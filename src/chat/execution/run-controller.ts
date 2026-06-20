import { chat, type ChatOptions } from '../../ai-chat';
import type { ChatRunRequest, ChatRunResult } from './types';
import { buildChatRunOptions } from './request-builder';

type ChatTransport = (
    provider: string,
    options: ChatOptions,
    customApiUrl?: string,
    advancedConfig?: { customModelsUrl?: string; customChatUrl?: string },
    serverUrl?: string
) => Promise<{ sessionId: string }>;

export class ChatRunController {
    constructor(private readonly transport: ChatTransport = chat) {}

    async run(request: ChatRunRequest): Promise<ChatRunResult> {
        let text = '';
        let thinking = '';
        const original = request.options;
        const result = await this.transport(
            request.provider,
            {
                ...original,
                onChunk: chunk => {
                    text += chunk;
                    request.onEvent?.({ type: 'text', chunk });
                    original.onChunk?.(chunk);
                },
                onThinkingChunk: chunk => {
                    thinking += chunk;
                    request.onEvent?.({ type: 'thinking', chunk });
                    original.onThinkingChunk?.(chunk);
                },
                onThinkingComplete: completedThinking => {
                    const finalThinking = completedThinking || thinking;
                    request.onEvent?.({ type: 'thinking_complete', thinking: finalThinking });
                    original.onThinkingComplete?.(finalThinking);
                },
                onToolPartUpdate: update => {
                    request.onEvent?.({ type: 'tool', update });
                    original.onToolPartUpdate?.(update);
                },
                onComplete: completedText => {
                    const finalText = completedText || text;
                    text = finalText;
                    request.onEvent?.({ type: 'complete', text: finalText });
                    original.onComplete?.(finalText);
                },
            },
            request.customApiUrl,
            request.advancedConfig,
            request.serverUrl
        );

        return { text, thinking, sessionId: result.sessionId };
    }
}

export const chatRunController = new ChatRunController();

export function runChat(
    provider: string,
    options: ChatOptions,
    customApiUrl?: string,
    advancedConfig?: { customModelsUrl?: string; customChatUrl?: string },
    serverUrl?: string
): Promise<ChatRunResult> {
    return chatRunController.run({
        provider,
        options: buildChatRunOptions(options),
        customApiUrl,
        advancedConfig,
        serverUrl,
    });
}
