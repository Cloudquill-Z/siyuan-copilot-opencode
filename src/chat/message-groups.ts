import type { Message } from '../ai-chat';

export interface MessageGroup {
    type: 'user' | 'assistant';
    messages: Message[];
    startIndex: number;
}

export function groupMessages(messages: Message[]): MessageGroup[] {
    const groups: MessageGroup[] = [];
    let current: MessageGroup | null = null;
    for (const [index, message] of messages.entries()) {
        if (message.role === 'system') continue;
        const type = message.role === 'user' ? 'user' : 'assistant';
        if (!current || current.type !== type || type === 'user') {
            if (current) groups.push(current);
            current = { type, messages: [message], startIndex: index };
        } else {
            current.messages.push(message);
        }
    }
    if (current) groups.push(current);
    return groups;
}
