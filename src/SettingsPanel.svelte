<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { t } from './utils/i18n';
    import { getDefaultSettings } from './defaultSettings';
    import { normalizeSettings } from './settingsSchema';
    import { pushMsg, pushErrMsg, lsNotebooks, getBlockByID } from './api';
    import { fetchModels, invalidateModelCache } from './ai-chat';
    import { getModelCapabilities } from './utils/modelCapabilities';
    import type { ModelConfig } from './defaultSettings';
    import { confirm } from 'siyuan';
    import { PLUGIN_ID } from './pluginPaths';
    import { updateSettings } from './stores/settings';
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

    let isRefreshingModels = false;
    let modelSearchQuery = '';

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    function debouncedSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveSettings(), 300);
    }

    $: opencodeConfig = settings.aiProviders?.opencode || { serverUrl: 'http://localhost:4096', models: [] };
    $: opencodeModels = opencodeConfig.models || [];
    $: visibleCount = opencodeModels.filter((m: any) => !m.hidden).length;
    $: totalCount = opencodeModels.length;
    $: filteredModels = (() => {
        const q = modelSearchQuery.trim().toLowerCase();
        if (!q) {
            return opencodeModels;
        }
        const terms = q.split(/\s+/);
        const matched = opencodeModels.filter((m: ModelConfig) => {
            const text = `${m.name} ${m.id}`.toLowerCase();
            return terms.every(term => text.includes(term));
        });
        return matched;
    })();

    $: modelOverflow = opencodeModels.length > 200;

    function toggleModelHidden(modelId: string) {
        opencodeConfig.models = opencodeConfig.models.map((m: ModelConfig) =>
            m.id === modelId ? { ...m, hidden: !m.hidden } : m
        );
        settings.aiProviders = { ...settings.aiProviders, opencode: { ...opencodeConfig } };
        debouncedSave();
    }

    function showAllModels() {
        opencodeConfig.models = opencodeConfig.models.map((m: ModelConfig) => ({ ...m, hidden: false }));
        settings.aiProviders = { ...settings.aiProviders, opencode: { ...opencodeConfig } };
        debouncedSave();
    }

    function hideAllModels() {
        opencodeConfig.models = opencodeConfig.models.map((m: ModelConfig) => ({ ...m, hidden: true }));
        settings.aiProviders = { ...settings.aiProviders, opencode: { ...opencodeConfig } };
        debouncedSave();
    }

    async function refreshModels() {
        if (isRefreshingModels) return;
        isRefreshingModels = true;
        try {
            const serverUrl = opencodeConfig.serverUrl || 'http://localhost:4096';
            invalidateModelCache(serverUrl);
            const models = await fetchModels('opencode', '', serverUrl);
            if (models && models.length > 0) {
                const existingModels: Record<string, ModelConfig> = {};
                const existingCount = (opencodeConfig.models || []).length;
                for (const m of opencodeConfig.models || []) {
                    existingModels[m.id] = m;
                }
                const mergedModels: ModelConfig[] = models.map(m => {
                    const existing = existingModels[m.id];
                    const capabilities = getModelCapabilities(m.id);
                    if (existing && existingCount <= 100) {
                        return {
                            ...existing,
                            name: m.name,
                            capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
                        };
                    }
                    return {
                        id: m.id,
                        name: m.name,
                        temperature: 0.7,
                        maxTokens: 4096,
                        capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
                        hidden: false,
                    };
                });
                opencodeConfig.models = mergedModels;
                settings.aiProviders = { ...settings.aiProviders };
                await saveSettings();
                pushMsg(`已刷新模型列表，共 ${mergedModels.length} 个模型`);
            }
        } catch (error) {
            pushErrMsg(`刷新模型失败: ${(error as Error).message}`);
        } finally {
            isRefreshingModels = false;
        }
    }

    function getModelCapabilitiesEmoji(model: ModelConfig): string {
        if (!model.capabilities) return '';
        const emojis: string[] = [];
        if (model.capabilities.thinking) emojis.push('💡');
        if (model.capabilities.vision) emojis.push('👀');
        if (model.capabilities.imageGeneration) emojis.push('🖼️');
        if (model.capabilities.toolCalling) emojis.push('🛠️');
        if (model.capabilities.webSearch) emojis.push('🌐');
        return emojis.length > 0 ? ' ' + emojis.join(' ') : '';
    }

    function handleProviderChange() {
        saveSettings();
    }

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
                    key: 'executionMessageMode',
                    value: settings.executionMessageMode,
                    type: 'select',
                    title: t('settings.executionMessageMode.title') || '执行中发送',
                    description:
                        t('settings.executionMessageMode.description') ||
                        '选择 AI 正在执行时继续发送消息的处理方式',
                    options: {
                        guide: t('settings.executionMessageMode.options.guide') || '引导',
                        queue: t('settings.executionMessageMode.options.queue') || '排队',
                    },
                },
                {
                    key: 'maxConcurrentTasks',
                    value: settings.maxConcurrentTasks,
                    type: 'select',
                    title: t('settings.maxConcurrentTasks.title') || '最大并行任务数',
                    description:
                        t('settings.maxConcurrentTasks.description') ||
                        '限制后台同时运行的 OpenCode 任务数量',
                    options: {
                        1: '1',
                        2: '2',
                        3: '3',
                        4: '4',
                    },
                },
                {
                    key: 'diagnosticLogMode',
                    value: settings.diagnosticLogMode,
                    type: 'select',
                    title: t('settings.diagnosticLogMode.title') || 'OpenCode 诊断日志',
                    description:
                        t('settings.diagnosticLogMode.description') ||
                        '记录下一次 OpenCode 请求的时间线、工具事件和可见思考片段',
                    options: {
                        off: t('settings.diagnosticLogMode.options.off') || '关闭',
                        next: t('settings.diagnosticLogMode.options.next') || '仅下一次',
                        always: t('settings.diagnosticLogMode.options.always') || '一直开启',
                    },
                },
                {
                    key: 'diagnosticLogLevel',
                    value: settings.diagnosticLogLevel,
                    type: 'select',
                    title: t('settings.diagnosticLogLevel.title') || '诊断日志详细程度',
                    description:
                        t('settings.diagnosticLogLevel.description') ||
                        '安全摘要默认脱敏和截断；完整诊断会记录更多提示词与输出片段',
                    options: {
                        safe: t('settings.diagnosticLogLevel.options.safe') || '安全摘要',
                        full: t('settings.diagnosticLogLevel.options.full') || '完整诊断',
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
                                    // 用户取消重置，无需提示。
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
        if (detail.key in settings) {
            settings[detail.key] = detail.value;
            if (detail.key === 'autoRenameSession' && detail.value) {
                settings.autoRenameProvider = 'opencode';
            }
            saveSettings();
        }
    };

    async function saveSettings() {
        await plugin.saveSettings(settings);
        updateSettings(JSON.parse(JSON.stringify(settings)));
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
            <div class="model-management-panel">
                <div class="model-management-panel__section">
                    <div class="config__item">
                        <div class="config__item-label">
                            <div class="config__item-title">OpenCode Server</div>
                            <div class="config__item-description">
                                {t('platform.apiUrl') || 'API 地址'} (OpenCode Server)
                            </div>
                        </div>
                        <div class="config__item-control">
                            <input
                                class="b3-text-field fn__flex-1"
                                type="text"
                                style="width: 100%"
                                value={opencodeConfig.serverUrl || 'http://localhost:4096'}
                                on:input={(e) => {
                                    opencodeConfig.serverUrl = e.currentTarget.value;
                                    settings.aiProviders = { ...settings.aiProviders };
                                    debouncedSave();
                                }}
                                placeholder="http://localhost:4096"
                            />
                        </div>
                    </div>
                </div>

                <div class="model-management-panel__toolbar">
                    <div class="model-management-panel__toolbar-left">
                        <button
                            class="b3-button b3-button--outline"
                            on:click={refreshModels}
                            disabled={isRefreshingModels}
                        >
                            {isRefreshingModels ? t('common.loading') || '加载中...' : (t('common.searchAndAdd') || '刷新模型')}
                        </button>
                        <button class="b3-button b3-button--outline" on:click={showAllModels}>
                            {t('models.showAll') || '全选'}
                        </button>
                        <button class="b3-button b3-button--outline" on:click={hideAllModels}>
                            {t('models.hideAll') || '全取消'}
                        </button>
                    </div>
                    <div class="model-management-panel__count">
                        {visibleCount} / {totalCount}
                    </div>
                </div>

                <div class="model-management-panel__search">
                    <input
                        type="text"
                        class="b3-text-field"
                        placeholder={t('multiModel.searchModels') || '搜索模型'}
                        bind:value={modelSearchQuery}
                        spellcheck="false"
                    />
                    {#if modelOverflow && !modelSearchQuery.trim()}
                        <div class="model-management-panel__overflow-hint">
                            模型过多（{opencodeModels.length} 个），建议使用搜索筛选。
                        </div>
                    {/if}
                </div>

                <div class="model-management-panel__list">
                    {#if filteredModels.length === 0}
                        <div class="model-management-panel__empty">
                            {isRefreshingModels
                                ? (t('models.fetching') || '正在获取模型...')
                                : (t('multiModel.noResults') || '无匹配结果')}
                        </div>
                    {:else}
                        {#each filteredModels as model (model.id)}
                            <div
                                class="model-mgmt-item"
                                class:model-mgmt-item--hidden={model.hidden}
                            >
                                <label class="model-mgmt-item__switch">
                                    <input
                                        type="checkbox"
                                        class="b3-switch"
                                        checked={!model.hidden}
                                        on:change={() => toggleModelHidden(model.id)}
                                    />
                                </label>
                                <div class="model-mgmt-item__info">
                                    <div class="model-mgmt-item__name">
                                        {model.name}{getModelCapabilitiesEmoji(model)}
                                    </div>
                                    <div class="model-mgmt-item__id">{model.id}</div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
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
	                                    bind:value={settings.autoRenameModelId}
	                                    on:change={() => {
                                            settings.autoRenameProvider = 'opencode';
                                            saveSettings();
                                        }}
	                                >
                                    <option value="">
                                        {t('settings.autoRenameSession.selectModel') ||
                                            '-- 选择模型 --'}
                                    </option>
                                    {#each (settings.aiProviders?.opencode?.models || []).filter(m => !m.hidden) as model}
                                        <option value={model.id}>
                                            {model.name || model.id}
                                        </option>
                                    {/each}
                                </select>
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

    .model-management-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: 16px;
    }

    .model-management-panel__section {
        background: var(--b3-theme-surface);
        border-radius: 6px;
        padding: 12px 16px;
    }

    .model-management-panel__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-shrink: 0;
    }

    .model-management-panel__toolbar-left {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .model-management-panel__count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        white-space: nowrap;
    }

    .model-management-panel__search {
        flex-shrink: 0;
    }

    .model-management-panel__search input {
        width: 100%;
        padding: 6px 8px;
        font-size: 13px;
    }

    .model-management-panel__overflow-hint {
        margin-top: 6px;
        padding: 6px 10px;
        background: var(--b3-card-warning-background);
        color: var(--b3-card-warning-color);
        font-size: 11px;
        border-radius: 4px;
        line-height: 1.4;
    }

    .model-management-panel__list {
        flex: 1;
        overflow-y: auto;
        content-visibility: auto;
        contain-intrinsic-size: auto 48px;
        min-height: 0;
    }

    .model-management-panel__empty {
        padding: 24px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .model-mgmt-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 4px;
        transition: background 0.15s;
        contain: layout style;

        &:hover {
            background: var(--b3-theme-surface);
        }

        &--hidden {
            opacity: 0.45;
        }
    }

    .model-mgmt-item__switch {
        flex-shrink: 0;
        display: flex;
        align-items: center;
    }

    .model-mgmt-item__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .model-mgmt-item__name {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .model-mgmt-item__id {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        .model-management-panel {
            padding: 8px;
        }

        .model-management-panel__toolbar {
            flex-direction: column;
            align-items: stretch;
        }

        .model-management-panel__toolbar-left {
            justify-content: center;
        }

        .model-management-panel__count {
            text-align: center;
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
