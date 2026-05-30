export type ChatMode = 'plan' | 'build';
export type OpenCodeAgentMode = 'plan' | 'build';

const CHAT_MODE_LABELS: Record<ChatMode, string> = {
    plan: '问答模式',
    build: '修订模式',
};

const CHAT_MODE_DESCRIPTIONS: Record<ChatMode, string> = {
    plan: '查询/阅读笔记，并直接在对话框回复，不修改笔记',
    build: '直接修改笔记，并在对话框汇报修改结果',
};

const CHAT_MODE_SYSTEM_INSTRUCTIONS: Record<ChatMode, string> = {
    plan: [
        '当前模式：问答模式。',
        '可以使用 siyuan-sisyphus 查询、搜索和阅读用户的思源笔记内容。',
        '只在当前对话框中回答用户，不要修改、创建、编辑、替换、删除或重命名任何思源笔记内容。',
    ].join('\n'),
    build: [
        '当前模式：修订模式。',
        '执行思源笔记修订前先安装或检查 skill：siyuan-sisyphus skill install；搜索/SQL 先看 siyuan-sisyphus-search-query，读取内容先看 siyuan-sisyphus-browse-read，创建/编辑/替换/删除先看 siyuan-sisyphus-create-edit。',
        '当用户要求修订、整理、改写、替换或删除笔记内容时，可以直接修改笔记，使用 siyuan-sisyphus 执行变更。',
        '修改后在当前对话框中简洁说明修改位置、修改内容和验证结果。',
    ].join('\n'),
};

export function getChatModeLabel(mode: ChatMode): string {
    return CHAT_MODE_LABELS[mode];
}

export function getChatModeDescription(mode: ChatMode): string {
    return CHAT_MODE_DESCRIPTIONS[mode];
}

export function getChatModeSystemInstruction(mode: ChatMode): string {
    return CHAT_MODE_SYSTEM_INSTRUCTIONS[mode];
}

export function getOpenCodeAgentForChatMode(mode?: ChatMode): OpenCodeAgentMode | undefined {
    if (!mode) return undefined;
    return mode === 'build' ? 'build' : 'plan';
}

export function getContextLimitForDisplay(options: {
    modelConfig?: any;
    currentModelId?: string;
    currentProvider?: string;
}): number | undefined {
    const limit = Number(
        options.modelConfig?.contextLimit ||
            options.modelConfig?.limit?.context ||
            options.modelConfig?.limits?.context ||
            options.modelConfig?.contextWindow ||
            options.modelConfig?.context_length ||
            0
    );
    if (Number.isFinite(limit) && limit > 0) {
        return limit;
    }
    // 默认 128K tokens，多数模型低于实际窗口，百分比展示保守可用
    return 128000;
}

export function getContextLimitForActiveModels(options: {
    modelConfig?: any;
    selectedModelConfigs?: any[];
    enableMultiModel?: boolean;
    chatMode?: ChatMode;
}): number | undefined {
    if (options.enableMultiModel && options.chatMode === 'plan') {
        const limits = (options.selectedModelConfigs || [])
            .map(modelConfig => getContextLimitForDisplay({ modelConfig }))
            .filter((limit): limit is number => Number.isFinite(limit) && limit > 0);
        if (limits.length > 0) {
            return Math.min(...limits);
        }
    }

    return getContextLimitForDisplay({ modelConfig: options.modelConfig });
}

export function shouldToggleChatModeFromKeydown(e: Pick<
    KeyboardEvent,
    'key' | 'defaultPrevented' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing'
>): boolean {
    return (
        !e.defaultPrevented &&
        e.key === 'Tab' &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.isComposing
    );
}
