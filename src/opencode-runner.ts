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

function getNodeModule(moduleName: string): any {
    try {
        if (typeof window !== 'undefined' && (window as any).require) {
            return (window as any).require(moduleName);
        }
        if (typeof globalThis !== 'undefined' && (globalThis as any).require) {
            return (globalThis as any).require(moduleName);
        }
    } catch (e) {
        console.warn(`[OpenCode Runner] Failed to load Node module "${moduleName}":`, e);
    }
    return null;
}

function getIsWin(): boolean {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const plat = typeof process !== 'undefined' ? process.platform : '';
    return ua.includes('win') || plat === 'win32';
}

function expandPathForMacOS(env: Record<string, string>): Record<string, string> {
    if (getIsWin()) return env;
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
}

export function getServedPort(): number {
    return detectedPort;
}

export function isServeRunning(): boolean {
    return serveRunning;
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

    const env: Record<string, string> = {
        ...(typeof process !== 'undefined' && process.env ? Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined && v !== null) as [string, string][]
        ) : {}),
        ...(options?.env || {}),
    };

    const isWin = getIsWin();
    const expandedEnv = expandPathForMacOS(env);

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
            if (getIsWin()) {
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

    const available = await checkServerAvailable(hostname, port);
    if (available) {
        detectedPort = port;
        serveRunning = true;
        return { success: true, port };
    }

    const result = startServe(options);
    if (!result.success) {
        return result;
    }

    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const ready = await checkServerAvailable(hostname, port);
        if (ready) {
            detectedPort = port;
            serveRunning = true;
            return { success: true, port };
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

export async function detectOpenCodeCLI(): Promise<{ found: boolean; path?: string; error?: string }> {
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
        const isWin = getIsWin();
        const cmd = isWin ? 'where' : 'which';
        const expandedEnv = expandPathForMacOS(
            typeof process !== 'undefined' && process.env
                ? (process.env as Record<string, string>)
                : {}
        );
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
