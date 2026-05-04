<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';
    import type { ProviderConfig, ModelConfig } from '../defaultSettings';
    import type { ThinkingEffort } from '../ai-chat';
    import { t } from '../utils/i18n';

    export let providers: Record<string, any>;
    export let selectedModels: Array<{
        provider: string;
        modelId: string;
        thinkingEnabled?: boolean;
        thinkingEffort?: ThinkingEffort;
    }> = [];
    export let isOpen = false;
    export let enableMultiModel = false;
    export let currentProvider = '';
    export let currentModelId = '';

    const dispatch = createEventDispatcher();

    const builtInProviderNames: Record<string, string> = {
        opencode: t('platform.builtIn.opencode'),
    };

    let expandedProviders: Set<string> = new Set();

    let modelSearchQuery = '';

    let containerWidth = 0;
    let containerElement: HTMLElement;
    let resizeObserver: ResizeObserver | null = null;

    let buttonEl: HTMLElement | null = null;
    let dropdownEl: HTMLElement | null = null;
    let _resizeHandler: () => void;

    let draggedIndex: number | null = null;
    let dropIndicatorIndex: number | null = null;

    let wasOpen = false;

    function getProviderModels(): Array<ModelConfig & { providerId: string; providerName: string }> {
        const config = providers['opencode'];
        if (config && config.models && config.models.length > 0) {
            return config.models.map((m: ModelConfig) => ({
                ...m,
                providerId: 'opencode',
                providerName: builtInProviderNames['opencode'],
            }));
        }
        return [];
    }

    // 响应式过滤后的模型列表（支持空格分隔的 AND 搜索）
    $: filteredModels = (() => {
        const _deps = providers;
        const allModels = getProviderModels();
        const query = modelSearchQuery.trim().toLowerCase();
        if (!query) {
            return allModels;
        } else {
            const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
            return allModels.filter(model => {
                const modelText = `${model.name} ${model.id}`.toLowerCase();
                return searchTerms.every(term => modelText.includes(term));
            });
        }
    })();

    function addModel(provider: string, modelId: string) {
        if (enableMultiModel) {
            const defaultThinkingEnabled = getProviderModelThinkingEnabled(provider, modelId);
            const defaultThinkingEffort = getProviderModelThinkingEffort(provider, modelId);
            selectedModels = [
                ...selectedModels,
                {
                    provider,
                    modelId,
                    thinkingEnabled: defaultThinkingEnabled,
                    thinkingEffort: defaultThinkingEffort,
                },
            ];
            dispatch('change', selectedModels);
        } else {
            dispatch('select', { provider, modelId });
            isOpen = false;
        }
    }

    function toggleEnableMultiModel() {
        dispatch('toggleEnable', enableMultiModel);
    }

    function getProviderDisplayName(providerId: string): string {
        if (builtInProviderNames[providerId]) {
            return builtInProviderNames[providerId];
        }
        return providerId;
    }

    function getModelName(provider: string, modelId: string): string {
        const providerConfig = providers[provider];
        if (providerConfig && providerConfig.models) {
            const model = providerConfig.models.find((m: any) => m.id === modelId);
            return model ? model.name : modelId;
        }
        return modelId;
    }

    function getProviderModelThinkingEnabled(provider: string, modelId: string): boolean {
        const providerConfig = providers[provider];
        if (providerConfig && providerConfig.models) {
            const model = providerConfig.models.find((m: any) => m.id === modelId);
            return model?.thinkingEnabled || false;
        }
        return false;
    }

    function getProviderModelThinkingEffort(provider: string, modelId: string): ThinkingEffort {
        const providerConfig = providers[provider];
        if (providerConfig && providerConfig.models) {
            const model = providerConfig.models.find((m: any) => m.id === modelId);
            return model?.thinkingEffort || 'low';
        }
        return 'low';
    }

    function getModelCapabilitiesEmoji(provider: string, modelId: string): string {
        const providerConfig = providers[provider];
        if (!providerConfig || !providerConfig.models) return '';
        const model = providerConfig.models.find((m: any) => m.id === modelId);
        if (!model?.capabilities) return '';

        const emojis: string[] = [];
        if (model.capabilities.thinking) emojis.push('💡');
        if (model.capabilities.vision) emojis.push('👀');
        if (model.capabilities.imageGeneration) emojis.push('🖼️');
        if (model.capabilities.toolCalling) emojis.push('🛠️');
        if (model.capabilities.webSearch) emojis.push('🌐');

        return emojis.length > 0 ? ' ' + emojis.join(' ') : '';
    }

    function toggleModelInstanceThinking(index: number) {
        const newModels = [...selectedModels];
        newModels[index].thinkingEnabled = !newModels[index].thinkingEnabled;
        selectedModels = newModels;
        dispatch('change', selectedModels);
    }

    function changeModelInstanceThinkingEffort(index: number, effort: ThinkingEffort) {
        const newModels = [...selectedModels];
        newModels[index].thinkingEffort = effort;
        selectedModels = newModels;
        dispatch('change', selectedModels);
    }

    function handleThinkingEffortChange(index: number, event: Event) {
        const target = event.currentTarget as HTMLSelectElement;
        const effort = target.value as ThinkingEffort;
        changeModelInstanceThinkingEffort(index, effort);
    }

    $: selectedModelNames = (() => {
        if (selectedModels.length === 0) return '';
        return selectedModels.map(m => getModelName(m.provider, m.modelId)).join('，');
    })();

    function getModelSelectionCount(provider: string, modelId: string): number {
        if (!enableMultiModel) return 0;
        return selectedModels.filter(m => m.provider === provider && m.modelId === modelId).length;
    }

    function decreaseModelSelection(provider: string, modelId: string, event: Event) {
        event.stopPropagation();
        if (!enableMultiModel) return;

        const index = selectedModels.findIndex(
            m => m.provider === provider && m.modelId === modelId
        );
        if (index !== -1) {
            const newModels = [...selectedModels];
            newModels.splice(index, 1);
            selectedModels = newModels;
            dispatch('change', selectedModels);
        }
    }

    function handleDragStart(event: DragEvent, index: number) {
        event.stopPropagation();
        draggedIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('application/multi-model-sort', 'true');
        }
    }

    function handleDragOver(event: DragEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }

        if (draggedIndex !== null && draggedIndex !== index) {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const y = event.clientY - rect.top;
            const height = rect.height;

            if (y < height / 2) {
                dropIndicatorIndex = index;
            } else {
                dropIndicatorIndex = index + 1;
            }
        }
    }

    function handleDragEnter(event: DragEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        if (draggedIndex !== null && draggedIndex !== index) {
            dropIndicatorIndex = index;
        }
    }

    function handleDragLeave(event: DragEvent) {
        event.stopPropagation();
        const relatedTarget = event.relatedTarget as HTMLElement;
        const currentTarget = event.currentTarget as HTMLElement;

        if (!currentTarget.contains(relatedTarget)) {
            dropIndicatorIndex = null;
        }
    }

    function handleDrop(event: DragEvent, dropIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        if (draggedIndex !== null) {
            let targetIndex = dropIndicatorIndex;

            if (targetIndex === null) {
                targetIndex = dropIndex;
            }

            if (
                targetIndex !== null &&
                targetIndex !== draggedIndex &&
                targetIndex !== draggedIndex + 1
            ) {
                const newModels = [...selectedModels];
                const [draggedItem] = newModels.splice(draggedIndex, 1);

                let adjustedTargetIndex = targetIndex;
                if (targetIndex > draggedIndex) {
                    adjustedTargetIndex -= 1;
                }

                newModels.splice(adjustedTargetIndex, 0, draggedItem);
                selectedModels = newModels;
                dispatch('change', selectedModels);
            }
        }
        draggedIndex = null;
        dropIndicatorIndex = null;
    }

    function handleDragEnd() {
        draggedIndex = null;
        dropIndicatorIndex = null;
    }

    function moveModelUp(index: number) {
        if (index > 0) {
            const newModels = [...selectedModels];
            [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
            selectedModels = newModels;
            dispatch('change', selectedModels);
        }
    }

    function moveModelDown(index: number) {
        if (index < selectedModels.length - 1) {
            const newModels = [...selectedModels];
            [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
            selectedModels = newModels;
            dispatch('change', selectedModels);
        }
    }

    function removeModel(index: number) {
        const newModels = selectedModels.filter((_, i) => i !== index);
        selectedModels = newModels;
        dispatch('change', selectedModels);
    }

    function getCurrentModelName(): string {
        if (!currentProvider || !currentModelId) {
            return t('models.selectPlaceholder');
        }
        return getModelName(currentProvider, currentModelId);
    }

    $: fullModelName = currentProvider && currentModelId
        ? getModelName(currentProvider, currentModelId)
        : t('models.selectPlaceholder');

    $: displayModelName = (() => {
        if (!fullModelName || fullModelName === t('models.selectPlaceholder')) return fullModelName;
        if (containerWidth > 0 && containerWidth < 200 && fullModelName.length > 10) {
            return fullModelName.substring(0, 10) + '...';
        }
        return fullModelName;
    })();

    function closeOnOutsideClick(event: MouseEvent) {
        let target = event.target as HTMLElement;
        let found = false;
        while (target) {
            if (target.classList && target.classList.contains('multi-model-selector')) {
                found = true;
                break;
            }
            target = target.parentElement;
        }
        if (!found) {
            isOpen = false;
        }
    }

    $: if (isOpen) {
        if (!wasOpen) {
            modelSearchQuery = '';
            wasOpen = true;
        }
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
            updateDropdownPosition();
            _resizeHandler = () => updateDropdownPosition();
            window.addEventListener('resize', _resizeHandler);
        }, 0);
    } else {
        wasOpen = false;
        document.removeEventListener('click', closeOnOutsideClick);
        if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
        if (dropdownEl) {
            dropdownEl.style.maxHeight = '';
            dropdownEl.style.top = '';
            dropdownEl.style.bottom = '';
            dropdownEl.style.left = '';
            dropdownEl.style.right = '';
        }
    }

    onDestroy(() => {
        document.removeEventListener('click', closeOnOutsideClick);
        if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
    });

    onMount(() => {
        if (containerElement) {
            resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    containerWidth = entry.contentRect.width;
                }
            });
            resizeObserver.observe(containerElement);
        }
    });

    function updateDropdownPosition() {
        if (!buttonEl || !dropdownEl) return;

        const rect = buttonEl.getBoundingClientRect();
        const margin = 8;

        const availableAbove = rect.top - margin;
        const availableBelow = window.innerHeight - rect.bottom - margin;

        dropdownEl.style.position = 'fixed';

        const dropdownWidth = dropdownEl.offsetWidth || 320;

        let left = rect.right - dropdownWidth;

        if (left < margin) {
            left = margin;
        }

        if (left + dropdownWidth > window.innerWidth - margin) {
            left = window.innerWidth - dropdownWidth - margin;
        }

        if (left < margin) {
            left = margin;
        }

        dropdownEl.style.left = `${left}px`;
        dropdownEl.style.right = 'auto';

        if (availableBelow >= availableAbove) {
            dropdownEl.style.top = `${rect.bottom + margin}px`;
            dropdownEl.style.bottom = 'auto';
            dropdownEl.style.maxHeight = `${Math.max(80, availableBelow)}px`;
        } else {
            dropdownEl.style.bottom = `${window.innerHeight - rect.top + margin}px`;
            dropdownEl.style.top = 'auto';
            dropdownEl.style.maxHeight = `${Math.max(80, availableAbove)}px`;
        }
    }
</script>

<div class="multi-model-selector" bind:this={containerElement}>
    <button
        bind:this={buttonEl}
        class="multi-model-selector__button b3-button b3-button--text"
        class:multi-model-selector__button--active={enableMultiModel}
        on:click|stopPropagation={() => (isOpen = !isOpen)}
        title={enableMultiModel ? t('multiModel.title') : fullModelName}
    >
        <svg class="b3-button__icon">
            <use xlink:href="#iconLayout"></use>
        </svg>
        <span class="multi-model-selector__label">
            {#if enableMultiModel}
                {#if selectedModels.length > 0}
                    {t('multiModel.enabled')} ({selectedModels.length})
                {:else}
                    {t('multiModel.title')}
                {/if}
            {:else}
                {displayModelName}
            {/if}
        </span>
    </button>

    {#if isOpen}
        <div class="multi-model-selector__dropdown" bind:this={dropdownEl}>
            <div class="multi-model-selector__header">
                <div class="multi-model-selector__title">
                    {enableMultiModel
                        ? t('multiModel.selectModels')
                        : t('models.selectPlaceholder')}
                </div>
                <div
                    class="multi-model-selector__toggle"
                    on:click|stopPropagation
                    role="button"
                    tabindex="0"
                    on:keydown={e => e.key === 'Enter' && toggleEnableMultiModel()}
                >
                    <label>
                        <input
                            type="checkbox"
                            class="b3-switch"
                            bind:checked={enableMultiModel}
                            on:change={toggleEnableMultiModel}
                        />
                        <span class="multi-model-selector__toggle-label">
                            {t('multiModel.enable')}
                        </span>
                    </label>
                </div>
            </div>

            {#if enableMultiModel}
                <div class="multi-model-selector__count-header">
                    <div class="multi-model-selector__count">
                        {#if selectedModels.length > 0}
                            {t('multiModel.selected')}: {selectedModels.length} ({selectedModelNames})
                        {:else}
                            {t('multiModel.selected')}: {selectedModels.length}
                        {/if}
                    </div>
                </div>

                {#if selectedModels.length > 0}
                    <div class="multi-model-selector__selected-header">
                        <div class="multi-model-selector__selected-title">
                            {t('multiModel.selectedModels')}
                        </div>
                    </div>

                    <div class="multi-model-selector__selected-models">
                        {#each selectedModels as model, index}
                            {#if dropIndicatorIndex === index}
                                <div
                                    class="multi-model-selector__drop-indicator multi-model-selector__drop-indicator--active"
                                ></div>
                            {/if}

                            <div
                                class="multi-model-selector__selected-model"
                                draggable="true"
                                role="button"
                                tabindex="0"
                                on:dragstart={e => handleDragStart(e, index)}
                                on:dragover={e => handleDragOver(e, index)}
                                on:dragenter={e => handleDragEnter(e, index)}
                                on:dragleave={handleDragLeave}
                                on:drop={e => handleDrop(e, index)}
                                on:dragend={handleDragEnd}
                            >
                                <div class="multi-model-selector__selected-model-content">
                                    <div class="multi-model-selector__drag-handle">
                                        <svg class="multi-model-selector__drag-icon">
                                            <use xlink:href="#iconDrag"></use>
                                        </svg>
                                    </div>
                                    <div class="multi-model-selector__selected-model-info">
                                        <span class="multi-model-selector__selected-model-name">
                                            {getModelName(
                                                model.provider,
                                                model.modelId
                                            )}{getModelCapabilitiesEmoji(
                                                model.provider,
                                                model.modelId
                                            )}
                                        </span>
                                        <span class="multi-model-selector__selected-model-provider">
                                            {getProviderDisplayName(model.provider)}
                                        </span>
                                    </div>
                                    <div
                                        class="multi-model-selector__selected-model-thinking"
                                        role="group"
                                        on:mousedown|stopPropagation
                                        on:click|stopPropagation
                                        on:keydown={() => {}}
                                    >
                                        <label
                                            class="multi-model-selector__thinking-toggle"
                                            title="思考模式"
                                        >
                                            <input
                                                type="checkbox"
                                                class="b3-switch"
                                                checked={model.thinkingEnabled || false}
                                                on:change={() =>
                                                    toggleModelInstanceThinking(index)}
                                            />
                                            <span class="multi-model-selector__thinking-label">
                                                思考
                                            </span>
                                        </label>
                                        {#if model.thinkingEnabled}
                                            <select
                                                class="b3-select multi-model-selector__thinking-effort"
                                                value={model.thinkingEffort || 'low'}
                                                on:change={e =>
                                                    handleThinkingEffortChange(index, e)}
                                                on:click|stopPropagation
                                                title="思考程度"
                                            >
                                                <option value="low">低</option>
                                                <option value="medium">中</option>
                                                <option value="high">高</option>
                                                <option value="auto">自动</option>
                                            </select>
                                        {/if}
                                    </div>
                                    <div class="multi-model-selector__selected-model-actions">
                                        <button
                                            class="multi-model-selector__move-btn"
                                            disabled={index === 0}
                                            on:click|stopPropagation={() => moveModelUp(index)}
                                            title={t('multiModel.moveUp')}
                                        >
                                            <svg class="multi-model-selector__move-icon">
                                                <use xlink:href="#iconUp"></use>
                                            </svg>
                                        </button>
                                        <button
                                            class="multi-model-selector__move-btn"
                                            disabled={index === selectedModels.length - 1}
                                            on:click|stopPropagation={() => moveModelDown(index)}
                                            title={t('multiModel.moveDown')}
                                        >
                                            <svg class="multi-model-selector__move-icon">
                                                <use xlink:href="#iconDown"></use>
                                            </svg>
                                        </button>
                                        <button
                                            class="multi-model-selector__remove-btn"
                                            on:click|stopPropagation={() => removeModel(index)}
                                            title={t('multiModel.remove')}
                                        >
                                            <svg class="multi-model-selector__remove-icon">
                                                <use xlink:href="#iconClose"></use>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}

                        {#if dropIndicatorIndex === selectedModels.length}
                            <div
                                class="multi-model-selector__drop-indicator multi-model-selector__drop-indicator--active"
                            ></div>
                        {/if}
                    </div>
                {/if}
            {/if}

            <div class="multi-model-selector__tree">
                <div class="multi-model-selector__search">
                    <input
                        type="text"
                        class="b3-text-field"
                        placeholder={t('multiModel.searchModels') || '搜索模型'}
                        bind:value={modelSearchQuery}
                        spellcheck="false"
                    />
                </div>

                {#if modelSearchQuery.trim() && filteredModels.length === 0}
                    <div class="multi-model-selector__no-results">
                        {t('multiModel.noResults') || '无匹配结果'}
                    </div>
                {/if}

                {#each filteredModels as model}
                    <div
                        class="multi-model-selector__model"
                        role="button"
                        tabindex="0"
                        class:multi-model-selector__model--active={!enableMultiModel &&
                            currentProvider === model.providerId &&
                            currentModelId === model.id}
                        on:click={() => addModel(model.providerId, model.id)}
                        on:keydown={() => {}}
                    >
                        {#if enableMultiModel}
                            <div class="multi-model-selector__add-button">
                                <svg class="multi-model-selector__add-icon">
                                    <use xlink:href="#iconAdd"></use>
                                </svg>
                            </div>
                        {/if}
                        <div class="multi-model-selector__model-info">
                            <div class="multi-model-selector__model-name-container">
                                {#if enableMultiModel && getModelSelectionCount(model.providerId, model.id) > 0}
                                    <span
                                        class="multi-model-selector__model-count-badge"
                                        role="button"
                                        tabindex="0"
                                        title="点击减少选择次数"
                                        on:click={e =>
                                            decreaseModelSelection(
                                                model.providerId,
                                                model.id,
                                                e
                                            )}
                                        on:keydown={() => {}}
                                    >
                                        {getModelSelectionCount(
                                            model.providerId,
                                            model.id
                                        )}
                                    </span>
                                {/if}
                                <span class="multi-model-selector__model-name">
                                    {model.name}{getModelCapabilitiesEmoji(
                                        model.providerId,
                                        model.id
                                    )}
                                </span>
                            </div>
                            <span class="multi-model-selector__model-params">
                                T: {model.temperature} | Max: {model.maxTokens}
                            </span>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .multi-model-selector {
        position: relative;
    }

    .multi-model-selector__button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        border-radius: 4px;
        transition: all 0.2s;

        &--active {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-primary);
        }
    }

    .multi-model-selector__label {
        white-space: nowrap;
    }

    .multi-model-selector__dropdown {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        min-width: 320px;
        max-width: calc(min(450px, 90vw));
        overflow: hidden;
        z-index: 1000;
        display: flex;
        flex-direction: column;
    }

    .multi-model-selector__header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--b3-theme-surface);
    }

    .multi-model-selector__title {
        font-weight: 600;
        font-size: 14px;
        color: var(--b3-theme-on-background);
    }

    .multi-model-selector__toggle {
        font-size: 12px;

        label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            user-select: none;
        }
    }

    .multi-model-selector__toggle-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .multi-model-selector__count-header {
        padding: 8px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .multi-model-selector__count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        font-weight: 500;
    }

    .multi-model-selector__selected-header {
        padding: 8px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .multi-model-selector__selected-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        margin-bottom: 2px;
    }

    .multi-model-selector__selected-models {
        max-height: 200px;
        overflow-y: auto;
    }

    .multi-model-selector__drop-indicator {
        height: 2px;
        background: var(--b3-theme-primary);
        border-radius: 1px;
        margin: 2px 8px;
        opacity: 0;
        transition: opacity 0.2s ease;

        &--active {
            opacity: 1;
        }
    }

    .multi-model-selector__selected-model {
        margin: 4px 8px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: move;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface-light);
            border-color: var(--b3-theme-primary-light);
        }

        &:active {
            transform: scale(0.98);
        }
    }

    .multi-model-selector__selected-model-content {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        min-width: 0;
    }

    .multi-model-selector__drag-handle {
        flex-shrink: 0;
        cursor: grab;
        color: var(--b3-theme-on-surface-light);

        &:active {
            cursor: grabbing;
        }
    }

    .multi-model-selector__drag-icon {
        width: 14px;
        height: 14px;
    }

    .multi-model-selector__selected-model-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .multi-model-selector__selected-model-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .multi-model-selector__selected-model-provider {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .multi-model-selector__selected-model-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .multi-model-selector__move-btn,
    .multi-model-selector__remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        border-radius: 4px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light);
        transition: all 0.2s;

        &:hover:not(:disabled) {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-background);
        }

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    }

    .multi-model-selector__move-icon,
    .multi-model-selector__remove-icon {
        width: 12px;
        height: 12px;
    }

    .multi-model-selector__tree {
        padding: 8px;
        overflow-y: auto;
        max-height: 500px;
        flex: 1;
    }

    .multi-model-selector__search {
        padding: 8px 0 12px 0;
    }

    .multi-model-selector__search input {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
    }

    .multi-model-selector__no-results {
        padding: 16px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .multi-model-selector__model {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 2px;
        border-left: 2px solid transparent;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
        }

        &--active {
            background: var(--b3-theme-primary-lightest);
            border-left-color: var(--b3-theme-primary);

            .multi-model-selector__model-name {
                color: var(--b3-theme-primary);
                font-weight: 600;
            }
        }
    }

    .multi-model-selector__add-button {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--b3-theme-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-primary-light);
            transform: scale(1.1);
        }
    }

    .multi-model-selector__add-icon {
        width: 12px;
        height: 12px;
        fill: var(--b3-theme-on-primary);
    }

    .multi-model-selector__model-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .multi-model-selector__model-name-container {
        display: flex;
        align-items: center;
        position: relative;
        padding-left: 12px;
    }

    .multi-model-selector__model-count-badge {
        position: absolute;
        left: -8px;
        top: -8px;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-size: 12px;
        font-weight: 600;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--b3-dialog-shadow);
        z-index: 10;
        border: 2px solid var(--b3-theme-background);
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;

        &:hover {
            background: var(--b3-theme-primary-light);
            transform: scale(1.1);
        }

        &:active {
            transform: scale(0.95);
        }
    }

    .multi-model-selector__model-name {
        font-size: 13px;
        color: var(--b3-theme-on-background);
        margin-bottom: 2px;
        font-weight: 500;
    }

    .multi-model-selector__model-params {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .multi-model-selector__selected-model-thinking {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .multi-model-selector__thinking-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .multi-model-selector__thinking-label {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .multi-model-selector__thinking-effort {
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 3px;
        cursor: pointer;
        min-width: 50px;
    }
</style>
