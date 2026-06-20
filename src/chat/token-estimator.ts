import type { ContextDocument, Message, MessageAttachment } from '../ai-chat';
import { calculateTotalTokens, estimateTokens } from '../ai-chat';

function estimateAttachments(attachments: MessageAttachment[] = []): number {
    return attachments.reduce(
        (sum, attachment) =>
            sum + (attachment.type === 'image'
                ? 85
                : estimateTokens(attachment.data || attachment.name || '')),
        0
    );
}

function estimateDocuments(documents: ContextDocument[] = []): number {
    return documents.reduce((sum, document) => sum + estimateTokens(document.content || ''), 0);
}

export function estimateMessagesContextTokens(messages: Message[]): number {
    return calculateTotalTokens(messages) + messages.length * 4;
}

export function estimateComposerContextTokens(input: {
    messages: Message[];
    draft: string;
    documents: ContextDocument[];
    attachments: MessageAttachment[];
}): number {
    const visible = input.messages.filter(message => message.role !== 'system');
    return (
        estimateMessagesContextTokens(input.messages) +
        visible.reduce(
            (sum, message) =>
                sum + estimateDocuments(message.contextDocuments) + estimateAttachments(message.attachments),
            0
        ) +
        estimateTokens(input.draft || '') +
        estimateDocuments(input.documents) +
        estimateAttachments(input.attachments)
    );
}
