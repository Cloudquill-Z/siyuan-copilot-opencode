import { OPENCODE_SESSION_TITLE } from "../pluginNamespace";
import type { DiagnosticLogger } from "../diagnostic-logger";
import {
    parseOpenCodeProviderModels,
    type OpenCodeModelInfo,
} from "./opencode-models";
import {
    createRealtimeCompletionWatcher,
    type RealtimeCompletionWatcher,
    type RealtimeSessionStatus,
} from "./realtime-completion-watcher";
import { getOpenCodeAgentForChatMode } from "../utils/chatMode";
import { getOpenCodeServerAuthHeader } from "../utils/opencode";

export type { OpenCodeModelInfo } from "./opencode-models";

export interface OpenCodeProviderConfig {
    serverUrl: string;
    directory?: string;
    workspace?: string;
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
    reasoningEffort?: 'low' | 'medium' | 'high' | 'max' | 'auto';
    onThinkingChunk?: (text: string) => void;
    onThinkingComplete?: (thinking: string) => void;
    onToolPartUpdate?: (update: OpenCodeToolPartUpdate) => void;
    tools?: any;
    customBody?: any;
    onPermissionAsked?: (req: PermissionRequest) => void;
    onQuestionAsked?: (req: QuestionRequest) => void;
    mode?: 'plan' | 'build';
    diagnosticLogger?: DiagnosticLogger;
    directory?: string;
    workspace?: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:4096';
const IDLE_TIMEOUT_MS = 300_000;
const SESSION_STATUS_POLL_INTERVAL_MS = 5_000;

const MODEL_CACHE_TTL = 5 * 60 * 1000;
const OPENCODE_DEBUG_LOGS = false;
const modelCache = new Map<string, { models: OpenCodeModelInfo[]; timestamp: number }>();

function debugOpenCode(...args: any[]) {
    if (OPENCODE_DEBUG_LOGS) {
        console.debug(...args);
    }
}

function logDiagnostic(logger: DiagnosticLogger | undefined, event: string, data?: unknown) {
    if (!logger) return;
    void logger.log(event, data).catch(err => {
        console.warn('[OpenCode] Failed to write diagnostic log:', err);
    });
}

function logToolDiagnostic(
    logger: DiagnosticLogger | undefined,
    source: string,
    update: OpenCodeToolPartUpdate
) {
    logDiagnostic(logger, 'tool.update', { source, part: update });
    if (update.status === 'running' || update.status === 'pending') {
        logDiagnostic(logger, 'tool.started', { source, part: update });
    } else if (update.status === 'completed') {
        logDiagnostic(logger, 'tool.completed', { source, part: update });
    } else if (update.status === 'error') {
        logDiagnostic(logger, 'tool.error', { source, part: update });
    }
}

function normalizeServerUrl(serverUrl: string): string {
    const trimmed = (serverUrl || '').trim();
    if (!trimmed) {
        return DEFAULT_SERVER_URL;
    }
    return trimmed.replace(/\/$/, '');
}

function normalizeQueryValue(value: any): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function getOpenCodeRequestContext(
    options?: Pick<OpenCodeChatOptions, 'customBody' | 'directory' | 'workspace'>,
    config?: Pick<OpenCodeProviderConfig, 'directory' | 'workspace'>
): { directory?: string; workspace?: string } {
    const customBody = options?.customBody && typeof options.customBody === 'object'
        ? options.customBody
        : {};

    return {
        directory:
            normalizeQueryValue(options?.directory) ??
            normalizeQueryValue(customBody.directory) ??
            normalizeQueryValue(config?.directory),
        workspace:
            normalizeQueryValue(options?.workspace) ??
            normalizeQueryValue(customBody.workspace) ??
            normalizeQueryValue(config?.workspace),
    };
}

function withOpenCodeRequestContext(
    path: string,
    context?: { directory?: string; workspace?: string }
): string {
    const params = new URLSearchParams();
    if (context?.directory) params.set('directory', context.directory);
    if (context?.workspace) params.set('workspace', context.workspace);
    const query = params.toString();
    return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
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
    return type === 'reasoning' || type === 'thinking' || type.includes('reasoning') || type.includes('thinking');
}

function isToolPart(part: any): boolean {
    const type = getPartType(part);
    return type === 'tool' || type === 'tool-invocation' || type === 'tool-result' || type.includes('tool');
}

function getPartRole(part: any, props: any = {}): string {
    return String(
        props?.role ||
        props?.message?.role ||
        props?.message?.type ||
        part?.role ||
        part?.message?.role ||
        part?.message?.type ||
        ''
    ).toLowerCase();
}

function isAssistantAuthoredPart(part: any, props: any = {}): boolean {
    const role = getPartRole(part, props);
    return role === 'assistant';
}

function getPartCacheKey(part: any, fallbackType: string): string {
    return `${fallbackType}:${part?.id || part?.partID || part?.callID || part?.tool || 'unknown'}`;
}

function getPartText(part: any): string {
    if (typeof part?.text === 'string') return part.text;
    if (typeof part?.content === 'string') return part.content;
    if (typeof part?.message === 'string') return part.message;
    if (typeof part?.reasoning === 'string') return part.reasoning;
    if (typeof part?.thinking === 'string') return part.thinking;
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
    const explicitCallID =
        props?.callID ||
        props?.toolCallID ||
        props?.invocationID ||
        props?.id ||
        props?.call?.id ||
        props?.call?.callID;
    const fallbackCallID = [
        props?.sessionID || props?.sessionId || props?.call?.sessionID || props?.call?.sessionId,
        props?.messageID || props?.messageId || props?.call?.messageID || props?.call?.messageId,
        props?.partID || props?.partId || props?.call?.partID || props?.call?.partId,
        tool,
        stringifyToolValue(props?.input ?? props?.arguments ?? props?.args ?? props?.params ?? props?.call?.input ?? props?.call?.arguments),
    ].filter(Boolean).join(':');
    const callID = explicitCallID || fallbackCallID;
    if (!tool && !callID) return null;

    const error = props?.error || props?.call?.error;
    const normalizedEventType = eventType.toLowerCase();
    const isRunning =
        normalizedEventType.endsWith('.before') ||
        normalizedEventType.includes('start') ||
        normalizedEventType.includes('running') ||
        normalizedEventType.includes('progress');
    const isAfter =
        normalizedEventType.endsWith('.after') ||
        normalizedEventType.endsWith('.updated') ||
        normalizedEventType.includes('complete') ||
        normalizedEventType.includes('finish') ||
        normalizedEventType.includes('done');
    return {
        partId: callID || tool || 'opencode-tool',
        callID: callID || tool || 'opencode-tool',
        toolName: tool || 'unknown',
        status: isRunning
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

function normalizeOpenCodeTools(tools: any): Record<string, boolean> | undefined {
    if (!tools) return undefined;
    if (!Array.isArray(tools) && typeof tools === 'object') {
        return tools;
    }
    if (!Array.isArray(tools)) return undefined;

    const normalized: Record<string, boolean> = {};
    for (const tool of tools) {
        const name =
            tool?.function?.name ||
            tool?.name ||
            tool?.id ||
            tool?.tool;
        if (name) normalized[name] = true;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildPromptBody(options: OpenCodeChatOptions, model: any): any {
    const rawCustomBody = options.customBody && typeof options.customBody === 'object'
        ? { ...options.customBody }
        : {};
    const customBody: any = {};
    for (const key of ['messageID', 'agent', 'noReply', 'tools', 'format', 'system', 'variant']) {
        if (rawCustomBody[key] !== undefined) {
            customBody[key] = rawCustomBody[key];
        }
    }

    const tools = normalizeOpenCodeTools(options.tools ?? rawCustomBody.tools);
    if (tools) {
        customBody.tools = tools;
    }
    return {
        ...(options.enableThinking === true &&
        options.reasoningEffort &&
        options.reasoningEffort !== 'auto'
            ? { variant: options.reasoningEffort }
            : {}),
        ...customBody,
        model,
        parts: [{ type: 'text', text: options.prompt }],
        ...(options.mode ? { agent: getOpenCodeAgentForChatMode(options.mode) } : {})
    };
}

function getEventParts(props: any): any[] {
    const candidates = [
        props?.part,
        props?.message?.part,
        props?.data?.part,
        props?.payload?.part,
    ].filter(Boolean);

    for (const parts of [props?.parts, props?.message?.parts, props?.data?.parts, props?.payload?.parts]) {
        if (Array.isArray(parts)) {
            candidates.push(...parts);
        }
    }

    return candidates;
}

function getPartSessionId(part: any, props: any): string | undefined {
    return props?.sessionID || props?.sessionId || props?.message?.sessionID || props?.message?.sessionId || part?.sessionID || part?.sessionId;
}

function getPartMessageId(part: any, props: any): string | undefined {
    return part?.messageID || part?.messageId || props?.messageID || props?.messageId || props?.info?.id || props?.message?.id;
}

function processRealtimePart(
    part: any,
    props: any,
    delta: any,
    partTextCache: Map<string, string>,
    callbacks: {
        onTextDelta?: (delta: string, partId: string) => void;
        onReasoningDelta?: (delta: string, partId: string) => void;
        onToolPartUpdate?: (part: any) => void;
    }
): boolean {
    if (!part) return false;
    const partId = part.id || part.partID || part.callID || part.toolCallID || 'unknown';

    if (isTextPart(part) && callbacks.onTextDelta && isAssistantAuthoredPart(part, props)) {
        const textDelta = getPartDelta(part, delta, partTextCache, 'text');
        if (textDelta) callbacks.onTextDelta(textDelta, partId);
        return !!textDelta;
    }

    if (isReasoningPart(part) && callbacks.onReasoningDelta) {
        const reasoningDelta = getPartDelta(part, delta, partTextCache, 'reasoning');
        if (reasoningDelta) callbacks.onReasoningDelta(reasoningDelta, partId);
        return !!reasoningDelta;
    }

    if (isToolPart(part) && callbacks.onToolPartUpdate) {
        callbacks.onToolPartUpdate(part);
        return true;
    }

    return false;
}

function formatErrorMessage(error: any): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (Array.isArray(error) && error.length > 0) {
        return formatErrorMessage(error[0]) || JSON.stringify(error);
    }
    if (typeof error === 'object') {
        return (
            error?.message ||
            error?.error ||
            error?.data?.message ||
            error?.data?.error ||
            error?.cause?.message ||
            error?.cause?.code ||
            JSON.stringify(error)
        );
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
        msg.includes('err_ssl_protocol_error') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('fetch error')
    );
}

function isTlsCertificateError(err: Error): boolean {
    const msg = err.message?.toLowerCase() || '';
    return (
        msg.includes('certificate verification error') ||
        msg.includes('certificate') && (msg.includes('verif') || msg.includes('invalid') || msg.includes('self-signed')) ||
        msg.includes('unable_to_verify_leaf_signature') ||
        msg.includes('self signed certificate') ||
        msg.includes('err_cert_authority_invalid') ||
        msg.includes('err_cert_common_name_invalid') ||
        msg.includes('cert_authority_invalid') ||
        msg.includes('x509') ||
        msg.includes('tls') && msg.includes('cert')
    );
}

function tlsCertificateErrorMessage(serverUrl: string): string {
    return (
        `TLS 证书验证失败 — OpenCode 服务器无法验证上游 AI 提供商的 SSL 证书。\n` +
        `可能原因：系统 CA 证书包缺失或 Bun 运行时无法访问 macOS 钥匙串。\n` +
        `解决方法：重启 OpenCode 服务器（${serverUrl}）。插件会自动设置 NODE_EXTRA_CA_CERTS 和 SSL_CERT_FILE 环境变量指向系统 CA 证书包。` +
        `如果你是手动启动 opencode serve，请先设置环境变量：export NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem（macOS）或 /etc/ssl/certs/ca-certificates.crt（Linux）`
    );
}

function normalizeSessionStatus(value: any): RealtimeSessionStatus {
    const raw =
        typeof value === 'string'
            ? value
            : value?.status?.type ||
              value?.status ||
              value?.type ||
              value?.state ||
              value?.phase ||
              '';
    const normalized = String(raw).toLowerCase();
    if (normalized.includes('idle') || normalized.includes('complete') || normalized.includes('done')) {
        return 'idle';
    }
    if (normalized.includes('error') || normalized.includes('fail')) {
        return 'error';
    }
    if (
        normalized.includes('running') ||
        normalized.includes('busy') ||
        normalized.includes('pending') ||
        normalized.includes('working') ||
        normalized.includes('queue')
    ) {
        return 'running';
    }
    return 'unknown';
}

async function fetchOpenCodeSessionStatus(
    serverUrl: string,
    sessionId: string
): Promise<RealtimeSessionStatus> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
        const authHeader = getOpenCodeServerAuthHeader();
        const response = await fetch(`${normalizeServerUrl(serverUrl)}/session/status`, {
            signal: controller.signal,
            headers: authHeader ? { Authorization: authHeader } : undefined,
        });
        if (!response.ok) {
            return 'unknown';
        }

        const data = await response.json().catch(() => null);
        if (!data) {
            return 'unknown';
        }

        if (Array.isArray(data)) {
            const match = data.find((item: any) => item?.sessionId === sessionId || item?.sessionID === sessionId || item?.id === sessionId);
            return normalizeSessionStatus(match);
        }

        const direct = data[sessionId] || data.sessions?.[sessionId] || data.sessionStatus?.[sessionId];
        if (direct) {
            return normalizeSessionStatus(direct);
        }

        if (data.sessionId === sessionId || data.sessionID === sessionId || data.id === sessionId) {
            return normalizeSessionStatus(data);
        }

        return 'unknown';
    } catch {
        return 'unknown';
    } finally {
        clearTimeout(timer);
    }
}

async function openCodeFetch(
    serverUrl: string,
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
    idleTimeoutMs: number | null = IDLE_TIMEOUT_MS
): Promise<{ response: Response; resetTimeout: () => void; clearTimeout: () => void }> {
    const url = `${normalizeServerUrl(serverUrl)}${path}`;

    if (signal?.aborted) {
        throw new Error('Request aborted');
    }

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null =
        idleTimeoutMs === null ? null : setTimeout(() => controller.abort(), idleTimeoutMs);
    let handedOff = false;
    let cleanupSignal: (() => void) | null = null;

    const clearIdleTimeout = () => {
        if (timeout) {
            globalThis.clearTimeout(timeout);
            timeout = null;
        }
        cleanupSignal?.();
        cleanupSignal = null;
    };

    const resetTimeout = () => {
        if (idleTimeoutMs === null) return;
        if (timeout) {
            globalThis.clearTimeout(timeout);
        }
        timeout = setTimeout(() => controller.abort(), idleTimeoutMs);
    };

    cleanupSignal = signal
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
        const authHeader = getOpenCodeServerAuthHeader();
        const response = await fetch(url, {
            ...options,
            signal: controller.signal as AbortSignal,
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader ? { Authorization: authHeader } : {}),
                ...(options.headers || {})
            }
        });
        handedOff = true;
        return { response, resetTimeout, clearTimeout: clearIdleTimeout };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            const minutes = idleTimeoutMs ? Math.round(idleTimeoutMs / 60_000) : 0;
            throw new Error(`OpenCode request timed out${minutes ? ` (no activity for ${minutes} minutes)` : ''}. The server may be overloaded or not responding.`);
        }
        if (isConnectionError(err)) {
            throw new Error(
                `Cannot connect to OpenCode at ${normalizeServerUrl(serverUrl)}. ` +
                `Please ensure opencode is installed and running. ` +
                `Run 'opencode serve' in your terminal, or the plugin can auto-start it.`
            );
        }
        if (isTlsCertificateError(err)) {
            throw new Error(tlsCertificateErrorMessage(normalizeServerUrl(serverUrl)));
        }
        throw err;
    } finally {
        if (!handedOff) {
            clearIdleTimeout();
        }
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
    onPermissionActivity?: (isWaiting: boolean) => void;
    onQuestionAsked?: (payload: QuestionRequest) => void;
    onQuestionActivity?: (isWaiting: boolean) => void;
}

export interface PermissionRequest {
    permissionID: string;
    sessionID: string;
    tool: string;
    input?: string;
    patterns?: string[];
    description?: string;
}

export interface QuestionOption {
    label: string;
    description?: string;
}

export interface QuestionInfo {
    header?: string;
    question: string;
    options: QuestionOption[];
    multiple?: boolean;
    custom?: boolean;
}

export interface QuestionRequest {
    requestID: string;
    sessionID: string;
    questions: QuestionInfo[];
    tool?: any;
}

function normalizeQuestionOptions(options: any): QuestionOption[] {
    if (!Array.isArray(options)) return [];
    return options
        .map((option: any) => {
            if (typeof option === 'string') {
                return { label: option };
            }
            const label = option?.label || option?.text || option?.value || option?.name || option?.id;
            if (!label) return null;
            return {
                label: String(label),
                description: option?.description ? String(option.description) : undefined,
            };
        })
        .filter(Boolean) as QuestionOption[];
}

function normalizeQuestionInfo(question: any): QuestionInfo {
    return {
        header: question?.header ? String(question.header) : undefined,
        question: String(question?.question || question?.prompt || question?.message || question?.title || 'OpenCode 需要你的回答'),
        options: normalizeQuestionOptions(question?.options || question?.choices),
        multiple: !!question?.multiple,
        custom: question?.custom !== false,
    };
}

function normalizeQuestionRequest(props: any, fallbackSessionId: string): QuestionRequest | null {
    const request = props?.request || props?.question || props;
    const requestID = props?.requestID || props?.requestId || props?.id || request?.requestID || request?.requestId || request?.id;
    const sessionID = props?.sessionID || props?.sessionId || request?.sessionID || request?.sessionId || fallbackSessionId;
    if (!requestID) return null;

    const rawQuestions = Array.isArray(request?.questions)
        ? request.questions
        : [request?.questions || request];
    const questions = rawQuestions.map(normalizeQuestionInfo).filter((question) => question.question);

    return {
        requestID: String(requestID),
        sessionID: String(sessionID),
        questions: questions.length > 0 ? questions : [normalizeQuestionInfo(request)],
        tool: request?.tool || props?.tool,
    };
}

class EventStreamClient {
    private controller: AbortController | null = null;
    private serverUrl: string;
    private targetSessionId: string;
    private partTextCache = new Map<string, string>();
    private partsById = new Map<string, any>();
    private messageRoles = new Map<string, string>();
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    constructor(serverUrl: string, sessionId: string) {
        this.serverUrl = normalizeServerUrl(serverUrl);
        this.targetSessionId = sessionId;
    }

    async connect(callbacks: EventStreamCallbacks, signal?: AbortSignal): Promise<void> {
        this.controller = new AbortController();
        if (signal?.aborted) {
            this.controller.abort();
            throw new Error('Request aborted');
        }

        const outerCleanup = signal
            ? (() => {
                  const listen = () => this.controller?.abort();
                  signal.addEventListener('abort', listen);
                  return () => signal.removeEventListener('abort', listen);
              })()
            : null;

        const url = `${this.serverUrl}/global/event`;
        debugOpenCode('[OpenCode] EventStream: connecting to', url);
        let response: Response;
        try {
            const authHeader = getOpenCodeServerAuthHeader();
            response = await fetch(url, {
                signal: this.controller.signal,
                headers: authHeader ? { Authorization: authHeader } : undefined,
            });
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

        debugOpenCode('[OpenCode] EventStream: connected, status', response.status);

        const reader = response.body?.getReader();
        if (!reader) {
            outerCleanup?.();
            throw new Error('Event stream body is not readable');
        }
        this.reader = reader;

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

            if (eventType === 'message.updated' && props?.info?.id) {
                this.messageRoles.set(props.info.id, String(props.info.role || '').toLowerCase());
            }

            const eventParts = getEventParts(props);
            if (eventParts.length > 0) {
                for (const part of eventParts) {
                    const partSessionId = getPartSessionId(part, props);
                    if (partSessionId && partSessionId !== this.targetSessionId) continue;
                    const messageId = getPartMessageId(part, props);
                    const partId = part.id || part.partID || part.partId;
                    const role = messageId ? this.messageRoles.get(messageId) : undefined;
                    const partWithRole = role ? { ...part, role } : part;
                    if (partId) {
                        this.partsById.set(partId, { ...(this.partsById.get(partId) || {}), ...partWithRole });
                    }

                    eventCount++;
                    if (eventCount <= 5 || eventCount % 20 === 0) {
                        debugOpenCode(`[OpenCode] EventStream: part #${eventCount}, event=${eventType}, type=${part.type}, delta=${(props.delta || '').slice(0, 50)}`);
                    }

                    processRealtimePart(partWithRole, props, props.delta, this.partTextCache, callbacks);
                }
                return;
            }

            if (eventType === 'message.part.delta') {
                const sid = props.sessionID || props.sessionId;
                if (sid && sid !== this.targetSessionId) return;

                const partId = props.partID || props.partId || props.id;
                const cachedPart = partId ? this.partsById.get(partId) : null;
                if (cachedPart) {
                    processRealtimePart(cachedPart, props, props.delta, this.partTextCache, callbacks);
                    return;
                }
            }

            if ((eventType.startsWith('tool.execute.') || eventType.toLowerCase().includes('tool')) && callbacks.onToolPartUpdate) {
                const sid = props.sessionID || props.sessionId || props.call?.sessionID;
                if (sid && sid !== this.targetSessionId) return;

                const update = toolEventToUpdate(eventType, props);
                if (update) {
                    callbacks.onToolPartUpdate(update);
                }
            } else if (eventType === 'session.idle') {
                const sid = props.sessionID;
                if (!sid || sid === this.targetSessionId) {
                    debugOpenCode('[OpenCode] EventStream: session.idle');
                    callbacks.onSessionIdle?.();
                }
            } else if (eventType === 'session.status') {
                const sid = props.sessionID;
                if ((!sid || sid === this.targetSessionId) && props?.status?.type === 'idle') {
                    debugOpenCode('[OpenCode] EventStream: session.status idle');
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
                if (permId && (!permSid || permSid === this.targetSessionId)) {
                    const isWaiting = eventType === 'permission.asked';
                    callbacks.onPermissionActivity?.(isWaiting);
                    if (callbacks.onPermissionAsked && isWaiting) {
                        debugOpenCode('[OpenCode] EventStream: permission.asked', props.tool || permission?.tool, permId);
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
            } else if (eventType === 'question.asked' || eventType === 'question.replied' || eventType === 'question.rejected') {
                const request = normalizeQuestionRequest(props, this.targetSessionId);
                if (request && (!request.sessionID || request.sessionID === this.targetSessionId)) {
                    const isWaiting = eventType === 'question.asked';
                    callbacks.onQuestionActivity?.(isWaiting);
                    if (callbacks.onQuestionAsked && isWaiting) {
                        debugOpenCode('[OpenCode] EventStream: question.asked', request.requestID);
                        callbacks.onQuestionAsked(request);
                    }
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

                if (buffer.trim()) {
                    processLine(buffer);
                    buffer = '';
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.warn('[OpenCode] Event stream read error:', err);
                    callbacks.onSessionError?.(err);
                }
            } finally {
                debugOpenCode('[OpenCode] EventStream: closed, received', eventCount, 'events');
                try {
                    reader.releaseLock();
                } catch {
                    // Reader may already be released after an explicit close.
                }
                if (this.reader === reader) {
                    this.reader = null;
                }
                outerCleanup?.();
            }
        })();
    }

    close(): void {
        this.controller?.abort();
        this.reader?.cancel().catch(() => {});
        this.reader = null;
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
                        const eventParts = getEventParts(properties);
                        if (eventParts.length > 0) {
                            for (const part of eventParts) {
                                processRealtimePart(part, properties, properties.delta, partTextCache, {
                                    onTextDelta: (textDelta) => {
                                        fullText += textDelta;
                                        onChunk(textDelta);
                                    },
                                    onReasoningDelta: (reasoningDelta) => {
                                        onThinkingChunk?.(reasoningDelta);
                                    },
                                    onToolPartUpdate: (toolPart) => {
                                        onToolPartUpdate?.(toolPartToUpdate(toolPart));
                                    }
                                });
                            }
                            continue;
                        }

                        if ((eventType.startsWith('tool.execute.') || eventType.toLowerCase().includes('tool')) && onToolPartUpdate) {
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

        if (buffer.trim()) {
            const line = buffer;
            buffer = '';
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
                const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
                if (data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data);
                        const { properties } = getEventPayload(parsed, currentEvent);
                        const eventParts = getEventParts(properties);
                        for (const part of eventParts) {
                            processRealtimePart(part, properties, properties.delta, partTextCache, {
                                onTextDelta: (textDelta) => {
                                    fullText += textDelta;
                                    onChunk(textDelta);
                                },
                                onReasoningDelta: (reasoningDelta) => {
                                    onThinkingChunk?.(reasoningDelta);
                                },
                                onToolPartUpdate: (toolPart) => {
                                    onToolPartUpdate?.(toolPartToUpdate(toolPart));
                                }
                            });
                        }
                    } catch {
                        // Incomplete trailing SSE frames are ignored.
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

    let clearFetchTimeout: (() => void) | null = null;
    try {
        const fetchResult = await openCodeFetch(
            config.serverUrl,
            '/provider',
            { method: 'GET' }
        );
        const { response } = fetchResult;
        clearFetchTimeout = fetchResult.clearTimeout;

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

        const connectedProviders = 'connected' in data
            ? new Set<string>(Array.isArray(data.connected) ? data.connected : [])
            : undefined;
        const models = parseOpenCodeProviderModels(data, connectedProviders);

        modelCache.set(serverUrl, { models, timestamp: Date.now() });
        return models;
    } catch (error) {
        const err = error as Error;
        if (err.name === 'AbortError') {
            throw new Error('Request timed out while fetching models');
        }
        throw err;
    } finally {
        clearFetchTimeout?.();
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
        const fetchResult = await openCodeFetch(
            config.serverUrl,
            `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionID)}`,
            {
                method: 'POST',
                body: JSON.stringify({ response }),
            }
        );
        try {
            return fetchResult.response.ok;
        } finally {
            fetchResult.clearTimeout();
        }
    } catch {
        return false;
    }
}

export async function replyToQuestion(
    config: OpenCodeProviderConfig,
    requestID: string,
    answers: string[][]
): Promise<boolean> {
    try {
        const fetchResult = await openCodeFetch(
            config.serverUrl,
            `/question/${encodeURIComponent(requestID)}/reply`,
            {
                method: 'POST',
                body: JSON.stringify({ answers }),
            }
        );
        try {
            return fetchResult.response.ok;
        } finally {
            fetchResult.clearTimeout();
        }
    } catch {
        return false;
    }
}

export async function rejectQuestion(
    config: OpenCodeProviderConfig,
    requestID: string
): Promise<boolean> {
    try {
        const fetchResult = await openCodeFetch(
            config.serverUrl,
            `/question/${encodeURIComponent(requestID)}/reject`,
            { method: 'POST' }
        );
        try {
            return fetchResult.response.ok;
        } finally {
            fetchResult.clearTimeout();
        }
    } catch {
        return false;
    }
}

export async function deleteOpenCodeSession(
    config: OpenCodeProviderConfig,
    sessionId: string
): Promise<void> {
    try {
        const fetchResult = await openCodeFetch(
            config.serverUrl,
            `/session/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
        );
        const { response } = fetchResult;
        if (!response.ok && response.status !== 404) {
            console.warn(`[OpenCode] Session cleanup returned ${response.status}`);
        }
        fetchResult.clearTimeout();
    } catch (err) {
        console.warn('[OpenCode] Session cleanup failed:', err);
    }
}

export async function chatOpenCode(
    options: OpenCodeChatOptions,
    config: OpenCodeProviderConfig
): Promise<{ sessionId: string }> {
    const serverUrl = normalizeServerUrl(config.serverUrl);
    const diagnosticLogger = options.diagnosticLogger;
    const requestContext = getOpenCodeRequestContext(options, config);
    let sessionId = options.sessionId;
    let sessionCreated = false;
    let eventStream: EventStreamClient | null = null;
    let wantRealtime = false;
    let realtimeText = '';
    let realtimeThinking = '';
    let realtimeHadUsefulActivity = false;
    let deliveredPartialResponse = false;

    try {
        if (!sessionId) {
            logDiagnostic(diagnosticLogger, 'request.sent', {
                method: 'POST',
                path: '/session',
                purpose: 'create-session',
            });
            const createFetchResult = await openCodeFetch(
                serverUrl,
                withOpenCodeRequestContext('/session', requestContext),
                {
                    method: 'POST',
                    body: JSON.stringify({ title: OPENCODE_SESSION_TITLE })
                },
                options.signal
            );
            const createRes = createFetchResult.response;
            logDiagnostic(diagnosticLogger, 'request.response', {
                method: 'POST',
                path: '/session',
                status: createRes.status,
                ok: createRes.ok,
            });

            try {
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
            logDiagnostic(diagnosticLogger, 'session.created', { sessionId });
            } finally {
                createFetchResult.clearTimeout();
            }
            sessionCreated = true;
        } else {
            logDiagnostic(diagnosticLogger, 'session.reused', { sessionId });
        }

        const providerID = options.model?.providerID || 'opencode';
        const modelID = options.model?.modelID || 'big-pickle';

        const model = { providerID, modelID };

        // Prefer prompt_async + event stream for all chats. Newer OpenCode server
        // builds have regressed the synchronous /message path with seq write errors.
        wantRealtime = true;
        let completionWatcher: RealtimeCompletionWatcher | null = null;

        if (wantRealtime) {
            try {
                logDiagnostic(diagnosticLogger, 'event_stream.connecting', {
                    path: '/global/event',
                    sessionId,
                });
                completionWatcher = createRealtimeCompletionWatcher({
                    signal: options.signal,
                    idleTimeoutMs: IDLE_TIMEOUT_MS,
                    pollIntervalMs: SESSION_STATUS_POLL_INTERVAL_MS,
                    getSessionStatus: () => fetchOpenCodeSessionStatus(serverUrl, sessionId!),
                });
                eventStream = new EventStreamClient(serverUrl, sessionId);
                await eventStream.connect({
                    onTextDelta: (delta) => {
                        logDiagnostic(diagnosticLogger, 'text.delta', {
                            source: 'event-stream',
                            length: delta.length,
                            text: delta,
                        });
                        debugOpenCode('[OpenCode] EventStream onTextDelta:', delta.slice(0, 50));
                        realtimeHadUsefulActivity = true;
                        completionWatcher?.markPermissionWaiting(false);
                        completionWatcher?.markActivity('text-delta');
                        realtimeText += delta;
                        options.onChunk?.(delta);
                    },
                    onReasoningDelta: (delta) => {
                        logDiagnostic(diagnosticLogger, 'thinking.delta', {
                            source: 'event-stream',
                            length: delta.length,
                            text: delta,
                        });
                        debugOpenCode('[OpenCode] EventStream onReasoningDelta:', delta.slice(0, 50));
                        realtimeHadUsefulActivity = true;
                        completionWatcher?.markPermissionWaiting(false);
                        completionWatcher?.markActivity('reasoning-delta');
                        realtimeThinking += delta;
                        options.onThinkingChunk?.(delta);
                    },
                    onToolPartUpdate: (part) => {
                        realtimeHadUsefulActivity = true;
                        completionWatcher?.markPermissionWaiting(false);
                        completionWatcher?.markActivity('tool-update');
                        logToolDiagnostic(
                            diagnosticLogger,
                            'event-stream',
                            isOpenCodeToolPartUpdate(part) ? part : toolPartToUpdate(part)
                        );
                        if (!options.onToolPartUpdate) return;
                        options.onToolPartUpdate(isOpenCodeToolPartUpdate(part) ? part : toolPartToUpdate(part));
                    },
                    onSessionIdle: () => {
                        logDiagnostic(diagnosticLogger, 'session.status', {
                            source: 'event-stream',
                            status: 'idle',
                        });
                        completionWatcher?.markActivity('session-idle');
                        completionWatcher?.resolveIdle();
                    },
                    onSessionError: (error) => {
                        logDiagnostic(diagnosticLogger, 'session.error', {
                            source: 'event-stream',
                            error,
                        });
                        const rawMessage = formatErrorMessage(error);
                        const err = new Error(
                            isTlsCertificateError(new Error(rawMessage))
                                ? tlsCertificateErrorMessage(serverUrl)
                                : rawMessage
                        );
                        options.onError?.(err);
                        completionWatcher?.reject(err);
                    },
                    onPermissionAsked: (req) => {
                        logDiagnostic(diagnosticLogger, 'permission.asked', req);
                        options.onPermissionAsked?.(req);
                    },
                    onPermissionActivity: (isWaiting) => {
                        logDiagnostic(diagnosticLogger, 'permission.activity', {
                            waiting: isWaiting,
                        });
                        realtimeHadUsefulActivity = true;
                        completionWatcher?.markActivity(isWaiting ? 'permission-asked' : 'permission-updated');
                        completionWatcher?.markPermissionWaiting(isWaiting);
                    },
                    onQuestionAsked: (req) => {
                        logDiagnostic(diagnosticLogger, 'question.asked', req);
                        options.onQuestionAsked?.(req);
                    },
                    onQuestionActivity: (isWaiting) => {
                        logDiagnostic(diagnosticLogger, 'question.activity', {
                            waiting: isWaiting,
                        });
                        realtimeHadUsefulActivity = true;
                        completionWatcher?.markActivity(isWaiting ? 'question-asked' : 'question-updated');
                        completionWatcher?.markPermissionWaiting(isWaiting);
                    },
                }, options.signal);
                logDiagnostic(diagnosticLogger, 'event_stream.connected', {
                    path: '/global/event',
                    sessionId,
                });
            } catch (streamErr) {
                logDiagnostic(diagnosticLogger, 'event_stream.fallback', {
                    error: streamErr,
                });
                console.warn('[OpenCode] Failed to connect event stream, falling back to sync mode:', streamErr);
                eventStream?.close();
                eventStream = null;
                completionWatcher = null;
            }
        }

        const promptBody = buildPromptBody(options, model);
        logDiagnostic(diagnosticLogger, 'prompt.built', {
            sessionId,
            model,
            mode: options.mode,
            enableThinking: options.enableThinking,
            reasoningEffort: options.reasoningEffort,
            promptChars: options.prompt.length,
            toolNames: promptBody.tools ? Object.keys(promptBody.tools) : [],
            body: diagnosticLogger?.level === 'full' ? promptBody : undefined,
        });

        if (eventStream) {
            const asyncPath = `/session/${encodeURIComponent(sessionId)}/prompt_async`;
            const asyncRequestPath = withOpenCodeRequestContext(asyncPath, requestContext);
            logDiagnostic(diagnosticLogger, 'request.sent', {
                method: 'POST',
                path: asyncRequestPath,
                purpose: 'prompt-async',
            });
            const asyncFetchResult = await openCodeFetch(
                serverUrl,
                asyncRequestPath,
                {
                    method: 'POST',
                    body: JSON.stringify(promptBody)
                },
                options.signal,
                IDLE_TIMEOUT_MS
            );
            try {
                logDiagnostic(diagnosticLogger, 'request.response', {
                    method: 'POST',
                    path: asyncRequestPath,
                    status: asyncFetchResult.response.status,
                    ok: asyncFetchResult.response.ok,
                });
                if (!asyncFetchResult.response.ok) {
                    const errText = await asyncFetchResult.response.text().catch(() => '');
                    throw new Error(`OpenCode async request failed: ${asyncFetchResult.response.status} ${asyncFetchResult.response.statusText}${errText ? ' - ' + errText : ''}`);
                }

                await completionWatcher!.wait();
                options.onComplete?.(realtimeText);
                if (realtimeThinking) {
                    options.onThinkingComplete?.(realtimeThinking);
                }
                eventStream.close();
                logDiagnostic(diagnosticLogger, 'run.completed', {
                    transport: 'event-stream',
                    textChars: realtimeText.length,
                    thinkingChars: realtimeThinking.length,
                });
                return { sessionId: sessionId! };
            } finally {
                asyncFetchResult.clearTimeout();
            }
        }

        // Fallback to synchronous /message only if the event stream is unavailable.
        const messagePath = `/session/${encodeURIComponent(sessionId)}/message`;
        const messageRequestPath = withOpenCodeRequestContext(messagePath, requestContext);
        logDiagnostic(diagnosticLogger, 'request.sent', {
            method: 'POST',
            path: messageRequestPath,
            purpose: 'message-fallback',
        });
        const messageFetchResult = await openCodeFetch(
            serverUrl,
            messageRequestPath,
            {
                method: 'POST',
                body: JSON.stringify(promptBody)
            },
            options.signal,
            IDLE_TIMEOUT_MS
        );
        const { response, resetTimeout } = messageFetchResult;
        logDiagnostic(diagnosticLogger, 'request.response', {
            method: 'POST',
            path: messageRequestPath,
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type') || '',
        });

        try {
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenCode request failed: ${response.status} ${response.statusText}${errText ? ' — ' + errText : ''}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let fullText = '';
        debugOpenCode('[OpenCode] POST /message response content-type:', contentType, 'eventStream active:', !!eventStream);

        if (contentType.includes('text/event-stream')) {
            // SSE response from POST /message
            let accumulatedThinking = '';
            const diagnosticResetTimeout = () => {
                logDiagnostic(diagnosticLogger, 'timeout.reset', {
                    source: 'message-sse',
                });
                resetTimeout();
            };
            try {
                fullText = await parseSSEStream(response, (text) => {
                    logDiagnostic(diagnosticLogger, 'text.delta', {
                        source: 'message-sse',
                        length: text.length,
                        text,
                    });
                    fullText += text;
                    if (!realtimeText) {
                        options.onChunk?.(text);
                    }
                }, options.signal, (thinking) => {
                    logDiagnostic(diagnosticLogger, 'thinking.delta', {
                        source: 'message-sse',
                        length: thinking.length,
                        text: thinking,
                    });
                    accumulatedThinking += thinking;
                    if (!realtimeThinking) {
                        options.onThinkingChunk?.(thinking);
                    }
                }, (update) => {
                    logToolDiagnostic(diagnosticLogger, 'message-sse', update);
                    options.onToolPartUpdate?.(update);
                }, diagnosticResetTimeout);
            } catch (streamErr) {
                const partialText = fullText || realtimeText;
                const partialThinking = accumulatedThinking || realtimeThinking;
                if (partialText) {
                    deliveredPartialResponse = true;
                    options.onComplete?.(partialText);
                }
                if (partialThinking) {
                    deliveredPartialResponse = true;
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
            logDiagnostic(diagnosticLogger, 'run.completed', {
                transport: 'message-sse',
                textChars: finalText.length,
                thinkingChars: finalThinking.length,
            });
        } else {
            // Synchronous JSON response
            logDiagnostic(diagnosticLogger, 'timeout.reset', {
                source: 'message-json',
                phase: 'before-read',
            });
            resetTimeout();
            const responseText = await response.text();
            logDiagnostic(diagnosticLogger, 'timeout.reset', {
                source: 'message-json',
                phase: 'after-read',
            });
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
                    deliveredPartialResponse = true;
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
                logDiagnostic(diagnosticLogger, 'thinking.delta', {
                    source: 'message-json',
                    length: thinkingText.length,
                    text: thinkingText,
                });
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
                        const update = toolPartToUpdate(part);
                        logToolDiagnostic(diagnosticLogger, 'message-json', update);
                        options.onToolPartUpdate(update);
                    }
                }
            }

            if (options.onChunk && fullText && !realtimeText) {
                const chunkSize = Math.max(1, Math.ceil(fullText.length / 100));
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    if (options.signal?.aborted) throw new Error('Request aborted');
                    const chunk = fullText.slice(i, i + chunkSize);
                    logDiagnostic(diagnosticLogger, 'text.delta', {
                        source: 'message-json',
                        length: chunk.length,
                        text: chunk,
                    });
                    options.onChunk(chunk);
                }
            }

            if (fullText || realtimeText) {
                deliveredPartialResponse = true;
            }
            options.onComplete?.(fullText || realtimeText);
            logDiagnostic(diagnosticLogger, 'run.completed', {
                transport: 'message-json',
                textChars: (fullText || realtimeText).length,
                thinkingChars: finalThinking.length,
            });
        }

        eventStream?.close();
        return { sessionId: sessionId! };
        } finally {
            messageFetchResult.clearTimeout();
        }
    } catch (error) {
        eventStream?.close();
        const err = error as Error;
        const isAborted = err.name === 'AbortError' || err.message?.includes('aborted');
        logDiagnostic(diagnosticLogger, isAborted ? 'run.cancelled' : 'run.failed', {
            error: err,
            sessionId,
            sessionCreated,
            deliveredPartialResponse,
        });

        const shouldPreserveRealtimeSession =
            wantRealtime && (realtimeHadUsefulActivity || !!realtimeText || !!realtimeThinking);
        if (sessionCreated && sessionId && !shouldPreserveRealtimeSession && !deliveredPartialResponse) {
            deleteOpenCodeSession(config, sessionId).catch(() => {});
        }

        if (isAborted) {
            options.onError?.(new Error('Request aborted'));
        } else if (isConnectionError(err)) {
            options.onError?.(new Error(
                `Cannot connect to OpenCode. Please ensure opencode is installed and running. ` +
                `Run 'opencode serve' or let the plugin auto-start it.`
            ));
        } else if (isTlsCertificateError(err)) {
            options.onError?.(new Error(tlsCertificateErrorMessage(serverUrl)));
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
        const fetchResult = await openCodeFetch(config.serverUrl, '/command', { method: 'GET' });
        try {
            const { response } = fetchResult;
            if (!response.ok) return [];
            const data = await response.json();
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.commands)) return data.commands;
            return [];
        } finally {
            fetchResult.clearTimeout();
        }
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
    const fetchResult = await openCodeFetch(
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
    const { response } = fetchResult;

    try {
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
    } finally {
        fetchResult.clearTimeout();
    }
}

export async function sendPromptAsync(
    config: OpenCodeProviderConfig,
    sessionId: string,
    prompt: string,
    model?: { providerID: string; modelID: string },
    options?: {
        agent?: 'plan' | 'build';
        noReply?: boolean;
    }
): Promise<void> {
    const part: any = { type: 'text', text: prompt };
    const fetchResult = await openCodeFetch(
        config.serverUrl,
        `/session/${encodeURIComponent(sessionId)}/prompt_async`,
        {
            method: 'POST',
            body: JSON.stringify({
                parts: [part],
                ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
                ...(options?.agent ? { agent: options.agent } : {}),
                ...(options?.noReply !== undefined ? { noReply: options.noReply } : {}),
            }),
        }
    );
    try {
        if (fetchResult.response.status !== 204) {
            console.warn(`[OpenCode] prompt_async returned ${fetchResult.response.status}`);
        }
    } finally {
        fetchResult.clearTimeout();
    }
}

export async function initSession(
    config: OpenCodeProviderConfig,
    sessionId: string,
    messageId?: string,
    model?: { providerID: string; modelID: string }
): Promise<boolean> {
    const fetchResult = await openCodeFetch(
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
    try {
        return fetchResult.response.ok;
    } finally {
        fetchResult.clearTimeout();
    }
}
