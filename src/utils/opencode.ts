export interface OpenCodeModelSelection {
    providerID: string;
    modelID: string;
}

export function parseOpenCodeModelId(modelId?: string): OpenCodeModelSelection | undefined {
    if (!modelId?.includes('/')) return undefined;

    const parts = modelId.split('/');
    const modelID = parts.pop() || '';
    const providerID = parts.join('/');

    if (!providerID || !modelID) return undefined;
    return { providerID, modelID };
}

export function getNodeModule(moduleName: string): any {
    try {
        if (typeof window !== 'undefined' && (window as any).require) {
            return (window as any).require(moduleName);
        }
        if (typeof globalThis !== 'undefined' && (globalThis as any).require) {
            return (globalThis as any).require(moduleName);
        }
    } catch {
        // Node APIs are optional in browser-only contexts.
    }
    return null;
}

export function isWindowsRuntime(): boolean {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const platform = typeof process !== 'undefined' ? process.platform : '';
    return userAgent.includes('win') || platform === 'win32';
}

export function isMacRuntime(): boolean {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const platform = typeof process !== 'undefined' ? process.platform : '';
    return userAgent.includes('mac') || platform === 'darwin';
}

/**
 * Detect the system CA certificate bundle file path for the current platform.
 *
 * The opencode binary embeds a Bun JS runtime whose BoringSSL TLS stack cannot
 * read the macOS keychain. It respects the SSL_CERT_FILE env var to load CA
 * certificates from a PEM file. Providing the system cert bundle lets Bun
 * verify upstream TLS certificates properly — no verification is disabled.
 *
 * Returns null on Windows (which uses the system certificate store, not a file
 * bundle) or when no known bundle file exists on disk.
 */
export function getSystemCaCertBundlePath(): string | null {
    if (isWindowsRuntime()) return null;

    const candidates = isMacRuntime()
        ? ['/etc/ssl/cert.pem']
        : [
              '/etc/ssl/certs/ca-certificates.crt', // Debian/Ubuntu/Gentoo
              '/etc/pki/tls/certs/ca-bundle.crt', // RHEL/CentOS/Fedora
              '/etc/ssl/certs/ca-bundle.crt', // OpenSUSE
              '/etc/ssl/cert.pem', // Alpine/OpenBSD/macOS fallback
              '/etc/ssl/certs/ca-certificates.crt', // repeated for safety
          ];

    const fs = getNodeModule('fs');
    if (fs?.existsSync) {
        for (const p of candidates) {
            try {
                if (fs.existsSync(p)) return p;
            } catch {
                // ignore
            }
        }
        return null;
    }

    // Browser-only context (no fs access) — return the first candidate as a
    // best-effort default. The opencode process will ignore it if the file
    // does not exist.
    return candidates[0];
}

export function expandOpenCodeCliPath(
    env: Record<string, string>,
    isWindows: boolean = isWindowsRuntime()
): Record<string, string> {
    if (isWindows) return env;

    const home = env.HOME || '';
    const extraPaths = [
        ...(home ? [`${home}/.opencode/bin`] : []),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        ...(home ? [`${home}/.local/bin`, `${home}/bin`] : []),
    ].filter(Boolean);
    const existingPath = env.PATH || '';

    return { ...env, PATH: [...extraPaths, existingPath].filter(Boolean).join(':') };
}

export function getOpenCodeCliEnv(baseEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string> {
    const source = baseEnv || (typeof process !== 'undefined' ? process.env : {});
    const env = Object.fromEntries(
        Object.entries(source || {}).filter(([, value]) => value !== undefined && value !== null) as [string, string][]
    );

    return expandOpenCodeCliPath(env);
}

/**
 * Build a Basic Authorization header value from the OPENCODE_SERVER_PASSWORD
 * and OPENCODE_SERVER_USERNAME env vars (if set).
 *
 * The opencode server enables HTTP Basic auth when OPENCODE_SERVER_PASSWORD
 * is set. The plugin must send the matching header on every request.
 *
 * Returns null when no password is configured (server runs without auth).
 */
export function getOpenCodeServerAuthHeader(env?: Record<string, string> | NodeJS.ProcessEnv): string | null {
    const source = env || (typeof process !== 'undefined' ? process.env : {});
    const password = source.OPENCODE_SERVER_PASSWORD || source.opencode_server_password;
    if (!password) return null;
    const username = source.OPENCODE_SERVER_USERNAME || source.opencode_server_username || 'opencode';
    try {
        const encoded = btoa(`${username}:${password}`);
        return `Basic ${encoded}`;
    } catch {
        // btoa may not be available in all contexts
        return null;
    }
}
