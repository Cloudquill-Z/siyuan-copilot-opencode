/**
 * AI Chat API 调用模块
 * 仅支持 OpenCode 提供商
 */
import { chatOpenCode, fetchOpenCodeModels, deleteOpenCodeSession } from './providers/opencode-provider';

export interface MessageAttachment {
    type: 'image' | 'file';
    name: string;
    data: string; // base64 或 URL
    mimeType?: string;
    path?: string; // 插件内存储的资源路径
    isWebPage?: boolean; // 标记是否为网页附件
    url?: string; // 原始URL（网页附件时使用）
}

export interface MessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}

export interface EditOperation {
    operationType?: 'update' | 'insert'; // 操作类型：update=更新块，insert=插入块，默认为update
    blockId: string; // update时为要更新的块ID，insert时为参考块ID
    docId?: string; // 汇总差异时对应文档ID
    docTitle?: string; // 汇总差异时对应文档名/路径
    oldDocTitle?: string; // 文档旧标题（重命名差异）
    newDocTitle?: string; // 文档新标题（重命名差异）
    affectedBlockIds?: string[]; // 本次回答中该文档涉及的块ID列表
    newContent: string;
    oldContent?: string; // kramdown格式的旧内容，用于实际应用编辑
    oldContentForDisplay?: string; // Markdown格式的旧内容，用于显示差异
    newContentForDisplay?: string; // Markdown格式的新内容，用于显示差异
    status: 'pending' | 'applied' | 'rejected';
    // insert操作的额外参数
    position?: 'before' | 'after'; // 插入位置：before=在blockId之前，after=在blockId之后
}

export interface ContextDocument {
    id: string;
    title: string;
    content: string;
    type?: 'doc' | 'block'; // 标识是文档还是块
}

export interface Message {
    role: "user" | "assistant" | "system";
    content: string | MessageContent[];
    attachments?: MessageAttachment[];
    contextDocuments?: ContextDocument[]; // 关联的上下文文档
    thinking?: string; // 思考过程内容
    editOperations?: EditOperation[]; // 编辑操作
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
    images?: GeneratedImageData[]; // 生成的图片数据
}

// 生成的图片数据接口（用于Gemini多轮生图）
export interface GeneratedImageData {
    mimeType: string;
    data: string; // base64 数据
    url?: string; // 可选的URL
    path?: string; // 插件内存储的资源路径
}

// 思考努力程度类型
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'auto';

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
    signal?: AbortSignal; // 用于中断请求
    enableThinking?: boolean; // 是否启用思考模式
    thinkingBudget?: number; // 思考预算（token数），-1表示动态
    reasoningEffort?: ThinkingEffort; // 思考努力程度（适用于 Gemini/Claude 等模型）
    onThinkingChunk?: (chunk: string) => void; // 思考过程回调
    onThinkingComplete?: (thinking: string) => void; // 思考完成回调
    customBody?: any; // 自定义请求体参数
    enableImageGeneration?: boolean; // 是否启用图片生成
    onImageGenerated?: (images: GeneratedImageData[]) => void; // 图片生成回调
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
}

export type AIProvider = 'opencode';

// 思考努力程度到比例的映射（用于计算 token 预算）
export const EFFORT_RATIO: Record<ThinkingEffort, number> = {
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    auto: 0.5  // auto 使用中等比例
};

/**
 * 获取模型列表
 */
export async function fetchModels(
    provider: string,
    _apiKey: string,
    customApiUrl?: string,
    _advancedConfig?: { customModelsUrl?: string; customChatUrl?: string }
): Promise<ModelInfo[]> {
    const models = await fetchOpenCodeModels({
        serverUrl: (customApiUrl || '').trim() || 'http://localhost:4096'
    });
    return models.map(model => ({
        id: model.providerID ? `${model.providerID}/${model.id}` : model.id,
        name: model.name,
        provider: 'OpenCode'
    }));
}

/**
 * 发送聊天请求
 * 返回 sessionId 用于多轮对话复用
 */
export async function chat(
    _provider: string,
    options: ChatOptions,
    customApiUrl?: string,
    _advancedConfig?: { customModelsUrl?: string; customChatUrl?: string },
    openCodeServerUrl?: string
): Promise<{ sessionId: string }> {
    // Build conversation history from all messages for multi-turn support
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

    let modelInfo: { providerID: string; modelID: string } | undefined;
    if (options.model.includes('/')) {
        const parts = options.model.split('/');
        const modelID = parts.pop() || '';
        const providerID = parts.join('/');
        if (providerID && modelID) {
            modelInfo = { providerID, modelID };
        }
    }

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
            signal: options.signal
        },
        { serverUrl }
    );

    return result;
}

/**
 * 清理 OpenCode session
 */
export async function cleanupSession(serverUrl: string, sessionId: string): Promise<void> {
    await deleteOpenCodeSession({ serverUrl }, sessionId);
}

/**
 * 估算token数量（简单估算，1个中文字符约等于1.5个token，1个英文单词约1个token）
 */
export function estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - chineseChars - text.match(/[a-zA-Z\s]/g)?.length || 0;

    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
}

/**
 * 计算消息列表的总token数
 */
export function calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
        if (typeof msg.content === 'string') {
            return total + estimateTokens(msg.content);
        } else {
            // 处理多模态内容
            return total + msg.content.reduce((sum, part) => {
                if (part.type === 'text' && part.text) {
                    return sum + estimateTokens(part.text);
                } else if (part.type === 'image_url') {
                    // 图片大约消耗85个token (根据OpenAI文档的低分辨率估算)
                    return sum + 85;
                }
                return sum;
            }, 0);
        }
    }, 0);
}

// ==================== 图片生成接口 ====================

export interface ImageGenerationOptions {
    apiKey: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    size?: string; // 例如: "1024x1024", "512x512"
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number; // 生成图片数量，默认1
    signal?: AbortSignal;
}

export interface GeneratedImage {
    url?: string;
    b64_json?: string;
    revised_prompt?: string; // 实际使用的提示词
}

export interface ImageGenerationResult {
    images: GeneratedImage[];
    total: number;
}

/**
 * 图片生成 API 接口
 * OpenCode 不支持图片生成，保留接口签名用于向后兼容
 */
export async function generateImage(
    _provider: string,
    _options: ImageGenerationOptions,
    _customApiUrl?: string
): Promise<ImageGenerationResult> {
    throw new Error('Image generation is not supported with OpenCode provider');
}

/**
 * 检查模型是否支持图片生成
 */
export function isImageGenerationSupported(_provider: string, _modelId: string): boolean {
    return false;
}
