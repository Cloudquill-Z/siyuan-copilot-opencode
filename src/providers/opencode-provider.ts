export interface OpenCodeProviderConfig {
    serverUrl: string;
}

export interface OpenCodeChatOptions {
    prompt: string;
    sessionId?: string;
    model?: { providerID: string; modelID: string };
    onChunk?: (text: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
}

export interface OpenCodeModelInfo {
    id: string;
    name: string;
    providerID?: string;
}

function normalizeServerUrl(serverUrl: string): string {
    const trimmed = (serverUrl || '').trim();
    if (!trimmed) {
        return 'http://localhost:4096';
    }
    return trimmed.replace(/\/$/, '');
}

function extractTextFromParts(parts: any): string {
    if (!Array.isArray(parts)) {
        return '';
    }
    return parts
        .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
        .map((part: any) => part.text)
        .join('');
}

async function openCodeFetch(
    serverUrl: string,
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal
): Promise<Response> {
    const url = `${normalizeServerUrl(serverUrl)}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const mergedSignal = signal
        ? (() => {
              const s = signal;
              const listen = () => {
                  if (s.aborted) controller.abort();
              };
              s.addEventListener('abort', listen);
              return () => s.removeEventListener('abort', listen);
          })()
        : null;

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal as AbortSignal,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        return response;
    } finally {
        clearTimeout(timeout);
        mergedSignal?.();
    }
}

export async function fetchOpenCodeModels(config: OpenCodeProviderConfig): Promise<OpenCodeModelInfo[]> {
    try {
        const response = await openCodeFetch(
            config.serverUrl,
            '/provider',
            { method: 'GET' }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;

        // Response format: { all: [{ id, name, models: { modelId: modelInfo } }] }
        const providers: any[] = data?.all || data?.providers || [];
        const models: OpenCodeModelInfo[] = [];
        const seen = new Set<string>();

        const addModel = (modelId: string, modelInfo: any, providerID: string) => {
            const uniqueId = providerID ? `${providerID}/${modelId}` : modelId;
            if (!modelId || seen.has(uniqueId)) return;
            seen.add(uniqueId);
            models.push({
                id: modelId,
                name: modelInfo?.name || modelInfo?.displayName || modelId,
                providerID
            });
        };

        for (const provider of providers) {
            const pid = provider?.id || provider?.providerID || provider?.name;
            const modelsObj = provider?.models;

            if (modelsObj && typeof modelsObj === 'object' && !Array.isArray(modelsObj)) {
                for (const [modelId, modelInfo] of Object.entries(modelsObj)) {
                    addModel(modelId, modelInfo as any, pid);
                }
            } else if (Array.isArray(modelsObj)) {
                for (const model of modelsObj) {
                    const mid = model?.id || model?.modelID;
                    if (mid) addModel(mid, model, pid);
                }
            }
        }

        return models;
    } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError') {
            throw new Error('Request timed out while fetching models');
        }
        throw err;
    }
}

export async function chatOpenCode(
    options: OpenCodeChatOptions,
    config: OpenCodeProviderConfig
): Promise<void> {
    const serverUrl = normalizeServerUrl(config.serverUrl);
    let fullText = '';

    try {
        let sessionId = options.sessionId;

        // Create a new session if not reusing an existing one
        if (!sessionId) {
            const createRes = await openCodeFetch(
                serverUrl,
                '/session',
                {
                    method: 'POST',
                    body: JSON.stringify({ title: 'copilot-session' })
                },
                options.signal
            );

            if (!createRes.ok) {
                const errText = await createRes.text().catch(() => '');
                throw new Error(`Failed to create session: ${createRes.status} ${createRes.statusText}${errText ? ' — ' + errText : ''}`);
            }

            const sessionData = await createRes.json() as any;
            sessionId = sessionData?.id;
            if (!sessionId) {
                throw new Error('Failed to create session: no session ID returned');
            }
        }

        // Determine the model - default to opencode/big-pickle
        const providerID = options.model?.providerID || 'opencode';
        const modelID = options.model?.modelID || 'big-pickle';

        // Send prompt
        const response = await openCodeFetch(
            serverUrl,
            `/session/${encodeURIComponent(sessionId)}/message`,
            {
                method: 'POST',
                body: JSON.stringify({
                    model: { providerID, modelID },
                    parts: [{ type: 'text', text: options.prompt }]
                })
            },
            options.signal
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenCode request failed: ${response.status} ${response.statusText}${errText ? ' — ' + errText : ''}`);
        }

        const data = await response.json() as any;

        // Handle error response
        // Error formats:
        // 1. { error: "message string" }
        // 2. { error: { message: "...", ... } }
        // 3. { success: false, error: [...], data: {...} } — MCP server error
        if (data?.success === false || data?.error) {
            let msg: string;
            if (typeof data.error === 'string') {
                msg = data.error;
            } else if (Array.isArray(data.error) && data.error.length > 0) {
                // MCP server error format: { success: false, error: [{ message: "...", ... }] }
                const firstErr = data.error[0];
                msg = firstErr?.message || JSON.stringify(data.error);
            } else if (typeof data.error === 'object' && data.error !== null) {
                msg = data.error?.message || data.error?.error || JSON.stringify(data.error);
            } else {
                msg = JSON.stringify(data.error);
            }
            throw new Error(msg);
        }

        // Extract text from parts
        const parts = data?.parts || [];
        fullText = extractTextFromParts(parts);

        options.onComplete?.(fullText);
    } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            options.onError?.(new Error('Request aborted'));
        } else {
            options.onError?.(err);
        }
        throw error;
    }
}
