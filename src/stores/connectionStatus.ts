import { writable } from 'svelte/store';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface ConnectionStatus {
    state: ConnectionState;
    version: string;
    serverUrl: string;
    lastChecked: number;
    error: string;
}

const initialState: ConnectionStatus = {
    state: 'disconnected',
    version: '',
    serverUrl: '',
    lastChecked: 0,
    error: '',
};

export const connectionStatusStore = writable<ConnectionStatus>(initialState);

let healthTimer: ReturnType<typeof setInterval> | null = null;
let currentServerUrl = '';

export function getConnectionStatus(): ConnectionStatus {
    let current: ConnectionStatus = initialState;
    connectionStatusStore.subscribe((v) => { current = v; })();
    return current;
}

export function startHealthPoll(serverUrl: string, intervalMs: number = 5000): void {
    stopHealthPoll();
    currentServerUrl = serverUrl;

    connectionStatusStore.update(s => ({ ...s, state: 'connecting', serverUrl, error: '' }));

    const check = async () => {
        try {
            const url = `${serverUrl.replace(/\/$/, '')}/global/health`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);

            let response: Response;
            try {
                response = await fetch(url, { signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }

            if (response.ok) {
                let data: any = {};
                try { data = await response.json(); } catch {}
                connectionStatusStore.update(s => ({
                    ...s,
                    state: 'connected',
                    version: data?.version || '',
                    lastChecked: Date.now(),
                    error: '',
                }));
            } else {
                connectionStatusStore.update(s => ({
                    ...s,
                    state: 'disconnected',
                    lastChecked: Date.now(),
                    error: `HTTP ${response.status}`,
                }));
            }
        } catch (err: any) {
            connectionStatusStore.update(s => ({
                ...s,
                state: 'disconnected',
                lastChecked: Date.now(),
                error: err.message || 'Connection failed',
            }));
        }
    };

    check();
    healthTimer = setInterval(check, intervalMs);
}

export function stopHealthPoll(): void {
    if (healthTimer !== null) {
        clearInterval(healthTimer);
        healthTimer = null;
    }
    connectionStatusStore.set({ ...initialState, serverUrl: currentServerUrl });
}

export function refreshHealth(): void {
    if (currentServerUrl) {
        connectionStatusStore.update(s => ({ ...s, state: 'connecting', error: '' }));
        startHealthPoll(currentServerUrl);
    }
}
