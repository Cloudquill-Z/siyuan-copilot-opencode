import type { Message, ThinkingEffort } from '../../ai-chat';
import { cleanModelName } from '../../utils/sessionExport';

export interface MultiModelChoice {
    provider: string;
    modelId: string;
    thinkingEnabled?: boolean;
    thinkingEffort?: ThinkingEffort;
}

export interface MultiModelResponse {
    provider: string;
    modelId: string;
    modelName: string;
    content: string;
    thinking?: string;
    isLoading: boolean;
    error?: string;
    thinkingCollapsed?: boolean;
    thinkingEnabled?: boolean;
    thinkingEffort?: ThinkingEffort;
    toolCalls?: any[];
    conversationMessages?: Message[];
    isSelected?: boolean;
}

export function createMultiModelResponses(
    choices: MultiModelChoice[],
    resolveModel: (choice: MultiModelChoice) => any
): MultiModelResponse[] {
    return choices.map(choice => {
        const model = resolveModel(choice);
        return {
            provider: choice.provider,
            modelId: choice.modelId,
            modelName: model?.name || choice.modelId,
            content: '',
            thinking: '',
            isLoading: true,
            thinkingCollapsed: false,
            toolCalls: [],
            thinkingEnabled: choice.thinkingEnabled ?? model?.thinkingEnabled ?? false,
            thinkingEffort: choice.thinkingEffort ?? model?.thinkingEffort ?? 'low',
        };
    });
}

export function applyMultiModelSelection(
    messages: Message[],
    responses: MultiModelResponse[],
    selectedIndex: number
): Message[] {
    const selected = responses[selectedIndex];
    if (!selected || selected.isLoading) return messages;

    const toolMessages = (selected.conversationMessages || [])
        .filter(message => message.role === 'tool' && message.tool_call_id)
        .map(message => ({
            role: 'tool' as const,
            tool_call_id: message.tool_call_id,
            name: message.name,
            content: message.content,
        }));

    let next = [...messages];
    if (toolMessages.length > 0) {
        let lastUserIndex = -1;
        for (let index = next.length - 1; index >= 0; index--) {
            if (next[index].role === 'user') {
                lastUserIndex = index;
                break;
            }
        }
        if (lastUserIndex >= 0) {
            next = [
                ...next.slice(0, lastUserIndex + 1),
                ...toolMessages,
                ...next.slice(lastUserIndex + 1),
            ];
        }
    }

    let assistantIndex = -1;
    for (let index = next.length - 1; index >= 0; index--) {
        const message = next[index];
        if (message.role !== 'assistant' || !message.multiModelResponses) continue;
        const unresolved =
            !message.multiModelResponses.some(response => response.isSelected) &&
            !(typeof message.content === 'string' && message.content.trim());
        if (unresolved) {
            assistantIndex = index;
            break;
        }
        if (assistantIndex === -1) assistantIndex = index;
    }

    const selectedResponses = responses.map((response, index) => ({
        ...response,
        isSelected: index === selectedIndex,
        modelName: cleanModelName(response.modelName),
    }));
    const assistant: Message = {
        role: 'assistant',
        content: selected.content,
        thinking: selected.thinking || '',
        multiModelResponses: selectedResponses,
    };
    if (assistantIndex >= 0) next[assistantIndex] = { ...next[assistantIndex], ...assistant };
    else next.push(assistant);
    return next;
}

export function finalizePendingMultiModel(
    messages: Message[],
    responses: MultiModelResponse[]
): Message[] {
    const firstSuccess = responses.findIndex(response => !response.error && !response.isLoading);
    return firstSuccess < 0 ? messages : applyMultiModelSelection(messages, responses, firstSuccess);
}
