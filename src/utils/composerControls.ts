export type ComposerChatMode = 'plan' | 'build';
export type ComposerThinkingValue = 'off' | 'auto' | 'low' | 'medium' | 'high' | 'max';

const THINKING_LABELS: Record<ComposerThinkingValue, string> = {
    off: '关闭',
    auto: 'Auto',
    low: 'Low',
    medium: 'Middle',
    high: 'High',
    max: 'Max',
};

export function getComposerModeMeta(mode: ComposerChatMode) {
    return mode === 'build'
        ? { label: '修订', tone: 'revision' as const }
        : { label: '问答', tone: 'answer' as const };
}

export function getThinkingDisplayLabel(
    thinking: ComposerThinkingValue,
    supportsThinking: boolean
): string {
    if (!supportsThinking || thinking === 'off') return THINKING_LABELS.off;
    return THINKING_LABELS[thinking];
}

export function formatComposerStatusSummary(options: {
    mode: ComposerChatMode;
    modelName?: string;
    thinking: ComposerThinkingValue;
    supportsThinking: boolean;
}): string {
    const modeLabel = getComposerModeMeta(options.mode).label;
    const modelLabel = options.modelName?.trim() || '选择模型';
    const thinkingLabel = getThinkingDisplayLabel(
        options.thinking,
        options.supportsThinking
    );
    return `${modeLabel} · ${modelLabel} · ${thinkingLabel}`;
}

export function getPromptMenuToggleState(promptListOpen: boolean) {
    return {
        addMenuOpen: true,
        promptListOpen: !promptListOpen,
        statusMenuOpen: false,
    };
}
