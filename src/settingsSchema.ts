import { DEFAULT_AI_SYSTEM_PROMPT, getDefaultSettings } from "./defaultSettings";

const LEGACY_DEFAULT_AI_SYSTEM_PROMPTS = new Set([
    '你是一个思源笔记操作小助手。具体思源笔记操作前加载 siyuan-mcp-sisyphus 这个 skill，搜索思源笔记可看 siyuan-search-query，编写思源笔记内容可看 siyuan-markup-guide。请基于以上技能提供思源笔记相关的帮助。',
    '你是一个思源笔记操作小助手。具体siyuan笔记前操作前加载 siyuan-mcp-sisyphus 这个 skill,搜索思源笔记可看siyuan-search-query，编写思源笔记内容可看siyuan-markup-guide',
]);

function isPlainObject(value: unknown): value is Record<string, any> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: any): T {
    if (Array.isArray(base)) {
        return (Array.isArray(override) ? override : base) as T;
    }

    if (!isPlainObject(base)) {
        return (override === undefined ? base : override) as T;
    }

    const output: Record<string, any> = { ...base };
    const source = isPlainObject(override) ? override : {};

    for (const [key, value] of Object.entries(source)) {
        const current = output[key];
        if (Array.isArray(current)) {
            output[key] = Array.isArray(value) ? value : current;
            continue;
        }

        if (isPlainObject(current)) {
            output[key] = deepMerge(current, value);
            continue;
        }

        output[key] = value;
    }

    return output as T;
}

export function mergeSettings<T>(base: T, override: any): T {
    return deepMerge(base, override);
}

export function normalizeSettings(rawSettings: any) {
    const defaults = getDefaultSettings();
    const merged = deepMerge(defaults, rawSettings || {});

    merged.settingsVersion = defaults.settingsVersion;
    merged.migrationVersion = Math.max(
        Number(merged.migrationVersion || 0),
        defaults.migrationVersion
    );

    merged.pluginData = deepMerge(defaults.pluginData, merged.pluginData || {});

    merged.aiProviders = deepMerge(defaults.aiProviders, merged.aiProviders || {});

    merged.aiProviders.opencode = deepMerge(
        defaults.aiProviders.opencode,
        merged.aiProviders.opencode || {}
    );

    if (!merged.aiProviders.opencode.serverUrl) {
        merged.aiProviders.opencode.serverUrl = defaults.aiProviders.opencode.serverUrl;
    }
    if (!Array.isArray(merged.aiProviders.opencode.models)) {
        merged.aiProviders.opencode.models = [];
    }

    const rawSystemPrompt =
        typeof rawSettings?.aiSystemPrompt === "string" ? rawSettings.aiSystemPrompt.trim() : "";
    const mergedSystemPrompt =
        typeof merged.aiSystemPrompt === "string" ? merged.aiSystemPrompt.trim() : "";
    if (
        !rawSystemPrompt ||
        !mergedSystemPrompt ||
        LEGACY_DEFAULT_AI_SYSTEM_PROMPTS.has(rawSystemPrompt) ||
        LEGACY_DEFAULT_AI_SYSTEM_PROMPTS.has(mergedSystemPrompt)
    ) {
        merged.aiSystemPrompt = DEFAULT_AI_SYSTEM_PROMPT;
    }

    return merged;
}
