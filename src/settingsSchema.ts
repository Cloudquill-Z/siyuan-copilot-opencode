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

function getBuiltInProviderIds(): string[] {
    return ["Achuan", "gemini", "deepseek", "openai", "moonshot", "volcano", "opencode"];
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

    if (isPlainObject(rawSettings?.dataTransfer)) {
        merged.pluginData.sessionStorageMigrated =
            merged.pluginData.sessionStorageMigrated || !!rawSettings.dataTransfer.sessionData;
        merged.pluginData.modelCapabilitiesInitialized =
            merged.pluginData.modelCapabilitiesInitialized ||
            !!rawSettings.dataTransfer.autoSetModelCapabilities;
    }

    merged.aiProviders = deepMerge(defaults.aiProviders, merged.aiProviders || {});
    merged.aiProviders.customProviders = Array.isArray(merged.aiProviders.customProviders)
        ? merged.aiProviders.customProviders
        : [];
    merged.aiProviders.disabledBuiltInProviders = Array.isArray(
        merged.aiProviders.disabledBuiltInProviders
    )
        ? merged.aiProviders.disabledBuiltInProviders
        : [];

    for (const providerId of getBuiltInProviderIds()) {
        merged.aiProviders[providerId] = deepMerge(
            defaults.aiProviders[providerId],
            merged.aiProviders[providerId] || {}
        );
    }

    const providerOrder = Array.isArray(merged.aiProviders.providerOrder)
        ? merged.aiProviders.providerOrder
        : [];
    const knownProviderIds = new Set<string>([
        ...getBuiltInProviderIds(),
        ...merged.aiProviders.customProviders.map((provider: any) => provider.id).filter(Boolean),
    ]);

    merged.aiProviders.providerOrder = [
        ...providerOrder.filter((id: string) => knownProviderIds.has(id)),
        ...Array.from(knownProviderIds).filter((id) => !providerOrder.includes(id)),
    ];

    if (!merged.aiProviders.opencode.serverUrl) {
        merged.aiProviders.opencode.serverUrl = defaults.aiProviders.opencode.serverUrl;
    }
    if (!Array.isArray(merged.aiProviders.opencode.models)) {
        merged.aiProviders.opencode.models = [];
    }

    return merged;
}
