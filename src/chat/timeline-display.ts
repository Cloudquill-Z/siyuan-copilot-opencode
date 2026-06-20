import type { Message } from '../ai-chat';
import type { OpenCodeTimelineItem } from '../task-types';

export type OpenCodeTimelineDisplayItem =
    | { type: 'text'; id: string; content: string; isFinal?: boolean }
    | { type: 'thinking'; id: string; content: string }
    | { type: 'tools'; id: string; toolParts: any[] };

export function getOpenCodeProcessKey(message: Message, fallbackKey: string): string {
    const timeline = message.openCodeTimeline || [];
    const firstTimelineId = timeline[0]?.id || fallbackKey;
    const lastTimelineId = timeline[timeline.length - 1]?.id || String(timeline.length);
    return `opencode-process-${message.modelId || 'model'}-${firstTimelineId}-${lastTimelineId}`;
}

export function groupOpenCodeTimeline(items: OpenCodeTimelineItem[] = []): OpenCodeTimelineDisplayItem[] {
    const grouped: OpenCodeTimelineDisplayItem[] = [];
    for (const item of items) {
        if (item.type === 'thinking' || item.type === 'text') {
            grouped.push({ ...item });
            continue;
        }
        const lastItem = grouped[grouped.length - 1];
        if (lastItem?.type === 'tools') {
            lastItem.toolParts = [...lastItem.toolParts, item.toolPart];
        } else {
            grouped.push({ type: 'tools', id: `tools-${item.id}`, toolParts: [item.toolPart] });
        }
    }
    return grouped;
}

export function getActiveOpenCodeTimelineItemId(
    items: OpenCodeTimelineItem[] = [],
    isThinkingPhase = false
): string {
    const grouped = groupOpenCodeTimeline(items);
    for (let index = grouped.length - 1; index >= 0; index--) {
        const item = grouped[index];
        if (item.type === 'tools' && item.toolParts.some(part => part.status === 'running' || part.status === 'pending')) return item.id;
        if (item.type === 'thinking' && isThinkingPhase) return item.id;
    }
    return '';
}

export function getOpenCodeToolPartKey(part: any): string {
    return part?.callID || part?.partId || part?.toolName || 'opencode-tool';
}

export function getOpenCodeToolStatusIcon(status: string): string {
    if (status === 'completed') return '✓';
    if (status === 'error') return '!';
    return '…';
}

export function getOpenCodeToolStatusText(status: string): string {
    if (status === 'completed') return '完成';
    if (status === 'error') return '失败';
    if (status === 'running') return '执行中';
    return '等待中';
}

export function formatOpenCodeToolValue(value: any): string {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
