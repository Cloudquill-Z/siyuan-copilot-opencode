<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import pluginManifest from '../plugin.json';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { t } from './utils/i18n';
    import { getDefaultSettings } from './defaultSettings';
    import { normalizeSettings } from './settingsSchema';
    import { pushMsg, pushErrMsg, lsNotebooks, getBlockByID } from './api';
    import { fetchModels, invalidateModelCache } from './ai-chat';
    import {
        findOpenCodeModelConfigMatch,
        uniqueOpenCodeModelRefs,
    } from './providers/opencode-models';
    import { getModelCapabilities } from './utils/modelCapabilities';
    import type { ModelConfig } from './defaultSettings';
    import { confirm } from 'siyuan';
    import { PLUGIN_ID } from './pluginPaths';
    import {
        connectionStatusStore,
        startHealthPoll,
        type ConnectionStatus,
    } from './stores/connectionStatus';
    import { updateSettings } from './stores/settings';
    import {
        filterTokenUsageByRange,
        formatTokenCount,
        groupTokenUsageByModel,
        normalizeTokenUsageRecords,
        summarizeTokenUsage,
    } from './utils/tokenUsage';
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
    let isRestartingOpenCode = false;
    let saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
    let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
    let modelSearchQuery = '';
    let tokenStatsRange: 'today' | '7d' | '30d' | 'all' = '7d';
    let connectionStatus: ConnectionStatus = {
        state: 'disconnected',
        version: '',
        serverUrl: '',
        lastChecked: 0,
        error: '',
    };
    const unsubscribeConnectionStatus = connectionStatusStore.subscribe(status => {
        connectionStatus = status;
    });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    function debouncedSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveSettings(), 300);
    }

    $: opencodeConfig = settings.aiProviders?.opencode || { serverUrl: 'http://localhost:4096', models: [] };
    $: opencodeModels = uniqueOpenCodeModelRefs(opencodeConfig.models || []);
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
    $: tokenUsageRecords = normalizeTokenUsageRecords(settings.pluginData?.tokenUsageRecords);
    $: filteredTokenUsageRecords = filterTokenUsageByRange(
        tokenUsageRecords,
        tokenStatsRange
    );
    $: tokenUsageSummary = summarizeTokenUsage(filteredTokenUsageRecords);
    $: tokenUsageByModel = groupTokenUsageByModel(filteredTokenUsageRecords);
    $: tokenUsagePeak = Math.max(1, ...tokenUsageByModel.map(item => item.totalTokens));

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
                const existingCount = (opencodeConfig.models || []).length;
                const mergedModels: ModelConfig[] = models.map(m => {
                    const existing = findOpenCodeModelConfigMatch(opencodeConfig.models || [], m.id, m.providerID);
                    const capabilities = getModelCapabilities(m.id);
                    if (existing && existingCount <= 100) {
                        return {
                            ...existing,
                            name: m.name,
                            providerID: m.providerID || (existing as any).providerID,
                            contextLimit: m.contextLimit || existing.contextLimit,
                            outputLimit: m.outputLimit || existing.outputLimit,
                            maxTokens: m.outputLimit || existing.maxTokens,
                            capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
                        };
                    }
                    return {
                        id: m.id,
                        name: m.name,
                        temperature: 0.7,
                        maxTokens: m.outputLimit || 4096,
                        contextLimit: m.contextLimit,
                        outputLimit: m.outputLimit,
                        providerID: m.providerID,
                        capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
                        hidden: false,
                    };
                });
                opencodeConfig.models = uniqueOpenCodeModelRefs(mergedModels);
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

    function getOpenCodeStatusText(): string {
        if (connectionStatus.state === 'connected') {
            return connectionStatus.version
                ? `已连接 · v${connectionStatus.version}`
                : '已连接';
        }
        if (connectionStatus.state === 'connecting') {
            return '连接中...';
        }
        return connectionStatus.error ? `未连接 · ${connectionStatus.error}` : '未连接';
    }

    function reconnectOpenCodeServer() {
        const serverUrl = opencodeConfig.serverUrl || 'http://localhost:4096';
        startHealthPoll(serverUrl);
    }

    async function restartOpenCodeServer() {
        if (isRestartingOpenCode) return;
        isRestartingOpenCode = true;
        try {
            await saveSettings();
            if (!plugin?.restartOpenCodeServer) {
                pushErrMsg('当前插件环境不支持重启 OpenCode Server');
                return;
            }
            const result = await plugin.restartOpenCodeServer(settings);
            if (result?.success) {
                pushMsg('OpenCode Server 已重新连接');
            } else {
                pushErrMsg(`重启 OpenCode Server 失败: ${result?.error || '未知错误'}`);
                reconnectOpenCodeServer();
            }
        } catch (error) {
            pushErrMsg(`重启 OpenCode Server 失败: ${(error as Error).message}`);
            reconnectOpenCodeServer();
        } finally {
            isRestartingOpenCode = false;
        }
    }

    function setTokenStatsRange(range: string) {
        if (range === 'today' || range === '7d' || range === '30d' || range === 'all') {
            tokenStatsRange = range;
        }
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
                    key: 'userName',
                    value: settings.userName,
                    type: 'textinput',
                    title: t('settings.userName.title') || '用户名称',
                    description:
                        t('settings.userName.description') ||
                        '设置聊天消息顶部显示的用户名称',
                    placeholder: t('settings.userName.placeholder') || '留空显示用户',
                },
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
            name: t('settings.settingsGroup.tokenStats') || 'Token 统计',
            items: [],
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
            name: t('settings.settingsGroup.soul') || '记忆',
            items: [
                {
                    key: 'soulDocId',
                    value: settings.soulDocId,
                    type: 'textinput',
                    title: t('settings.soulDocId.title') || '灵魂文档 ID',
                    description:
                        t('settings.soulDocId.description') ||
                        '设置核心档案使用的思源文档 ID。',
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
        saveState = 'saving';
        if (saveStateTimer) clearTimeout(saveStateTimer);
        try {
            await plugin.saveSettings(settings);
            updateSettings(JSON.parse(JSON.stringify(settings)));
            saveState = 'saved';
            saveStateTimer = setTimeout(() => (saveState = 'idle'), 1600);
        } catch (error) {
            saveState = 'error';
            pushErrMsg(`保存设置失败: ${(error as Error).message}`);
        }
    }

    function ensureMemorySettings() {
        settings.memory = {
            ...getDefaultSettings().memory,
            ...(settings.memory || {}),
        };
        settings.pluginData = {
            ...getDefaultSettings().pluginData,
            ...(settings.pluginData || {}),
        };
    }

    async function saveMemorySettings() {
        ensureMemorySettings();
        await saveSettings();
    }

    onMount(async () => {
        await runload();
    });

    onDestroy(() => {
        unsubscribeConnectionStatus();
        if (saveTimer) clearTimeout(saveTimer);
        if (saveStateTimer) clearTimeout(saveStateTimer);
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
        ensureMemorySettings();

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
    $: currentGroupDescription = getGroupDescription(focusGroup);

    function getGroupDescription(groupName: string): string {
        const descriptions: Record<string, string> = {
            [t('settings.settingsGroup.systemPrompt')]: '定义 AI 的基础角色、工作边界和长期行为。',
            [t('settings.settingsGroup.platformManagement')]: '管理 OpenCode 服务状态、地址与可用模型。',
            [t('settings.settingsGroup.displayAndOperation')]: '调整身份显示、交互方式、任务并发和诊断选项。',
            [t('settings.settingsGroup.tokenStats') || 'Token 统计']: '查看不同时间范围和模型的 Token 使用情况。',
            [t('settings.settingsGroup.noteExport')]: '设置对话保存到笔记时使用的笔记本和默认路径。',
            [t('settings.settingsGroup.sessionManagement') || '会话管理']: '管理会话命名方式与相关自动化行为。',
            [t('settings.settingsGroup.soul') || '记忆']: '配置长期记忆的存储位置、提取范围与注入限制。',
            [t('settings.settingsGroup.reset') || 'Reset Settings']: '恢复默认配置；此操作会覆盖当前设置。',
        };
        return descriptions[groupName] || '管理 OpenCode 插件设置。';
    }
</script>

<div class="settings-layout">
    <aside class="settings-sidebar">
        <div class="settings-sidebar__brand">
            <div class="settings-sidebar__product">OpenCode</div>
            <div class="settings-sidebar__caption">插件设置</div>
        </div>
        <div class="settings-nav" aria-label="设置分类" role="tablist">
            {#each groups as group}
                <button
                    type="button"
                    class="settings-nav__item"
                    class:settings-nav__item--active={group.name === focusGroup}
                    aria-selected={group.name === focusGroup}
                    on:click={() => {
                        focusGroup = group.name;
                    }}
                    role="tab"
                >
                    <span>{group.name}</span>
                </button>
            {/each}
        </div>
        <div
            class="settings-save-state"
            class:settings-save-state--saving={saveState === 'saving'}
            class:settings-save-state--saved={saveState === 'saved'}
            class:settings-save-state--error={saveState === 'error'}
        >
            <span class="settings-save-state__dot"></span>
            {saveState === 'saving'
                ? '正在保存…'
                : saveState === 'saved'
                  ? '已保存'
                  : saveState === 'error'
                    ? '保存失败'
                    : '修改自动保存'}
        </div>
    </aside>
    <main class="settings-main">
        <header class="settings-page-header">
            <div class="settings-page-header__copy">
                <div class="settings-page-header__eyebrow">设置</div>
                <h2>{focusGroup}</h2>
                <p>{currentGroupDescription}</p>
            </div>
            <span class="settings-version">v{pluginManifest.version}</span>
        </header>
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
                    <div class="opencode-runtime-panel">
                        <div class="opencode-runtime-panel__row">
                            <span>插件版本</span>
                            <strong>v{pluginManifest.version}</strong>
                        </div>
                        <div class="opencode-runtime-panel__row">
                            <span>OpenCode Server</span>
                            <strong class:opencode-runtime-panel__status--ok={connectionStatus.state === 'connected'} class:opencode-runtime-panel__status--warn={connectionStatus.state === 'connecting'} class:opencode-runtime-panel__status--error={connectionStatus.state === 'disconnected'}>
                                {getOpenCodeStatusText()}
                            </strong>
                        </div>
                        <div class="opencode-runtime-panel__row">
                            <span>服务地址</span>
                            <code>{connectionStatus.serverUrl || opencodeConfig.serverUrl || 'http://localhost:4096'}</code>
                        </div>
                        <div class="opencode-runtime-panel__actions">
                            <button
                                class="b3-button b3-button--outline"
                                on:click={reconnectOpenCodeServer}
                                disabled={isRestartingOpenCode}
                            >
                                重新连接
                            </button>
                            <button
                                class="b3-button"
                                on:click={restartOpenCodeServer}
                                disabled={isRestartingOpenCode}
                            >
                                {isRestartingOpenCode ? '重启中...' : '重启 OpenCode Server'}
                            </button>
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
        {:else if focusGroup === (t('settings.settingsGroup.tokenStats') || 'Token 统计')}
            <div class="token-stats-panel">
                <div class="token-stats-panel__header">
                    <div>
                        <div class="token-stats-panel__title">Token 使用量统计</div>
                        <div class="token-stats-panel__desc">
                            按时间和模型查看输入、输出与总 token 消耗。
                        </div>
                    </div>
                    <div class="token-stats-panel__range">
                        {#each [
                            { value: 'today', label: '今日' },
                            { value: '7d', label: '7 天' },
                            { value: '30d', label: '30 天' },
                            { value: 'all', label: '全部' },
                        ] as range}
                            <button
                                type="button"
                                class:token-stats-panel__range-button--active={tokenStatsRange === range.value}
                                class="token-stats-panel__range-button"
                                on:click={() => setTokenStatsRange(range.value)}
                            >
                                {range.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="token-stats-panel__metrics">
                    <div class="token-stats-card">
                        <span>总 Token</span>
                        <strong>{formatTokenCount(tokenUsageSummary.totalTokens)}</strong>
                    </div>
                    <div class="token-stats-card">
                        <span>输入 Token</span>
                        <strong>{formatTokenCount(tokenUsageSummary.inputTokens)}</strong>
                    </div>
                    <div class="token-stats-card">
                        <span>输出 Token</span>
                        <strong>{formatTokenCount(tokenUsageSummary.outputTokens)}</strong>
                    </div>
                    <div class="token-stats-card">
                        <span>调用次数</span>
                        <strong>{tokenUsageSummary.calls.toLocaleString()}</strong>
                    </div>
                </div>

                <div class="token-stats-panel__section">
                    <div class="token-stats-panel__section-title">按模型统计</div>
                    {#if tokenUsageByModel.length === 0}
                        <div class="token-stats-panel__empty">暂无统计记录</div>
                    {:else}
                        <div class="token-stats-table">
                            <div class="token-stats-table__head">
                                <span>模型</span>
                                <span>次数</span>
                                <span>输入</span>
                                <span>输出</span>
                                <span>总量</span>
                            </div>
                            {#each tokenUsageByModel as item}
                                <div class="token-stats-table__row">
                                    <div class="token-stats-table__model">
                                        <strong>{item.modelName}</strong>
                                        <span>{item.modelId}</span>
                                        <div class="token-stats-table__bar">
                                            <div
                                                style={`width: ${Math.max(4, Math.round((item.totalTokens / tokenUsagePeak) * 100))}%`}
                                            ></div>
                                        </div>
                                    </div>
                                    <span>{item.calls}</span>
                                    <span>{formatTokenCount(item.inputTokens)}</span>
                                    <span>{formatTokenCount(item.outputTokens)}</span>
                                    <span>{formatTokenCount(item.totalTokens)}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {:else if focusGroup === (t('settings.settingsGroup.soul') || '记忆')}
            <div class="memory-settings-panel">
                <div class="config__item">
                    <div class="config__item-label">
                        <div class="config__item-title">
                            {t('settings.memory.enabled.title') || '启用长期记忆'}
                        </div>
                        <div class="config__item-description">
                            {t('settings.memory.enabled.description') ||
                                '开启后，AI 会读取记忆笔记本中的 Agent 总览、核心档案和相关往事。'}
                        </div>
                    </div>
                    <div class="config__item-control">
                        <input
                            type="checkbox"
                            class="b3-switch"
                            bind:checked={settings.memory.enabled}
                            on:change={saveMemorySettings}
                        />
                    </div>
                </div>

                <div class="config__item">
                    <div class="config__item-label">
                        <div class="config__item-title">
                            {t('settings.soulDocId.title') || '灵魂文档 ID'}
                        </div>
                        <div class="config__item-description">
                            {t('settings.soulDocId.description') || '作为核心档案优先读取的思源文档 ID'}
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

                <div class="config__item">
                    <div class="config__item-label">
                        <div class="config__item-title">
                            {t('settings.memory.notebook.title') || '记忆笔记本'}
                        </div>
                        <div class="config__item-description">
                            {t('settings.memory.notebook.description') ||
                                '所有长期记忆文档都会保存在这个笔记本中，日常检索也只在这里进行。'}
                        </div>
                    </div>
                    <div class="config__item-control">
                        <select
                            class="b3-select"
                            bind:value={settings.memory.notebookId}
                            on:change={saveMemorySettings}
                        >
                            {#each Object.entries(notebookOptions) as [id, name]}
                                <option value={id}>{name}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="config__item">
                    <div class="config__item-label">
                        <div class="config__item-title">
                            {t('settings.memory.rootPath.title') || '记忆根目录'}
                        </div>
                        <div class="config__item-description">
                            {t('settings.memory.rootPath.description') ||
                                '笔记本内的相对路径。留空则直接使用记忆笔记本根目录。'}
                        </div>
                    </div>
                    <div class="config__item-control">
                        <input
                            class="b3-text-field"
                            type="text"
                            bind:value={settings.memory.rootPath}
                            on:change={saveMemorySettings}
                            placeholder="AI记忆"
                        />
                    </div>
                </div>

                <div class="memory-settings-panel__grid">
                    <label class="memory-settings-panel__check">
                        <input
                            type="checkbox"
                            class="b3-checkbox"
                            bind:checked={settings.memory.autoExtract}
                            on:change={saveMemorySettings}
                        />
                        <span>{t('settings.memory.autoExtract') || '自动提取记忆'}</span>
                    </label>
                    <label class="memory-settings-panel__check">
                        <input
                            type="checkbox"
                            class="b3-checkbox"
                            bind:checked={settings.memory.saveFullConversation}
                            on:change={saveMemorySettings}
                        />
                        <span>{t('settings.memory.saveFullConversation') || '保存完整对话'}</span>
                    </label>
                </div>

                <div class="memory-settings-panel__grid">
                    <div class="config__item memory-settings-panel__compact">
                        <div class="config__item-label">
                            <div class="config__item-title">
                                {t('settings.memory.maxEpisodicItems') || '情景记忆条数'}
                            </div>
                        </div>
                        <div class="config__item-control">
                            <input
                                class="b3-text-field"
                                type="number"
                                min="0"
                                max="20"
                                bind:value={settings.memory.maxEpisodicItems}
                                on:change={saveMemorySettings}
                            />
                        </div>
                    </div>
                    <div class="config__item memory-settings-panel__compact">
                        <div class="config__item-label">
                            <div class="config__item-title">
                                {t('settings.memory.maxMemoryPromptChars') || '最大注入长度'}
                            </div>
                        </div>
                        <div class="config__item-control">
                            <input
                                class="b3-text-field"
                                type="number"
                                min="1000"
                                max="32000"
                                step="1000"
                                bind:value={settings.memory.maxMemoryPromptChars}
                                on:change={saveMemorySettings}
                            />
                        </div>
                    </div>
                </div>

                <div class="memory-settings-panel__meta">
                    {t('settings.memory.initCommandHint') ||
                        '在聊天中发送 /init，让 OpenCode 扫描笔记仓库并写入 Agent 总览。'}
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
    </main>
</div>

<style lang="scss">
    .settings-layout {
        height: 100%;
        display: grid;
        grid-template-columns: 196px minmax(0, 1fr);
        overflow: hidden;
        background: var(--b3-theme-background);
        container-type: inline-size;
        container-name: settings-panel;
    }

    .settings-sidebar {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 18px 12px 12px;
        border-right: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    .settings-sidebar__brand {
        padding: 0 10px 16px;
    }

    .settings-sidebar__product {
        color: var(--b3-theme-on-background);
        font-size: 16px;
        font-weight: 650;
        line-height: 1.3;
    }

    .settings-sidebar__caption {
        margin-top: 3px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.4;
    }

    .settings-nav {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 4px;
        min-height: 0;
        overflow-y: auto;
    }

    .settings-nav__item {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 38px;
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font: inherit;
        font-size: 13px;
        line-height: 1.4;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

        &:hover {
            background: var(--b3-list-hover);
            color: var(--b3-theme-on-background);
        }

        &:focus-visible {
            outline: 2px solid var(--b3-theme-primary);
            outline-offset: 1px;
        }

        &--active {
            border-color: color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-primary);
            font-weight: 600;
        }
    }

    .settings-save-state {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 32px;
        margin-top: 10px;
        padding: 6px 10px;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
    }

    .settings-save-state__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--b3-theme-on-surface-light);
        opacity: 0.55;
    }

    .settings-save-state--saving .settings-save-state__dot {
        background: var(--b3-card-warning-color);
        animation: settings-save-pulse 1s ease-in-out infinite;
    }

    .settings-save-state--saved {
        color: var(--b3-card-success-color);

        .settings-save-state__dot {
            background: var(--b3-card-success-color);
            opacity: 1;
        }
    }

    .settings-save-state--error {
        color: var(--b3-card-error-color);

        .settings-save-state__dot {
            background: var(--b3-card-error-color);
            opacity: 1;
        }
    }

    @keyframes settings-save-pulse {
        50% { opacity: 0.25; }
    }

    .settings-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .settings-page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 20px 24px 18px;
        border-bottom: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
    }

    .settings-page-header__copy {
        min-width: 0;

        h2 {
            margin: 3px 0 0;
            color: var(--b3-theme-on-background);
            font-size: 20px;
            font-weight: 650;
            line-height: 1.3;
        }

        p {
            max-width: 640px;
            margin: 5px 0 0;
            color: var(--b3-theme-on-surface-light);
            font-size: 12px;
            line-height: 1.55;
        }
    }

    .settings-page-header__eyebrow {
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 650;
        letter-spacing: 0.08em;
    }

    .settings-version {
        flex-shrink: 0;
        padding: 4px 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 999px;
        color: var(--b3-theme-on-surface-light);
        background: var(--b3-theme-surface);
        font-size: 11px;
    }

    .config__tab-wrap {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 20px 24px 28px;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    :global(.config__tab-container_plugin) {
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        overflow: hidden;
    }

    :global(.config__tab-container_plugin .item-wrap.b3-label) {
        margin: 0;
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    :global(.config__tab-container_plugin .item-wrap.b3-label:last-child) {
        border-bottom: none;
    }

    :global(.config__tab-container_plugin .item-wrap .title) {
        color: var(--b3-theme-on-background);
        font-size: 13px;
        font-weight: 600;
    }

    :global(.config__tab-container_plugin .b3-label__text) {
        margin-top: 4px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.5;
    }

    :global(.config__tab-container_plugin .b3-text-field),
    :global(.config__tab-container_plugin .b3-select) {
        min-height: 34px;
    }

    .model-management-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: 0;
    }

    .model-management-panel__section {
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        padding: 16px;
    }

    .opencode-runtime-panel {
        display: grid;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--b3-border-color);
    }

    .opencode-runtime-panel__row {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        min-height: 28px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;

        span {
            color: var(--b3-theme-on-surface-light);
        }

        strong,
        code {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--b3-theme-on-background);
            font-size: 13px;
        }

        code {
            padding: 2px 6px;
            border-radius: 4px;
            background: var(--b3-theme-background);
            font-family: var(--b3-font-family-code);
        }
    }

    .opencode-runtime-panel__status--ok {
        color: var(--b3-card-success-color) !important;
    }

    .opencode-runtime-panel__status--warn {
        color: var(--b3-card-warning-color) !important;
    }

    .opencode-runtime-panel__status--error {
        color: var(--b3-card-error-color) !important;
    }

    .opencode-runtime-panel__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding-top: 4px;
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

    .token-stats-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        min-height: 0;
        padding: 0;
        overflow-y: auto;
    }

    .token-stats-panel__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
    }

    .token-stats-panel__title {
        color: var(--b3-theme-on-background);
        font-size: 18px;
        font-weight: 650;
        line-height: 1.3;
    }

    .token-stats-panel__desc {
        margin-top: 4px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.5;
    }

    .token-stats-panel__range {
        display: inline-flex;
        gap: 4px;
        padding: 3px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-surface);
    }

    .token-stats-panel__range-button {
        height: 28px;
        padding: 0 10px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        cursor: pointer;

        &:hover {
            color: var(--b3-theme-on-surface);
        }

        &--active {
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-background);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        }
    }

    .token-stats-panel__metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
    }

    .token-stats-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);

        span {
            color: var(--b3-theme-on-surface-light);
            font-size: 12px;
        }

        strong {
            color: var(--b3-theme-on-background);
            font-size: 22px;
            font-weight: 650;
            line-height: 1.2;
        }
    }

    .token-stats-panel__section {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        overflow: hidden;
    }

    .token-stats-panel__section-title {
        padding: 12px 14px;
        border-bottom: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-background);
        font-size: 14px;
        font-weight: 600;
    }

    .token-stats-panel__empty {
        padding: 28px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .token-stats-table {
        min-width: 640px;
    }

    .token-stats-table__head,
    .token-stats-table__row {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) 70px 90px 90px 90px;
        gap: 12px;
        align-items: center;
        padding: 10px 14px;
    }

    .token-stats-table__head {
        color: var(--b3-theme-on-surface-light);
        background: var(--b3-theme-surface);
        font-size: 12px;
        font-weight: 600;
    }

    .token-stats-table__row {
        border-top: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .token-stats-table__model {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;

        strong,
        span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        strong {
            color: var(--b3-theme-on-background);
            font-size: 13px;
        }

        span {
            color: var(--b3-theme-on-surface-light);
            font-size: 11px;
        }
    }

    .token-stats-table__bar {
        width: 120px;
        max-width: 100%;
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--b3-theme-surface);

        div {
            height: 100%;
            border-radius: inherit;
            background: var(--b3-theme-primary);
        }
    }

    .memory-settings-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        overflow-y: auto;
        padding: 0;
    }

    .memory-settings-panel__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
    }

    .memory-settings-panel__check {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 8px 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-surface);
    }

    .memory-settings-panel__compact {
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .memory-settings-panel__meta {
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
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
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        border-radius: 9px;
        margin-top: 8px;
    }

    .config__item {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .config__item-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .config__item-title {
        font-size: 13px;
        font-weight: 600;
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

        > .b3-text-field,
        > .b3-select {
            min-height: 34px;
        }

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
        .settings-layout {
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(0, 1fr);
        }

        .settings-sidebar {
            padding: 10px;
            border-right: none;
            border-bottom: 1px solid var(--b3-border-color);
        }

        .settings-sidebar__brand,
        .settings-save-state {
            display: none;
        }

        .settings-nav {
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
        }

        .settings-nav__item {
            width: auto;
            min-width: max-content;
            min-height: 34px;
            padding: 6px 10px;
        }

        .settings-page-header {
            padding: 16px;
        }

        .settings-page-header__copy h2 {
            font-size: 18px;
        }

        .config__tab-wrap {
            padding: 16px;
        }

        .model-management-panel {
            padding: 0;
        }

        .model-management-panel__toolbar {
            flex-direction: column;
            align-items: stretch;
        }

        .opencode-runtime-panel__row {
            grid-template-columns: 1fr;
            gap: 4px;
        }

        .model-management-panel__toolbar-left {
            justify-content: center;
        }

        .model-management-panel__count {
            text-align: center;
        }
    }

    @container settings-panel (min-width: 600px) and (max-width: 768px) {
        .settings-layout {
            grid-template-columns: 172px minmax(0, 1fr);
        }

        .settings-page-header,
        .config__tab-wrap {
            padding-left: 18px;
            padding-right: 18px;
        }
    }
</style>
