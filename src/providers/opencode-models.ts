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
    providerID: string = 'opencode'
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
        if (provider !== providerID || !modelId) continue;

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
