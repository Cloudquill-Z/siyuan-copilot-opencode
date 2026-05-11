import { OPENCODE_SESSION_TITLE } from "../pluginNamespace";

export interface OpenCodeProviderConfig {
    serverUrl: string;
}

export interface OpenCodeToolPartUpdate {
    partId: string;
    callID: string;
    toolName: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    input?: any;
    output?: string;
    error?: string;
    title?: string;
}

export interface OpenCodeChatOptions {
    prompt: string;
    sessionId?: string;
    model?: { providerID: string; modelID: string };
    onChunk?: (text: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
    enableThinking?: boolean;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'auto';
    onThinkingChunk?: (text: string) => void;
    onThinkingComplete?: (thinking: string) => void;
    onToolPartUpdate?: (update: OpenCodeToolPartUpdate) => void;
    mode?: 'plan' | 'build';
}

export interface OpenCodeModelInfo {
    id: string;
    name: string;
    providerID?: string;
    enableThinking?: boolean;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'auto';
}

const DEFAULT_SERVER_URL = 'http://localhost:4096';
const IDLE_TIMEOUT_MS = 300_000;

const MODEL_CACHE_TTL = 5 * 60 * 1000;
const modelCache = new Map<string, { models: OpenCodeModelInfo[]; timestamp: number }>();

function normalizeServerUrl(serverUrl: string): string {
    const trimmed = (serverUrl || '').trim();
    if (!trimmed) {
        return DEFAULT_SERVER_URL;
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

function extractThinkingFromParts(parts: any): string {
    if (!Array.isArray(parts)) {
        return '';
    }
    return parts
        .filter((part: any) => part?.type === 'reasoning' && typeof part?.text === 'string')
        .map((part: any) => part.text)
        .join('');
}

function formatErrorMessage(error: any): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (Array.isArray(error) && error.length > 0) {
        return error[0]?.message || JSON.stringify(error);
    }
    if (typeof error === 'object') {
        return error?.message || error?.error || JSON.stringify(error);
    }
    return JSON.stringify(error);
}

function isConnectionError(err: Error): boolean {
    const msg = err.message?.toLowerCase() || '';
    return (
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('network request failed') ||
        msg.includes('err_connection_refused') ||
        msg.includes('err_connection_refused') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('fetch error')
    );
}

async function openCodeFetch(
    serverUrl: string,
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal
): Promise<{ response: Response; resetTimeout: () => void }> {
    const url = `${normalizeServerUrl(serverUrl)}${path}`;

    if (signal?.aborted) {
        throw new Error('Request aborted');
    }

    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);

    const resetTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };

    const cleanup = signal
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
        return { response, resetTimeout };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            throw new Error('OpenCode request timed out (no activity for 5 minutes). The server may be overloaded or not responding.');
        }
        if (isConnectionError(err)) {
            throw new Error(
                `Cannot connect to OpenCode at ${normalizeServerUrl(serverUrl)}. ` +
                `Please ensure opencode is installed and running. ` +
                `Run 'opencode serve' in your terminal, or the plugin can auto-start it.`
            );
        }
        throw err;
    } finally {
        clearTimeout(timeout);
        cleanup?.();
    }
}

// ─── Real-time Event Stream Client ───────────────────────────────────────────

interface EventStreamCallbacks {
    onTextDelta?: (delta: string, partId: string) => void;
    onReasoningDelta?: (delta: string, partId: string) => void;
    onToolPartUpdate?: (part: any) => void;
    onSessionIdle?: () => void;
    onSessionError?: (error: any) => void;
}

class EventStreamClient {
    private controller: AbortController | null = null;
    private serverUrl: string;
    private targetSessionId: string;

    constructor(serverUrl: string, sessionId: string) {
        this.serverUrl = normalizeServerUrl(serverUrl);
        this.targetSessionId = sessionId;
    }

    async connect(callbacks: EventStreamCallbacks, signal?: AbortSignal): Promise<void> {
        this.controller = new AbortController();

        const outerCleanup = signal
            ? (() => {
                  const listen = () => this.controller?.abort();
                  signal.addEventListener('abort', listen);
                  return () => signal.removeEventListener('abort', listen);
              })()
            : null;

        const url = `${this.serverUrl}/event`;
        let response: Response;
        try {
            response = await fetch(url, { signal: this.controller.signal });
        } catch (err: any) {
            outerCleanup?.();
            if (err.name === 'AbortError') return;
            throw err;
        }

        if (!response.ok) {
            outerCleanup?.();
            throw new Error(`Event stream connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            outerCleanup?.();
            throw new Error('Event stream body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        const processLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) {
                currentEvent = '';
                return;
            }
            if (trimmed.startsWith(':')) return;

            if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.slice(6).trim();
                return;
            }

            if (!trimmed.startsWith('data:')) return;

            const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
            if (!jsonStr) return;

            let parsed: any;
            try {
                parsed = JSON.parse(jsonStr);
            } catch {
                return;
            }

            const payload = parsed?.payload;
            if (!payload) return;

            const eventType = payload.type || currentEvent;
            const props = payload.properties || {};

            if (eventType === 'message.part.updated') {
                const part = props.part;
                const delta = props.delta;
                if (!part) return;

                if (part.sessionID && part.sessionID !== this.targetSessionId) return;

                if (part.type === 'text' && delta && callbacks.onTextDelta) {
                    callbacks.onTextDelta(delta, part.id);
                } else if (part.type === 'reasoning' && delta && callbacks.onReasoningDelta) {
                    callbacks.onReasoningDelta(delta, part.id);
                } else if (part.type === 'tool' && callbacks.onToolPartUpdate) {
                    callbacks.onToolPartUpdate(part);
                }
            } else if (eventType === 'session.idle') {
                const sid = props.sessionID;
                if (!sid || sid === this.targetSessionId) {
                    callbacks.onSessionIdle?.();
                }
            } else if (eventType === 'session.error') {
                const sid = props.sessionID;
                if (!sid || sid === this.targetSessionId) {
                    callbacks.onSessionError?.(props.error || 'Unknown session error');
                }
            }
        };

        (async () => {
            try {
                while (true) {
                    if (this.controller?.signal.aborted) break;
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        processLine(line);
                    }
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.warn('[OpenCode] Event stream read error:', err);
                }
            } finally {
                reader.releaseLock();
                outerCleanup?.();
            }
        })();
    }

    close(): void {
        this.controller?.abort();
        this.controller = null;
    }
}

// ─── SSE Stream Parser (for /session/:id/message SSE responses) ──────────────

async function parseSSEStream(
    response: Response,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
    onThinkingChunk?: (text: string) => void,
    resetTimeout?: () => void
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

            resetTimeout?.();

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;

                if (trimmed.startsWith('event:')) continue;

                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed?.success === false || parsed?.error) {
                            const msg = formatErrorMessage(parsed.error);
                            throw new Error(msg);
                        }

                        const text = extractTextFromParts(parsed?.parts || []);
                        if (text) {
                            fullText += text;
                            onChunk(text);
                        }

                        if (onThinkingChunk) {
                            const thinkingText = extractThinkingFromParts(parsed?.parts || []);
                            if (thinkingText) {
                                onThinkingChunk(thinkingText);
                            }
                        }
                    } catch (parseErr) {
                        if (parseErr instanceof SyntaxError) {
                            continue;
                        }
                        throw parseErr;
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullText;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchOpenCodeModels(config: OpenCodeProviderConfig): Promise<OpenCodeModelInfo[]> {
    const serverUrl = normalizeServerUrl(config.serverUrl);
    const cached = modelCache.get(serverUrl);
    if (cached && (Date.now() - cached.timestamp) < MODEL_CACHE_TTL) {
        return cached.models;
    }

    try {
        const { response } = await openCodeFetch(
            config.serverUrl,
            '/provider',
            { method: 'GET' }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        let data: any;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            throw new Error(`Failed to parse models response from OpenCode${responseText ? ': ' + responseText.slice(0, 200) : ' (empty response)'}`);
        }

        const connectedIds: Set<string> = new Set(data?.connected || []);
        const allProviders: any[] = data?.all || [];
        const providers = allProviders.filter((p: any) => {
            const pid = p?.id || p?.providerID || p?.name || '';
            return connectedIds.has(pid);
        });
        const models: OpenCodeModelInfo[] = [];
        const seen = new Set<string>();

        const addModel = (modelId: string, modelInfo: any, providerID: string) => {
            if (!modelId) return;
            const uniqueId = providerID ? `${providerID}/${modelId}` : modelId;
            if (seen.has(uniqueId)) return;
            seen.add(uniqueId);
            const m: OpenCodeModelInfo = {
                id: modelId,
                name: modelInfo?.name || modelInfo?.displayName || modelId,
                providerID: providerID || undefined
            };
            if (typeof modelInfo?.enableThinking === 'boolean') {
                m.enableThinking = modelInfo.enableThinking;
            }
            if (modelInfo?.reasoningEffort && ['low', 'medium', 'high', 'auto'].includes(modelInfo.reasoningEffort)) {
                m.reasoningEffort = modelInfo.reasoningEffort;
            }
            models.push(m);
        };

        for (const provider of providers) {
            const pid = provider?.id || provider?.providerID || provider?.name || '';
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

        modelCache.set(serverUrl, { models, timestamp: Date.now() });
        return models;
    } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError') {
            throw new Error('Request timed out while fetching models');
        }
        throw err;
    }
}

export function invalidateModelCache(serverUrl?: string): void {
    if (serverUrl) {
        const normalized = normalizeServerUrl(serverUrl);
        modelCache.delete(normalized);
    } else {
        modelCache.clear();
    }
}

export async function deleteOpenCodeSession(
    config: OpenCodeProviderConfig,
    sessionId: string
): Promise<void> {
    try {
        const { response } = await openCodeFetch(
            config.serverUrl,
            `/session/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
        );
        if (!response.ok && response.status !== 404) {
            console.warn(`[OpenCode] Session cleanup returned ${response.status}`);
        }
    } catch (err) {
        console.warn('[OpenCode] Session cleanup failed:', err);
    }
}

export async function chatOpenCode(
    options: OpenCodeChatOptions,
    config: OpenCodeProviderConfig
): Promise<{ sessionId: string }> {
    const serverUrl = normalizeServerUrl(config.serverUrl);
    let sessionId = options.sessionId;
    let sessionCreated = false;

    try {
        if (!sessionId) {
            const { response: createRes } = await openCodeFetch(
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

            const sessionData = await createRes.text();
            let session: any;
            try {
                session = sessionData ? JSON.parse(sessionData) : {};
            } catch {
                throw new Error('Failed to parse session response from OpenCode');
            }
            sessionId = session?.id;
            if (!sessionId) {
                throw new Error('Failed to create session: no session ID returned');
            }
            sessionCreated = true;
        }

        const providerID = options.model?.providerID || 'opencode';
        const modelID = options.model?.modelID || 'big-pickle';

        const model: any = { providerID, modelID };
        if (options.enableThinking && options.reasoningEffort) {
            model.enableThinking = options.enableThinking;
            model.reasoningEffort = options.reasoningEffort;
        }

        // Try real-time event stream for thinking/tool updates
        let eventStream: EventStreamClient | null = null;
        const wantRealtime = !!(options.onThinkingChunk || options.onToolPartUpdate);

        if (wantRealtime) {
            try {
                eventStream = new EventStreamClient(serverUrl, sessionId);
                await eventStream.connect({
                    onTextDelta: (delta) => options.onChunk?.(delta),
                    onReasoningDelta: (delta) => options.onThinkingChunk?.(delta),
                    onToolPartUpdate: (part) => {
                        if (!options.onToolPartUpdate) return;
                        const state = part.state || {};
                        options.onToolPartUpdate({
                            partId: part.id,
                            callID: part.callID || part.id,
                            toolName: part.tool || 'unknown',
                            status: state.status || 'pending',
                            input: state.input,
                            output: state.output,
                            error: state.error,
                            title: state.title,
                        });
                    },
                    onSessionError: (error) => {
                        options.onError?.(new Error(formatErrorMessage(error)));
                    },
                }, options.signal);
            } catch (streamErr) {
                console.warn('[OpenCode] Failed to connect event stream, falling back to sync mode:', streamErr);
                eventStream?.close();
                eventStream = null;
            }
        }

        // Send the message
        const { response, resetTimeout } = await openCodeFetch(
            serverUrl,
            `/session/${encodeURIComponent(sessionId)}/message`,
            {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    parts: [{ type: 'text', text: options.prompt }],
                    ...(options.mode ? { mode: options.mode } : {})
                })
            },
            options.signal
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenCode request failed: ${response.status} ${response.statusText}${errText ? ' — ' + errText : ''}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let fullText = '';

        if (contentType.includes('text/event-stream')) {
            // SSE response from POST /message
            let accumulatedThinking = '';
            try {
                fullText = await parseSSEStream(response, (text) => {
                    options.onChunk?.(text);
                }, options.signal, (thinking) => {
                    accumulatedThinking += thinking;
                    options.onThinkingChunk?.(thinking);
                }, resetTimeout);
            } catch (streamErr) {
                if (fullText) {
                    options.onComplete?.(fullText);
                }
                if (accumulatedThinking) {
                    options.onThinkingComplete?.(accumulatedThinking);
                }
                eventStream?.close();
                throw streamErr;
            }
            options.onComplete?.(fullText);
            if (accumulatedThinking) {
                options.onThinkingComplete?.(accumulatedThinking);
            }
        } else {
            // Synchronous JSON response
            resetTimeout();
            const responseText = await response.text();
            resetTimeout();
            let data: any;
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch {
                if (responseText.trim()) {
                    fullText = responseText;
                    options.onChunk?.(fullText);
                    options.onComplete?.(fullText);
                    eventStream?.close();
                    return { sessionId: sessionId! };
                }
                data = {};
            }

            if (data?.success === false || data?.error) {
                const msg = formatErrorMessage(data.error);
                throw new Error(msg);
            }

            const parts = data?.parts || [];
            fullText = extractTextFromParts(parts);

            // Extract thinking from final response (fallback if event stream didn't deliver)
            const thinkingText = extractThinkingFromParts(parts);
            if (thinkingText && options.onThinkingChunk) {
                options.onThinkingChunk(thinkingText);
            }
            if (thinkingText && options.onThinkingComplete) {
                options.onThinkingComplete(thinkingText);
            }

            // Extract tool parts from final response (fallback)
            if (options.onToolPartUpdate) {
                for (const part of parts) {
                    if (part?.type === 'tool' && part?.state) {
                        options.onToolPartUpdate({
                            partId: part.id,
                            callID: part.callID || part.id,
                            toolName: part.tool || 'unknown',
                            status: part.state.status || 'completed',
                            input: part.state.input,
                            output: part.state.output,
                            error: part.state.error,
                            title: part.state.title,
                        });
                    }
                }
            }

            if (options.onChunk && fullText) {
                const chunkSize = Math.max(1, Math.ceil(fullText.length / 100));
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    if (options.signal?.aborted) throw new Error('Request aborted');
                    options.onChunk(fullText.slice(i, i + chunkSize));
                }
            }

            options.onComplete?.(fullText);
        }

        eventStream?.close();
        return { sessionId: sessionId! };
    } catch (error) {
        const err = error as Error;

        if (sessionCreated && sessionId) {
            deleteOpenCodeSession(config, sessionId).catch(() => {});
        }

        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            options.onError?.(new Error('Request aborted'));
        } else if (isConnectionError(err)) {
            options.onError?.(new Error(
                `Cannot connect to OpenCode. Please ensure opencode is installed and running. ` +
                `Run 'opencode serve' or let the plugin auto-start it.`
            ));
        } else {
            options.onError?.(err);
        }
        throw error;
    }
}
