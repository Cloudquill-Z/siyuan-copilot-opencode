export function coerceSelectOptionValue(optionValue: string, currentValue: unknown): string | number {
    return typeof currentValue === 'number' ? Number(optionValue) : optionValue;
}

export function normalizeConcurrentTaskLimit(value: unknown): number {
    return Math.min(4, Math.max(1, Math.floor(Number(value) || 2)));
}

export function canStartConcurrentTask(activeTaskCount: number, limit: unknown): boolean {
    return activeTaskCount < normalizeConcurrentTaskLimit(limit);
}
