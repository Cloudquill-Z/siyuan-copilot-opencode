import type { Message, MessageContent } from '../ai-chat';

export function getMessageText(content: string | MessageContent[]): string {
    if (typeof content === 'string') {
        return content;
    }

    return content
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text)
        .join('\n');
}

export function getActualMessageContent(message: Message): string {
    if (message.finalReply) {
        return message.finalReply;
    }

    if (message.multiModelResponses?.length) {
        const selectedResponse = message.multiModelResponses.find(response => response.isSelected);
        if (selectedResponse?.content) {
            return getMessageText(selectedResponse.content);
        }

        const firstWithContent = message.multiModelResponses.find(response => response.content);
        if (firstWithContent) {
            return getMessageText(firstWithContent.content);
        }
    }

    return getMessageText(message.content);
}

export function convertLatexToMarkdown(text: string): string {
    const withBlockMath = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula) => {
        return `\n\n$$\n${formula.trim()}\n$$\n\n`;
    });

    return withBlockMath.replace(/\\\((.*?)\\\)/g, (_match, formula) => `$${formula}$`);
}
