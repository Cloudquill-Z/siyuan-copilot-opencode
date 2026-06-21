import type { Message, QuestionRequest } from '../../ai-chat';
import type { ChatMode } from '../../utils/chatMode';
import { base64ToBlob, saveAsset } from '../../utils/assets';
import { runChat } from './run-controller';
import type { OpenCodeTodo } from '../todo-state';

export interface GeneratedImageAsset {
    mimeType: string;
    path: string;
    previewUrl: string;
}

export async function runSingleModelTarget(options: {
    provider: string;
    providerConfig: any;
    modelConfig: any;
    messages: Message[];
    temperature?: number;
    signal: AbortSignal;
    enableThinking: boolean;
    mode: ChatMode;
    customBody?: Record<string, unknown>;
    diagnosticLogger?: any;
    onThinkingChunk: (chunk: string) => void;
    onThinkingComplete: () => void;
    onToolPartUpdate: (update: any) => void;
    onTodoUpdated: (todos: OpenCodeTodo[]) => void;
    onPermissionAsked: (request: any) => void;
    onQuestionAsked: (request: QuestionRequest) => void;
    onChunk: (chunk: string) => void | Promise<void>;
    onComplete: (text: string, images: GeneratedImageAsset[]) => void | Promise<void>;
    onError: (error: Error) => void;
}): Promise<void> {
    const model = options.modelConfig;
    const tools = model.capabilities?.webSearch && model.webSearchEnabled &&
        String(model.id).toLowerCase().includes('gemini')
        ? [{ type: 'function', function: { name: 'googleSearch' } }]
        : undefined;
    let generatedImages: GeneratedImageAsset[] = [];
    await runChat(
        options.provider,
        {
            apiKey: options.providerConfig.apiKey,
            model: model.id,
            messages: options.messages,
            temperature: options.temperature ?? model.temperature,
            maxTokens: model.maxTokens > 0 ? model.maxTokens : undefined,
            stream: true,
            signal: options.signal,
            enableThinking: options.enableThinking,
            reasoningEffort: model.thinkingEffort || 'low',
            mode: options.mode,
            tools,
            customBody: options.customBody || {},
            diagnosticLogger: options.diagnosticLogger,
            enableImageGeneration: Boolean(model.capabilities?.imageGeneration),
            onImageGenerated: async images => {
                generatedImages = await Promise.all(images.map(async (image, index) => {
                    const mimeType = image.mimeType || 'image/png';
                    const blob = base64ToBlob(image.data, mimeType);
                    const path = await saveAsset(
                        blob,
                        `generated-image-${Date.now()}-${index + 1}.${mimeType.split('/')[1] || 'png'}`
                    );
                    return { mimeType, path, previewUrl: URL.createObjectURL(blob) };
                }));
            },
            onThinkingChunk: options.onThinkingChunk,
            onThinkingComplete: options.onThinkingComplete,
            onToolPartUpdate: options.onToolPartUpdate,
            onTodoUpdated: options.onTodoUpdated,
            onPermissionAsked: options.onPermissionAsked,
            onQuestionAsked: options.onQuestionAsked,
            onChunk: options.onChunk,
            onComplete: text => options.onComplete(text, generatedImages),
            onError: options.onError,
        },
        options.providerConfig.customApiUrl,
        options.providerConfig.advancedConfig
    );
}
