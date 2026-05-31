import { DEFAULT_AI_SYSTEM_PROMPT, getDefaultSettings } from "./defaultSettings";
import { normalizeTokenUsageRecords } from "./utils/tokenUsage";

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
    merged.pluginData.tokenUsageRecords = normalizeTokenUsageRecords(
        merged.pluginData.tokenUsageRecords
    );

    merged.aiProviders = deepMerge(defaults.aiProviders, merged.aiProviders || {});
    merged.memory = deepMerge(defaults.memory, merged.memory || {});
    merged.pluginData.memoryExtractionState = isPlainObject(merged.pluginData.memoryExtractionState)
        ? merged.pluginData.memoryExtractionState
        : {};

    merged.memory.enabled = !!merged.memory.enabled;
    merged.memory.notebookId =
        typeof merged.memory.notebookId === "string" ? merged.memory.notebookId.trim() : "";
    merged.memory.rootPath =
        typeof merged.memory.rootPath === "string"
            ? merged.memory.rootPath.trim().replace(/^\/+|\/+$/g, "")
            : defaults.memory.rootPath;
    merged.memory.overviewDocId =
        typeof merged.memory.overviewDocId === "string" ? merged.memory.overviewDocId.trim() : "";
    merged.memory.coreDocId =
        typeof merged.memory.coreDocId === "string" ? merged.memory.coreDocId.trim() : "";
    merged.memory.autoExtract = merged.memory.autoExtract !== false;
    merged.memory.saveFullConversation = !!merged.memory.saveFullConversation;
    merged.memory.maxOverviewChars = Math.min(
        12000,
        Math.max(500, Math.floor(Number(merged.memory.maxOverviewChars) || defaults.memory.maxOverviewChars))
    );
    merged.memory.maxCoreChars = Math.min(
        16000,
        Math.max(500, Math.floor(Number(merged.memory.maxCoreChars) || defaults.memory.maxCoreChars))
    );
    merged.memory.maxEpisodicItems = Math.min(
        20,
        Math.max(0, Math.floor(Number(merged.memory.maxEpisodicItems) || defaults.memory.maxEpisodicItems))
    );
    merged.memory.maxTopicItems = Math.min(
        10,
        Math.max(0, Math.floor(Number(merged.memory.maxTopicItems) || defaults.memory.maxTopicItems))
    );
    merged.memory.maxMemoryPromptChars = Math.min(
        32000,
        Math.max(1000, Math.floor(Number(merged.memory.maxMemoryPromptChars) || defaults.memory.maxMemoryPromptChars))
    );
    merged.memory.minImportance = Math.min(
        1,
        Math.max(0, Number(merged.memory.minImportance) || defaults.memory.minImportance)
    );

    if (typeof merged.userName !== "string") {
        merged.userName = defaults.userName;
    }
    merged.userName = merged.userName.trim();

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

    merged.maxConcurrentTasks = Math.min(
        4,
        Math.max(1, Math.floor(Number(merged.maxConcurrentTasks) || defaults.maxConcurrentTasks))
    );

    return merged;
}
