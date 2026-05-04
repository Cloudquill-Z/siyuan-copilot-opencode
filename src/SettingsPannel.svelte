<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { t } from './utils/i18n';
    import { getDefaultSettings } from './defaultSettings';
    import { normalizeSettings } from './settingsSchema';
    import { pushMsg, pushErrMsg, lsNotebooks, getBlockByID } from './api';
    import { confirm } from 'siyuan';
    import ProviderConfigPanel from './components/ProviderConfigPanel.svelte';
    import { PLUGIN_ID } from './pluginPaths';
    export let plugin;

    let settings = { ...getDefaultSettings() };

    let notebookOptions: Record<string, string> = {};

    let soulDocValidation: { status: 'idle' | 'checking' | 'valid' | 'invalid'; message: string } =
        {
            status: 'idle',
            message: '',
        };

    interface ISettingGroup {
        name: string;
        items: ISettingItem[];
    }

    const builtInProviderNames: Record<string, string> = {
        opencode: t('platform.builtIn.opencode'),
    };

    const builtInProviderDefaultUrls: Record<string, string> = {
        opencode: 'http://localhost:4096',
    };

    const builtInProviderWebsites: Record<string, string> = {
        opencode: 'https://opencode.ai',
    };

    let selectedProviderId = '';

    function handleProviderChange() {
        saveSettings();
    }

    function handleProviderSelect() {
        settings = { ...settings, selectedProviderId };
        saveSettings();
    }

    $: allProviderOptions = [{
        id: 'opencode',
        name: builtInProviderNames['opencode'],
        type: 'built-in' as const,
    }];

    $: selectedProviderName = selectedProviderId
        ? builtInProviderNames[selectedProviderId] || t('platform.unknown')
        : t('platform.select');

    let groups: ISettingGroup[] = [
        {
            name: t('settings.settingsGroup.systemPrompt'),
            items: [
                {
                    key: 'aiSystemPrompt',
                    value: settings.aiSystemPrompt,
                    type: 'textarea',
                    title: t('settings.ai.systemPrompt.title'),
                    description: t('settings.ai.systemPrompt.description'),
                    direction: 'row',
                    rows: 4,
                    placeholder: t('settings.ai.systemPrompt.placeholder'),
                },
            ],
        },
        {
            name: t('settings.settingsGroup.platformManagement'),
            items: [],
        },
        {
            name: t('settings.settingsGroup.displayAndOperation'),
            items: [
                {
                    key: 'sendMessageShortcut',
                    value: settings.sendMessageShortcut,
                    type: 'select',
                    title: t('settings.sendMessageShortcut.title'),
                    description: t('settings.sendMessageShortcut.description'),
                    options: {
                        'ctrl+enter': t('settings.sendMessageShortcut.options.ctrlEnter'),
                        enter: t('settings.sendMessageShortcut.options.enter'),
                    },
                },
                {
                    key: 'messageFontSize',
                    value: settings.messageFontSize,
                    type: 'number',
                    title: t('settings.messageFontSize.title'),
                    description: t('settings.messageFontSize.description'),
                    number: {
                        min: 5,
                        max: 32,
                        step: 1,
                    },
                },
                {
                    key: 'multiModelViewMode',
                    value: settings.multiModelViewMode,
                    type: 'select',
                    title: t('settings.multiModelViewMode.title'),
                    description: t('settings.multiModelViewMode.description'),
                    options: {
                        tab: t('settings.multiModelViewMode.options.tab'),
                        card: t('settings.multiModelViewMode.options.card'),
                    },
                },
            ],
        },
        {
            name: t('settings.settingsGroup.noteExport'),
            items: [
                {
                    key: 'exportNotebook',
                    value: settings.exportNotebook,
                    type: 'select',
                    title: t('settings.exportNotebook.title'),
                    description: t('settings.exportNotebook.description'),
                    options: notebookOptions,
                },
                {
                    key: 'exportDefaultPath',
                    value: settings.exportDefaultPath,
                    type: 'textinput',
                    title: t('settings.exportDefaultPath.title'),
                    description: t('settings.exportDefaultPath.description'),
                    placeholder: t('settings.exportDefaultPath.placeholder'),
                },
            ],
        },
        {
            name: t('settings.settingsGroup.sessionManagement') || '会话管理',
            items: [
                {
                    key: 'autoRenameSession',
                    value: settings.autoRenameSession,
                    type: 'checkbox',
                    title: t('settings.autoRenameSession.title') || '会话自动重命名',
                    description:
                        t('settings.autoRenameSession.description') ||
                        '在首次发送消息时，自动使用AI生成会话标题',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.soul') || 'SOUL 文档',
            items: [
                {
                    key: 'soulDocId',
                    value: settings.soulDocId,
                    type: 'textinput',
                    title: t('settings.soulDocId.title') || 'SOUL 文档 ID',
                    description:
                        t('settings.soulDocId.description') ||
                        '设置 SOUL 数据存储的文档 ID。SOUL 工具只能在此文档内进行增删改查操作。',
                    placeholder:
                        t('settings.soulDocId.placeholder') ||
                        '输入文档块 ID，如 20260312120000-xxxxxxxx',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.webApp') || '网页小程序',
            items: [
                {
                    key: 'openLinksInWebView',
                    value: settings.openLinksInWebView,
                    type: 'checkbox',
                    title: t('settings.openLinksInWebView.title') || '在 WebView 中打开链接',
                    description:
                        t('settings.openLinksInWebView.description') ||
                        '点击思源笔记中的 https 链接时，在内置 WebView 标签页中打开，而不是外部浏览器',
                },
                {
                    key: 'searchEngine',
                    value: settings.searchEngine,
                    type: 'select',
                    title: '搜索引擎',
                    description: '选择地址栏使用的默认搜索引擎',
                    options: {
                        google: 'Google',
                        bing: 'Bing',
                    },
                },
            ],
        },
        {
            name: t('settings.settingsGroup.reset') || 'Reset Settings',
            items: [
                {
                    key: 'reset',
                    value: '',
                    type: 'button',
                    title: t('settings.reset.title') || 'Reset Settings',
                    description:
                        t('settings.reset.description') || 'Reset all settings to default values',
                    button: {
                        label: t('settings.reset.label') || 'Reset',
                        callback: async () => {
                            confirm(
                                t('settings.reset.title') || 'Reset Settings',
                                t('settings.reset.confirmMessage') ||
                                    'Are you sure you want to reset all settings to default values? This action cannot be undone.',
                                async () => {
                                    settings = { ...getDefaultSettings() };
                                    updateGroupItems();
                                    await saveSettings();
                                    await pushMsg(t('settings.reset.message'));
                                },
                                () => {
                                    console.log('Reset cancelled');
                                }
                            );
                        },
                    },
                },
            ],
        },
    ];

    let focusGroup = groups[0].name;

    interface ChangeEvent {
        group: string;
        key: string;
        value: any;
    }

    const onChanged = ({ detail }: CustomEvent<ChangeEvent>) => {
        console.log(detail.key, detail.value);
        if (detail.key in settings) {
            settings[detail.key] = detail.value;
            saveSettings();
        }
    };

    async function saveSettings() {
        await plugin.saveSettings(settings);
    }

    onMount(async () => {
        await runload();
    });

    async function runload() {
        const loadedSettings = await plugin.loadSettings();
        settings = normalizeSettings(loadedSettings);

        if (!settings.aiProviders) {
            settings.aiProviders = {
                opencode: { serverUrl: 'http://localhost:4096', models: [] },
            };
        }

        if (!settings.aiProviders.opencode) {
            settings.aiProviders.opencode = { serverUrl: 'http://localhost:4096', models: [] };
        }

        selectedProviderId = settings.selectedProviderId || settings.currentProvider || 'opencode';

        if (!settings.selectedProviderId) {
            settings.selectedProviderId = selectedProviderId;
        }

        await loadNotebooks();

        if (settings.soulDocId) {
            await validateSoulDocId();
        }

        updateGroupItems();
    }

    async function loadNotebooks() {
        try {
            const notebooks = await lsNotebooks();
            if (notebooks?.notebooks && notebooks.notebooks.length > 0) {
                notebookOptions = {};
                notebookOptions[''] =
                    t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --';
                notebooks.notebooks
                    .filter(notebook => notebook.closed === false)
                    .forEach(notebook => {
                        notebookOptions[notebook.id] = notebook.name;
                    });
            } else {
                notebookOptions = {
                    '': t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --',
                };
            }
        } catch (error) {
            console.error('Load notebooks error:', error);
            notebookOptions = {
                '': t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --',
            };
        }
    }

    async function validateSoulDocId() {
        const docId = settings.soulDocId?.trim();
        if (!docId) {
            soulDocValidation = { status: 'idle', message: '' };
            return;
        }

        soulDocValidation = {
            status: 'checking',
            message: t('settings.soulDocId.validating') || '验证中...',
        };

        try {
            const block = await getBlockByID(docId);
            if (!block) {
                soulDocValidation = {
                    status: 'invalid',
                    message: t('settings.soulDocId.notFound') || '块不存在，请检查 ID 是否正确',
                };
                return;
            }

            if (block.type !== 'd') {
                soulDocValidation = {
                    status: 'invalid',
                    message:
                        t('settings.soulDocId.notDoc') ||
                        `该 ID 不是文档类型，当前类型: ${block.type}`,
                };
                return;
            }

            soulDocValidation = {
                status: 'valid',
                message:
                    t('settings.soulDocId.valid') || `✓ 有效文档: ${block.content || '未命名'}`,
            };
        } catch (error) {
            soulDocValidation = {
                status: 'invalid',
                message: t('settings.soulDocId.error') || '验证失败: ' + (error as Error).message,
            };
        }
    }

    function updateGroupItems() {
        groups = groups.map(group => ({
            ...group,
            items: group.items.map(item => {
                const updatedItem: any = {
                    ...item,
                    value: settings[item.key] ?? item.value,
                };
                if (item.key === 'exportNotebook') {
                    updatedItem.options = notebookOptions;
                }
                return updatedItem;
            }),
        }));
    }

    $: currentGroup = groups.find(group => group.name === focusGroup);
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                data-name="editor"
                class:b3-list-item--focus={group.name === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group.name;
                }}
                on:keydown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        focusGroup = group.name;
                    }
                }}
                role="tab"
                tabindex="0"
            >
                <span class="b3-list-item__text">{group.name}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        {#if focusGroup === t('settings.settingsGroup.systemPrompt')}
            <SettingPanel
                group={currentGroup?.name || ''}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
            />
        {:else if focusGroup === t('settings.settingsGroup.platformManagement')}
            <div class="platform-management-layout">
                <aside class="platform-sidebar">
                    <div class="unified-platform-manager">
                        <div class="manager-header">
                            <h5>{t('platform.management')}</h5>
                        </div>

                        <div class="platform-list">
                            {#each allProviderOptions as platform (platform.id)}
                                <div
                                    class="platform-item"
                                    class:platform-item--selected={selectedProviderId ===
                                        platform.id}
                                    on:click={() => {
                                        selectedProviderId = platform.id;
                                        handleProviderSelect();
                                    }}
                                    on:keydown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            selectedProviderId = platform.id;
                                            handleProviderSelect();
                                        }
                                    }}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="platform-item__info">
                                        <span class="platform-item__name">{platform.name}</span>
                                        <span class="platform-item__type">
                                            {platform.type === 'built-in'
                                                ? t('platform.type.builtin')
                                                : t('platform.type.custom')}
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </aside>

                <main class="platform-main">
                    {#if selectedProviderId}
                        {#key selectedProviderId}
                            <ProviderConfigPanel
                                providerId={selectedProviderId}
                                providerName={selectedProviderName}
                                defaultApiUrl={builtInProviderDefaultUrls[selectedProviderId]}
                                websiteUrl={builtInProviderWebsites[selectedProviderId]}
                                bind:config={settings.aiProviders[selectedProviderId]}
                                isCustomProvider={false}
                                on:change={handleProviderChange}
                            />
                        {/key}
                    {:else}
                        <div class="no-selection">
                            {t('platform.selectHint') || '请选择一个平台以查看或编辑其配置'}
                        </div>
                    {/if}
                </main>
            </div>
        {:else if focusGroup === (t('settings.settingsGroup.sessionManagement') || '会话管理')}
            <div class="session-management-panel">
                <SettingPanel
                    group={currentGroup?.name || ''}
                    settingItems={currentGroup?.items || []}
                    display={true}
                    on:changed={onChanged}
                />

                {#if settings.autoRenameSession}
                    <div class="auto-rename-model-selector">
                        <div class="config__item">
                            <div class="config__item-label">
                                <div class="config__item-title">
                                    {t('settings.autoRenameSession.modelTitle') || '重命名模型'}
                                </div>
                                <div class="config__item-description">
                                    {t('settings.autoRenameSession.modelDescription') ||
                                        '选择用于生成会话标题的AI模型'}
                                </div>
                            </div>
                            <div
                                class="config__item-control"
                                style="display: flex; gap: 8px; align-items: center;"
                            >
                                <select
                                    class="b3-select"
                                    bind:value={settings.autoRenameProvider}
                                    on:change={() => {
                                        settings.autoRenameModelId = '';
                                        saveSettings();
                                    }}
                                >
                                    <option value="">
                                        {t('settings.autoRenameSession.selectProvider') ||
                                            '-- 选择平台 --'}
                                    </option>
                                    {#each allProviderOptions as provider}
                                        {#if settings.aiProviders[provider.id]?.models?.length > 0}
                                            <option value={provider.id}>{provider.name}</option>
                                        {/if}
                                    {/each}
                                </select>

                                {#if settings.autoRenameProvider}
                                    <select
                                        class="b3-select"
                                        bind:value={settings.autoRenameModelId}
                                        on:change={saveSettings}
                                    >
                                        <option value="">
                                            {t('settings.autoRenameSession.selectModel') ||
                                                '-- 选择模型 --'}
                                        </option>
                                        {#each settings.aiProviders[settings.autoRenameProvider]?.models || [] as model}
                                            <option value={model.id}>
                                                {model.name || model.id}
                                            </option>
                                        {/each}
                                    </select>
                                {/if}
                            </div>
                        </div>

                        <div class="config__item" style="margin-top: 16px;">
                            <div class="config__item-label">
                                <div class="config__item-title">
                                    {t('settings.autoRenameSession.promptTitle') || '自定义提示词'}
                                </div>
                                <div class="config__item-description">
                                    {t('settings.autoRenameSession.promptDescription') ||
                                        '自定义生成会话标题的提示词，使用 {message} 作为用户消息的占位符'}
                                </div>
                            </div>
                            <div class="config__item-control">
                                <textarea
                                    class="b3-text-field"
                                    rows="4"
                                    bind:value={settings.autoRenamePrompt}
                                    on:change={saveSettings}
                                    placeholder={t(
                                        'settings.autoRenameSession.promptPlaceholder'
                                    ) ||
                                        '请根据以下用户消息生成一个简洁的会话标题（不超过20个字，不要使用引号）：\n\n{message}'}
                                ></textarea>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if focusGroup === (t('settings.settingsGroup.soul') || 'SOUL 文档')}
            <div class="soul-settings-panel">
                <div class="config__item">
                    <div class="config__item-label">
                        <div class="config__item-title">
                            {t('settings.soulDocId.title') || 'SOUL 文档 ID'}
                        </div>
                        <div class="config__item-description">
                            {t('settings.soulDocId.description') || '设置 SOUL 数据存储的文档 ID'}
                        </div>
                    </div>
                    <div class="config__item-control">
                        <input
                            class="b3-text-field"
                            type="text"
                            bind:value={settings.soulDocId}
                            on:change={async () => {
                                await saveSettings();
                                await validateSoulDocId();
                            }}
                            placeholder={t('settings.soulDocId.placeholder') ||
                                '输入文档块 ID，如 20260312120000-xxxxxxxx'}
                        />
                        <button
                            class="b3-button b3-button--outline"
                            on:click={validateSoulDocId}
                            disabled={soulDocValidation.status === 'checking'}
                        >
                            {soulDocValidation.status === 'checking'
                                ? t('settings.soulDocId.validating') || '验证中...'
                                : t('settings.soulDocId.validate') || '验证'}
                        </button>
                    </div>
                    {#if soulDocValidation.message}
                        <div
                            class="soul-validation-message"
                            class:soul-validation-valid={soulDocValidation.status === 'valid'}
                            class:soul-validation-invalid={soulDocValidation.status === 'invalid'}
                        >
                            {soulDocValidation.message}
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <SettingPanel
                group={currentGroup?.name || ''}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
            />
        {/if}
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
        display: flex;
        flex-direction: row;
        overflow: hidden;
        container-type: inline-size;
        container-name: settings-panel;
    }
    .config__panel > .b3-tab-bar {
        width: min(30%, 170px);
        flex-shrink: 0;
    }

    .config__tab-wrap {
        flex: 1;
        height: 100%;
        overflow: hidden;
        padding: 2px;
        display: flex;
        flex-direction: column;
    }

    .platform-management-layout {
        display: flex;
        gap: 16px;
        flex: 1;
        min-height: 0;
        align-items: stretch;
    }

    .platform-sidebar {
        width: 260px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .platform-main {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .no-selection {
        padding: 24px;
        background: var(--b3-theme-background);
        border: 1px dashed var(--b3-border-color);
        border-radius: 6px;
        color: var(--b3-theme-on-surface-light);
    }

    .unified-platform-manager {
        background: var(--b3-theme-surface);
        border-radius: 6px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    .manager-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;

        h5 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .platform-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .platform-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
            border-color: var(--b3-theme-primary);
        }

        &.platform-item--selected {
            background: var(--b3-theme-primary-lightest);
            border-color: var(--b3-theme-primary);
        }
    }

    .platform-item__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    .platform-item__name {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .platform-item__type {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        padding: 2px 6px;
        background: var(--b3-theme-surface);
        border-radius: 10px;
        align-self: flex-start;
    }

    .session-management-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        overflow-y: auto;
    }

    .soul-settings-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }

    .soul-validation-message {
        margin-top: 8px;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
    }

    .soul-validation-valid {
        background: var(--b3-card-success-background);
        color: var(--b3-card-success-color);
    }

    .soul-validation-invalid {
        background: var(--b3-card-error-background);
        color: var(--b3-card-error-color);
    }

    .auto-rename-model-selector {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        margin-top: 8px;
    }

    .config__item {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .config__item-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .config__item-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .config__item-description {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
    }

    .config__item-control {
        display: flex;
        gap: 8px;
        align-items: center;

        .b3-select {
            flex: 1;
            min-width: 0;
        }

        textarea.b3-text-field {
            width: 100%;
            min-height: 80px;
            padding: 8px 12px;
            font-size: 13px;
            line-height: 1.6;
            font-family: var(--b3-font-family);
            resize: vertical;

            &::placeholder {
                color: var(--b3-theme-on-surface-light);
                opacity: 0.6;
            }
        }
    }

    @container settings-panel (max-width: 599px) {
        .platform-management-layout {
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
        }

        .platform-sidebar {
            width: 100%;
            max-height: 42%;
        }

        .platform-main {
            min-height: 260px;
        }
    }

    @container settings-panel (max-width: 768px) {
        .config__panel > .b3-tab-bar {
            width: min(40%, 170px);
            min-width: 112px;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .config__panel > .b3-tab-bar .b3-list-item__text {
            display: inline-block !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }
    }
</style>
