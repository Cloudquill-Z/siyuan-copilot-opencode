import type { Message } from './ai-chat';

export type OpenCodeTimelineItem =
    | { type: 'text'; id: string; content: string; isFinal?: boolean }
    | { type: 'thinking'; id: string; content: string }
    | { type: 'tool'; id: string; toolPart: any };

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
    openCodeTimeline: OpenCodeTimelineItem[];
    openCodeToolParts: any[];
    isThinkingPhase: boolean;
    abortController: AbortController | null;
}

export interface TaskViewState {
    messages: Message[];
    currentInput: string;
    currentAttachments: any[];
    contextDocuments: any[];
    streamingMessage: string;
    streamingThinking: string;
    openCodeToolParts: any[];
    openCodeTimeline: OpenCodeTimelineItem[];
    isThinkingPhase: boolean;
    isLoading: boolean;
    hasUnsavedChanges: boolean;
    lastPreparedContextTokens: number;
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

function getOpenCodeToolPartKey(part: any): string {
    return part?.callID || part?.partId || part?.toolName || 'opencode-tool';
}

function nextTimelineId(items: OpenCodeTimelineItem[], prefix: string): string {
    return `${prefix}-${items.length}`;
}

export function appendTaskRuntimeText<T extends TaskViewState>(state: T, chunk: string): T {
    if (!chunk) return state;

    const openCodeTimeline = [...state.openCodeTimeline];
    const lastIndex = openCodeTimeline.length - 1;
    const lastItem = openCodeTimeline[lastIndex];

    if (lastItem?.type === 'text' && !lastItem.isFinal) {
        openCodeTimeline[lastIndex] = {
            ...lastItem,
            content: lastItem.content + chunk,
        };
    } else {
        openCodeTimeline.push({
            type: 'text',
            id: nextTimelineId(openCodeTimeline, 'text'),
            content: chunk,
        });
    }

    return {
        ...state,
        streamingMessage: state.streamingMessage + chunk,
        openCodeTimeline,
        isLoading: true,
    };
}

export function appendTaskRuntimeThinking<T extends TaskViewState>(state: T, chunk: string): T {
    if (!chunk) return state;

    const openCodeTimeline = [...state.openCodeTimeline];
    const lastIndex = openCodeTimeline.length - 1;
    const lastItem = openCodeTimeline[lastIndex];

    if (lastItem?.type === 'thinking') {
        openCodeTimeline[lastIndex] = {
            ...lastItem,
            content: lastItem.content + chunk,
        };
    } else {
        openCodeTimeline.push({
            type: 'thinking',
            id: nextTimelineId(openCodeTimeline, 'thinking'),
            content: chunk,
        });
    }

    return {
        ...state,
        streamingThinking: state.streamingThinking + chunk,
        openCodeTimeline,
        isThinkingPhase: true,
        isLoading: true,
    };
}

export function applyTaskRuntimeToolUpdate<T extends TaskViewState>(state: T, update: any): T {
    if (!update) return state;

    const updateKey = getOpenCodeToolPartKey(update);
    const existingPartIndex = state.openCodeToolParts.findIndex(
        (part: any) => getOpenCodeToolPartKey(part) === updateKey
    );
    const openCodeToolParts = [...state.openCodeToolParts];
    if (existingPartIndex >= 0) {
        openCodeToolParts[existingPartIndex] = {
            ...openCodeToolParts[existingPartIndex],
            ...update,
        };
    } else {
        openCodeToolParts.push(update);
    }

    const openCodeTimeline = [...state.openCodeTimeline];
    const existingTimelineIndex = openCodeTimeline.findIndex(
        item => item.type === 'tool' && getOpenCodeToolPartKey(item.toolPart) === updateKey
    );
    if (existingTimelineIndex >= 0) {
        const item = openCodeTimeline[existingTimelineIndex];
        if (item.type === 'tool') {
            openCodeTimeline[existingTimelineIndex] = {
                ...item,
                toolPart: {
                    ...item.toolPart,
                    ...update,
                },
            };
        }
    } else {
        openCodeTimeline.push({
            type: 'tool',
            id: `tool-${updateKey}-${openCodeTimeline.length}`,
            toolPart: { ...update },
        });
    }

    return {
        ...state,
        openCodeToolParts,
        openCodeTimeline,
        isThinkingPhase: false,
        isLoading: true,
    };
}
