import { expandOpenCodeCliPath, getNodeModule, isWindowsRuntime } from './utils/opencode';

const DEFAULT_PORT = 4096;
const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_CLI_CMD = 'opencode';
const OPENCODE_RUNNER_DEBUG_LOGS = false;

let serveProcess: any = null;
let serveRunning = false;
let detectedPort: number = DEFAULT_PORT;

function debugRunner(...args: any[]) {
    if (OPENCODE_RUNNER_DEBUG_LOGS) {
        console.debug(...args);
    }
}

function isElectron(): boolean {
    return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');
}

export interface OpenCodeRunnerOptions {
    cliPath?: string;
    port?: number;
    hostname?: string;
    workingDir?: string;
    env?: Record<string, string>;
}

export interface OpenCodeRunnerResult {
    success: boolean;
    error?: string;
    port?: number;
    serverVersion?: string;
    cliVersion?: string;
    restarted?: boolean;
}

export function getServedPort(): number {
    return detectedPort;
}

export function isServeRunning(): boolean {
    return serveRunning;
}

function getExpandedEnv(options?: Pick<OpenCodeRunnerOptions, 'env'>): Record<string, string> {
    const env: Record<string, string> = {
        ...(typeof process !== 'undefined' && process.env ? Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined && v !== null) as [string, string][]
        ) : {}),
        ...(options?.env || {}),
    };

    return expandOpenCodeCliPath(env, isWindowsRuntime());
}

function runChildProcess(
    command: string,
    args: string[],
    options?: {
        env?: Record<string, string>;
        shell?: boolean;
        timeoutMs?: number;
    }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const childProcess = getNodeModule('child_process');
    if (!childProcess) {
        return Promise.resolve({ code: 1, stdout: '', stderr: 'child_process unavailable' });
    }

    return new Promise((resolve) => {
        const child = childProcess.spawn(command, args, {
            shell: !!options?.shell,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: options?.env,
        });

        let stdout = '';
        let stderr = '';
        const timer = options?.timeoutMs
            ? setTimeout(() => {
                  try { child.kill(); } catch {}
              }, options.timeoutMs)
            : null;

        child.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        child.on('close', (code: number | null) => {
            if (timer) clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        child.on('error', (err: Error) => {
            if (timer) clearTimeout(timer);
            resolve({ code: 1, stdout, stderr: err.message });
        });
    });
}

function normalizeOpenCodeVersion(version: string): string {
    return (version || '').trim().replace(/^v/i, '');
}

export function isOpenCodeVersionMismatch(serverVersion?: string, cliVersion?: string): boolean {
    const server = normalizeOpenCodeVersion(serverVersion || '');
    const cli = normalizeOpenCodeVersion(cliVersion || '');
    return !!server && !!cli && server !== cli;
}

async function waitForServerUnavailable(hostname: string, port: number): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
        const available = await checkServerAvailable(hostname, port, 500);
        if (!available) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
}

export async function stopExistingOpenCodeServeOnPort(port: number): Promise<boolean> {
    if (!isElectron()) return false;

    const isWin = isWindowsRuntime();
    if (isWin) {
        const netstat = await runChildProcess('netstat', ['-ano'], { shell: true, timeoutMs: 5000 });
        const pids = new Set<string>();
        for (const line of netstat.stdout.split(/\r?\n/)) {
            if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
            const pid = line.trim().split(/\s+/).pop();
            if (pid) pids.add(pid);
        }

        let stopped = false;
        for (const pid of pids) {
            const task = await runChildProcess('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/value'], { shell: true, timeoutMs: 5000 });
            if (!/opencode/i.test(task.stdout)) continue;
            const killed = await runChildProcess('taskkill', ['/T', '/F', '/PID', pid], { shell: true, timeoutMs: 5000 });
            stopped = stopped || killed.code === 0;
        }
        return stopped;
    }

    const lsof = await runChildProcess('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeoutMs: 5000 });
    const pids = lsof.stdout.split(/\s+/).map((pid) => pid.trim()).filter(Boolean);
    let stopped = false;

    for (const pid of pids) {
        const ps = await runChildProcess('ps', ['-p', pid, '-o', 'command='], { timeoutMs: 5000 });
        if (!/\bopencode\b/i.test(ps.stdout)) continue;

        const kill = await runChildProcess('kill', [pid], { timeoutMs: 5000 });
        stopped = stopped || kill.code === 0;
    }

    return stopped;
}

export async function checkServerAvailable(
    host: string = DEFAULT_HOSTNAME,
    port: number = DEFAULT_PORT,
    timeoutMs: number = 3000
): Promise<boolean> {
    try {
        const url = `http://${host}:${port}/global/health`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timer);
            return response.ok;
        } catch {
            clearTimeout(timer);
            return false;
        }
    } catch {
        return false;
    }
}

export function startServe(options?: OpenCodeRunnerOptions): OpenCodeRunnerResult {
    if (!isElectron()) {
        return {
            success: false,
            error: 'Auto-starting OpenCode server is only available in the SiYuan desktop app (Electron environment). Please run "opencode serve" manually in your terminal.',
        };
    }

    const childProcess = getNodeModule('child_process');
    if (!childProcess) {
        return {
            success: false,
            error: 'Cannot access child_process module. Please run "opencode serve" manually in your terminal.',
        };
    }

    const cliPath = options?.cliPath || DEFAULT_CLI_CMD;
    const port = options?.port || DEFAULT_PORT;
    const hostname = options?.hostname || DEFAULT_HOSTNAME;
    const workingDir = options?.workingDir || process.cwd();

    const args = ['serve', '--port', String(port), '--hostname', hostname];

    const isWin = isWindowsRuntime();
    const expandedEnv = getExpandedEnv(options);

    try {
        serveProcess = childProcess.spawn(cliPath, args, {
            cwd: workingDir,
            env: expandedEnv,
            shell: isWin,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        detectedPort = port;
        serveRunning = true;

        serveProcess.on('error', (err: Error) => {
            console.error('[OpenCode Runner] Failed to start opencode serve:', err.message);
            serveRunning = false;
            serveProcess = null;
        });

        serveProcess.on('exit', (code: number, signal: string) => {
            debugRunner(`[OpenCode Runner] opencode serve exited with code ${code}, signal ${signal}`);
            serveRunning = false;
            serveProcess = null;
        });

        serveProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                debugRunner(`[OpenCode Serve] ${text}`);
            }
        });

        serveProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                debugRunner(`[OpenCode Serve] ${text}`);
            }
        });

        return { success: true, port };
    } catch (err: any) {
        return {
            success: false,
            error: err.message || String(err),
        };
    }
}

export function stopServe(): void {
    if (serveProcess && !serveProcess.killed) {
        try {
            if (isWindowsRuntime()) {
                const childProcess = getNodeModule('child_process');
                if (childProcess) {
                    childProcess.spawn('taskkill', ['/T', '/F', '/PID', String(serveProcess.pid)], {
                        windowsHide: true,
                        stdio: 'ignore',
                    });
                }
            } else {
                serveProcess.kill('SIGTERM');
            }
        } catch (e) {
            console.error('[OpenCode Runner] Failed to stop opencode serve:', e);
        }
        serveProcess = null;
        serveRunning = false;
    }
}

export async function ensureServerRunning(options?: OpenCodeRunnerOptions): Promise<OpenCodeRunnerResult> {
    const port = options?.port || DEFAULT_PORT;
    const hostname = options?.hostname || DEFAULT_HOSTNAME;

    const health = await checkServerHealth(hostname, port, 3000);
    if (health.healthy) {
        const cli = await detectOpenCodeCLIVersion(options);
        if (isOpenCodeVersionMismatch(health.version, cli.version)) {
            const mismatchError = `OpenCode server version mismatch: server v${health.version}, CLI v${cli.version}.`;
            console.warn(`[OpenCode Runner] ${mismatchError} Restarting stale server on port ${port}.`);
            stopServe();
            const stopped = await stopExistingOpenCodeServeOnPort(port);
            const unavailable = stopped ? await waitForServerUnavailable(hostname, port) : false;
            if (!stopped || !unavailable) {
                return {
                    success: false,
                    port,
                    serverVersion: health.version,
                    cliVersion: cli.version,
                    error: `${mismatchError} Please stop the existing opencode serve process on port ${port} and reconnect.`,
                };
            }
        } else {
            detectedPort = port;
            serveRunning = true;
            return { success: true, port, serverVersion: health.version, cliVersion: cli.version };
        }
    }

    const result = startServe(options);
    if (!result.success) {
        return result;
    }

    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const ready = await checkServerAvailable(hostname, port);
        if (ready) {
            const readyHealth = await checkServerHealth(hostname, port, 3000);
            const cli = await detectOpenCodeCLIVersion(options);
            detectedPort = port;
            serveRunning = true;
            return {
                success: true,
                port,
                serverVersion: readyHealth.version,
                cliVersion: cli.version,
                restarted: health.healthy,
            };
        }
    }

    stopServe();
    return {
        success: false,
        error: 'OpenCode server did not become ready within 15 seconds. Please ensure opencode is installed and try starting it manually with: opencode serve',
    };
}

export interface SessionStatusInfo {
    sessionId: string;
    status: 'idle' | 'running' | 'error';
}

export async function fetchSessionStatuses(
    host: string = DEFAULT_HOSTNAME,
    port: number = DEFAULT_PORT
): Promise<SessionStatusInfo[]> {
    try {
        const url = `http://${host}:${port}/session/status`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        let response: Response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) return [];

        const data = await response.json();
        if (!data || typeof data !== 'object') return [];

        return Object.entries(data).map(([sessionId, status]: [string, any]) => ({
            sessionId,
            status: status?.status || 'idle',
        }));
    } catch {
        return [];
    }
}

export async function checkServerHealth(
    host: string = DEFAULT_HOSTNAME,
    port: number = DEFAULT_PORT,
    timeoutMs: number = 5000
): Promise<{ healthy: boolean; version: string }> {
    try {
        const url = `http://${host}:${port}/global/health`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }

        if (response.ok) {
            let data: any = {};
            try { data = await response.json(); } catch {}
            return { healthy: true, version: data?.version || '' };
        }
        return { healthy: false, version: '' };
    } catch {
        return { healthy: false, version: '' };
    }
}

export async function detectOpenCodeCLIVersion(options?: Pick<OpenCodeRunnerOptions, 'cliPath' | 'env'>): Promise<{ found: boolean; path?: string; version?: string; error?: string }> {
    const cli = await detectOpenCodeCLI(options);
    if (!cli.found) return cli;

    const expandedEnv = getExpandedEnv(options);
    const version = await runChildProcess(cli.path || options?.cliPath || DEFAULT_CLI_CMD, ['--version'], {
        env: expandedEnv,
        shell: isWindowsRuntime(),
        timeoutMs: 5000,
    });

    if (version.code === 0 && version.stdout.trim()) {
        return {
            ...cli,
            version: normalizeOpenCodeVersion(version.stdout.trim().split(/\s+/).pop() || version.stdout.trim()),
        };
    }

    return {
        ...cli,
        error: version.stderr || 'Failed to detect opencode CLI version',
    };
}

export async function detectOpenCodeCLI(options?: Pick<OpenCodeRunnerOptions, 'env'>): Promise<{ found: boolean; path?: string; error?: string }> {
    if (!isElectron()) {
        return {
            found: false,
            error: 'CLI detection is only available in the SiYuan desktop app. Please install opencode from https://opencode.ai',
        };
    }

    const childProcess = getNodeModule('child_process');
    if (!childProcess) {
        return {
            found: false,
            error: 'Cannot access child_process module. Please install opencode from https://opencode.ai',
        };
    }

    return new Promise((resolve) => {
        const isWin = isWindowsRuntime();
        const cmd = isWin ? 'where' : 'which';
        const expandedEnv = getExpandedEnv(options);
        const child = childProcess.spawn(cmd, [DEFAULT_CLI_CMD], {
            shell: true,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: expandedEnv,
        });

        let stdout = '';

        child.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.on('close', (code: number) => {
            if (code === 0 && stdout.trim()) {
                const paths = stdout.trim().split(/\r?\n/);
                resolve({ found: true, path: paths[0] });
            } else {
                resolve({
                    found: false,
                    error: 'opencode command not found. Install it from https://opencode.ai',
                });
            }
        });

        child.on('error', () => {
            resolve({
                found: false,
                error: 'opencode command not found. Install it from https://opencode.ai',
            });
        });
    });
}
