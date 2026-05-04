import { getDefaultSettings } from "./defaultSettings";

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

    return merged;
}
