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
