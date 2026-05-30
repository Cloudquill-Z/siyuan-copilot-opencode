export interface OpenCodeModelInfo {
    id: string;
    name: string;
    providerID?: string;
    contextLimit?: number;
    outputLimit?: number;
    enableThinking?: boolean;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'max' | 'auto';
}

const MODEL_NAME_WORDS: Record<string, string> = {
    ai: 'AI',
    api: 'API',
    glm: 'GLM',
    gpt: 'GPT',
    k2: 'K2',
    mimo: 'MiMo',
    v1: 'V1',
    v2: 'V2',
    v3: 'V3',
    v4: 'V4',
    v5: 'V5',
};

function formatModelWord(word: string): string {
    const lower = word.toLowerCase();
    if (MODEL_NAME_WORDS[lower]) {
        return MODEL_NAME_WORDS[lower];
    }
    if (/^[a-z]\d+(?:\.\d+)?$/i.test(word)) {
        return word.toUpperCase();
    }
    if (lower === 'deepseek') {
        return 'DeepSeek';
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatModelNameFromId(modelId: string): string {
    return modelId
        .split(/[-_:/]+/)
        .filter(Boolean)
        .map(formatModelWord)
        .join(' ');
}

export function parseOpenCodeModelListOutput(
    output: string,
    providerID?: string
): OpenCodeModelInfo[] {
    const models: OpenCodeModelInfo[] = [];
    const seen = new Set<string>();

    for (const rawLine of (output || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const slashIndex = line.indexOf('/');
        if (slashIndex <= 0) continue;

        const provider = line.slice(0, slashIndex);
        const modelId = line.slice(slashIndex + 1).trim();
        if ((providerID && provider !== providerID) || !modelId) continue;

        const uniqueId = `${provider}/${modelId}`;
        if (seen.has(uniqueId)) continue;
        seen.add(uniqueId);

        models.push({
            id: modelId,
            name: formatModelNameFromId(modelId),
            providerID: provider,
        });
    }

    return models;
}

function getProviderId(provider: any): string {
    return String(provider?.id || provider?.providerID || provider?.name || '').trim();
}

function readLimitNumber(...values: any[]): number | undefined {
    for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) {
            return num;
        }
    }
    return undefined;
}

function normalizeModelInfo(modelId: string, modelInfo: any, providerID: string): OpenCodeModelInfo | null {
    if (!modelId) return null;
    const contextLimit = readLimitNumber(
        modelInfo?.limit?.context,
        modelInfo?.limits?.context,
        modelInfo?.contextLimit,
        modelInfo?.context_length,
        modelInfo?.contextWindow
    );
    const outputLimit = readLimitNumber(
        modelInfo?.limit?.output,
        modelInfo?.limits?.output,
        modelInfo?.outputLimit,
        modelInfo?.maxTokens
    );
    const model: OpenCodeModelInfo = {
        id: modelId,
        name: modelInfo?.name || modelInfo?.displayName || formatModelNameFromId(modelId),
        providerID: providerID || undefined,
    };
    if (contextLimit) model.contextLimit = contextLimit;
    if (outputLimit) model.outputLimit = outputLimit;
    if (typeof modelInfo?.enableThinking === 'boolean') {
        model.enableThinking = modelInfo.enableThinking;
    }
    if (
        modelInfo?.reasoningEffort &&
        ['low', 'medium', 'high', 'max', 'auto'].includes(modelInfo.reasoningEffort)
    ) {
        model.reasoningEffort = modelInfo.reasoningEffort;
    }
    return model;
}

export function parseOpenCodeProviderModels(
    data: any,
    connectedProviders?: Set<string>
): OpenCodeModelInfo[] {
    const providerSource = data?.all ?? data?.providers ?? [];
    const providers = Array.isArray(providerSource)
        ? providerSource
        : Object.entries(providerSource || {}).map(([id, provider]: [string, any]) => ({
              id,
              ...(provider || {}),
          }));
    const models: OpenCodeModelInfo[] = [];
    const seen = new Set<string>();

    const addModel = (modelId: string, modelInfo: any, providerID: string) => {
        const model = normalizeModelInfo(modelId, modelInfo, providerID);
        if (!model) return;
        const key = `${model.providerID || ''}/${model.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        models.push(model);
    };

    for (const provider of providers) {
        const providerID = getProviderId(provider);
        if (!providerID) continue;

        if (connectedProviders !== undefined) {
            const isConnected = connectedProviders.has(providerID);
            const isFreeBuiltIn = providerID === 'opencode';
            if (!isConnected && !isFreeBuiltIn) continue;
        }

        const modelsObj = provider?.models;
        if (modelsObj && typeof modelsObj === 'object' && !Array.isArray(modelsObj)) {
            for (const [modelId, modelInfo] of Object.entries(modelsObj)) {
                addModel(modelId, modelInfo, providerID);
            }
        } else if (Array.isArray(modelsObj)) {
            for (const modelInfo of modelsObj) {
                const modelId = modelInfo?.id || modelInfo?.modelID || modelInfo?.name;
                addModel(modelId, modelInfo, providerID);
            }
        }
    }

    return models;
}

export function mergeOpenCodeModelLists(
    primaryModels: OpenCodeModelInfo[],
    supplementalModels: OpenCodeModelInfo[]
): OpenCodeModelInfo[] {
    const merged = [...primaryModels];
    const seen = new Set(
        primaryModels.map(model => `${model.providerID || ''}/${model.id}`)
    );

    for (const model of supplementalModels) {
        const key = `${model.providerID || ''}/${model.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(model);
    }

    return merged;
}

export function shouldRefreshOpenCodeModelCatalog(models: Array<{ contextLimit?: number }> = []): boolean {
    if (models.length === 0) return true;
    if (models.length < 100) return true;
    return models.some(model => !model.contextLimit);
}
