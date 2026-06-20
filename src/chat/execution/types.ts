import type { ChatOptions } from '../../ai-chat';
import type { OpenCodeToolPartUpdate } from '../../providers/opencode-provider';

export type ChatRunEvent =
    | { type: 'text'; chunk: string }
    | { type: 'thinking'; chunk: string }
    | { type: 'thinking_complete'; thinking: string }
    | { type: 'tool'; update: OpenCodeToolPartUpdate }
    | { type: 'complete'; text: string };

export interface ChatRunRequest {
    provider: string;
    options: ChatOptions;
    customApiUrl?: string;
    advancedConfig?: { customModelsUrl?: string; customChatUrl?: string };
    serverUrl?: string;
    onEvent?: (event: ChatRunEvent) => void;
}

export interface ChatRunResult {
    text: string;
    thinking: string;
    sessionId: string;
}
