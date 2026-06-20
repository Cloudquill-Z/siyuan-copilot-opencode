/**
 * Local TLS proxy for the opencode embedded Bun runtime.
 *
 * The opencode binary embeds a Bun JS runtime whose BoringSSL TLS stack cannot
 * read the macOS system keychain. This causes "unknown certificate verification
 * error" for all HTTPS fetch() calls to upstream LLM providers.
 *
 * This proxy solves it securely: it listens on a local HTTP port and forwards
 * requests to the real HTTPS target using Node.js's https module, which CAN
 * access the macOS keychain. No TLS verification is disabled — the proxy
 * performs proper certificate verification using the system trust store.
 *
 * URL convention:
 *   client sends:  POST http://127.0.0.1:<port>/https/api.example.com/v1/chat
 *   proxy forwards: POST https://api.example.com/v1/chat
 *
 * The path after the port must start with /<scheme>/<host>/<rest-of-path>.
 * Query string and request body are preserved. Streaming responses (SSE) are
 * piped through so the proxy is fully transparent.
 */

import { expandOpenCodeCliPath, getNodeModule, isWindowsRuntime } from './utils/opencode';

let proxyProcess: any = null;
let detectedProxyPort: number = 0;

export function getProxyPort(): number {
    return detectedProxyPort;
}

export function isProxyRunning(): boolean {
    return proxyProcess !== null && !proxyProcess.killed;
}

export function stopTlsProxy(): void {
    if (proxyProcess && !proxyProcess.killed) {
        try {
            proxyProcess.kill('SIGTERM');
        } catch {
            // ignore
        }
    }
    proxyProcess = null;
    detectedProxyPort = 0;
}

const PROXY_SCRIPT = `
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const server = http.createServer((clientReq, clientRes) => {
    try {
        // Forward-proxy mode: path format /<scheme>/<host>/<path>
        const rawPath = clientReq.url || '';
        const parts = rawPath.split('/'); // ['', 'https', 'host', 'path...']
        if (parts.length < 3) {
            clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
            clientRes.end('Bad proxy path: expected /<scheme>/<host>/<path>');
            return;
        }
        const scheme = parts[1];
        const host = parts[2];
        const restPath = '/' + parts.slice(3).join('/');
        const targetUrl = new URL(restPath, scheme + '://' + host);
        if (clientReq.url.includes('?')) {
            targetUrl.search = clientReq.url.slice(clientReq.url.indexOf('?'));
        }

        const headers = Object.assign({}, clientReq.headers);
        delete headers.host;
        delete headers.connection;
        headers.host = targetUrl.host;

        const options = {
            method: clientReq.method,
            hostname: targetUrl.hostname,
            port: targetUrl.port || (scheme === 'https' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            headers: headers,
        };

        const req = https.request(options, (upstreamRes) => {
            clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
            upstreamRes.pipe(clientRes);
        });

        req.on('error', (err) => {
            if (!clientRes.headersSent) {
                clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            clientRes.end('Proxy error: ' + err.message);
        });

        clientReq.pipe(req);
    } catch (err) {
        if (!clientRes.headersSent) {
            clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        clientRes.end('Proxy internal error: ' + (err && err.message || err));
    }
});

// CONNECT method — transparent TCP tunnel for HTTPS.
// Bun's fetch() uses CONNECT when HTTPS_PROXY is set. The tunnel lets Bun
// establish TLS with the target. With HTTPS_PROXY + SSL_CERT_FILE set,
// Bun's BoringSSL correctly verifies the target's certificate through the
// tunnel, resolving the "unknown certificate verification error".
server.on('connect', (req, clientSocket, head) => {
    const target = req.url || '';
    const colonIdx = target.lastIndexOf(':');
    const host = colonIdx > 0 ? target.slice(0, colonIdx) : target;
    const port = colonIdx > 0 ? parseInt(target.slice(colonIdx + 1), 10) || 443 : 443;

    const upstream = net.connect(port, host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n');
        if (head && head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
    });

    upstream.on('error', () => { try { clientSocket.end(); } catch {} });
    clientSocket.on('error', () => { try { upstream.end(); } catch {} });
    clientSocket.on('close', () => { try { upstream.destroy(); } catch {} });
});

server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const port = (addr && addr.port) || 0;
    // Write port to a temp file so the parent can read it synchronously
    const portFile = path.join(os.tmpdir(), 'opencode-tls-proxy-' + process.ppid + '.port');
    try { fs.writeFileSync(portFile, String(port)); } catch {}
    // Also signal via stdout
    process.stdout.write('PROXY_PORT=' + port + '\\n');
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
`;

export function startTlsProxy(): { success: boolean; port?: number; error?: string } {
    const childProcess = getNodeModule('child_process');
    const fs = getNodeModule('fs');
    const os = getNodeModule('os');
    const path = getNodeModule('path');
    if (!childProcess || !fs || !os || !path) {
        return { success: false, error: 'Node modules unavailable — cannot start TLS proxy' };
    }

    stopTlsProxy();

    const expandedEnv = expandOpenCodeCliPath(
        Object.fromEntries(
            Object.entries(typeof process !== 'undefined' ? process.env : {})
                .filter(([, v]) => v !== undefined && v !== null) as [string, string][]
        ),
        isWindowsRuntime()
    );

    // Temp file for the proxy to write its port to
    const portFile = path.join(os.tmpdir(), `opencode-tls-proxy-${process.pid}.port`);
    try { fs.unlinkSync(portFile); } catch {}

    try {
        const child = childProcess.spawn('node', ['-e', PROXY_SCRIPT], {
            env: expandedEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
        });

        // Block synchronously for up to 3 seconds waiting for the port file
        const deadline = Date.now() + 3000;
        let proxyPort = 0;
        while (Date.now() < deadline) {
            try {
                if (fs.existsSync(portFile)) {
                    const content = fs.readFileSync(portFile, 'utf8').trim();
                    const parsed = parseInt(content, 10);
                    if (parsed > 0) {
                        proxyPort = parsed;
                        break;
                    }
                }
            } catch {}
            // Small sleep to avoid 100% CPU
            const start = Date.now();
            while (Date.now() - start < 30) { /* busy wait */ }
        }

        // Clean up the port file
        try { fs.unlinkSync(portFile); } catch {}

        if (proxyPort > 0) {
            detectedProxyPort = proxyPort;
            proxyProcess = child;
            try { child.unref(); } catch {}
            return { success: true, port: proxyPort };
        }

        // Check if process already exited
        const stderrText = '';
        return { success: false, error: 'TLS proxy did not start within 3s' };
    } catch (err: any) {
        return { success: false, error: err.message || String(err) };
    }
}
