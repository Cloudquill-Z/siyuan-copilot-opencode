import { get, writable } from 'svelte/store';

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
let healthController: AbortController | null = null;
let healthPollGeneration = 0;
let healthCheckRunning = false;

export function getConnectionStatus(): ConnectionStatus {
    return get(connectionStatusStore);
}

export function startHealthPoll(serverUrl: string, intervalMs: number = 5000): void {
    stopHealthPoll(false);
    currentServerUrl = serverUrl;
    const generation = healthPollGeneration;

    connectionStatusStore.update(s => ({ ...s, state: 'connecting', serverUrl, error: '' }));

    const check = async () => {
        if (healthCheckRunning || generation !== healthPollGeneration) return;
        healthCheckRunning = true;
        try {
            const url = `${serverUrl.replace(/\/$/, '')}/global/health`;
            const controller = new AbortController();
            healthController = controller;
            const timer = setTimeout(() => controller.abort(), 5000);

            let response: Response;
            try {
                response = await fetch(url, { signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }

            if (generation !== healthPollGeneration || controller.signal.aborted) return;
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
            if (generation !== healthPollGeneration || err?.name === 'AbortError') return;
            connectionStatusStore.update(s => ({
                ...s,
                state: 'disconnected',
                lastChecked: Date.now(),
                error: err.message || 'Connection failed',
            }));
        } finally {
            if (generation === healthPollGeneration) {
                healthCheckRunning = false;
                healthController = null;
            }
        }
    };

    check();
    healthTimer = setInterval(check, intervalMs);
}

export function stopHealthPoll(resetState: boolean = true): void {
    healthPollGeneration++;
    healthController?.abort();
    healthController = null;
    healthCheckRunning = false;
    if (healthTimer !== null) {
        clearInterval(healthTimer);
        healthTimer = null;
    }
    if (resetState) {
        connectionStatusStore.set({ ...initialState, serverUrl: currentServerUrl });
    }
}

export function refreshHealth(): void {
    if (currentServerUrl) {
        connectionStatusStore.update(s => ({ ...s, state: 'connecting', error: '' }));
        startHealthPoll(currentServerUrl);
    }
}
