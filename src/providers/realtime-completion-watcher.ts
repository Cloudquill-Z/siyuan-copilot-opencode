export type RealtimeSessionStatus = 'idle' | 'running' | 'error' | 'unknown';

export interface RealtimeCompletionWatcherOptions {
    signal?: AbortSignal;
    idleTimeoutMs: number;
    pollIntervalMs: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    getSessionStatus?: () => Promise<RealtimeSessionStatus>;
}

export interface RealtimeCompletionWatcher {
    markActivity(reason?: string): void;
    markPermissionWaiting(isWaiting: boolean): void;
    resolveIdle(): void;
    reject(error: Error): void;
    wait(): Promise<void>;
}

const DEFAULT_NOW = () => Date.now();
const DEFAULT_SLEEP = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatDuration(ms: number): string {
    const minutes = ms / 60_000;
    if (minutes >= 1) {
        return `${Math.max(1, Math.round(minutes))} minutes`;
    }
    return `${Math.max(1, Math.round(ms / 1000))} seconds`;
}

export function createRealtimeCompletionWatcher(
    options: RealtimeCompletionWatcherOptions
): RealtimeCompletionWatcher {
    const now = options.now || DEFAULT_NOW;
    const sleep = options.sleep || DEFAULT_SLEEP;
    let lastActivityAt = now();
    let lastActivityReason = 'start';
    let permissionWaiting = false;
    let monitorStarted = false;
    let settled = false;
    let resolveDone: (() => void) | null = null;
    let rejectDone: ((error: Error) => void) | null = null;

    const done = new Promise<void>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });

    const cleanupAbort = (() => {
        if (!options.signal) return () => {};
        const onAbort = () => rejectWatcher(new Error('Request aborted'));
        options.signal.addEventListener('abort', onAbort);
        return () => options.signal?.removeEventListener('abort', onAbort);
    })();

    const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanupAbort();
        callback();
    };

    function markActivity(reason: string = 'activity') {
        if (settled) return;
        lastActivityAt = now();
        lastActivityReason = reason;
    }

    function resolveIdle() {
        settle(() => resolveDone?.());
    }

    function rejectWatcher(error: Error) {
        settle(() => rejectDone?.(error));
    }

    async function checkStatus() {
        if (!options.getSessionStatus) return;
        let status: RealtimeSessionStatus = 'unknown';
        try {
            status = await options.getSessionStatus();
        } catch {
            status = 'unknown';
        }

        if (status === 'idle') {
            resolveIdle();
            return;
        }
        if (status === 'error') {
            rejectWatcher(new Error('OpenCode session reported an error while waiting for completion.'));
            return;
        }
        if (status === 'running') {
            markActivity('session-status-running');
        }
    }

    async function monitor() {
        while (!settled) {
            if (options.signal?.aborted) {
                rejectWatcher(new Error('Request aborted'));
                return;
            }

            await checkStatus();
            if (settled) return;

            const inactiveFor = now() - lastActivityAt;
            if (!permissionWaiting && inactiveFor >= options.idleTimeoutMs) {
                rejectWatcher(new Error(
                    `OpenCode task appears stalled: no text, thinking, tool, permission, or status activity for ${formatDuration(options.idleTimeoutMs)}. Last activity: ${lastActivityReason}.`
                ));
                return;
            }

            await sleep(options.pollIntervalMs);
        }
    }

    return {
        markActivity,
        markPermissionWaiting(isWaiting: boolean) {
            permissionWaiting = isWaiting;
            if (isWaiting) {
                markActivity('permission-waiting');
            }
        },
        resolveIdle,
        reject: rejectWatcher,
        wait() {
            if (!monitorStarted) {
                monitorStarted = true;
                monitor().catch((error) => rejectWatcher(error));
            }
            return done;
        },
    };
}
