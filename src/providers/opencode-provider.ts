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

function isOpenCodeToolPartUpdate(value: any): value is OpenCodeToolPartUpdate {
    return !!value && typeof value.callID === 'string' && typeof value.toolName === 'string' && typeof value.status === 'string';
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
    onPermissionAsked?: (req: PermissionRequest) => void;
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

function getEventPayload(parsed: any, currentEvent = ''): { type: string; properties: any } {
    const event =
        parsed?.payload && (parsed.payload.type || parsed.payload.properties)
            ? parsed.payload
            : parsed?.event && (parsed.event.type || parsed.event.properties)
              ? parsed.event
              : parsed;
    if (currentEvent && !event?.type && !event?.properties) {
        return {
            type: currentEvent,
            properties: event || {},
        };
    }
    return {
        type: event?.type || currentEvent || '',
        properties: event?.properties || event?.data || {},
    };
}

function getPartType(part: any): string {
    return String(part?.type || '').toLowerCase();
}

function isTextPart(part: any): boolean {
    return getPartType(part) === 'text';
}

function isReasoningPart(part: any): boolean {
    const type = getPartType(part);
    return type === 'reasoning' || type === 'thinking';
}

function isToolPart(part: any): boolean {
    const type = getPartType(part);
    return type === 'tool' || type === 'tool-invocation' || type === 'tool-result';
}

function getPartCacheKey(part: any, fallbackType: string): string {
    return `${fallbackType}:${part?.id || part?.partID || part?.callID || part?.tool || 'unknown'}`;
}

function getPartText(part: any): string {
    if (typeof part?.text === 'string') return part.text;
    if (typeof part?.content === 'string') return part.content;
    if (typeof part?.message === 'string') return part.message;
    return '';
}

function getPartDelta(part: any, delta: any, cache: Map<string, string>, fallbackType: string): string {
    if (typeof delta === 'string' && delta) {
        const key = getPartCacheKey(part, fallbackType);
        cache.set(key, (cache.get(key) || '') + delta);
        return delta;
    }

    const nextText = getPartText(part);
    if (!nextText) return '';

    const key = getPartCacheKey(part, fallbackType);
    const previousText = cache.get(key) || '';
    if (nextText === previousText) return '';

    cache.set(key, nextText);
    return nextText.startsWith(previousText) ? nextText.slice(previousText.length) : nextText;
}

function stringifyToolValue(value: any): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function normalizeToolName(value: any): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return value.name || value.id || value.tool || value.title || value.type;
}

function normalizeToolStatus(status: any): OpenCodeToolPartUpdate['status'] {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'running' || normalized === 'started' || normalized === 'executing') {
        return 'running';
    }
    if (normalized === 'completed' || normalized === 'done' || normalized === 'success') {
        return 'completed';
    }
    if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') {
        return 'error';
    }
    return 'pending';
}

function toolPartToUpdate(part: any): OpenCodeToolPartUpdate {
    const state = part?.state || {};
    const callID =
        part?.callID ||
        part?.toolCallID ||
        part?.invocationID ||
        state.callID ||
        state.toolCallID ||
        state.id ||
        part?.id ||
        'unknown';
    const rawStatus =
        state.status ||
        part?.status ||
        (state.error || part?.error
            ? 'error'
            : state.output !== undefined || part?.output !== undefined || part?.result !== undefined
              ? 'completed'
              : undefined);
    return {
        partId: part?.id || callID,
        callID,
        toolName:
            normalizeToolName(part?.tool) ||
            normalizeToolName(part?.toolName) ||
            normalizeToolName(state.tool) ||
            normalizeToolName(state.toolName) ||
            normalizeToolName(part?.name) ||
            part?.title ||
            'unknown',
        status: normalizeToolStatus(rawStatus),
        input:
            state.input ??
            state.arguments ??
            state.args ??
            part?.input ??
            part?.arguments ??
            part?.args ??
            part?.params,
        output: stringifyToolValue(state.output ?? state.result ?? part?.output ?? part?.result),
        error: stringifyToolValue(state.error ?? part?.error),
        title: state.title || part?.title,
    };
}

function toolEventToUpdate(eventType: string, props: any): OpenCodeToolPartUpdate | null {
    const tool =
        normalizeToolName(props?.tool) ||
        normalizeToolName(props?.name) ||
        normalizeToolName(props?.toolName) ||
        normalizeToolName(props?.call?.tool) ||
        normalizeToolName(props?.call?.name);
    const callID =
        props?.callID ||
        props?.toolCallID ||
        props?.invocationID ||
        props?.id ||
        props?.call?.id ||
        props?.call?.callID ||
        tool;
    if (!tool && !callID) return null;

    const error = props?.error || props?.call?.error;
    const isAfter = eventType.endsWith('.after') || eventType.endsWith('.updated');
    return {
        partId: callID || tool || 'opencode-tool',
        callID: callID || tool || 'opencode-tool',
        toolName: tool || 'unknown',
        status: eventType.endsWith('.before')
            ? 'running'
            : error
              ? 'error'
              : isAfter
                ? 'completed'
                : normalizeToolStatus(props?.status),
        input:
            props?.input ??
            props?.arguments ??
            props?.args ??
            props?.params ??
            props?.call?.input ??
            props?.call?.arguments,
        output: stringifyToolValue(props?.output ?? props?.result ?? props?.call?.output ?? props?.call?.result),
        error: stringifyToolValue(error),
        title: props?.title || props?.description,
    };
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
    onPermissionAsked?: (payload: PermissionRequest) => void;
}

export interface PermissionRequest {
    permissionID: string;
    sessionID: string;
    tool: string;
    input?: string;
    patterns?: string[];
    description?: string;
}

class EventStreamClient {
    private controller: AbortController | null = null;
    private serverUrl: string;
    private targetSessionId: string;
    private partTextCache = new Map<string, string>();

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
        console.log('[OpenCode] EventStream: connecting to', url);
        let response: Response;
        try {
            response = await fetch(url, { signal: this.controller.signal });
        } catch (err: any) {
            outerCleanup?.();
            if (err.name === 'AbortError') return;
            console.warn('[OpenCode] EventStream: connection failed:', err.message);
            throw err;
        }

        if (!response.ok) {
            outerCleanup?.();
            console.warn('[OpenCode] EventStream: server returned', response.status);
            throw new Error(`Event stream connection failed: ${response.status}`);
        }

        console.log('[OpenCode] EventStream: connected, status', response.status);

        const reader = response.body?.getReader();
        if (!reader) {
            outerCleanup?.();
            throw new Error('Event stream body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let eventCount = 0;

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

            const { type: eventType, properties: props } = getEventPayload(parsed, currentEvent);
            if (!eventType) return;

            if (eventType === 'message.part.updated') {
                const part = props.part;
                const delta = props.delta;
                if (!part) return;

                const partSessionId = props.sessionID || part.sessionID || part.sessionId;
                if (partSessionId && partSessionId !== this.targetSessionId) return;

                eventCount++;
                if (eventCount <= 5 || eventCount % 20 === 0) {
                    console.log(`[OpenCode] EventStream: part.updated #${eventCount}, type=${part.type}, delta=${(delta || '').slice(0, 50)}`);
                }

                if (isTextPart(part) && callbacks.onTextDelta) {
                    const textDelta = getPartDelta(part, delta, this.partTextCache, 'text');
                    if (textDelta) callbacks.onTextDelta(textDelta, part.id);
                } else if (isReasoningPart(part) && callbacks.onReasoningDelta) {
                    const reasoningDelta = getPartDelta(part, delta, this.partTextCache, 'reasoning');
                    if (reasoningDelta) callbacks.onReasoningDelta(reasoningDelta, part.id);
                } else if (isToolPart(part) && callbacks.onToolPartUpdate) {
                    callbacks.onToolPartUpdate(part);
                }
            } else if (eventType.startsWith('tool.execute.') && callbacks.onToolPartUpdate) {
                const sid = props.sessionID || props.sessionId || props.call?.sessionID;
                if (sid && sid !== this.targetSessionId) return;

                const update = toolEventToUpdate(eventType, props);
                if (update) {
                    callbacks.onToolPartUpdate(update);
                }
            } else if (eventType === 'session.idle') {
                const sid = props.sessionID;
                if (!sid || sid === this.targetSessionId) {
                    console.log('[OpenCode] EventStream: session.idle');
                    callbacks.onSessionIdle?.();
                }
            } else if (eventType === 'session.error') {
                const sid = props.sessionID;
                if (!sid || sid === this.targetSessionId) {
                    console.warn('[OpenCode] EventStream: session.error', props.error);
                    callbacks.onSessionError?.(props.error || 'Unknown session error');
                }
            } else if (eventType === 'permission.asked' || eventType === 'permission.updated' || eventType === 'permission.replied') {
                const permission = props.permission || props;
                const permId = props.permissionID || props.id || permission?.permissionID || permission?.id;
                const permSid = props.sessionID || permission?.sessionID;
                if (callbacks.onPermissionAsked && permId && (!permSid || permSid === this.targetSessionId)) {
                    console.log('[OpenCode] EventStream: permission.asked', props.tool || permission?.tool, permId);
                    callbacks.onPermissionAsked({
                        permissionID: permId,
                        sessionID: permSid || this.targetSessionId,
                        tool: props.tool || permission?.tool || permission?.type || 'unknown',
                        input: props.input || permission?.input || props.prompt || '',
                        patterns: props.patterns,
                        description: props.description || props.message || permission?.description || props.input || '',
                    });
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
                console.log('[OpenCode] EventStream: closed, received', eventCount, 'events');
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
    onToolPartUpdate?: (update: OpenCodeToolPartUpdate) => void,
    resetTimeout?: () => void
): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let currentEvent = '';
    const partTextCache = new Map<string, string>();

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
                if (!trimmed) {
                    currentEvent = '';
                    continue;
                }
                if (trimmed.startsWith(':')) continue;

                if (trimmed.startsWith('event:')) {
                    currentEvent = trimmed.slice(6).trim();
                    continue;
                }

                if (trimmed.startsWith('data:')) {
                    const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed?.success === false || parsed?.error) {
                            const msg = formatErrorMessage(parsed.error);
                            throw new Error(msg);
                        }

                        const { type: eventType, properties } = getEventPayload(parsed, currentEvent);
                        if (eventType === 'message.part.updated') {
                            const part = properties.part;
                            const delta = properties.delta;
                            if (part) {
                                if (isTextPart(part)) {
                                    const textDelta = getPartDelta(part, delta, partTextCache, 'text');
                                    if (textDelta) {
                                        fullText += textDelta;
                                        onChunk(textDelta);
                                    }
                                } else if (isReasoningPart(part) && onThinkingChunk) {
                                    const reasoningDelta = getPartDelta(part, delta, partTextCache, 'reasoning');
                                    if (reasoningDelta) {
                                        onThinkingChunk(reasoningDelta);
                                    }
                                } else if (isToolPart(part) && onToolPartUpdate) {
                                    onToolPartUpdate(toolPartToUpdate(part));
                                }
                            }
                            continue;
                        }

                        if (eventType.startsWith('tool.execute.') && onToolPartUpdate) {
                            const update = toolEventToUpdate(eventType, properties);
                            if (update) {
                                onToolPartUpdate(update);
                            }
                            continue;
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

export async function respondToPermission(
    config: OpenCodeProviderConfig,
    sessionId: string,
    permissionID: string,
    response: 'once' | 'always' | 'reject'
): Promise<boolean> {
    try {
        const { response: res } = await openCodeFetch(
            config.serverUrl,
            `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionID)}`,
            {
                method: 'POST',
                body: JSON.stringify({ response }),
            }
        );
        return res.ok;
    } catch {
        return false;
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
    let eventStream: EventStreamClient | null = null;

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
        if (options.enableThinking === true) {
            model.enableThinking = true;
            if (options.reasoningEffort) {
                model.reasoningEffort = options.reasoningEffort;
            }
        }

        // Try real-time event stream for thinking/tool updates
        const wantRealtime = !!(options.onThinkingChunk || options.onToolPartUpdate);
        let realtimeText = '';
        let realtimeThinking = '';

        if (wantRealtime) {
            try {
                eventStream = new EventStreamClient(serverUrl, sessionId);
                await eventStream.connect({
                    onTextDelta: (delta) => {
                        console.log('[OpenCode] EventStream onTextDelta:', delta.slice(0, 50));
                        realtimeText += delta;
                        options.onChunk?.(delta);
                    },
                    onReasoningDelta: (delta) => {
                        console.log('[OpenCode] EventStream onReasoningDelta:', delta.slice(0, 50));
                        realtimeThinking += delta;
                        options.onThinkingChunk?.(delta);
                    },
                    onToolPartUpdate: (part) => {
                        if (!options.onToolPartUpdate) return;
                        options.onToolPartUpdate(isOpenCodeToolPartUpdate(part) ? part : toolPartToUpdate(part));
                    },
                    onSessionError: (error) => {
                        options.onError?.(new Error(formatErrorMessage(error)));
                    },
                    onPermissionAsked: (req) => {
                        options.onPermissionAsked?.(req);
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
        console.log('[OpenCode] POST /message response content-type:', contentType, 'eventStream active:', !!eventStream);

        if (contentType.includes('text/event-stream')) {
            // SSE response from POST /message
            let accumulatedThinking = '';
            try {
                fullText = await parseSSEStream(response, (text) => {
                    if (!realtimeText) {
                        options.onChunk?.(text);
                    }
                }, options.signal, (thinking) => {
                    accumulatedThinking += thinking;
                    if (!realtimeThinking) {
                        options.onThinkingChunk?.(thinking);
                    }
                }, options.onToolPartUpdate, resetTimeout);
            } catch (streamErr) {
                const partialText = fullText || realtimeText;
                const partialThinking = accumulatedThinking || realtimeThinking;
                if (partialText) {
                    options.onComplete?.(partialText);
                }
                if (partialThinking) {
                    options.onThinkingComplete?.(partialThinking);
                }
                eventStream?.close();
                throw streamErr;
            }
            const finalText = fullText || realtimeText;
            const finalThinking = accumulatedThinking || realtimeThinking;
            options.onComplete?.(finalText);
            if (finalThinking) {
                options.onThinkingComplete?.(finalThinking);
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
                    if (!realtimeText) {
                        options.onChunk?.(fullText);
                    }
                    options.onComplete?.(fullText || realtimeText);
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
            if (thinkingText && options.onThinkingChunk && !realtimeThinking) {
                options.onThinkingChunk(thinkingText);
            }
            const finalThinking = thinkingText || realtimeThinking;
            if (finalThinking && options.onThinkingComplete) {
                options.onThinkingComplete(finalThinking);
            }

            // Extract tool parts from final response (fallback)
            if (options.onToolPartUpdate) {
                for (const part of parts) {
                    if (isToolPart(part)) {
                        options.onToolPartUpdate(toolPartToUpdate(part));
                    }
                }
            }

            if (options.onChunk && fullText && !realtimeText) {
                const chunkSize = Math.max(1, Math.ceil(fullText.length / 100));
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    if (options.signal?.aborted) throw new Error('Request aborted');
                    options.onChunk(fullText.slice(i, i + chunkSize));
                }
            }

            options.onComplete?.(fullText || realtimeText);
        }

        eventStream?.close();
        return { sessionId: sessionId! };
    } catch (error) {
        eventStream?.close();
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

// ─── Command API ──────────────────────────────────────────────────────────────

export interface OpenCodeCommand {
    name: string;
    description?: string;
    args?: Array<{ name: string; description?: string; required?: boolean }>;
}

export async function listCommands(config: OpenCodeProviderConfig): Promise<OpenCodeCommand[]> {
    try {
        const { response } = await openCodeFetch(config.serverUrl, '/command', { method: 'GET' });
        if (!response.ok) return [];
        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.commands)) return data.commands;
        return [];
    } catch {
        return [];
    }
}

export interface CommandResult {
    success: boolean;
    sessionId: string;
    parts?: any[];
    info?: any;
}

export async function executeCommand(
    config: OpenCodeProviderConfig,
    sessionId: string,
    command: string,
    args?: string,
    model?: { providerID: string; modelID: string },
    agent?: string
): Promise<CommandResult> {
    const { response } = await openCodeFetch(
        config.serverUrl,
        `/session/${encodeURIComponent(sessionId)}/command`,
        {
            method: 'POST',
            body: JSON.stringify({
                command,
                arguments: args || '',
                ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
                ...(agent ? { agent } : {}),
            }),
        }
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Command failed: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return {
        success: true,
        sessionId: data?.sessionID || sessionId,
        parts: data?.parts,
        info: data?.info,
    };
}

export async function sendPromptAsync(
    config: OpenCodeProviderConfig,
    sessionId: string,
    prompt: string,
    model?: { providerID: string; modelID: string }
): Promise<void> {
    const { response } = await openCodeFetch(
        config.serverUrl,
        `/session/${encodeURIComponent(sessionId)}/prompt_async`,
        {
            method: 'POST',
            body: JSON.stringify({
                parts: [{ type: 'text', text: prompt }],
                ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
            }),
        }
    );
    if (response.status !== 204) {
        console.warn(`[OpenCode] prompt_async returned ${response.status}`);
    }
}

export async function initSession(
    config: OpenCodeProviderConfig,
    sessionId: string,
    messageId?: string,
    model?: { providerID: string; modelID: string }
): Promise<boolean> {
    const { response } = await openCodeFetch(
        config.serverUrl,
        `/session/${encodeURIComponent(sessionId)}/init`,
        {
            method: 'POST',
            body: JSON.stringify({
                ...(messageId ? { messageID: messageId } : {}),
                ...(model ? { providerID: model.providerID, modelID: model.modelID } : {}),
            }),
        }
    );
    return response.ok;
}
