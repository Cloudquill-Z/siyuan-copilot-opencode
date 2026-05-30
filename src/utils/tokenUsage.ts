interface TokenUsageMessageContent {
    type: 'text' | 'image_url';
    text?: string;
}

interface TokenUsageMessage {
    content: string | TokenUsageMessageContent[];
}

export interface TokenUsageRecord {
    id: string;
    createdAt: number;
    provider: string;
    modelId: string;
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextTokens: number;
    contextLimit?: number;
}

export interface TokenUsageSummary {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    calls: number;
}

export const MAX_TOKEN_USAGE_RECORDS = 2000;

function estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const englishAndWhitespaceChars = (text.match(/[a-zA-Z\s]/g) || []).length;
    const otherChars = Math.max(0, text.length - chineseChars - englishAndWhitespaceChars);

    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
}

function calculateTotalTokens(messages: TokenUsageMessage[]): number {
    return messages.reduce((total, msg) => {
        if (typeof msg.content === 'string') {
            return total + estimateTokens(msg.content);
        }

        return total + msg.content.reduce((sum, part) => {
            if (part.type === 'text' && part.text) {
                return sum + estimateTokens(part.text);
            }
            if (part.type === 'image_url') {
                return sum + 85;
            }
            return sum;
        }, 0);
    }, 0);
}

export function createTokenUsageRecord(options: {
    messages: TokenUsageMessage[];
    outputText: string;
    provider: string;
    modelId: string;
    modelName: string;
    contextLimit?: number;
}): TokenUsageRecord {
    const inputTokens = calculateTotalTokens(options.messages);
    const outputTokens = estimateTokens(options.outputText || '');
    const now = Date.now();

    return {
        id: `token-${now}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        provider: options.provider || 'opencode',
        modelId: options.modelId || '',
        modelName: options.modelName || options.modelId || 'OpenCode',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        contextTokens: inputTokens,
        contextLimit: options.contextLimit,
    };
}

export function normalizeTokenUsageRecords(records: unknown): TokenUsageRecord[] {
    if (!Array.isArray(records)) return [];

    return records
        .filter((record: any) => record && typeof record === 'object')
        .map((record: any) => {
            const inputTokens = Math.max(0, Math.round(Number(record.inputTokens) || 0));
            const outputTokens = Math.max(0, Math.round(Number(record.outputTokens) || 0));
            return {
                id: String(record.id || `token-${record.createdAt || Date.now()}`),
                createdAt: Math.max(0, Math.round(Number(record.createdAt) || 0)),
                provider: String(record.provider || 'opencode'),
                modelId: String(record.modelId || ''),
                modelName: String(record.modelName || record.modelId || 'OpenCode'),
                inputTokens,
                outputTokens,
                totalTokens: Math.max(
                    0,
                    Math.round(Number(record.totalTokens) || inputTokens + outputTokens)
                ),
                contextTokens: Math.max(
                    0,
                    Math.round(Number(record.contextTokens) || inputTokens)
                ),
                contextLimit:
                    Number(record.contextLimit) > 0
                        ? Math.round(Number(record.contextLimit))
                        : undefined,
            };
        })
        .filter(record => record.createdAt > 0)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_TOKEN_USAGE_RECORDS);
}

export function appendTokenUsageRecord(
    records: unknown,
    record: TokenUsageRecord
): TokenUsageRecord[] {
    return normalizeTokenUsageRecords([record, ...normalizeTokenUsageRecords(records)]);
}

export function summarizeTokenUsage(records: TokenUsageRecord[]): TokenUsageSummary {
    return records.reduce(
        (summary, record) => ({
            inputTokens: summary.inputTokens + record.inputTokens,
            outputTokens: summary.outputTokens + record.outputTokens,
            totalTokens: summary.totalTokens + record.totalTokens,
            calls: summary.calls + 1,
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 }
    );
}

export function filterTokenUsageByRange(
    records: TokenUsageRecord[],
    range: 'today' | '7d' | '30d' | 'all',
    now = Date.now()
): TokenUsageRecord[] {
    if (range === 'all') return records;

    const date = new Date(now);
    let start: number;
    if (range === 'today') {
        start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    } else {
        const days = range === '7d' ? 7 : 30;
        start = now - days * 24 * 60 * 60 * 1000;
    }

    return records.filter(record => record.createdAt >= start);
}

export function groupTokenUsageByModel(records: TokenUsageRecord[]) {
    const groups = new Map<
        string,
        TokenUsageSummary & { modelId: string; modelName: string; provider: string }
    >();

    for (const record of records) {
        const key = `${record.provider}:${record.modelId || record.modelName}`;
        const existing =
            groups.get(key) ||
            {
                provider: record.provider,
                modelId: record.modelId,
                modelName: record.modelName,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                calls: 0,
            };
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
        existing.totalTokens += record.totalTokens;
        existing.calls += 1;
        groups.set(key, existing);
    }

    return Array.from(groups.values()).sort((a, b) => b.totalTokens - a.totalTokens);
}

export function formatTokenCount(value: number): string {
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return `${Math.max(0, Math.round(value)).toLocaleString()}`;
}
