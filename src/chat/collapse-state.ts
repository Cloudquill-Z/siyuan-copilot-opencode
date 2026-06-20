export function readCollapsed(
    state: Record<string, boolean>,
    key: string | number,
    fallback = true
): boolean {
    return state[String(key)] ?? fallback;
}

export function toggleCollapsed(
    state: Record<string, boolean>,
    key: string | number,
    fallback = true
): Record<string, boolean> {
    return { ...state, [String(key)]: !readCollapsed(state, key, fallback) };
}
