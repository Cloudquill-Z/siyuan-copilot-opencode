/**
 * AI Chat API 调用模块
 * 仅支持 OpenCode 提供商
 */
import { chatOpenCode, fetchOpenCodeModels, deleteOpenCodeSession, type OpenCodeToolPartUpdate, listCommands as fetchOpenCodeCommands, executeCommand as execOpenCodeCommand, sendPromptAsync as sendOpenCodePromptAsync, initSession as initOpenCodeSession, type OpenCodeCommand, respondToPermission as respondOpenCodePermission, replyToQuestion as replyOpenCodeQuestion, rejectQuestion as rejectOpenCodeQuestion, type PermissionRequest, type QuestionRequest } from './providers/opencode-provider';
import type { DiagnosticLogger } from './diagnostic-logger';
import { parseOpenCodeModelId } from './utils/opencode';

export interface MessageAttachment {
    type: 'image' | 'file';
    name: string;
    data: string;
    mimeType?: string;
    path?: string;
    isWebPage?: boolean;
    url?: string;
}

export interface MessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}

export interface ToolCall {
    id: string;
    type?: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface EditOperation {
    operationType?: 'update' | 'insert';
    blockId: string;
    docId?: string;
    docTitle?: string;
    oldDocTitle?: string;
    newDocTitle?: string;
    affectedBlockIds?: string[];
    newContent: string;
    oldContent?: string;
    oldContentForDisplay?: string;
    newContentForDisplay?: string;
    status: 'pending' | 'applied' | 'rejected';
    position?: 'before' | 'after';
}

export interface ContextDocument {
    id: string;
    title: string;
    content: string;
    type?: 'doc' | 'block';
}

export interface Message {
    role: "user" | "assistant" | "system" | "tool";
    content: string | MessageContent[];
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
    provider?: string;
    modelId?: string;
    modelName?: string;
    reasoning_content?: string;
    toolCallThinkings?: Array<{
        toolCallIndex: number;
        thinkingBefore: string;
    }>;
    thinkingBeforeToolCalls?: string;
    thinkingAfterToolCalls?: string;
    finalReply?: string;
    attachments?: MessageAttachment[];
    contextDocuments?: ContextDocument[];
    thinking?: string;
    openCodeToolParts?: OpenCodeToolPartUpdate[];
    openCodeTimeline?: Array<
        | { type: 'thinking'; id: string; content: string }
        | { type: 'tool'; id: string; toolPart: OpenCodeToolPartUpdate }
    >;
    editOperations?: EditOperation[];
    multiModelResponses?: Array<{
        provider: string;
        modelId: string;
        modelName: string;
        content: string;
        thinking?: string;
        isLoading: boolean;
        error?: string;
        isSelected?: boolean;
        thinkingCollapsed?: boolean;
        thinkingEnabled?: boolean;
        thinkingEffort?: ThinkingEffort;
    }>;
    images?: GeneratedImageData[];
}

export interface GeneratedImageData {
    mimeType: string;
    data: string;
    url?: string;
    path?: string;
}

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max' | 'auto';

export interface ChatOptions {
    apiKey: string;
    model: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    onChunk?: (chunk: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
    enableThinking?: boolean;
    thinkingBudget?: number;
    reasoningEffort?: ThinkingEffort;
    onThinkingChunk?: (chunk: string) => void;
    onThinkingComplete?: (thinking: string) => void;
    onToolPartUpdate?: (update: OpenCodeToolPartUpdate) => void;
    tools?: any;
    onToolCallComplete?: (toolCalls: ToolCall[]) => void;
    onPermissionAsked?: (req: PermissionRequest) => void;
    onQuestionAsked?: (req: QuestionRequest) => void;
    customBody?: any;
    enableImageGeneration?: boolean;
    onImageGenerated?: (images: GeneratedImageData[]) => void;
    mode?: 'plan' | 'build';
    diagnosticLogger?: DiagnosticLogger;
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    providerID?: string;
    contextLimit?: number;
    outputLimit?: number;
    enableThinking?: boolean;
    reasoningEffort?: ThinkingEffort;
}

export type AIProvider = 'opencode';

export const EFFORT_RATIO: Record<ThinkingEffort, number> = {
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    max: 1,
    auto: 0.5
};

const sessionCleanupQueue: Array<{ serverUrl: string; sessionId: string }> = [];

function scheduleSessionCleanup(serverUrl: string, sessionId: string) {
    sessionCleanupQueue.push({ serverUrl, sessionId });
    if (sessionCleanupQueue.length === 1) {
        processCleanupQueue();
    }
}

async function processCleanupQueue() {
    while (sessionCleanupQueue.length > 0) {
        const item = sessionCleanupQueue.shift()!;
        try {
            await deleteOpenCodeSession({ serverUrl: item.serverUrl }, item.sessionId);
        } catch {
            // ignore cleanup errors
        }
    }
}

export { invalidateModelCache } from './providers/opencode-provider';
export async function fetchModels(
    _provider: string,
    _apiKey: string,
    customApiUrl?: string,
    _advancedConfig?: { customModelsUrl?: string; customChatUrl?: string }
): Promise<ModelInfo[]> {
    const serverUrl = (customApiUrl || '').trim() || 'http://localhost:4096';
    const models = await fetchOpenCodeModels({ serverUrl });
    return models.map(model => ({
        id: model.providerID ? `${model.providerID}/${model.id}` : model.id,
        name: model.name,
        provider: 'OpenCode',
        providerID: model.providerID,
        contextLimit: model.contextLimit,
        outputLimit: model.outputLimit,
        enableThinking: model.enableThinking,
        reasoningEffort: model.reasoningEffort
    }));
}

export async function chat(
    _provider: string,
    options: ChatOptions,
    customApiUrl?: string,
    _advancedConfig?: { customModelsUrl?: string; customChatUrl?: string },
    openCodeServerUrl?: string
): Promise<{ sessionId: string }> {
    const conversationLines: string[] = [];
    for (const msg of options.messages) {
        const content = typeof msg.content === 'string'
            ? msg.content
            : msg.content.filter((p: MessageContent) => p.type === 'text' && !!p.text).map((p: MessageContent) => p.text || '').join('\n');
        if (content.trim()) {
            conversationLines.push(`[${msg.role}]: ${content}`);
        }
    }
    const prompt = conversationLines.join('\n\n');

    const modelInfo = parseOpenCodeModelId(options.model);

    const sessionIdFromBody = typeof options.customBody?.sessionId === 'string'
        ? options.customBody.sessionId
        : undefined;

    const serverUrl = (openCodeServerUrl || customApiUrl || '').trim() || 'http://localhost:4096';

    const result = await chatOpenCode(
        {
            prompt,
            sessionId: sessionIdFromBody,
            model: modelInfo,
            onChunk: options.onChunk,
            onComplete: options.onComplete,
            onError: options.onError,
            signal: options.signal,
            enableThinking: options.enableThinking,
            reasoningEffort: options.reasoningEffort,
            onThinkingChunk: options.onThinkingChunk,
            onThinkingComplete: options.onThinkingComplete,
            onToolPartUpdate: options.onToolPartUpdate,
            tools: options.tools,
            customBody: options.customBody,
            onPermissionAsked: options.onPermissionAsked,
            onQuestionAsked: options.onQuestionAsked,
            mode: options.mode,
            diagnosticLogger: options.diagnosticLogger
        },
        { serverUrl }
    );

    return result;
}

export async function cleanupSession(serverUrl: string, sessionId: string): Promise<void> {
    scheduleSessionCleanup(serverUrl, sessionId);
}

export function estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const englishAndWhitespaceChars = (text.match(/[a-zA-Z\s]/g) || []).length;
    const otherChars = Math.max(0, text.length - chineseChars - englishAndWhitespaceChars);

    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
}

export function calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
        if (typeof msg.content === 'string') {
            return total + estimateTokens(msg.content);
        } else {
            return total + msg.content.reduce((sum, part) => {
                if (part.type === 'text' && part.text) {
                    return sum + estimateTokens(part.text);
                } else if (part.type === 'image_url') {
                    return sum + 85;
                }
                return sum;
            }, 0);
        }
    }, 0);
}

export interface ImageGenerationOptions {
    apiKey: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    size?: string;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
    signal?: AbortSignal;
}

export interface GeneratedImage {
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
}

export interface ImageGenerationResult {
    images: GeneratedImage[];
    total: number;
}

export async function generateImage(
    _provider: string,
    _options: ImageGenerationOptions,
    _customApiUrl?: string
): Promise<ImageGenerationResult> {
    throw new Error('Image generation is not supported with OpenCode provider');
}

export function isImageGenerationSupported(_provider: string, _modelId: string): boolean {
    return false;
}

// ─── Command API ────────────────────────────────────────────────────────────────

export type { OpenCodeCommand } from './providers/opencode-provider';

export async function listCommands(serverUrl: string = 'http://localhost:4096'): Promise<OpenCodeCommand[]> {
    return fetchOpenCodeCommands({ serverUrl });
}

export async function executeCommand(
    serverUrl: string,
    sessionId: string,
    command: string,
    args?: string,
    modelId?: string
): Promise<{ success: boolean; sessionId: string; parts?: any[] }> {
    const model = parseOpenCodeModelId(modelId);
    return execOpenCodeCommand({ serverUrl }, sessionId, command, args, model);
}

export async function sendStillPrompt(
    serverUrl: string,
    sessionId: string,
    prompt: string = 'Continue.',
    modelId?: string,
    options?: {
        agent?: 'plan' | 'build';
        noReply?: boolean;
    }
): Promise<void> {
    const model = parseOpenCodeModelId(modelId);
    return sendOpenCodePromptAsync({ serverUrl }, sessionId, prompt, model, options);
}

export async function sessionInit(
    serverUrl: string,
    sessionId: string,
    modelId?: string
): Promise<boolean> {
    const model = parseOpenCodeModelId(modelId);
    return initOpenCodeSession({ serverUrl }, sessionId, undefined, model);
}

export { type PermissionRequest, type QuestionRequest } from './providers/opencode-provider';

export async function respondToPermission(
    serverUrl: string,
    sessionId: string,
    permissionID: string,
    response: 'once' | 'always' | 'reject'
): Promise<boolean> {
    return respondOpenCodePermission({ serverUrl }, sessionId, permissionID, response);
}

export async function replyToQuestion(
    serverUrl: string,
    requestID: string,
    answers: string[][]
): Promise<boolean> {
    return replyOpenCodeQuestion({ serverUrl }, requestID, answers);
}

export async function rejectQuestion(
    serverUrl: string,
    requestID: string
): Promise<boolean> {
    return rejectOpenCodeQuestion({ serverUrl }, requestID);
}
