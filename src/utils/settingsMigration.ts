export function migrateLegacyProviderSettings(settings: any): boolean {
    let changed = false;
    if (!settings.aiProviders) {
        settings.aiProviders = {
            opencode: { serverUrl: 'http://localhost:4096', models: [] },
            customProviders: [],
            disabledBuiltInProviders: [],
            providerOrder: [],
        };
        changed = true;
    }
    for (const key of ['customProviders', 'disabledBuiltInProviders', 'providerOrder']) {
        if (!Array.isArray(settings.aiProviders[key])) {
            settings.aiProviders[key] = [];
            changed = true;
        }
    }
    if (settings.aiProvider === 'opencode' && settings.aiModel) {
        const provider = settings.aiProviders.opencode ||= {
            serverUrl: 'http://localhost:4096',
            models: [],
        };
        if (!provider.models?.some((model: any) => model.id === settings.aiModel)) {
            provider.models = [
                ...(provider.models || []),
                {
                    id: settings.aiModel,
                    name: settings.aiModel,
                    temperature: settings.aiTemperature || 1,
                    maxTokens: settings.aiMaxTokens || -1,
                },
            ];
        }
        settings.currentProvider ||= 'opencode';
        settings.currentModelId ||= settings.aiModel;
        changed = true;
    }
    return changed;
}
