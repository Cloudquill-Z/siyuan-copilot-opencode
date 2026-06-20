<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fetchModels } from '../ai-chat';
    import { pushMsg, pushErrMsg } from '../api';
    import type { ProviderConfig, ModelConfig } from '../defaultSettings';
    import { t } from '../utils/i18n';
    import { getModelCapabilities } from '../utils/modelCapabilities';

    export let providerId: string;
    export let providerName: string;
    export let defaultApiUrl: string = '';
    export let websiteUrl: string = '';
    export let config: ProviderConfig;
    export let isCustomProvider: boolean = false;

    $: isOpenCodeProvider = providerId === 'opencode';

    const dispatch = createEventDispatcher();

    let isLoadingModels = false;
    let searchQuery = '';
    let availableModels: { id: string; name: string; provider?: string; enableThinking?: boolean; reasoningEffort?: string }[] = [];
    let showModelSearchModal = false;
    let showAddModelModal = false;
    let manualModelId = '';
    let manualModelName = '';
    let isEditingName = false;
    let editingName = providerName;
    let showAdvancedConfig = false;
    let customBodyErrors: { [modelId: string]: string | null } = {};
    let showCustomBodyForModel: { [modelId: string]: boolean } = {};

    function validateJsonString(str: string): {
        valid: boolean;
        error?: string;
        formatted?: string;
    } {
        if (!str || !str.trim()) {
            return { valid: true };
        }
        try {
            const parsed = JSON.parse(str);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return { valid: false, error: '必须是 JSON 对象格式' };
            }
            return { valid: true, formatted: JSON.stringify(parsed, null, 2) };
        } catch (e: any) {
            const message = e.message || '无效的 JSON 格式';
            const posMatch = message.match(/position\s+(\d+)/i);
            if (posMatch) {
                const pos = parseInt(posMatch[1]);
                return { valid: false, error: `JSON 格式错误：第 ${pos} 个字符处` };
            }
            return { valid: false, error: `JSON 格式错误：${message}` };
        }
    }

    function handleCustomBodyChange(modelId: string, value: string) {
        const result = validateJsonString(value);
        customBodyErrors[modelId] = result.valid ? null : result.error || null;
        customBodyErrors = { ...customBodyErrors };
        updateModel(modelId, 'customBody', value);
    }

    function formatCustomBodyJson(modelId: string, currentValue: string) {
        const result = validateJsonString(currentValue);
        if (result.valid && result.formatted) {
            updateModel(modelId, 'customBody', result.formatted);
            customBodyErrors[modelId] = null;
            customBodyErrors = { ...customBodyErrors };
            pushMsg('JSON 已格式化');
        }
    }

    $: {
        if (!config.advancedConfig) {
            config.advancedConfig = {
                customModelsUrl: '',
                customChatUrl: '',
            };
        }
    }

    async function loadModels() {
        if (isOpenCodeProvider) {
            if (!config.serverUrl && !defaultApiUrl) {
                pushErrMsg('请先设置 OpenCode Server 地址');
                return;
            }
        } else {
            if (!config.apiKey) {
                pushErrMsg(t('aiSidebar.errors.noApiKey'));
                return;
            }
        }

        isLoadingModels = true;
        try {
            const models = await fetchModels(
                providerId,
                config.apiKey || '',
                isOpenCodeProvider ? (config.serverUrl || defaultApiUrl || '') : config.customApiUrl,
                config.advancedConfig
            );
            const uniqueModelsMap = new Map();
            models.forEach(m => {
                if (!uniqueModelsMap.has(m.id)) {
                    uniqueModelsMap.set(m.id, {
                        id: m.id,
                        name: m.name,
                        provider: m.provider,
                        enableThinking: m.enableThinking,
                        reasoningEffort: m.reasoningEffort
                    });
                }
            });
            availableModels = Array.from(uniqueModelsMap.values()).sort((a, b) =>
                a.id.localeCompare(b.id)
            );
            showModelSearchModal = true;
            searchQuery = '';
            pushMsg(t('models.fetchSuccess').replace('{count}', availableModels.length.toString()));
        } catch (error) {
            pushErrMsg(`${t('models.fetchFailed')}: ${error.message}`);
            console.error('Load models error:', error);
        } finally {
            isLoadingModels = false;
        }
    }

    function openModelSearchModal() {
        if (isOpenCodeProvider) {
            if (!config.serverUrl && !defaultApiUrl) {
                pushErrMsg('请先设置 OpenCode Server 地址');
                return;
            }
        } else {
            if (!config.apiKey) {
                pushErrMsg('请先设置 API Key');
                return;
            }
        }
        loadModels();
    }

    function closeModelSearchModal() {
        showModelSearchModal = false;
        searchQuery = '';
        availableModels = [];
    }

    function addModel(modelId: string, modelName: string, enableThinking?: boolean, reasoningEffort?: string) {
        if (config.models.some(m => m.id === modelId)) {
            pushErrMsg('该模型已添加');
            return;
        }

        const capabilities = getModelCapabilities(modelId);
        if (enableThinking) {
            capabilities.thinking = true;
        }
        const thinker: any = {};
        if (typeof enableThinking === 'boolean') {
            thinker.thinkingEnabled = enableThinking;
        }
        if (reasoningEffort && ['low', 'medium', 'high', 'max', 'auto'].includes(reasoningEffort)) {
            thinker.thinkingEffort = reasoningEffort;
        }
        const newModel: ModelConfig = {
            id: modelId,
            name: modelName,
            temperature: 1,
            maxTokens: -1,
            thinkingEnabled: false,
            thinkingEffort: 'medium',
            ...thinker,
            capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
        };

        config.models = [...config.models, newModel];
        dispatch('change');
        pushMsg(`已添加模型: ${modelName}`);
    }

    function addManualModel() {
        if (!manualModelId.trim()) {
            pushErrMsg(t('models.idRequired'));
            return;
        }

        const modelName = manualModelName.trim() || manualModelId.trim();
        addModel(manualModelId.trim(), modelName);

        manualModelId = '';
        manualModelName = '';
        showAddModelModal = false;
    }

    function openAddModelModal() {
        showAddModelModal = true;
    }

    function closeAddModelModal() {
        showAddModelModal = false;
        manualModelId = '';
        manualModelName = '';
    }

    function removeModel(modelId: string) {
        config.models = config.models.filter(m => m.id !== modelId);
        dispatch('change');
        pushMsg('已删除模型');
    }

    function toggleModel(modelId: string, modelName: string, enableThinking?: boolean, reasoningEffort?: string) {
        const isAdded = config.models.some(m => m.id === modelId);
        if (isAdded) {
            removeModel(modelId);
        } else {
            addModel(modelId, modelName, enableThinking, reasoningEffort);
        }
    }

    function updateModel(modelId: string, field: keyof ModelConfig, value: any) {
        const model = config.models.find(m => m.id === modelId);
        if (model) {
            (model as any)[field] = value;
            config.models = [...config.models];
            dispatch('change');
        }
    }

    $: filteredModels = availableModels
        .filter(m => {
            if (!searchQuery.trim()) return true;
            const keywords = searchQuery.toLowerCase().trim().split(/\s+/);
            const modelId = m.id.toLowerCase();
            const modelName = m.name.toLowerCase();
            return keywords.every(
                keyword => modelId.includes(keyword) || modelName.includes(keyword)
            );
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    function startEditName() {
        editingName = providerName;
        isEditingName = true;
    }

    function saveName() {
        if (editingName.trim() && editingName !== providerName) {
            dispatch('rename', { newName: editingName.trim() });
            providerName = editingName.trim();
        }
        isEditingName = false;
    }

    function cancelEditName() {
        editingName = providerName;
        isEditingName = false;
    }

    $: if (!isEditingName) {
        editingName = providerName;
    }
</script>

<div class="provider-config">
    <div class="provider-config__header">
        {#if isCustomProvider && isEditingName}
            <div class="provider-name-editor">
                <input
                    class="b3-text-field provider-name-input"
                    type="text"
                    bind:value={editingName}
                    on:keydown={e => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') cancelEditName();
                    }}
                    placeholder="输入平台名称"
                />
                <button class="b3-button b3-button--text" on:click={saveName} title="保存">
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconCheck"></use>
                    </svg>
                </button>
                <button class="b3-button b3-button--text" on:click={cancelEditName} title="取消">
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconClose"></use>
                    </svg>
                </button>
            </div>
        {:else}
            <div class="provider-header-content">
                <div class="provider-title-row">
                    <h4>{providerName}</h4>
                    {#if websiteUrl}
                        <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="platform-link"
                            title="访问平台官网"
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconLink"></use>
                            </svg>
                            <span>访问平台</span>
                        </a>
                    {/if}
                </div>
            </div>
            {#if isCustomProvider}
                <button
                    class="b3-button b3-button--text edit-name-button"
                    on:click={startEditName}
                    title="编辑名称"
                >
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconEdit"></use>
                    </svg>
                </button>
            {/if}
        {/if}
    </div>

    <div class="provider-config__section">
        {#if isOpenCodeProvider}
            <div>
                <div class="b3-label__text">
                    {t('platform.apiUrl')} (OpenCode Server)
                </div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    style="width: 100%"
                    value={config.serverUrl || defaultApiUrl || ''}
                    on:input={(e) => {
                        config.serverUrl = e.currentTarget.value;
                        dispatch('change');
                    }}
                    placeholder="http://localhost:4096"
                />
                <div class="b3-label__text label-description">
                    请确认 OpenCode MCP 服务已启动并运行
                </div>
            </div>

            <div class="provider-config__checkbox-row">
                <label class="b3-label__text provider-config__checkbox-label">
                    <input
                        type="checkbox"
                        class="b3-switch"
                        bind:checked={config.skipTlsVerify}
                        on:change={() => dispatch('change')}
                    />
                    <span>跳过 TLS 证书验证</span>
                </label>
                <div class="b3-label__text label-description">
                    开启后，自动启动的 OpenCode 服务器将跳过上游 AI 提供商的 SSL 证书验证。适用于公司代理、自签名证书或 CA 证书过期导致「certificate verification error」的场景。如果你手动启动 opencode serve，请自行设置环境变量 NODE_TLS_REJECT_UNAUTHORIZED=0。修改后需重启 OpenCode 服务器生效。
                </div>
            </div>
        {:else}
            <div>
                <div class="b3-label__text">
                    {t('platform.apiUrl')}
                </div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    style="width: 100%"
                    value={config.customApiUrl || defaultApiUrl || ''}
                    on:input={(e) => {
                        config.customApiUrl = e.currentTarget.value;
                        dispatch('change');
                    }}
                    placeholder={t('platform.apiUrlPlaceholder')}
                />
                <div class="b3-label__text label-description">
                    {t('platform.apiUrlHint')}
                </div>
            </div>

            <div>
                <div class="b3-label__text">API Key</div>
                <div class="api-key-input-wrapper">
                    <input
                        class="b3-text-field fn__flex-1"
                        type="password"
                        bind:value={config.apiKey}
                        on:change={() => dispatch('change')}
                        placeholder={t('settings.ai.apiKey.description')}
                    />
                </div>
            </div>
        {/if}

        <div>
            <div class="b3-label__text">{t('models.management')}</div>
            <div class="provider-config__model-buttons">
                <button
                    class="b3-button b3-button--outline"
                    on:click={openModelSearchModal}
                    disabled={isLoadingModels || (!isOpenCodeProvider && !config.apiKey)}
                >
                    {isLoadingModels ? t('common.loading') : t('common.searchAndAdd')}
                </button>
                <button class="b3-button b3-button--outline" on:click={openAddModelModal}>
                    {t('models.manualAdd')}
                </button>
            </div>
        </div>

        <div class="advanced-config-section">
            <button
                class="b3-button b3-button--text advanced-toggle"
                on:click={() => (showAdvancedConfig = !showAdvancedConfig)}
            >
                <svg class="b3-button__icon" style="transition: transform 0.2s">
                    <use xlink:href={showAdvancedConfig ? '#iconDown' : '#iconRight'}></use>
                </svg>
                <span>{t('platform.advanced')}</span>
            </button>

            {#if showAdvancedConfig}
                <div class="advanced-config-content">
                    <div class="b3-label__text advanced-hint">
                        {t('platform.advancedConfig.hint')}
                    </div>

                    <div>
                        <div class="b3-label__text">{t('platform.advancedConfig.modelsUrl')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            style="width: 100%"
                            bind:value={config.advancedConfig.customModelsUrl}
                            on:change={() => dispatch('change')}
                            placeholder={t('platform.advancedConfig.modelsUrlPlaceholder')}
                        />
                    </div>

                    <div>
                        <div class="b3-label__text">{t('platform.advancedConfig.chatUrl')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            style="width: 100%"
                            bind:value={config.advancedConfig.customChatUrl}
                            on:change={() => dispatch('change')}
                            placeholder={t('platform.advancedConfig.chatUrlPlaceholder')}
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- 模型搜索弹窗 -->
    {#if showModelSearchModal}
        <div class="modal-overlay" on:click={closeModelSearchModal}>
            <div class="modal-content modal-content--large" on:click|stopPropagation>
                <div class="modal-header">
                    <h4>{t('common.searchAndAdd')}</h4>
                    <button class="modal-close" on:click={closeModelSearchModal}>
                        <svg class="b3-button__icon" style="width: 13px;height: 13px">
                            <use xlink:href="#iconClose"></use>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    {#if availableModels.length > 0}
                        <div>
                            <input
                                class="b3-text-field fn__flex-1"
                                style="width: 100%"
                                type="text"
                                bind:value={searchQuery}
                                placeholder={t('models.searchPlaceholder')}
                            />
                        </div>

                        <div class="model-search-results">
                            {#each filteredModels.slice(0, 200) as model}
                                <div class="model-search-item">
                                    <div class="model-search-item__info">
                                        <span class="model-search-item__name">
                                            {model.name}
                                            {#if model.provider && model.provider !== 'OpenCode'}
                                                <span class="model-search-item__provider">{model.provider}</span>
                                            {/if}
                                        </span>
                                        <span class="model-search-item__id">{model.id}</span>
                                    </div>
                                    <button
                                        class="b3-button"
                                        class:b3-button--text={!config.models.some(
                                            m => m.id === model.id
                                        )}
                                        class:b3-button--cancel={config.models.some(
                                            m => m.id === model.id
                                        )}
                                        on:click={() => toggleModel(model.id, model.name, model.enableThinking, model.reasoningEffort)}
                                    >
                                        {config.models.some(m => m.id === model.id)
                                            ? t('models.remove') || '移除'
                                            : t('models.add')}
                                    </button>
                                </div>
                            {/each}
                            {#if filteredModels.length === 0}
                                <div class="model-search-empty">{t('models.noMatch')}</div>
                            {/if}
                        </div>
                    {:else}
                        <div class="loading-models">
                            <div class="loading-spinner"></div>
                            <span>{t('models.fetching')}</span>
                        </div>
                    {/if}
                </div>
                <div class="modal-footer">
                    <button class="b3-button b3-button--text" on:click={closeModelSearchModal}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if config.models.length > 0}
        <div class="provider-config__models">
            <h5>{t('models.added')}</h5>
            {#each config.models as model}
                <div class="model-item">
                    <div class="model-item__header">
                        <span class="model-item__name">{model.name}</span>
                        <button
                            class="b3-button b3-button--text b3-button--error"
                            on:click={() => removeModel(model.id)}
                            title="删除"
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconTrashcan"></use>
                            </svg>
                        </button>
                    </div>
                    <div class="model-item__config">
                        <div class="model-config-item">
                            <span>{t('models.temperature')}: {model.temperature}</span>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                bind:value={model.temperature}
                                on:change={() =>
                                    updateModel(model.id, 'temperature', model.temperature)}
                            />
                        </div>
                        <div class="model-config-item">
                            <span>{t('models.maxTokens')}</span>
                            <input
                                class="b3-text-field"
                                type="number"
                                min="-1"
                                max="128000"
                                bind:value={model.maxTokens}
                                on:change={() =>
                                    updateModel(model.id, 'maxTokens', model.maxTokens)}
                            />
                        </div>
                        <div class="model-config-item">
                            <button
                                class="custom-body-toggle"
                                on:click={() =>
                                    (showCustomBodyForModel[model.id] =
                                        !showCustomBodyForModel[model.id])}
                            >
                                <svg class="b3-button__icon">
                                    <use
                                        xlink:href={showCustomBodyForModel[model.id]
                                            ? '#iconDown'
                                            : '#iconRight'}
                                    ></use>
                                </svg>
                                <span>{t('models.customBody')}</span>
                            </button>

                            {#if showCustomBodyForModel[model.id]}
                                <div class="custom-body-content">
                                    <div class="custom-body-header">
                                        {#if model.customBody && validateJsonString(model.customBody).valid}
                                            <button
                                                class="format-json-btn"
                                                title="格式化 JSON"
                                                on:click={() =>
                                                    formatCustomBodyJson(
                                                        model.id,
                                                        model.customBody || ''
                                                    )}
                                            >
                                                <svg
                                                    class="b3-button__icon"
                                                    style="width: 12px; height: 12px; color: var(--b3-theme-on-surface);"
                                                >
                                                    <use xlink:href="#iconFormat"></use>
                                                </svg>
                                            </button>
                                        {/if}
                                    </div>
                                    <textarea
                                        class="b3-text-field custom-body-textarea"
                                        class:json-error={customBodyErrors[model.id]}
                                        class:json-valid={model.customBody &&
                                            !customBodyErrors[model.id] &&
                                            validateJsonString(model.customBody).valid}
                                        style="width: 100%; height: 80px; resize: vertical; font-family: monospace; font-size: 12px;"
                                        value={model.customBody || ''}
                                        placeholder={'支持嵌套 JSON，例如：\n{\n  "key": "value",\n  "nested": { "a": 1 }\n}'}
                                        spellcheck={false}
                                        on:input={e =>
                                            handleCustomBodyChange(model.id, e.currentTarget.value)}
                                    />
                                    {#if customBodyErrors[model.id]}
                                        <div class="json-error-hint">
                                            {customBodyErrors[model.id]}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- 手动添加模型弹窗 -->
    {#if showAddModelModal}
        <div class="modal-overlay" on:click={closeAddModelModal}>
            <div class="modal-content" on:click|stopPropagation>
                <div class="modal-header">
                    <h4>{t('models.manual')}</h4>
                    <button class="modal-close" on:click={closeAddModelModal}>
                        <svg class="b3-button__icon" style="width: 13px;height: 13px">
                            <use xlink:href="#iconClose"></use>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div>
                        <div class="b3-label__text">{t('models.id')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            bind:value={manualModelId}
                            placeholder={t('models.idPlaceholder')}
                            on:keydown={e => e.key === 'Enter' && addManualModel()}
                        />
                    </div>
                    <div>
                        <div class="b3-label__text">{t('models.name')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            bind:value={manualModelName}
                            placeholder={t('models.namePlaceholder')}
                            on:keydown={e => e.key === 'Enter' && addManualModel()}
                        />
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="b3-button b3-button--text" on:click={closeAddModelModal}>
                        {t('common.cancel')}
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        on:click={addManualModel}
                        disabled={!manualModelId.trim()}
                    >
                        {t('models.addModel')}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .provider-config {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        height: 100%;
        overflow-y: auto;
    }

    .provider-config__header {
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .provider-header-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        flex: 1;
    }

    .provider-title-row {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .platform-link {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        border-radius: 4px;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-primary);
        }

        svg {
            width: 14px;
            height: 14px;
        }
    }

    .provider-name-editor {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }

    .provider-name-input {
        flex: 1;
        font-size: 16px;
        font-weight: 600;
    }

    .edit-name-button {
        opacity: 0.6;
        transition: opacity 0.2s;

        &:hover {
            opacity: 1;
        }
    }

    .provider-config__section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .api-key-input-wrapper {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .label-description {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-top: 4px;
        line-height: 1.4;
    }

    .provider-config__checkbox-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 8px;
    }

    .provider-config__checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
    }

    .provider-config__model-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;

        button {
            flex: 1;
            min-width: 0;
        }
    }

    .model-search-results {
        max-height: 300px;
        overflow-y: auto;
        margin-top: 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
    }

    .model-search-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--b3-border-color);

        &:last-child {
            border-bottom: none;
        }

        &:hover {
            background: var(--b3-theme-background);
        }
    }

    .model-search-item__name {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .model-search-item__provider {
        display: inline-block;
        padding: 1px 4px;
        background: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.4;
        white-space: nowrap;
    }

    .provider-config__models {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--b3-border-color);

        h5 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .model-item {
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
    }

    .model-item__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }

    .model-item__name {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .model-item__config {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .model-config-item {
        display: flex;
        flex-direction: column;
        gap: 4px;

        span {
            font-size: 12px;
            color: var(--b3-theme-on-surface);
        }

        input[type='range'] {
            width: 100%;
        }

        input[type='number'] {
            width: 100%;
        }
    }

    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--b3-dialog-shadow);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal-content {
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        min-width: 400px;
        max-width: 600px;
        animation: modalShow 0.2s ease-out;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .modal-close {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light);
        border-radius: 4px;

        &:hover {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-background);
        }
    }

    .modal-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--b3-border-color);
    }

    @keyframes modalShow {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    .modal-content--large {
        min-width: 600px;
        max-width: 800px;
        max-height: 70vh;
    }

    .model-search-item__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
    }

    .model-search-item__id {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .model-search-empty {
        padding: 40px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    .loading-models {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 40px;
        color: var(--b3-theme-on-surface);
    }

    .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--b3-theme-border);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .advanced-config-section {
        margin-top: 8px;
        border-top: 1px solid var(--b3-border-color);
        padding-top: 8px;
    }

    .advanced-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        width: 100%;
        justify-content: flex-start;
        color: var(--b3-theme-on-surface);
        font-size: 13px;

        &:hover {
            color: var(--b3-theme-on-background);
        }

        .b3-button__icon {
            width: 14px;
            height: 14px;
        }
    }

    .advanced-config-content {
        margin-top: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .advanced-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
        margin-bottom: 4px;
        padding: 8px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        border-left: 3px solid var(--b3-theme-primary);
    }

    .custom-body-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--b3-theme-on-surface);
        font-size: 13px;

        &:hover {
            color: var(--b3-theme-on-background);
        }

        .b3-button__icon {
            width: 14px;
            height: 14px;
        }
    }

    .custom-body-content {
        margin-top: 8px;
    }

    .custom-body-header {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 4px;
    }

    .format-json-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        cursor: pointer;

        &:hover {
            background: var(--b3-theme-surface-light);
        }
    }

    .custom-body-textarea {
        width: 100%;
        min-height: 80px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace;
        font-size: 12px;
        resize: vertical;
    }

    .custom-body-textarea.json-error {
        border-color: var(--b3-theme-error) !important;
        background: var(--b3-card-error-background);
    }

    .custom-body-textarea.json-valid {
        border-color: var(--b3-theme-success) !important;
    }

    .json-error-hint {
        margin-top: 4px;
        font-size: 11px;
        color: var(--b3-theme-error);
        line-height: 1.3;
    }
</style>
