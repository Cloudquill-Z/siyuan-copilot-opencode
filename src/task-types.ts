import type { Message } from './ai-chat';

export type TaskStatus =
    | 'draft'
    | 'queued'
    | 'running'
    | 'waiting_permission'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface TaskSession {
    id: string;
    title: string;
    messages?: Message[];
    createdAt: number;
    updatedAt: number;
    pinned?: boolean;
    messageCount?: number;
    status?: TaskStatus;
    openCodeSessionId?: string;
    lastError?: string;
}

export interface TaskRuntime {
    streamingMessage: string;
    streamingThinking: string;
    openCodeTimeline: any[];
    openCodeToolParts: any[];
    isThinkingPhase: boolean;
    abortController: AbortController | null;
}

export function normalizeTaskSession(raw: any): TaskSession {
    const now = Date.now();
    return {
        id: String(raw?.id || ''),
        title: String(raw?.title || ''),
        messages: raw?.messages,
        createdAt: Number(raw?.createdAt) || now,
        updatedAt: Number(raw?.updatedAt) || Number(raw?.createdAt) || now,
        pinned: Boolean(raw?.pinned),
        messageCount: Number(raw?.messageCount) || undefined,
        status: raw?.status || 'completed',
        openCodeSessionId: raw?.openCodeSessionId,
        lastError: raw?.lastError,
    };
}
