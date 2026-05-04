import { OPENCODE_SESSION_TITLE } from "../pluginNamespace";

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
    const timeout = setTimeout(() => controller.abort(), 120000);

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

/**
 * Parse SSE event stream and extract text from data chunks
 */
async function parseSSEStream(
    response: Response,
    onChunk: (text: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
        while (true) {
            if (signal?.aborted) {
                reader.cancel();
                throw new Error('Request aborted');
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;

                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const text = extractTextFromParts(parsed?.parts || []);
                        if (text) {
                            fullText += text;
                            onChunk(text);
                        }
                        // Check for error in stream
                        if (parsed?.success === false || parsed?.error) {
                            let msg: string;
                            if (typeof parsed.error === 'string') {
                                msg = parsed.error;
                            } else if (Array.isArray(parsed.error) && parsed.error.length > 0) {
                                msg = parsed.error[0]?.message || JSON.stringify(parsed.error);
                            } else if (typeof parsed.error === 'object' && parsed.error !== null) {
                                msg = parsed.error?.message || parsed.error?.error || JSON.stringify(parsed.error);
                            } else {
                                msg = JSON.stringify(parsed.error);
                            }
                            throw new Error(msg);
                        }
                    } catch (parseErr) {
                        // If it's already an Error, rethrow
                        if (parseErr instanceof Error && parseErr.message !== 'Request aborted') {
                            // Could be a partial JSON chunk, skip
                            if (!(parseErr instanceof SyntaxError)) throw parseErr;
                        }
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullText;
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

/**
 * Delete an OpenCode session to prevent resource leaks
 */
export async function deleteOpenCodeSession(
    config: OpenCodeProviderConfig,
    sessionId: string
): Promise<void> {
    try {
        await openCodeFetch(
            config.serverUrl,
            `/session/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
        );
    } catch {
        // Silently ignore cleanup errors
    }
}

export async function chatOpenCode(
    options: OpenCodeChatOptions,
    config: OpenCodeProviderConfig
): Promise<{ sessionId: string }> {
    const serverUrl = normalizeServerUrl(config.serverUrl);

    try {
        let sessionId = options.sessionId;

        if (!sessionId) {
            const createRes = await openCodeFetch(
                serverUrl,
                '/session',
                {
                    method: 'POST',
                    body: JSON.stringify({ title: OPENCODE_SESSION_TITLE })
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

        const providerID = options.model?.providerID || 'opencode';
        const modelID = options.model?.modelID || 'big-pickle';

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

        // Check if response is SSE stream or JSON
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
            // SSE streaming mode
            const fullText = await parseSSEStream(response, (text) => {
                options.onChunk?.(text);
            }, options.signal);
            options.onComplete?.(fullText);
        } else {
            // JSON mode
            const data = await response.json() as any;

            if (data?.success === false || data?.error) {
                let msg: string;
                if (typeof data.error === 'string') {
                    msg = data.error;
                } else if (Array.isArray(data.error) && data.error.length > 0) {
                    const firstErr = data.error[0];
                    msg = firstErr?.message || JSON.stringify(data.error);
                } else if (typeof data.error === 'object' && data.error !== null) {
                    msg = data.error?.message || data.error?.error || JSON.stringify(data.error);
                } else {
                    msg = JSON.stringify(data.error);
                }
                throw new Error(msg);
            }

            const parts = data?.parts || [];
            const fullText = extractTextFromParts(parts);

            // Simulate streaming for consistent UX
            if (options.onChunk && fullText) {
                // Output in chunks for typing effect
                const chunkSize = 3;
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    if (options.signal?.aborted) throw new Error('Request aborted');
                    options.onChunk(fullText.slice(i, i + chunkSize));
                    await new Promise(r => setTimeout(r, 10));
                }
            }

            options.onComplete?.(fullText);
        }

        return { sessionId: sessionId! };
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
