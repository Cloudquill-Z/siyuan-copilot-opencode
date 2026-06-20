import type { ChatOptions } from '../../ai-chat';

export function buildChatRunOptions(options: ChatOptions): ChatOptions {
    return {
        ...options,
        messages: options.messages.map(message => ({ ...message })),
        stream: options.stream ?? true,
    };
}
