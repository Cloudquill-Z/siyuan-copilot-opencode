<script lang="ts">
    import { onMount, tick, onDestroy } from 'svelte';
    import {
        type Message,
        type MessageAttachment,
        type EditOperation,
        type ToolCall,
        type ContextDocument,
        type ThinkingEffort,
        type QuestionRequest,
        fetchModels,
        executeCommand,
        sendStillPrompt,
        estimateTokens,
        calculateTotalTokens,
        invalidateModelCache,
    } from './ai-chat';
    import type { MessageContent } from './ai-chat';
    import { runChat } from './chat/execution/run-controller';
    import {
        applyMultiModelSelection,
        createMultiModelResponses,
        finalizePendingMultiModel,
        type MultiModelChoice,
        type MultiModelResponse,
    } from './chat/execution/multi-model-state';
    import { runMultiModelTargets } from './chat/execution/multi-model-runner';
    import { prepareMessagesForAI as prepareMessagesForAIRequest } from './chat/execution/message-preparer';
    import {
        convertLatexToMarkdown,
        getActualMessageContent,
        getMessageText,
    } from './chat/message-content';
    import { renderMessageHtml } from './chat/message-renderer';
    import {
        cleanupCodeBlocks,
        highlightCodeBlocks,
        renderMathFormulas,
        setupBlockRefLinks,
        setupImageClickHandlers,
    } from './chat/dom-enhancers';
    import { copyMessage, handleCopyEvent as handleMessageCopyEvent } from './chat/message-copy';
    import {
        formatOpenCodeToolValue,
        getActiveOpenCodeTimelineItemId,
        getOpenCodeProcessKey,
        getOpenCodeToolPartKey,
        getOpenCodeToolStatusIcon,
        getOpenCodeToolStatusText,
        groupOpenCodeTimeline,
    } from './chat/timeline-display';
    import {
        escapeSqlString,
        generateSimpleDiff,
        normalizeOperationContentForDiff,
        renderMarkdownForSplitDiff,
    } from './chat/diff-utils';
    import { TaskStateController } from './chat/task-state-controller';
    import { SessionRepository } from './chat/session-repository';
    import { hydrateSessionMessages } from './chat/session-hydrator';
    import {
        AttachmentController,
    } from './chat/attachment-controller';
    import { AttachmentWorkflow } from './chat/attachment-workflow';
    import {
        ContextController,
        buildDocumentSearchQuery,
        createContextTitle,
        refreshContextDocuments,
    } from './chat/context-controller';
    import { getActiveEditor, openTab } from 'siyuan';
    import {
        pushMsg,
        pushErrMsg,
        sql,
        exportMdContent,
        openBlock,
        getBlockByID,
        getFileBlob,
        getHPathByID,
        putFile,
        removeFile,
    } from './api';
    import { saveAsset, loadAsset, base64ToBlob, readAssetAsText, revokeLoadedAssetUrls } from './utils/assets';
    import {
        CHAT_SESSIONS_PATH,
        getLegacySessionPath,
        getPluginFileBlob,
        getSessionPath,
        isPluginAssetPath,
        loadJsonFile,
        saveJsonFile,
    } from './pluginPaths';
    import {
        createDiagnosticLogger,
        shouldStartDiagnosticLog,
        type DiagnosticLogger,
        type DiagnosticLogLevel,
        type DiagnosticLogMode,
    } from './diagnostic-logger';
    import { SUMMARY_EVENT, WEBAPP_TAB_TYPE } from './pluginNamespace';
    import {
        fetchWithWebView,
        parseWebPageToMarkdown,
    } from './utils/webParser';
    import TaskToolbar from './components/chat/TaskToolbar.svelte';
    import MessageList from './components/chat/MessageList.svelte';
    import ModelPresetButton from './components/ModelPreset.svelte';
    import MultiModelSelector from './components/MultiModelSelector.svelte';
    import SaveToNoteDialog from './components/chat/dialogs/SaveToNoteDialog.svelte';
    import ImageViewer from './components/chat/dialogs/ImageViewer.svelte';
    import openCodeIconUrl from '../assets/opencode-icon.svg';
    import type { ProviderConfig } from './defaultSettings';
    import { settingsStore, updateSettings } from './stores/settings';
    import { connectionStatusStore, refreshHealth, type ConnectionStatus } from './stores/connectionStatus';
    import { confirm, Constants, platformUtils } from 'siyuan';
    import { t } from './utils/i18n';
    import { getModelCapabilities } from './utils/modelCapabilities';
    import { shouldSendMessageFromKeydown } from './utils/sendShortcut';
    import {
        findOpenCodeModelConfigMatch,
        shouldRefreshOpenCodeModelCatalog,
        uniqueOpenCodeModelRefs,
    } from './providers/opencode-models';
    import {
        getChatModeDescription,
        getChatModeLabel,
        getChatModeSystemInstruction,
        getContextLimitForActiveModels,
        shouldToggleChatModeFromKeydown,
        type ChatMode,
    } from './utils/chatMode';
    import {
        appendTokenUsageRecord,
        createTokenUsageRecord,
        formatTokenCount,
    } from './utils/tokenUsage';
    import {
        formatComposerStatusSummary,
        getPromptMenuToggleState,
    } from './utils/composerControls';
    import {
        buildSessionMarkdown,
        cleanModelName,
        createSessionExportSnapshot,
        sanitizeDocumentName,
        type SessionExportSnapshot,
    } from './utils/sessionExport';
    import { mutateSessionMetadata } from './session-metadata';
    import {
        buildMemoryDreamPrompt,
        buildMemoryInitPrompt,
        ensureMemoryBase,
        ensureMemoryOverviewTarget,
        extractEpisodicMemory,
        isMemoryDreamCommand,
        isMemoryInitCommand,
    } from './memory';
    import {
        appendTaskRuntimeText,
        appendTaskRuntimeThinking,
        applyTaskRuntimeToolUpdate,
        type OpenCodeTimelineItem,
        type TaskSession,
    } from './task-types';
    // Agent 模式工具使用强制规则（统一常量）
    // STUBS: ./tools deleted, safe no-op replacements
    async function soul(_op: any): Promise<{ success: boolean; content: string }> {
        try {
            const docId = settings.soulDocId?.trim();
            if (!docId) return { success: false, content: '' };
            const data = await exportMdContent(docId, false, false, 2, 0, false);
            if (data && data.content) {
                return { success: true, content: data.content };
            }
            return { success: false, content: '' };
        } catch (e) {
            console.error('[SOUL] 获取文档内容失败:', e);
            return { success: false, content: '' };
        }
    }
    function isSupportedThinkingGeminiModel(_id: string) { return false; }
    function isSupportedThinkingClaudeModel(_id: string) { return false; }
    function isGemini3Model(_id: string) { return false; }

    export let plugin: any;
    export let initialMessage: string = ''; // 初始消息
    export let mode: 'sidebar' | 'dialog' = 'sidebar'; // 使用模式：sidebar或dialog
    export let respondToGlobalActions: boolean = false; // 是否响应全局事件（仅标签页实例）
    const AI_SIDEBAR_DEBUG_LOGS = false;
    function debugSidebar(...args: any[]) {
        if (AI_SIDEBAR_DEBUG_LOGS) {
            console.debug(...args);
        }
    }

    type ChatSession = TaskSession;
    const sessionRepository = new SessionRepository<ChatSession>();

    interface SidebarSessionState {
        messages: Message[];
        currentInput: string;
        currentAttachments: MessageAttachment[];
        contextDocuments: ContextDocument[];
        streamingMessage: string;
        streamingThinking: string;
        openCodeToolParts: any[];
        openCodeTimeline: OpenCodeTimelineItem[];
        isThinkingPhase: boolean;
        isLoading: boolean;
        hasUnsavedChanges: boolean;
        lastPreparedContextTokens: number;
    }

    let messages: Message[] = [];
    let currentInput = '';
    let isInputComposing = false;
    let isLoading = false;
    let streamingMessage = '';
    let streamingThinkingCollapsed = true;
    let streamingToolCallsCollapsed = true;
    let streamingThinking = ''; // 流式思考内容
    let isThinkingPhase = false; // 是否在思考阶段
    let openCodeTimeline: OpenCodeTimelineItem[] = [];
    let openCodeTimelineCounter = 0;
    let settings: any = {};
    let messagesContainer: HTMLElement;

    function handleCopyEvent(event: ClipboardEvent) {
        handleMessageCopyEvent(event, messagesContainer || null);
    }
    let textareaElement: HTMLTextAreaElement;
    let inputContainer: HTMLElement;
    let fileInputElement: HTMLInputElement;
    let imageInputElement: HTMLInputElement;
    let isInitialLoading = true;

    // 思考过程折叠状态管理
    let thinkingCollapsed: Record<string, any> = {};
    let toolCallGroupsCollapsed: Record<string, boolean> = {};
    let timelineCollapsed: Record<string, boolean> = {};
    let openCodeProcessCollapsed: Record<string, boolean> = {};

    function isOpenCodeProcessCollapsed(key: string): boolean {
        return openCodeProcessCollapsed[key] ?? true;
    }

    function toggleOpenCodeProcessCollapsed(key: string) {
        openCodeProcessCollapsed = {
            ...openCodeProcessCollapsed,
            [key]: !isOpenCodeProcessCollapsed(key),
        };
    }


    function isThinkingCollapsed(
        stateOrKey: Record<string, any> | string | number,
        key?: string | number
    ): boolean {
        const state = key === undefined ? thinkingCollapsed : stateOrKey as Record<string, any>;
        const stateKey = key === undefined ? stateOrKey : key;
        return state[String(stateKey)] ?? true;
    }

    function toggleThinkingCollapsed(key: string | number) {
        const stateKey = String(key);
        thinkingCollapsed = {
            ...thinkingCollapsed,
            [stateKey]: !isThinkingCollapsed(stateKey),
        };
    }

    function isToolCallGroupCollapsed(
        state: Record<string, boolean>,
        key: string
    ): boolean {
        return state[key] ?? true;
    }

    function toggleToolCallGroup(key: string) {
        toolCallGroupsCollapsed = {
            ...toolCallGroupsCollapsed,
            [key]: !isToolCallGroupCollapsed(toolCallGroupsCollapsed, key),
        };
    }

    function isTimelineCollapsed(
        stateOrKey: Record<string, boolean> | string,
        keyOrDefault: string | boolean,
        defaultCollapsed?: boolean
    ): boolean {
        const state =
            typeof keyOrDefault === 'boolean'
                ? timelineCollapsed
                : stateOrKey as Record<string, boolean>;
        const stateKey =
            typeof keyOrDefault === 'boolean' ? stateOrKey as string : keyOrDefault;
        const fallback =
            typeof keyOrDefault === 'boolean' ? keyOrDefault : defaultCollapsed ?? true;
        return state[stateKey] ?? fallback;
    }

    function toggleTimelineCollapsed(key: string, defaultCollapsed: boolean) {
        timelineCollapsed = {
            ...timelineCollapsed,
            [key]: !isTimelineCollapsed(key, defaultCollapsed),
        };
    }

    let editingMessageIndex: number | null = null;
    let editingMessageContent = '';
    let isEditDialogOpen = false;

    // 命令自动补全
    let showCommandPalette = false;
    let commandPaletteFilter = '';
    let commandPaletteIndex = 0;
    const BUILTIN_COMMANDS = [
        { name: 'still', desc: '让 AI 继续生成', args: '[提示词]' },
        { name: 'init', desc: '初始化记忆，让 OpenCode 扫描思源笔记仓库', args: '' },
        { name: 'dream', desc: '整理记忆，合并相似内容并清理过时情景记忆', args: '' },
        { name: 'clear', desc: '清除当前会话', args: '' },
    ];

    // 右键菜单状态
    let contextMenuVisible = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let contextMenuMessageIndex: number | null = null;
    let contextMenuMessageType: 'user' | 'assistant' | null = null;
    let contextMenuIsMultiModel = false;
    // 选区相关（用于右键时判断是否对选中的文本进行复制）
    let selectionInMessage = false;
    let selectionHtml = '';
    let selectionText = '';

    // 附件管理
    let currentAttachments: MessageAttachment[] = [];
    let isUploadingFile = false;
    const attachmentController = new AttachmentController(
        (file, name) => saveAsset(file, name),
        attachments => {
            currentAttachments = attachments;
            isUploadingFile = attachmentController.isSaving;
        }
    );
    const attachmentWorkflow = new AttachmentWorkflow(attachmentController);

    // 网页链接功能
    let isWebLinkDialogOpen = false;
    let webLinkInput = '';
    let isFetchingWebContent = false;

    // 中断控制 — 每个会话独立的 AbortController
    let sessionControllers = new Map<string, AbortController>();
    let sessionIsAborted = new Map<string, boolean>();
    let activeSessions = new Set<string>();

    // 兼容旧代码的全局代理变量——始终反映当前会话状态
    let abortController: AbortController | null = null;
    let isAborted = false;

    function syncFromCurrentSession() {
        abortController = sessionControllers.get(currentSessionId) || null;
        isAborted = sessionIsAborted.get(currentSessionId) || false;
    }

    function setController(sid: string, ctrl: AbortController | null) {
        if (ctrl) {
            sessionControllers.set(sid, ctrl);
            activeSessions.add(sid);
        } else {
            sessionControllers.delete(sid);
            activeSessions.delete(sid);
            sessionIsAborted.delete(sid);
        }
        activeSessions = new Set(activeSessions);
        if (sid === currentSessionId) {
            abortController = ctrl;
        }
    }

    function setIsAborted(sid: string, val: boolean) {
        if (val) sessionIsAborted.set(sid, true);
        else sessionIsAborted.delete(sid);
        if (sid === currentSessionId) {
            isAborted = val;
        }
    }

    function createSessionId(): string {
        const randomPart =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2, 10);
        return `session_${Date.now()}_${randomPart}`;
    }

    // 当切换当前会话时，同步全局代理变量
    $: currentSessionId, syncFromCurrentSession();


    // 自动滚动控制
    let autoScroll = true;

    // 上下文文档
    let contextDocuments: ContextDocument[] = [];
    const contextController = new ContextController(documents => {
        contextDocuments = documents;
    });
    let isSearchDialogOpen = false;
    let searchKeyword = '';
    let searchResults: any[] = [];
    let isSearching = false;
    let isDragOver = false;
    let searchTimeout: number | null = null;

    // 提示词管理
    interface Prompt {
        id: string;
        title: string;
        content: string;
        createdAt: number;
    }
    let prompts: Prompt[] = [];
    let isPromptManagerOpen = false;
    let isPromptSelectorOpen = false;
    let isAddMenuOpen = false;
    let isStatusMenuOpen = false;
    let isModelSelectorOpen = false;
    let editingPrompt: Prompt | null = null;
    let newPromptTitle = '';
    let newPromptContent = '';

    // 会话管理
    let sessions: ChatSession[] = [];
    let currentSessionId: string = '';
    let isSessionManagerOpen = false;
    let hasUnsavedChanges = false;
    const DRAFT_TASK_PREFIX = 'draft:';
    const createDraftTaskId = () => `${DRAFT_TASK_PREFIX}${createSessionId()}`;
    const isDraftTaskId = (id: string) => id.startsWith(DRAFT_TASK_PREFIX);
    const initialDraftTaskId = createDraftTaskId();
    let activeDraftTaskId = initialDraftTaskId;
    const MAX_ACTIVE_TASK_TABS = 4;
    const taskStateController = new TaskStateController<SidebarSessionState>(
        () => blankTaskState(),
        [initialDraftTaskId],
        MAX_ACTIVE_TASK_TABS
    );
    let activeTaskIds: string[] = taskStateController.activeTaskIds;
    let unreadTaskIds = taskStateController.unreadIds;
    $: currentActiveTaskId = currentSessionId || activeDraftTaskId;

    function syncTaskControllerState() {
        activeTaskIds = taskStateController.activeTaskIds;
        unreadTaskIds = taskStateController.unreadIds;
    }

    function activeTaskKey(): string {
        return currentSessionId || activeDraftTaskId;
    }

    function markTaskUnread(taskId: string) {
        taskStateController.markUnread(taskId, activeTaskKey());
        syncTaskControllerState();
    }

    function clearTaskUnread(taskId: string) {
        taskStateController.clearUnread(taskId);
        syncTaskControllerState();
    }

    function captureActiveTaskState(): SidebarSessionState {
        return {
            messages,
            currentInput,
            currentAttachments,
            contextDocuments,
            streamingMessage,
            streamingThinking,
            openCodeToolParts,
            openCodeTimeline,
            isThinkingPhase,
            isLoading,
            hasUnsavedChanges,
            lastPreparedContextTokens,
        };
    }

    function saveActiveTaskState() {
        const key = activeTaskKey();
        if (!key) return;
        taskStateController.saveForeground(key, captureActiveTaskState());
    }

    function applyTaskState(state: SidebarSessionState) {
        messages = state.messages;
        currentInput = state.currentInput;
        attachmentController.replace(state.currentAttachments);
        contextController.replace(state.contextDocuments);
        streamingMessage = state.streamingMessage;
        streamingThinking = state.streamingThinking;
        openCodeToolParts = state.openCodeToolParts;
        openCodeTimeline = state.openCodeTimeline;
        isThinkingPhase = state.isThinkingPhase;
        isLoading = state.isLoading;
        hasUnsavedChanges = state.hasUnsavedChanges;
        lastPreparedContextTokens = state.lastPreparedContextTokens || 0;
    }

    function blankTaskState(): SidebarSessionState {
        return {
            messages: settings.aiSystemPrompt
                ? [{ role: 'system', content: settings.aiSystemPrompt }]
                : [],
            currentInput: '',
            currentAttachments: [],
            contextDocuments: [],
            streamingMessage: '',
            streamingThinking: '',
            openCodeToolParts: [],
            openCodeTimeline: [],
            isThinkingPhase: false,
            isLoading: false,
            hasUnsavedChanges: false,
            lastPreparedContextTokens: 0,
        };
    }

    function ensureActiveTaskTab(taskId: string) {
        taskStateController.ensureTab(taskId, activeTaskKey(), activeSessions);
        syncTaskControllerState();
    }

    function replaceActiveDraftWithTask(taskId: string) {
        const draftId = activeDraftTaskId;
        if (!draftId || !isDraftTaskId(draftId)) {
            ensureActiveTaskTab(taskId);
            return;
        }
        taskStateController.replaceDraft(draftId, taskId);
        syncTaskControllerState();
        activeDraftTaskId = '';
        clearTaskUnread(draftId);
    }

    function getTaskTabTitle(taskId: string): string {
        if (isDraftTaskId(taskId)) return t('aiSidebar.session.new') || '新任务';
        const task = sessions.find(s => s.id === taskId);
        return task?.title || taskId.slice(0, 8);
    }

    function isActiveTask(taskId: string): boolean {
        return taskId === activeTaskKey();
    }

    function getStoredTaskState(taskId: string): SidebarSessionState {
        return taskStateController.getState(taskId);
    }

    function prepareMessagesForAI(
        messagesToPrepare: Message[],
        latestContext: ContextDocument[],
        userContent: string,
        lastUserMessage: Message,
        thinkingEnabled = false,
        modelId = currentModelId
    ) {
        return prepareMessagesForAIRequest({
            messages: messagesToPrepare,
            contextDocumentsWithLatestContent: latestContext,
            userContent,
            lastUserMessage,
            thinkingEnabled,
            modelId,
            settings,
            contextCount: tempModelSettings.contextCount,
            buildSystemPromptForCurrentRequest,
        });
    }

    function updateStoredTaskState(taskId: string, updater: (state: SidebarSessionState) => SidebarSessionState) {
        taskStateController.updateState(taskId, isActiveTask(taskId), updater);
    }

    function flushBackgroundTaskState(taskId: string): SidebarSessionState | null {
        return taskStateController.flushBackground(taskId);
    }

    function appendStreamingTextForTask(taskId: string, chunk: string) {
        if (!chunk) return;
        if (isActiveTask(taskId)) {
            streamingMessage += chunk;
            appendOpenCodeTimelineText(chunk);
            return;
        }
        markTaskUnread(taskId);
        updateStoredTaskState(taskId, state => appendTaskRuntimeText(state, chunk));
    }

    function appendThinkingForTask(taskId: string, chunk: string) {
        if (!chunk) return;
        if (isActiveTask(taskId)) {
            appendStreamingThinking(chunk);
            return;
        }
        markTaskUnread(taskId);
        updateStoredTaskState(taskId, state => appendTaskRuntimeThinking(state, chunk));
    }

    function updateToolPartForTask(taskId: string, update: any) {
        if (isActiveTask(taskId)) {
            updateOpenCodeToolPart(update);
            return;
        }
        markTaskUnread(taskId);
        updateStoredTaskState(taskId, state => applyTaskRuntimeToolUpdate(state, update));
    }

    // 在新窗口打开菜单
    let openWindowMenuButton: HTMLButtonElement;

    // 全屏模式
    let isFullscreen = false;
    let sidebarContainer: HTMLElement;

    // 当前选中的提供商和模型
    let currentProvider = '';
    let currentModelId = '';
    let providers: Record<string, ProviderConfig> = {};

    // 显示设置
    let messageFontSize = 12;
    let multiModelViewMode: 'tab' | 'card' = 'tab'; // 多模型回答样式
    let isTokenDetailsOpen = false;
    let lastPreparedContextTokens = 0;
    let tokenButtonElement: HTMLButtonElement | null = null;
    let tokenPopoverStyle = '';

    // 模型临时设置
    let tempModelSettings = {
        contextCount: -1, // -1表示使用不限制
        temperature: 1,
        temperatureEnabled: true,
        systemPrompt: '',
        modelSelectionEnabled: false,
        selectedModels: [] as Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>,
        enableMultiModel: false,
        chatMode: 'plan' as 'plan' | 'build',
    };

    // 对话模式
    type ThinkingSelectValue = 'off' | ThinkingEffort;
    let chatMode: ChatMode = 'plan';
    const THINKING_EFFORT_OPTIONS: Array<{ value: ThinkingEffort; label: string }> = [
        { value: 'auto', label: 'Auto' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Middle' },
        { value: 'high', label: 'High' },
        { value: 'max', label: 'Max' },
    ];
    let isDiffDialogOpen = false;
    let currentDiffOperation: EditOperation | null = null;
    type DiffViewMode = 'diff' | 'split';
    let diffViewMode: DiffViewMode = 'diff'; // diff查看模式：diff或split

    // 图片查看器
    let imageViewer: ImageViewer;

    function findModelById(models: any[] = [], modelId?: string, providerID?: string) {
        return findOpenCodeModelConfigMatch(models, modelId, providerID) || null;
    }

    function getCurrentContextLimit(): number | undefined {
        const modelConfig = getCurrentModelConfig();
        const selectedModelConfigs = selectedMultiModels
            .map(model => getProviderAndModelConfig(model.provider, model.modelId)?.modelConfig)
            .filter(Boolean);

        return getContextLimitForActiveModels({
            modelConfig,
            selectedModelConfigs,
            enableMultiModel: enableMultiModel || !modelConfig,
            chatMode,
        });
    }

    function estimateMessageExtraTokens(message: Message): number {
        const contextTokens = (message.contextDocuments || []).reduce(
            (sum, doc) => sum + estimateTokens(doc.content || ''),
            0
        );
        const attachmentTokens = (message.attachments || []).reduce((sum, attachment) => {
            if (attachment.type === 'image') return sum + 85;
            return sum + estimateTokens(attachment.data || attachment.name || '');
        }, 0);
        return contextTokens + attachmentTokens;
    }

    function estimateMessagesContextTokens(messagesToMeasure: Message[]): number {
        return calculateTotalTokens(messagesToMeasure) + messagesToMeasure.length * 4;
    }

    function estimateCurrentContextTokens(): number {
        const visibleMessages = messages.filter(message => message.role !== 'system');
        const messageTokens =
            estimateMessagesContextTokens(messages) +
            visibleMessages.reduce((sum, message) => sum + estimateMessageExtraTokens(message), 0);
        const draftTokens = estimateTokens(currentInput || '');
        const contextTokens = contextDocuments.reduce(
            (sum, doc) => sum + estimateTokens(doc.content || ''),
            0
        );
        const attachmentTokens = currentAttachments.reduce((sum, attachment) => {
            if (attachment.type === 'image') return sum + 85;
            return sum + estimateTokens(attachment.data || attachment.name || '');
        }, 0);
        return messageTokens + draftTokens + contextTokens + attachmentTokens;
    }

    async function recordTokenUsage(
        requestMessages: Message[],
        outputText: string,
        modelConfig: any,
        provider = currentProvider
    ) {
        try {
            const record = createTokenUsageRecord({
                messages: requestMessages,
                outputText,
                provider,
                modelId: modelConfig?.id || currentModelId || '',
                modelName: modelConfig?.name || modelConfig?.id || currentModelId || 'OpenCode',
                contextLimit: currentContextLimit,
            });
            settings.pluginData = {
                ...(settings.pluginData || {}),
                tokenUsageRecords: appendTokenUsageRecord(
                    settings.pluginData?.tokenUsageRecords,
                    record
                ),
            };
            await plugin.saveSettings(settings);
        } catch (error) {
            console.warn('Failed to record token usage:', error);
        }
    }

    function updateTokenPopoverPosition() {
        if (!tokenButtonElement || typeof window === 'undefined') return;
        const rect = tokenButtonElement.getBoundingClientRect();
        const margin = 12;
        const width = Math.min(280, Math.max(220, window.innerWidth - margin * 2));
        const left = Math.min(
            Math.max(margin, rect.right - width),
            Math.max(margin, window.innerWidth - width - margin)
        );
        const bottom = Math.max(margin, window.innerHeight - rect.top + 10);
        tokenPopoverStyle = `--token-popover-left: ${left}px; --token-popover-bottom: ${bottom}px; --token-popover-width: ${width}px;`;
    }

    async function toggleTokenDetails(event: MouseEvent) {
        event.stopPropagation();
        isTokenDetailsOpen = !isTokenDetailsOpen;
        if (isTokenDetailsOpen) {
            await tick();
            updateTokenPopoverPosition();
        }
    }

    $: currentContextTokens = estimateCurrentContextTokens();
    $: currentContextLimit = (
        currentProvider,
        currentModelId,
        providers,
        settings,
        selectedMultiModels,
        enableMultiModel,
        chatMode,
        getCurrentContextLimit()
    );
    $: displayedContextTokens = Math.max(currentContextTokens, lastPreparedContextTokens);
    $: displayedContextPercent = currentContextLimit
        ? Math.min(100, Math.round((displayedContextTokens / currentContextLimit) * 100))
        : 0;
    $: isContextCompactionLikely =
        !!currentContextLimit && isLoading && displayedContextTokens >= currentContextLimit * 0.95;

    // 消息内容显示缓存（存储每个消息的显示内容，键为content的哈希）
    const messageDisplayCache = new Map<string, { loading: boolean; content: string }>();

    const formatMessage = (content: string | MessageContent[]): string =>
        renderMessageHtml(getMessageText(content));

    // 获取content的缓存键
    function getContentHash(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return `${content.length}:${hash >>> 0}:${content.slice(0, 64)}:${content.slice(-64)}`;
    }

    // 获取用于显示的消息内容（将 assets 路径替换为 blob URL）
    function getDisplayContent(content: string | MessageContent[]): string {
        const textContent = typeof content === 'string' ? content : getMessageText(content);

        // 检查是否包含 assets 路径
        if (!isPluginAssetPath(textContent)) {
            return formatMessage(textContent);
        }

        // 使用content本身的哈希作为缓存键
        const cacheKey = getContentHash(textContent);

        // 如果缓存中存在且已加载完成，直接返回
        const cached = messageDisplayCache.get(cacheKey);
        if (cached && !cached.loading) {
            return cached.content;
        }

        // 如果正在加载，返回原始内容
        if (cached && cached.loading) {
            return formatMessage(textContent);
        }

        // 标记为加载中
        messageDisplayCache.set(cacheKey, { loading: true, content: '' });

        // 异步加载assets图片
        replaceAssetPathsWithBlob(textContent).then(processedContent => {
            const formattedContent = formatMessage(processedContent);
            messageDisplayCache.set(cacheKey, { loading: false, content: formattedContent });
            // 触发重新渲染
            messages = [...messages];
        });

        // 先返回原始内容
        return formatMessage(textContent);
    }

    function openImageViewer(src: string, name: string) {
        imageViewer.show(src, name);
    }

    // 当模式切换时，更新已添加的上下文文档内容
    $: if (chatMode) {
        updateContextDocumentsForMode();
    }

    // 更新上下文文档内容以匹配当前模式
    async function updateContextDocumentsForMode() {
        if (contextDocuments.length === 0) return;

        const updatedDocs: ContextDocument[] = [];
        for (const doc of contextDocuments) {
            try {
                let content: string;

                if (doc.type === 'webpage') {
                    // 网页类型：保持原内容不变（已经获取到内容）
                    content = doc.content;
                } else {
                    // ask模式：获取Markdown格式
                    const data = await exportMdContent(doc.id, false, false, 2, 0, false);
                    if (data && data.content) {
                        content = data.content;
                    } else {
                        content = doc.content; // 保留原内容
                    }
                }

                updatedDocs.push({
                    id: doc.id,
                    title: doc.title,
                    content: content,
                    type: doc.type,
                    url: doc.url,
                });
            } catch (error) {
                console.error(`Failed to update content for block ${doc.id}:`, error);
                // 出错时保留原内容
                updatedDocs.push(doc);
            }
        }

        contextController.replace(updatedDocs);
    }

    async function runResponseRegeneration(
        response: MultiModelResponse,
        history: Message[],
        lastUserMessage: Message,
        update: (patch: Partial<MultiModelResponse>) => void
    ) {
        if (response.isLoading) return pushErrMsg(t('aiSidebar.errors.generating'));
        const config = getProviderAndModelConfig(response.provider, response.modelId);
        if (!config) return pushErrMsg(t('aiSidebar.info.noValidModel') || '无效的模型');
        if (
            !config.providerConfig ||
            (providerRequiresApiKey(response.provider) && !config.providerConfig.apiKey)
        ) {
            return pushErrMsg(t('aiSidebar.errors.noApiKey'));
        }

        update({
            isLoading: true,
            error: undefined,
            content: '',
            thinking: '',
            thinkingCollapsed: false,
            toolCalls: [],
        });
        const refreshedContext = await refreshContextDocuments(
            lastUserMessage.contextDocuments || [],
            async document => {
                const data = await exportMdContent(document.id, false, false, 2, 0, false);
                return data?.content;
            }
        );
        const userContent = getMessageText(lastUserMessage.content);
        const preparedUserMessage: Message = {
            ...lastUserMessage,
            content: userContent,
            contextDocuments: refreshedContext.length ? refreshedContext : undefined,
        };
        const messagesToSend = await prepareMessagesForAI(
            history,
            refreshedContext,
            userContent,
            preparedUserMessage,
            Boolean(
                config.modelConfig.capabilities?.thinking &&
                (response.thinkingEnabled ?? config.modelConfig.thinkingEnabled)
            ),
            config.modelConfig.id
        );
        lastPreparedContextTokens = estimateMessagesContextTokens(messagesToSend);
        await runMultiModelTargets({
            targets: [{ choice: response, ...config }],
            messages: messagesToSend,
            signal: new AbortController().signal,
            mode: chatMode,
            temperature: tempModelSettings.temperatureEnabled
                ? tempModelSettings.temperature
                : undefined,
            isActive: () => true,
            processContent: async content =>
                saveBase64ImagesInContent(convertLatexToMarkdown(content)),
            update: (_index, patch) => update(patch),
            settled: () => undefined,
        });
    }

    async function regenerateModelResponse(index: number) {
        const response = multiModelResponses[index];
        if (!response) return pushErrMsg(t('aiSidebar.errors.noMessage'));
        const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
        if (!lastUserMessage) return pushErrMsg(t('aiSidebar.errors.noUserMessage'));
        await runResponseRegeneration(response, messages, lastUserMessage, patch => {
            if (!multiModelResponses[index]) return;
            multiModelResponses[index] = { ...multiModelResponses[index], ...patch };
            multiModelResponses = [...multiModelResponses];
        });
    }

    async function regenerateHistoryModelResponse(
        absMessageIndex: number,
        responseIndex: number
    ) {
        const message = messages[absMessageIndex];
        const response = message?.multiModelResponses?.[responseIndex] as
            | MultiModelResponse
            | undefined;
        if (!response) return pushErrMsg(t('aiSidebar.errors.noMessage'));
        const lastUserMessage = messages
            .slice(0, absMessageIndex)
            .reverse()
            .find(item => item.role === 'user');
        if (!lastUserMessage) return pushErrMsg(t('aiSidebar.errors.noUserMessage'));
        await runResponseRegeneration(
            response,
            messages.slice(0, absMessageIndex),
            lastUserMessage,
            patch => {
                const target = messages[absMessageIndex]?.multiModelResponses?.[responseIndex];
                if (!target) return;
                messages[absMessageIndex].multiModelResponses[responseIndex] = {
                    ...target,
                    ...patch,
                };
                messages = [...messages];
            }
        );
    }

    // Agent 模式
    let isToolSelectorOpen = false;
    let toolAutoApproveSettings: Record<string, boolean> = {}; // 所有工具的 autoApprove 配置（包括未选中的）
    let toolAutoApproveSettingsAsk: Record<string, boolean> = {}; // 问答模式所有工具的 autoApprove 配置

    // 记忆当前选择的模式
    $: if (chatMode && settings && !isInitialLoading) {
        // 同步到临时设置以便在预设按钮中正确显示
        if (tempModelSettings.chatMode !== chatMode) {
            tempModelSettings.chatMode = chatMode;
        }
        if (settings.lastUsedChatMode !== chatMode) {
            settings.lastUsedChatMode = chatMode;
            plugin.saveSettings(settings);
        }
    }
    function setChatMode(nextMode: ChatMode) {
        chatMode = nextMode;
    }

    function toggleChatMode() {
        setChatMode(chatMode === 'plan' ? 'build' : 'plan');
    }

    function getLocalizedChatModeLabel(mode: ChatMode): string {
        return t(`aiSidebar.mode.${mode}`) || getChatModeLabel(mode);
    }

    function getLocalizedChatModeDescription(mode: ChatMode): string {
        return t(`aiSidebar.mode.${mode}Description`) || getChatModeDescription(mode);
    }

    function getConnectionLabel(status: ConnectionStatus) {
        if (status.state === 'connected') return '已连接';
        if (status.state === 'connecting') return '连接中';
        return '未连接';
    }

    let toolCallsInProgress: Set<string> = new Set(); // 正在执行的工具调用ID
    let toolCallsExpanded: Record<string, boolean> = {}; // 工具调用是否展开，默认折叠
    let toolCallResultsExpanded: Record<string, boolean> = {}; // 工具结果是否展开，默认折叠
    let openCodeToolParts: any[] = []; // OpenCode 工具调用实时状态

    async function appendStreamingThinking(chunk: string) {
        if (!chunk) return;
        isThinkingPhase = true;
        streamingThinking += chunk;
        const lastItem = openCodeTimeline[openCodeTimeline.length - 1];
        if (lastItem?.type === 'thinking') {
            openCodeTimeline = openCodeTimeline.map(item =>
                item.id === lastItem.id && item.type === 'thinking'
                    ? { ...item, content: item.content + chunk }
                    : item
            );
        } else {
            openCodeTimeline = [
                ...openCodeTimeline,
                {
                    type: 'thinking',
                    id: `thinking-${Date.now()}-${openCodeTimelineCounter++}`,
                    content: chunk,
                },
            ];
        }
        if (!streamingThinkingCollapsed) {
            await scrollToBottom();
        }
    }

    function appendOpenCodeTimelineText(chunk: string) {
        if (!chunk) return;

        const lastItem = openCodeTimeline[openCodeTimeline.length - 1];
        if (lastItem?.type === 'text' && !lastItem.isFinal) {
            openCodeTimeline = openCodeTimeline.map((item, index) =>
                index === openCodeTimeline.length - 1 && item.type === 'text'
                    ? { ...item, content: item.content + chunk }
                    : item
            );
            return;
        }

        openCodeTimeline = [
            ...openCodeTimeline,
            {
                type: 'text',
                id: `text-${Date.now()}-${openCodeTimelineCounter++}`,
                content: chunk,
            },
        ];
    }

    function getOpenCodeFinalAnswer(message: Message): string {
        if (typeof message.finalReply === 'string' && message.finalReply.trim()) {
            return message.finalReply;
        }
        return typeof message.content === 'string' ? message.content : '';
    }

    function getOpenCodeProcessTimeline(message: Message): OpenCodeTimelineItem[] {
        const timeline = message.openCodeTimeline || [];
        const finalAnswer = getOpenCodeFinalAnswer(message).trim();
        if (!finalAnswer) return timeline;

        let lastTextIndex = -1;
        for (let index = timeline.length - 1; index >= 0; index--) {
            const item = timeline[index];
            if (item.type === 'text' && item.content.trim() === finalAnswer) {
                lastTextIndex = index;
                break;
            }
        }

        if (lastTextIndex < 0) return timeline;
        return timeline.filter((_item, index) => index !== lastTextIndex);
    }

    function finishStreamingThinking(collapseKey?: string | number) {
        isThinkingPhase = false;
        if (collapseKey !== undefined) {
            thinkingCollapsed = {
                ...thinkingCollapsed,
                [collapseKey]: true,
            };
        }
    }

    function resetOpenCodeTimeline() {
        openCodeTimeline = [];
        openCodeTimelineCounter = 0;
        if (timelineCollapsed['opencode-timeline-streaming'] !== undefined) {
            const nextTimelineCollapsed = { ...timelineCollapsed };
            delete nextTimelineCollapsed['opencode-timeline-streaming'];
            timelineCollapsed = nextTimelineCollapsed;
        }
    }

    function cloneOpenCodeTimelineItems(items: OpenCodeTimelineItem[]) {
        return items.map(item => {
            if (item.type === 'tool') {
                return { ...item, toolPart: { ...item.toolPart } };
            }
            return { ...item };
        });
    }

    function cloneOpenCodeTimeline() {
        return cloneOpenCodeTimelineItems(openCodeTimeline);
    }

    function updateOpenCodeToolPart(update: any) {
        if (!update) return;
        isThinkingPhase = false;

        const updateKey = getOpenCodeToolPartKey(update);
        const isTerminalStatus = update.status === 'completed' || update.status === 'error';
        const existingIndex = openCodeToolParts.findIndex(
            (part: any) => getOpenCodeToolPartKey(part) === updateKey
        );

        if (existingIndex >= 0) {
            const next = [...openCodeToolParts];
            next[existingIndex] = { ...next[existingIndex], ...update };
            openCodeToolParts = next;
        } else {
            openCodeToolParts = [...openCodeToolParts, update];
        }

        const timelineToolIndex = openCodeTimeline.findIndex(
            item => item.type === 'tool' && getOpenCodeToolPartKey(item.toolPart) === updateKey
        );
        if (timelineToolIndex >= 0) {
            openCodeTimeline = openCodeTimeline.map((item, index) =>
                index === timelineToolIndex && item.type === 'tool'
                    ? { ...item, toolPart: { ...item.toolPart, ...update } }
                    : item
            );
        } else {
            openCodeTimeline = [
                ...openCodeTimeline,
                {
                    type: 'tool',
                    id: `tool-${updateKey}-${openCodeTimelineCounter++}`,
                    toolPart: { ...update },
                },
            ];
        }

        if (isTerminalStatus) {
            toolCallsExpanded = {
                ...toolCallsExpanded,
                [updateKey]: false,
            };
        } else if (toolCallsExpanded[updateKey] === undefined) {
            toolCallsExpanded = {
                ...toolCallsExpanded,
                [updateKey]: true,
            };
        }

        if (!streamingToolCallsCollapsed) {
            scrollToBottom();
        }
    }

    function handleOpenCodePermissionAsked(req: any) {
        activePermissionRequest = {
            permissionID: req.permissionID,
            sessionID: req.sessionID,
            tool: req.tool,
            input: req.input || req.description || '',
            description: req.description || '',
        };
    }

    // 权限确认对话框
    let activePermissionRequest: { permissionID: string; sessionID: string; tool: string; input: string; description: string } | null = null;
    let activeQuestionRequest: QuestionRequest | null = null;
    let questionDrafts: Array<{ selected: string[]; custom: string }> = [];
    let activeDiagnosticLogger: DiagnosticLogger | null = null;
    const closedDiagnosticRunIds = new Set<string>();

    async function startDiagnosticLog(userContent: string, modelConfig: any): Promise<DiagnosticLogger | null> {
        const mode = (settings?.diagnosticLogMode || 'off') as DiagnosticLogMode;
        if (!shouldStartDiagnosticLog(mode)) return null;

        try {
            const level = (settings?.diagnosticLogLevel === 'full' ? 'full' : 'safe') as DiagnosticLogLevel;
            const logger = createDiagnosticLogger({
                level,
                sessionId: currentSessionId || undefined,
                putFile,
            });
            activeDiagnosticLogger = logger;

            settings.diagnosticLastLogPath = logger.filePath;
            if (mode === 'next') {
                settings.diagnosticLogMode = 'off';
            }
            await plugin.saveSettings(settings);
            updateSettings(JSON.parse(JSON.stringify(settings)));

            await logger.log('run.started', {
                provider: currentProvider,
                model: modelConfig?.id,
                chatMode,
                sessionId: currentSessionId,
                userPromptChars: userContent.length,
                userPromptPreview: userContent,
                level,
            });
            pushMsg(`OpenCode 诊断日志已开启：${logger.filePath}`);
            return logger;
        } catch (err) {
            console.warn('[Diagnostic] Failed to start diagnostic log:', err);
            pushErrMsg(`诊断日志开启失败：${(err as Error).message}`);
            return null;
        }
    }

    async function closeDiagnosticLog(logger: DiagnosticLogger | null, event: string, data?: unknown) {
        if (!logger) return;
        if (closedDiagnosticRunIds.has(logger.runId)) return;
        closedDiagnosticRunIds.add(logger.runId);
        if (activeDiagnosticLogger === logger) {
            activeDiagnosticLogger = null;
        }
        try {
            await logger.close(event, data);
            pushMsg(`OpenCode 诊断日志已保存：${logger.filePath}`);
        } catch (err) {
            console.warn('[Diagnostic] Failed to close diagnostic log:', err);
        }
    }

    async function handlePermissionResponse(response: 'once' | 'always' | 'reject') {
        if (!activePermissionRequest) return;
        const req = activePermissionRequest;
        activePermissionRequest = null;
        try {
            void activeDiagnosticLogger?.log('permission.replied', {
                permissionID: req.permissionID,
                sessionID: req.sessionID,
                tool: req.tool,
                response,
            });
            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
            const { respondToPermission } = await import('./ai-chat');
            await respondToPermission(serverUrl, req.sessionID, req.permissionID, response);
        } catch (err) {
            console.warn('[Permission] Failed to respond:', err);
        }
    }

    function handleOpenCodeQuestionAsked(req: QuestionRequest) {
        activeQuestionRequest = req;
        questionDrafts = req.questions.map((question) => ({
            selected: question.multiple ? [] : (question.options[0]?.label ? [question.options[0].label] : []),
            custom: '',
        }));
    }

    function toggleQuestionOption(questionIndex: number, option: string, multiple?: boolean) {
        questionDrafts = questionDrafts.map((draft, index) => {
            if (index !== questionIndex) return draft;
            if (!multiple) {
                return { ...draft, selected: [option] };
            }
            const exists = draft.selected.includes(option);
            return {
                ...draft,
                selected: exists
                    ? draft.selected.filter((item) => item !== option)
                    : [...draft.selected, option],
            };
        });
    }

    function updateQuestionCustom(questionIndex: number, value: string) {
        questionDrafts = questionDrafts.map((draft, index) =>
            index === questionIndex ? { ...draft, custom: value } : draft
        );
    }

    function buildQuestionAnswers(): string[][] {
        if (!activeQuestionRequest) return [];
        return activeQuestionRequest.questions.map((_question, index) => {
            const draft = questionDrafts[index] || { selected: [], custom: '' };
            const answers = [...draft.selected];
            const custom = draft.custom.trim();
            if (custom) answers.push(custom);
            return answers;
        });
    }

    async function submitQuestionAnswer() {
        if (!activeQuestionRequest) return;
        const answers = buildQuestionAnswers();
        const hasAnswer = answers.every((answer) => answer.length > 0);
        if (!hasAnswer) {
            pushErrMsg('请先选择或输入回答');
            return;
        }
        const request = activeQuestionRequest;
        activeQuestionRequest = null;
        questionDrafts = [];
        try {
            void activeDiagnosticLogger?.log('question.replied', {
                requestID: request.requestID,
                sessionID: request.sessionID,
                answers,
            });
            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
            const { replyToQuestion } = await import('./ai-chat');
            const ok = await replyToQuestion(serverUrl, request.requestID, answers);
            if (!ok) {
                pushErrMsg('回答发送失败，请检查 OpenCode 服务状态');
            }
        } catch (err) {
            console.warn('[Question] Failed to reply:', err);
            pushErrMsg('回答发送失败');
        }
    }

    async function rejectQuestionAnswer() {
        if (!activeQuestionRequest) return;
        const request = activeQuestionRequest;
        activeQuestionRequest = null;
        questionDrafts = [];
        try {
            void activeDiagnosticLogger?.log('question.rejected', {
                requestID: request.requestID,
                sessionID: request.sessionID,
            });
            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
            const { rejectQuestion } = await import('./ai-chat');
            await rejectQuestion(serverUrl, request.requestID);
        } catch (err) {
            console.warn('[Question] Failed to reject:', err);
        }
    }
    type PendingDocDiff = {
        docId: string;
        docTitle: string;
        oldDocTitle: string;
        newDocTitle: string;
        oldContent: string;
        newContent: string;
        affectedBlockIds: Set<string>;
    };
    const pendingDocDiffsByMessage = new Map<number, Map<string, PendingDocDiff>>();
    let lastSavedToolsConfigSnapshot = JSON.stringify({
        selectedTools: [],
        toolAutoApproveSettings: {},
    }); // 最近一次已加载/已保存的工具配置快照
    let thinkingBeforeToolCalls: string = ''; // 工具调用前的思考内容

    // 多模型对话
    let enableMultiModel = false; // 多模型已禁用
    let selectedMultiModels: MultiModelChoice[] = [];
    let multiModelResponses: MultiModelResponse[] = [];
    let isWaitingForAnswerSelection = false; // 是否在等待用户选择答案
    let selectedAnswerIndex: number | null = null; // 用户选择的答案索引
    let multiModelLayout: 'card' | 'tab' = 'tab'; // 多模型布局模式：card 或 tab（会在初始化时从设置读取）
    let selectedTabIndex: number = 0; // 当前选中的页签索引

    let saveToNoteDialog: SaveToNoteDialog;

    // 订阅设置变化
    let unsubscribe: () => void;

    onMount(async () => {
        settings = await plugin.loadSettings();

        // 迁移旧设置到新结构
        migrateOldSettings();

        // 初始化提供商和模型信息
        providers = settings.aiProviders || {};
        currentProvider = settings.currentProvider || '';
        currentModelId = settings.currentModelId || '';

        // 补充已有模型缺失的 capabilities（防止旧数据无 thinking 能力标识）
        for (const [pid, providerData] of Object.entries(providers)) {
            if (pid === 'customProviders' || pid === 'disabledBuiltInProviders' || pid === 'providerOrder') continue;
            if (Array.isArray(providerData)) continue;
            const cfg = providerData as any;
            if (cfg && cfg.models && Array.isArray(cfg.models)) {
                let changed = false;
                for (const m of cfg.models) {
                    if (!m.capabilities) {
                        const caps = getModelCapabilities(m.id);
                        if (Object.keys(caps).length > 0) {
                            m.capabilities = caps;
                            changed = true;
                        }
                    } else if (!m.capabilities.thinking) {
                        const caps = getModelCapabilities(m.id);
                        if (caps.thinking) {
                            m.capabilities.thinking = true;
                            changed = true;
                        }
                    }
                }
                if (changed) {
                    cfg.models = [...cfg.models];
                }
            }
        }

        // 初始化模式
        if (!settings.selectedModelPresetId && settings.lastUsedChatMode) {
            chatMode = settings.lastUsedChatMode === 'build' ? 'build' : 'plan';
        }

        // 初始化多模型选择，过滤掉无效的模型
        selectedMultiModels = (settings.selectedMultiModels || []).filter(model => {
            const config = getProviderAndModelConfig(model.provider, model.modelId);
            return config !== null; // 只保留有效的模型
        });

        // 如果过滤后的模型列表与原列表不同，保存更新后的列表
        if (selectedMultiModels.length !== (settings.selectedMultiModels || []).length) {
            settings.selectedMultiModels = selectedMultiModels;
            await plugin.saveSettings(settings);
        }

        // 初始化字体大小设置
        messageFontSize = settings.messageFontSize || 12;

        // 初始化多模型视图样式设置
        multiModelViewMode = settings.multiModelViewMode || 'tab';
        multiModelLayout = multiModelViewMode; // 同时初始化多模型布局

        // 加载历史会话
        await loadSessions();

        // 加载提示词
        await loadPrompts();

        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
        }

        // 如果有初始消息，自动填充到输入框
        if (initialMessage) {
            currentInput = initialMessage;
            // 在dialog模式下，自动聚焦输入框
            if (mode === 'dialog') {
                await tick();
                textareaElement?.focus();
            }
        }

        // 订阅设置变化
        unsubscribe = settingsStore.subscribe(newSettings => {
            if (newSettings && Object.keys(newSettings).length > 0) {
                // 更新本地设置
                settings = newSettings;

                // 更新提供商信息
                if (newSettings.aiProviders) {
                    providers = newSettings.aiProviders;
                }

                // 更新当前选择（如果设置中有保存）
                if (Object.prototype.hasOwnProperty.call(newSettings, 'currentProvider')) {
                    currentProvider = newSettings.currentProvider || '';
                }
                if (Object.prototype.hasOwnProperty.call(newSettings, 'currentModelId')) {
                    currentModelId = newSettings.currentModelId || '';
                }

                // 更新多模型选择，过滤掉无效的模型
                if (newSettings.selectedMultiModels !== undefined) {
                    const validModels = newSettings.selectedMultiModels.filter(model => {
                        const config = getProviderAndModelConfig(model.provider, model.modelId);
                        return config !== null;
                    });
                    selectedMultiModels = validModels;

                    // 如果过滤后的模型列表与原列表不同，更新设置
                    if (validModels.length !== newSettings.selectedMultiModels.length) {
                        settings.selectedMultiModels = validModels;
                        // 异步保存设置
                        plugin.saveSettings(settings).catch(err => {
                            console.error('Failed to save filtered multi-models:', err);
                        });
                    }
                }

                // 实时更新字体大小设置
                if (newSettings.messageFontSize !== undefined) {
                    messageFontSize = newSettings.messageFontSize;
                }

                // 实时更新多模型视图样式设置
                if (newSettings.multiModelViewMode !== undefined) {
                    multiModelViewMode = newSettings.multiModelViewMode;
                    multiModelLayout = newSettings.multiModelViewMode; // 同步更新多模型布局
                }

                // 更新系统提示词
                if (settings.aiSystemPrompt && messages.length === 0) {
                    messages = [{ role: 'system', content: settings.aiSystemPrompt }];
                } else if (settings.aiSystemPrompt && messages[0]?.role === 'system') {
                    messages[0].content = settings.aiSystemPrompt;
                }

                // console.debug('AI Sidebar: ' + t('common.configComplete'));
            }
        });

        // 添加全局点击事件监听器
        document.addEventListener('click', handleClickOutside);
        // 添加全局滚动事件监听器以关闭右键菜单
        document.addEventListener('scroll', closeContextMenu, true);
        // 添加全局复制事件监听器
        document.addEventListener('copy', handleCopyEvent);
        window.addEventListener('resize', updateTokenPopoverPosition);
        // 监听文档总结事件
        window.addEventListener(SUMMARY_EVENT, handleSummarizeDoc as EventListener);

        // Auto-fetch OpenCode models on startup (merge with existing settings)
        if (settings.aiProviders?.opencode) {
            const existingModels = settings.aiProviders.opencode.models || [];
            const needsFetch = shouldRefreshOpenCodeModelCatalog(existingModels);
            if (needsFetch) {
                try {
                    const providerConfig = settings.aiProviders.opencode;
                    const serverUrl = providerConfig?.serverUrl || 'http://localhost:4096';
                    invalidateModelCache(serverUrl);
                    const models = await fetchModels('opencode', '', serverUrl);
                    if (models && models.length > 0) {
                        // 合并逻辑：保留已有模型的用户设置（hidden/temperature/thinkingEnabled 等）
                        const modelConfigs = models.map(m => {
                            const existing = findModelById(existingModels, m.id, m.providerID);
                            const capabilities = getModelCapabilities(m.id);
                            if (m.enableThinking) {
                                capabilities.thinking = true;
                            }
                            if (existing) {
                                // 保留用户设置，更新 capabilities 和 name
                                return {
                                    ...existing,
                                    name: m.name,
                                    providerID: m.providerID || existing.providerID,
                                    contextLimit: m.contextLimit || existing.contextLimit,
                                    outputLimit: m.outputLimit || existing.outputLimit,
                                    maxTokens: m.outputLimit || existing.maxTokens,
                                    capabilities: Object.keys(capabilities).length > 0 ? capabilities : existing.capabilities,
                                };
                            }
                            // 新模型：使用默认值
                            return {
                                id: m.id,
                                name: m.name,
                                temperature: 0.7,
                                maxTokens: m.outputLimit || 4096,
                                contextLimit: m.contextLimit,
                                outputLimit: m.outputLimit,
                                providerID: m.providerID,
                                capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
                                thinkingEnabled: m.enableThinking ?? false,
                                thinkingEffort: m.reasoningEffort ?? 'low',
                                hidden: false,
                            };
                        });
                        settings.aiProviders.opencode.models = uniqueOpenCodeModelRefs(modelConfigs);
                        if (!settings.currentProvider) {
                            settings.currentProvider = 'opencode';
                        }
                        if (!settings.currentModelId || !findModelById(settings.aiProviders.opencode.models, settings.currentModelId)) {
                            settings.currentModelId = settings.aiProviders.opencode.models[0].id;
                        }
                        providers = settings.aiProviders;
                        currentProvider = settings.currentProvider;
                        currentModelId = settings.currentModelId;
                        await plugin.saveData('settings.json', settings);
                        updateSettings(JSON.parse(JSON.stringify(settings)));
                    }
                } catch (e) {
                    console.warn('Auto-fetch OpenCode models failed:', e);
                }
            }
        }

        isInitialLoading = false;
    });

    onDestroy(async () => {
        // 取消订阅
        if (unsubscribe) {
            unsubscribe();
        }

        // 移除全局点击事件监听器
        document.removeEventListener('click', handleClickOutside);
        // 移除全局滚动事件监听器
        document.removeEventListener('scroll', closeContextMenu, true);
        // 移除全局复制事件监听器
        document.removeEventListener('copy', handleCopyEvent);
        window.removeEventListener('resize', updateTokenPopoverPosition);
        // 移除文档总结事件监听器
        window.removeEventListener(SUMMARY_EVENT, handleSummarizeDoc as EventListener);
        if (savePathSearchTimeout) {
            clearTimeout(savePathSearchTimeout);
            savePathSearchTimeout = null;
        }
        revokeLoadedAssetUrls();

        // 如果有未保存的更改，自动保存当前会话
        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            await saveCurrentSession(true); // 静默保存，不显示提示
        }
    });

    // 迁移旧设置到新结构
    function migrateOldSettings() {
        if (!settings.aiProviders && settings.aiProvider && settings.aiApiKey) {
            // 创建新的提供商结构
            if (!settings.aiProviders) {
                settings.aiProviders = {
                    gemini: { apiKey: '', customApiUrl: '', models: [] },
                    deepseek: { apiKey: '', customApiUrl: '', models: [] },
                    openai: { apiKey: '', customApiUrl: '', models: [] },
                    volcano: { apiKey: '', customApiUrl: '', models: [] },
                    opencode: { serverUrl: 'http://localhost:4096', models: [] },
                    customProviders: [],
                    disabledBuiltInProviders: [],
                    providerOrder: [],
                };
            }

            // 迁移旧的设置
            const oldProvider = settings.aiProvider;
            if (settings.aiProviders[oldProvider]) {
                settings.aiProviders[oldProvider].apiKey = settings.aiApiKey || '';
                settings.aiProviders[oldProvider].customApiUrl = settings.aiCustomApiUrl || '';

                // 如果有模型，添加到列表
                if (settings.aiModel) {
                    settings.aiProviders[oldProvider].models = [
                        {
                            id: settings.aiModel,
                            name: settings.aiModel,
                            temperature: settings.aiTemperature || 1,
                            maxTokens: settings.aiMaxTokens || -1,
                        },
                    ];
                    settings.currentProvider = oldProvider;
                    settings.currentModelId = settings.aiModel;
                }
            }

            // 保存迁移后的设置
            plugin.saveSettings(settings);
        }

        // 确保 customProviders 数组存在
        if (settings.aiProviders && !settings.aiProviders.customProviders) {
            settings.aiProviders.customProviders = [];
        }

        // 确保 disabledBuiltInProviders 数组存在
        if (settings.aiProviders && !settings.aiProviders.disabledBuiltInProviders) {
            settings.aiProviders.disabledBuiltInProviders = [];
        }

        // 确保 providerOrder 数组存在
        if (settings.aiProviders && !settings.aiProviders.providerOrder) {
            settings.aiProviders.providerOrder = [];
        }
    }

    // 自动调整textarea高度
    function autoResizeTextarea() {
        if (textareaElement) {
            textareaElement.style.height = 'auto';
            textareaElement.style.height = Math.min(textareaElement.scrollHeight, 200) + 'px';
        }
    }

    // 监听输入变化
    $: {
        currentInput;
        tick().then(autoResizeTextarea);
    }

    // 当消息、多模型响应或选择页签/答案变化时，高亮代码块
    $: {
        // 保持对变量的引用以便 Svelte 触发依赖
        messages;
        multiModelResponses;
        selectedTabIndex;
        selectedAnswerIndex;
        thinkingCollapsed;
        streamingMessage;
        streamingThinking;

        tick().then(async () => {
            if (messagesContainer) {
                // 等待DOM完全更新后再处理代码块
                await tick();
                await tick();
                highlightCodeBlocks(messagesContainer);
                await tick();
                cleanupCodeBlocks(messagesContainer);
                renderMathFormulas(messagesContainer);
                setupBlockRefLinks(messagesContainer);
                setupImageClickHandlers(messagesContainer, openImageViewer);
            }
        });
    }

    async function addAttachmentFile(file: File) {
        isUploadingFile = true;
        try {
            await attachmentWorkflow.addFile(file);
        } catch (error) {
            const code = (error as Error).message;
            if (code === 'unsupported') pushErrMsg(t('aiSidebar.errors.textAndImageOnly'));
            else if (code === 'too_large') pushErrMsg(t('aiSidebar.errors.fileTooLarge'));
            else pushErrMsg(t('aiSidebar.errors.addFileFailed'));
        } finally {
            isUploadingFile = attachmentController.isSaving;
        }
    }

    async function handlePaste(event: ClipboardEvent) {
        isUploadingFile = true;
        try {
            await attachmentWorkflow.addFromPaste(event);
        } catch (error) {
            console.error('Paste attachment error:', error);
            pushErrMsg(t('aiSidebar.errors.addFileFailed'));
        } finally {
            isUploadingFile = attachmentController.isSaving;
        }
    }

    async function waitForPendingAttachmentSaves() {
        await attachmentController.waitForPendingSaves();
    }

    function triggerFileUpload() {
        isAddMenuOpen = false;
        fileInputElement?.click();
    }

    function triggerImageUpload() {
        isAddMenuOpen = false;
        imageInputElement?.click();
    }

    async function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            isUploadingFile = true;
            try {
                await attachmentWorkflow.addFiles(Array.from(input.files));
            } catch (error) {
                console.error('Add files error:', error);
                pushErrMsg(t('aiSidebar.errors.addFileFailed'));
            } finally {
                isUploadingFile = attachmentController.isSaving;
            }
        }
        input.value = '';
    }

    async function addClipboardText() {
        isAddMenuOpen = false;
        try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) return pushErrMsg('剪贴板中没有可用文本');
            currentInput = currentInput.trimEnd()
                ? `${currentInput.trimEnd()}\n\n${text}`
                : text;
            await tick();
            autoResizeTextarea();
            textareaElement?.focus();
        } catch (error) {
            console.error('Read clipboard error:', error);
            pushErrMsg('无法读取剪贴板，请检查系统权限');
        }
    }

    function removeAttachment(index: number) {
        attachmentController.remove(index);
    }

    function openWebLinkDialog() {
        isWebLinkDialogOpen = true;
        webLinkInput = '';
    }

    function closeWebLinkDialog() {
        isWebLinkDialogOpen = false;
        webLinkInput = '';
    }

    async function fetchWebPages() {
        const links = webLinkInput.split('\n').map(link => link.trim()).filter(Boolean);
        if (!links.length) return pushErrMsg('请输入至少一个链接');
        isFetchingWebContent = true;
        try {
            if (await attachmentWorkflow.addWebPages(links)) closeWebLinkDialog();
        } catch (error) {
            console.error('Fetch web pages error:', error);
            pushErrMsg('获取网页内容失败');
        } finally {
            isFetchingWebContent = false;
        }
    }

    function isAtBottom() {
        if (!messagesContainer) return true;
        const threshold = 100; // 100px的阈值
        const scrollBottom =
            messagesContainer.scrollHeight -
            messagesContainer.scrollTop -
            messagesContainer.clientHeight;
        return scrollBottom < threshold;
    }

    // 处理滚动事件
    function handleScroll() {
        if (!messagesContainer) return;

        const atBottom = isAtBottom();

        // 如果用户滚动到底部附近，恢复自动滚动
        if (atBottom) {
            autoScroll = true;
        } else if (isLoading) {
            // 如果正在加载且用户滚动离开底部，停止自动滚动
            autoScroll = false;
        }
    }

    // 全屏切换
    function toggleFullscreen() {
        if (!sidebarContainer) return;
        isFullscreen = !isFullscreen;
    }

    // 滚动到底部
    async function scrollToBottom(force = false) {
        await tick();
        if (messagesContainer && (force || autoScroll)) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // 滚动到顶部
    async function scrollToTop() {
        await tick();
        if (messagesContainer) {
            messagesContainer.scrollTop = 0;
        }
    }

    // 切换模型
    function handleModelSelect(event: CustomEvent<{ provider: string; modelId: string }>) {
        const { provider, modelId } = event.detail;
        currentProvider = provider;
        currentModelId = modelId;

        // 保存选择
        settings.currentProvider = provider;
        settings.currentModelId = modelId;
        plugin.saveSettings(settings);
        isStatusMenuOpen = false;
        isModelSelectorOpen = false;
    }

    // 处理多模型选择变化
    function handleMultiModelChange(
        event: CustomEvent<
            Array<{
                provider: string;
                modelId: string;
                thinkingEnabled?: boolean;
                thinkingEffort?: ThinkingEffort;
            }>
        >
    ) {
        selectedMultiModels = event.detail;

        // 保存到设置中
        settings.selectedMultiModels = event.detail;
        plugin.saveSettings(settings);
    }

    // 处理多模型开关切换
    function handleToggleMultiModel(event: CustomEvent<boolean>) {
        enableMultiModel = event.detail;

        // 如果禁用多模型,清除相关状态
        if (!enableMultiModel) {
            multiModelResponses = [];
            isWaitingForAnswerSelection = false;
            selectedAnswerIndex = null;
        }
    }

    // 处理多模型中模型的思考模式切换
    function handleToggleModelThinking(
        event: CustomEvent<{ provider: string; modelId: string; enabled: boolean }>
    ) {
        const { provider, modelId, enabled } = event.detail;

        // 查找并更新 provider 中对应模型的 thinkingEnabled 设置
        let providerConfig: any = null;

        // 检查是否是内置平台
        if (providers[provider] && !Array.isArray(providers[provider])) {
            providerConfig = providers[provider];
        } else if (providers.customProviders && Array.isArray(providers.customProviders)) {
            // 检查是否是自定义平台
            providerConfig = providers.customProviders.find((p: any) => p.id === provider);
        }

        if (providerConfig && providerConfig.models) {
            const model = providerConfig.models.find((m: any) => m.id === modelId);
            if (model) {
                model.thinkingEnabled = enabled;
                // 触发响应式更新
                providers = { ...providers };
                // 保存设置
                settings.aiProviders = providers;
                plugin.saveSettings(settings);
            }
        }
    }

    // 处理模型设置应用
    async function handleApplyModelSettings(
        event: CustomEvent<{
            contextCount: number;
            temperature: number;
            temperatureEnabled: boolean;
            systemPrompt: string;
            modelSelectionEnabled?: boolean;
            selectedModels?: Array<{
                provider: string;
                modelId: string;
                thinkingEnabled?: boolean;
                thinkingEffort?: ThinkingEffort;
            }>;
            enableMultiModel?: boolean;
            chatMode?: 'plan' | 'build';
        }>
    ) {
        const newSettings = event.detail;

        // 更新tempModelSettings，保持所有字段的状态
        tempModelSettings = {
            contextCount: newSettings.contextCount,
            temperature: newSettings.temperature,
            temperatureEnabled: newSettings.temperatureEnabled,
            systemPrompt: newSettings.systemPrompt,
            modelSelectionEnabled: newSettings.modelSelectionEnabled ?? false,
            selectedModels: newSettings.selectedModels || [],
            enableMultiModel: newSettings.enableMultiModel ?? false,
            chatMode: newSettings.chatMode ?? 'plan',
        };

        // 应用聊天模式
        if (newSettings.chatMode) {
            chatMode = newSettings.chatMode;
        }

        // 如果启用了模型选择
        if (
            newSettings.modelSelectionEnabled &&
            newSettings.selectedModels &&
            newSettings.selectedModels.length > 0
        ) {
            // 只有ask模式才能启用多模型
            if (newSettings.enableMultiModel && newSettings.chatMode === 'plan') {
                // 多模型模式
                enableMultiModel = true;

                // 先更新设置对象
                settings.selectedMultiModels = [...newSettings.selectedModels];

                // 然后更新本地变量
                selectedMultiModels = [...newSettings.selectedModels];

                // 最后保存设置
                await plugin.saveSettings(settings);
            } else {
                // 单模型模式
                enableMultiModel = false;
                const selectedModel = newSettings.selectedModels[0];
                if (selectedModel) {
                    // 先更新设置对象（包括selectedProviderId）
                    settings.selectedProviderId = selectedModel.provider;
                    settings.currentProvider = selectedModel.provider;
                    settings.currentModelId = selectedModel.modelId;

                    // 然后更新本地变量
                    currentProvider = selectedModel.provider;
                    currentModelId = selectedModel.modelId;

                    // 最后保存设置
                    await plugin.saveSettings(settings);
                }
            }
        } else {
            // 如果未启用模型选择，确保禁用多模型模式
            enableMultiModel = false;
        }
    }

    // 获取当前提供商配置
    function getCurrentProviderConfig() {
        if (!currentProvider) return null;

        // 检查是否是内置平台
        if (providers[currentProvider] && !Array.isArray(providers[currentProvider])) {
            return providers[currentProvider];
        }

        // 检查是否是自定义平台
        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            return providers.customProviders.find((p: any) => p.id === currentProvider);
        }

        return null;
    }

    // 获取当前模型配置
    function getCurrentModelConfig() {
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig || !currentModelId) {
            return null;
        }
        return findModelById(providerConfig.models || [], currentModelId);
    }

    function getLatestCurrentModelConfig(): any {
        if (!currentProvider || !currentModelId) return null;
        const configuredProviders = settings.aiProviders || {};
        const providerConfig =
            configuredProviders.customProviders?.find(
                (provider: any) => provider.id === currentProvider
            ) ||
            configuredProviders[currentProvider] ||
            getCurrentProviderConfig();
        return findModelById(providerConfig?.models || [], currentModelId);
    }

    $: currentReactiveModelConfig = getLatestCurrentModelConfig();
    $: showThinkingToggle = Boolean(currentReactiveModelConfig?.capabilities?.thinking);
    $: isThinkingModeEnabled =
        showThinkingToggle && Boolean(currentReactiveModelConfig?.thinkingEnabled);
    $: showWebSearchToggle =
        currentModelId.toLowerCase().startsWith('gemini') &&
        Boolean(currentReactiveModelConfig?.capabilities?.webSearch);
    $: isWebSearchModeEnabled =
        showWebSearchToggle && Boolean(currentReactiveModelConfig?.webSearchEnabled);
    $: showThinkingEffortSelector = isThinkingModeEnabled;
    $: isCurrentModelGemini = isSupportedThinkingGeminiModel(currentModelId);
    $: isCurrentModelGemini3 = isGemini3Model(currentModelId);
    $: currentThinkingEffort =
        (currentReactiveModelConfig?.thinkingEffort || 'low') as ThinkingEffort;
    $: currentThinkingSelectValue = (
        showThinkingToggle && isThinkingModeEnabled ? currentThinkingEffort : 'off'
    ) as ThinkingSelectValue;
    $: composerStatusSummary = formatComposerStatusSummary({
        mode: chatMode,
        modelName: getCurrentModelConfig()?.name || currentModelId,
        thinking: currentThinkingSelectValue,
        supportsThinking: showThinkingToggle,
    });

    function closeComposerMenus() {
        isAddMenuOpen = false;
        isStatusMenuOpen = false;
        isModelSelectorOpen = false;
    }

    function toggleAddMenu() {
        const nextOpen = !isAddMenuOpen;
        closeComposerMenus();
        isPromptSelectorOpen = false;
        isTokenDetailsOpen = false;
        isAddMenuOpen = nextOpen;
    }

    function toggleStatusMenu() {
        const nextOpen = !isStatusMenuOpen;
        closeComposerMenus();
        isPromptSelectorOpen = false;
        isTokenDetailsOpen = false;
        isStatusMenuOpen = nextOpen;
    }

    function togglePromptList() {
        const nextState = getPromptMenuToggleState(isPromptSelectorOpen);
        isAddMenuOpen = nextState.addMenuOpen;
        isPromptSelectorOpen = nextState.promptListOpen;
        isStatusMenuOpen = nextState.statusMenuOpen;
        isModelSelectorOpen = false;
        isTokenDetailsOpen = false;
    }

    function selectComposerMode(mode: ChatMode) {
        setChatMode(mode);
        isStatusMenuOpen = false;
    }

    // 更新思考程度
    async function updateThinkingEffort(effort: ThinkingEffort) {
        if (!currentProvider || !currentModelId) {
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            return;
        }

        modelConfig.thinkingEffort = effort;

        // 获取提供商配置
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig) {
            return;
        }

        // 找到模型在数组中的索引并更新
        const modelIndex = providerConfig.models.findIndex((m: any) => m.id === currentModelId);
        if (modelIndex !== -1) {
            providerConfig.models[modelIndex] = { ...modelConfig };
            providerConfig.models = [...providerConfig.models];
        }

        // 更新 settings 并保存
        const isCustomProvider =
            settings.aiProviders.customProviders?.some((p: any) => p.id === currentProvider) ||
            false;

        if (isCustomProvider) {
            const customProviders = settings.aiProviders.customProviders || [];
            const customProviderIndex = customProviders.findIndex(
                (p: any) => p.id === currentProvider
            );
            if (customProviderIndex !== -1) {
                customProviders[customProviderIndex] = { ...providerConfig };
                settings = {
                    ...settings,
                    aiProviders: {
                        ...settings.aiProviders,
                        customProviders: [...customProviders],
                    },
                };
            }
        } else {
            settings = {
                ...settings,
                aiProviders: {
                    ...settings.aiProviders,
                    [currentProvider]: providerConfig,
                },
            };
        }

        providers = {
            ...providers,
            [currentProvider]: providerConfig,
        };

        await plugin.saveSettings(settings);
    }

    async function selectThinkingValue(nextValue: ThinkingSelectValue) {
        if (nextValue === 'off') {
            if (isThinkingModeEnabled) {
                await toggleThinkingMode();
            }
            isStatusMenuOpen = false;
            return;
        }

        if (!isThinkingModeEnabled) {
            await toggleThinkingMode();
        }
        await updateThinkingEffort(nextValue);
        isStatusMenuOpen = false;
    }

    async function handleThinkingSelectChange(event: Event) {
        const target = event.currentTarget as HTMLSelectElement;
        await selectThinkingValue(target.value as ThinkingSelectValue);
    }

    // 切换思考模式
    async function toggleThinkingMode() {
        if (!currentProvider || !currentModelId) {
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            return;
        }

        // 确保 capabilities 对象存在
        if (!modelConfig.capabilities) {
            modelConfig.capabilities = {};
        }

        // 只有当模型支持思考能力时，才能切换
        if (!modelConfig.capabilities.thinking) {
            return;
        }

        // 切换思考模式启用状态
        modelConfig.thinkingEnabled = !modelConfig.thinkingEnabled;

        // 获取提供商配置
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig) {
            return;
        }

        // 找到模型在数组中的索引并更新
        const modelIndex = providerConfig.models.findIndex((m: any) => m.id === currentModelId);
        if (modelIndex !== -1) {
            providerConfig.models[modelIndex] = { ...modelConfig };
            providerConfig.models = [...providerConfig.models];
        }

        // 更新 settings 并保存
        // 检查是否是自定义平台（通过检查 customProviders 数组）
        const isCustomProvider =
            settings.aiProviders.customProviders?.some((p: any) => p.id === currentProvider) ||
            false;

        if (isCustomProvider) {
            // 自定义平台：更新 customProviders 数组
            const customProviders = settings.aiProviders.customProviders || [];
            const customProviderIndex = customProviders.findIndex(
                (p: any) => p.id === currentProvider
            );
            if (customProviderIndex !== -1) {
                customProviders[customProviderIndex] = { ...providerConfig };
                settings = {
                    ...settings,
                    aiProviders: {
                        ...settings.aiProviders,
                        customProviders: [...customProviders],
                    },
                };
            }
        } else {
            // 内置平台：直接更新
            settings = {
                ...settings,
                aiProviders: {
                    ...settings.aiProviders,
                    [currentProvider]: providerConfig,
                },
            };
        }

        // 更新 providers 对象以触发响应式更新
        providers = {
            ...providers,
            [currentProvider]: providerConfig,
        };

        // 保存设置（settings 已经在上面更新过了）
        await plugin.saveSettings(settings);
    }

    // 切换联网模式
    async function toggleWebSearchMode() {
        if (!currentProvider || !currentModelId) {
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            return;
        }

        // 确保 capabilities 对象存在
        if (!modelConfig.capabilities) {
            modelConfig.capabilities = {};
        }

        // 只有当模型支持联网能力时，才能切换
        if (!modelConfig.capabilities.webSearch) {
            return;
        }

        // 切换联网模式启用状态
        modelConfig.webSearchEnabled = !modelConfig.webSearchEnabled;

        // 获取提供商配置
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig) {
            return;
        }

        // 找到模型在数组中的索引并更新
        const modelIndex = providerConfig.models.findIndex((m: any) => m.id === currentModelId);
        if (modelIndex !== -1) {
            providerConfig.models[modelIndex] = { ...modelConfig };
            providerConfig.models = [...providerConfig.models];
        }

        // 更新 settings 并保存
        const isCustomProvider =
            settings.aiProviders.customProviders?.some((p: any) => p.id === currentProvider) ||
            false;

        if (isCustomProvider) {
            const customProviders = settings.aiProviders.customProviders || [];
            const customProviderIndex = customProviders.findIndex(
                (p: any) => p.id === currentProvider
            );
            if (customProviderIndex !== -1) {
                customProviders[customProviderIndex] = { ...providerConfig };
                settings = {
                    ...settings,
                    aiProviders: {
                        ...settings.aiProviders,
                        customProviders: [...customProviders],
                    },
                };
            }
        } else {
            settings = {
                ...settings,
                aiProviders: {
                    ...settings.aiProviders,
                    [currentProvider]: providerConfig,
                },
            };
        }

        providers = {
            ...providers,
            [currentProvider]: providerConfig,
        };

        await plugin.saveSettings(settings);
    }

    // 获取指定提供商和模型的配置
    function getProviderAndModelConfig(provider: string, modelId: string) {
        let providerConfig: any = null;

        // 检查是否是内置平台
        if (providers[provider] && !Array.isArray(providers[provider])) {
            providerConfig = providers[provider];
        } else if (providers.customProviders && Array.isArray(providers.customProviders)) {
            // 检查是否是自定义平台
            providerConfig = providers.customProviders.find((p: any) => p.id === provider);
        }

        if (!providerConfig) return null;

        const modelConfig = findModelById(providerConfig.models || [], modelId);
        return { providerConfig, modelConfig };
    }

    function providerRequiresApiKey(provider: string) {
        return provider !== 'opencode';
    }

    function getUserDisplayName() {
        const configuredName = `${settings.userName || ''}`.trim();
        return configuredName || t('aiSidebar.messages.user') || 'User';
    }

    function getSessionExportContext() {
        return {
            userName: settings.userName,
            providers,
            currentProvider,
            currentModelId,
            userFallback: t('aiSidebar.messages.user') || 'User',
            assistantFallback: t('aiSidebar.messages.assistant') || 'AI',
        };
    }

    function getPlatformAndModelLabel(provider: string, modelId?: string, modelName?: string) {
        const id = `${modelId || ''}`.trim();
        const parts = id.split('/').filter(Boolean);
        const platform =
            parts.length > 1
                ? parts.slice(0, -1).join('/')
                : provider === 'opencode'
                  ? 'OpenCode'
                  : provider || 'OpenCode';
        const model =
            `${modelName || parts[parts.length - 1] || id || t('aiSidebar.messages.assistant') || 'AI'}`.trim();
        return `${platform} / ${model}`;
    }

    function getCurrentAssistantDisplayName() {
        const modelConfig = getCurrentModelConfig();
        return getPlatformAndModelLabel(
            currentProvider,
            modelConfig?.id || currentModelId,
            modelConfig?.name
        );
    }

    function createAssistantMessage(
        content: Message['content'],
        extra: Partial<Message> = {},
        provider = currentProvider,
        modelConfig: any = getCurrentModelConfig()
    ): Message {
        const modelId = modelConfig?.id || currentModelId || '';
        return {
            role: 'assistant',
            content,
            provider,
            modelId,
            modelName: modelConfig?.name || modelId,
            ...extra,
        };
    }

    function getAssistantDisplayName(message?: Message) {
        if (message?.multiModelResponses && message.multiModelResponses.length > 0) {
            const selectedResponse =
                message.multiModelResponses.find(response => response.isSelected) ||
                message.multiModelResponses.find(response => response.content && !response.error) ||
                message.multiModelResponses[0];

            if (selectedResponse) {
                return getPlatformAndModelLabel(
                    selectedResponse.provider,
                    selectedResponse.modelId,
                    selectedResponse.modelName
                );
            }

            return t('multiModel.responses') || t('aiSidebar.messages.assistant') || 'AI';
        }

        if (message?.modelId || message?.modelName || message?.provider) {
            return getPlatformAndModelLabel(
                message.provider || currentProvider,
                message.modelId || currentModelId,
                message.modelName
            );
        }

        return getCurrentAssistantDisplayName();
    }

    function getGroupDisplayName(group: MessageGroup) {
        if (group.type === 'user') {
            return getUserDisplayName();
        }

        return getAssistantDisplayName(
            group.messages.find(message => message.role === 'assistant')
        );
    }

    // 多模型发送消息
    async function sendMultiModelMessage() {
        // 保存用户输入和附件
        const userContent = currentInput.trim();
        const userAttachments = [...currentAttachments];
        const userContextDocuments = [...contextDocuments];

        const contextDocumentsWithLatestContent: ContextDocument[] = [];
        if (userContextDocuments.length > 0) {
            for (const doc of userContextDocuments) {
                try {
                    let content: string;
                    const data = await exportMdContent(doc.id, false, false, 2, 0, false);
                    content = (data && data.content) || doc.content;
                    contextDocumentsWithLatestContent.push({
                        id: doc.id,
                        title: doc.title,
                        content: content,
                        type: doc.type,
                    });
                } catch (error) {
                    console.error(`Failed to get latest content for block ${doc.id}:`, error);
                    contextDocumentsWithLatestContent.push(doc);
                }
            }
        }

        // 检查最后一条消息是否已经是用户消息（重新生成的情况）
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const isRegenerate = lastMessage && lastMessage.role === 'user' && !userContent;

        // 只有在不是重新生成的情况下才创建新的用户消息
        if (!isRegenerate) {
            // 创建用户消息
            const userMessage: Message = {
                role: 'user',
                content: userContent,
                attachments: userAttachments.length > 0 ? userAttachments : undefined,
                contextDocuments:
                    contextDocumentsWithLatestContent.length > 0
                        ? contextDocumentsWithLatestContent
                        : undefined,
            };

            messages = [...messages, userMessage];
        }
        currentInput = '';
        attachmentController.replace([]);
        contextController.replace([]);
        isLoading = true;
        isWaitingForAnswerSelection = true;
        selectedAnswerIndex = null; // 重置选择的答案索引，因为这是新的多模型对话
        hasUnsavedChanges = true;
        autoScroll = true;
        isAborted = false; // 重置中断标志

        await scrollToBottom(true);

        // 如果是第一条用户消息且没有会话ID，立即创建会话
        // 只有在非重新生成的情况下才执行
        if (!isRegenerate) {
            const userMessages = messages.filter(m => m.role === 'user');
            if (userMessages.length === 1 && !currentSessionId) {
                const now = Date.now();
                const newSession: ChatSession = {
                    id: createSessionId(),
                    title: generateSessionTitle(),
                    messages: [...messages],
                    createdAt: now,
                    updatedAt: now,
                    status: 'running',
                };
                sessions = [newSession, ...sessions];
                currentSessionId = newSession.id;
                replaceActiveDraftWithTask(newSession.id);
                await saveSessions();

                // 立即执行自动重命名
                autoRenameSession(userContent);
            }
        }

        await scrollToBottom(true);

        // 获取最后一条用户消息（用于 prepareMessagesForAI）
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMessage) {
            pushErrMsg(t('aiSidebar.errors.noUserMessage'));
            isLoading = false;
            return;
        }

        // 准备消息数组（包含上下文）
        // 对于重新生成的情况，使用已有的上下文；对于新消息，使用新获取的上下文
        const contextToUse =
            isRegenerate && lastUserMessage.contextDocuments
                ? lastUserMessage.contextDocuments
                : contextDocumentsWithLatestContent;

        const messagesToSend = await prepareMessagesForAI(
            messages,
            contextToUse,
            lastUserMessage.content as string,
            lastUserMessage
        );
        lastPreparedContextTokens = estimateMessagesContextTokens(messagesToSend);

        // 过滤掉无效的模型并初始化多模型响应数组
        const validModels = selectedMultiModels.filter(model => {
            const config = getProviderAndModelConfig(model.provider, model.modelId);
            return config !== null;
        });

        // 如果有无效模型，给出提示
        if (validModels.length < selectedMultiModels.length) {
            const invalidCount = selectedMultiModels.length - validModels.length;
            pushMsg(
                `有 ${invalidCount} 个模型已从配置中删除，将使用剩余的 ${validModels.length} 个模型`
            );
        }

        // 如果没有有效模型，退回到单模型
        if (validModels.length === 0) {
            pushErrMsg('所选的多模型已全部失效，请重新选择模型');
            enableMultiModel = false;
            return;
        }

        multiModelResponses = createMultiModelResponses(
            validModels,
            model => getProviderAndModelConfig(model.provider, model.modelId)?.modelConfig
        );

        // 创建新的 AbortController
        setController(currentSessionId, new AbortController());

        // 标记是否已经创建了助手消息（用于多模型第一次返回时保存会话）
        let assistantMessageCreated = false;
        let assistantMessageIndex = -1;

        async function persistMultiModelAssistantSnapshot() {
            if (!assistantMessageCreated) {
                assistantMessageCreated = true;
                const lastMessage = messages[messages.length - 1];
                if (lastMessage?.role === 'assistant' && lastMessage.multiModelResponses) {
                    lastMessage.multiModelResponses = [...multiModelResponses];
                    assistantMessageIndex = messages.length - 1;
                    messages = [...messages];
                } else {
                    messages = [...messages, {
                        role: 'assistant',
                        content: '',
                        multiModelResponses: [...multiModelResponses],
                    }];
                    assistantMessageIndex = messages.length - 1;
                }
                hasUnsavedChanges = true;
            } else if (assistantMessageIndex >= 0 && messages[assistantMessageIndex]) {
                messages[assistantMessageIndex].multiModelResponses = [...multiModelResponses];
                messages = [...messages];
            }
            await saveCurrentSession(true);
        }

        const targets = validModels
            .map(choice => {
                const config = getProviderAndModelConfig(choice.provider, choice.modelId);
                return config ? { choice, ...config } : null;
            })
            .filter(Boolean) as Array<{
                choice: MultiModelChoice;
                providerConfig: any;
                modelConfig: any;
            }>;
        await runMultiModelTargets({
            targets,
            messages: messagesToSend,
            signal: abortController.signal,
            mode: chatMode,
            temperature: tempModelSettings.temperatureEnabled
                ? tempModelSettings.temperature
                : undefined,
            isActive: () => !isAborted && isWaitingForAnswerSelection,
            processContent: async content =>
                saveBase64ImagesInContent(convertLatexToMarkdown(content)),
            update: (index, patch) => {
                if (!multiModelResponses[index]) return;
                multiModelResponses[index] = {
                    ...multiModelResponses[index],
                    ...patch,
                };
                multiModelResponses = [...multiModelResponses];
            },
            settled: persistMultiModelAssistantSnapshot,
        });

        isLoading = false;
        setController(currentSessionId, null);
    }

    // 准备发送给AI的消息（提取为独立函数以便复用）

    async function buildSystemPromptForCurrentRequest(): Promise<{
        baseSystemPrompt: string;
        hasToolInstruction: boolean;
    }> {
        let baseSystemPrompt = settings.aiSystemPrompt || '';
        if (tempModelSettings.systemPrompt.trim()) {
            baseSystemPrompt = tempModelSettings.systemPrompt;
        }
        const modeInstruction = getChatModeSystemInstruction(chatMode);
        if (modeInstruction.trim()) {
            baseSystemPrompt = `${baseSystemPrompt.trim()}\n\n${modeInstruction}`.trim();
        }

        const hasToolInstruction = false;
        const hasSoulDoc = !!settings.soulDocId?.trim();
        if (hasSoulDoc) {
            try {
                const soulResult = await soul({ operation: 'getDoc' });
                if (soulResult.success && soulResult.content) {
                    baseSystemPrompt += `\n\n=== SOUL记忆 ===\n\n以下是用户设置的SOUL文档内容，包含用户的偏好设置和要求，请在回复时遵循这些要求：\n\n${soulResult.content}`;
                }
            } catch (error) {
                console.error('[SOUL] 自动获取文档内容失败:', error);
            }
        }

        return { baseSystemPrompt, hasToolInstruction };
    }

    function selectMultiModelAnswer(index: number) {
        const selected = multiModelResponses[index];
        if (!selected || selected.isLoading) return;
        messages = applyMultiModelSelection(messages, multiModelResponses, index);
        multiModelResponses = [];
        isWaitingForAnswerSelection = false;
        selectedAnswerIndex = index;
        hasUnsavedChanges = true;
        void saveCurrentSession(true);
    }
    // 自动重命名会话
    async function autoRenameSession(content: string) {
        // 检查是否启用自动重命名
        if (!settings.autoRenameSession) {
            return;
        }

        // 检查是否配置了重命名模型
        const renameProvider = settings.autoRenameProvider || 'opencode';
        if (!settings.autoRenameModelId) {
            return;
        }

        // 获取重命名模型配置
        const config = getProviderAndModelConfig(
            renameProvider,
            settings.autoRenameModelId
        );
        if (!config) {
            return;
        }

        const { providerConfig, modelConfig } = config;
        if (providerRequiresApiKey(renameProvider) && !providerConfig.apiKey) {
            return;
        }

        try {
            // 使用自定义提示词模板，替换 {message} 占位符
            const promptTemplate =
                settings.autoRenamePrompt ||
                '请根据以下内容生成一个简洁的会话标题（不超过20个字，不要使用引号）：\n\n{message}';
            const prompt = promptTemplate.replace('{message}', content);

            let generatedTitle = '';

            // 调用AI生成标题
            await runChat(
                renameProvider,
                {
                    apiKey: providerConfig.apiKey,
                    model: modelConfig.id,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: modelConfig.temperature,
                    maxTokens: 50,
                    stream: true,
                    onChunk: async (chunk: string) => {
                        generatedTitle += chunk;
                    },
                    onComplete: async (text: string) => {
                        // 清理生成的标题（移除引号和多余空格）
                        const cleanTitle = (text || generatedTitle)
                            .trim()
                            .replace(/^["']|["']$/g, '')
                            .substring(0, 50);
                        if (cleanTitle && currentSessionId) {
                            // 直接更新当前会话的标题（不重新加载，避免覆盖刚创建的会话）
                            const session = sessions.find(s => s.id === currentSessionId);
                            if (session) {
                                session.title = cleanTitle;
                                sessions = [...sessions];
                                await saveSessions();
                            }
                        }
                    },
                    onError: (error: Error) => {
                        console.error('Auto-rename session failed:', error);
                        // 静默失败，不影响用户体验
                    },
                },
                providerConfig.customApiUrl || providerConfig.serverUrl,
                providerConfig.advancedConfig,
                providerConfig.serverUrl
            );
        } catch (error) {
            console.error('Auto-rename session error:', error);
            // 静默失败
        }
    }

    // 发送消息
    async function handleOpenCodeCommand(input: string) {
        isLoading = true;
        const parts = input.slice(1).split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1).join(' ');

        try {
            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';

            if (command === 'still' || command === 'continue') {
                const prompt = args || 'Continue.';
                await sendStillPrompt(serverUrl, currentSessionId, prompt, currentModelId);
                pushMsg('已发送继续指令');
            }
            else {
                const result = await executeCommand(serverUrl, currentSessionId, command, args, currentModelId);
                if (result.parts && result.parts.length > 0) {
                    const textParts = result.parts
                        .filter((p: any) => p?.type === 'text' && p?.text)
                        .map((p: any) => p.text)
                        .join('\n');
                    if (textParts) {
                        const converted = convertLatexToMarkdown(textParts);
                        messages = [...messages, createAssistantMessage(converted)];
                        hasUnsavedChanges = true;
                        await saveCurrentSession(true);
                    }
                } else {
                    pushMsg(`命令 /${command} 已执行`);
                }
            }
        } catch (err: any) {
            pushErrMsg(`命令执行失败: ${err.message}`);
            messages = [
                ...messages,
                createAssistantMessage(`❌ 命令 /${command} 执行失败: ${err.message}`),
            ];
            hasUnsavedChanges = true;
        } finally {
            currentInput = '';
            isLoading = false;
        }
    }

    async function prepareMemoryInitPrompt(): Promise<string | null> {
        const memorySettings = settings.memory || {};
        if (!String(memorySettings.notebookId || '').trim()) {
            pushErrMsg('请先在设置的“记忆”页选择记忆笔记本');
            return null;
        }

        try {
            settings.memory = {
                ...memorySettings,
                enabled: true,
            };
            await ensureMemoryBase(settings);
            const overviewDocId = await ensureMemoryOverviewTarget(settings);
            await plugin.saveSettings(settings);
            updateSettings(JSON.parse(JSON.stringify(settings)));
            return buildMemoryInitPrompt(settings, overviewDocId);
        } catch (error) {
            pushErrMsg(`初始化记忆任务失败: ${(error as Error).message}`);
            return null;
        }
    }

    async function prepareMemoryDreamPrompt(): Promise<string | null> {
        const memorySettings = settings.memory || {};
        if (!String(memorySettings.notebookId || '').trim()) {
            pushErrMsg('请先在设置的“记忆”页选择记忆笔记本');
            return null;
        }

        try {
            settings.memory = {
                ...memorySettings,
                enabled: true,
            };
            await ensureMemoryBase(settings);
            await plugin.saveSettings(settings);
            updateSettings(JSON.parse(JSON.stringify(settings)));
            return buildMemoryDreamPrompt(settings);
        } catch (error) {
            pushErrMsg(`准备记忆整理任务失败: ${(error as Error).message}`);
            return null;
        }
    }

    async function sendMessage() {
        const trimmedInput = currentInput.trim();
        if ((!trimmedInput && currentAttachments.length === 0) || isLoading) return;

        let memoryCommandPromptForRun = '';
        if (isMemoryInitCommand(trimmedInput)) {
            const prompt = await prepareMemoryInitPrompt();
            if (!prompt) return;
            memoryCommandPromptForRun = prompt;
        } else if (isMemoryDreamCommand(trimmedInput)) {
            const prompt = await prepareMemoryDreamPrompt();
            if (!prompt) return;
            memoryCommandPromptForRun = prompt;
        }

        // OpenCode 指令检测：以 / 开头的内容作为命令执行
        if (!memoryCommandPromptForRun && trimmedInput.startsWith('/') && currentSessionId) {
            await handleOpenCodeCommand(trimmedInput);
            return;
        }

        // 【修复】立即设置加载状态，防止并发点击触发多次发送
        isLoading = true;

        // 等待拖拽后仍在后台落盘的附件，保证会话里有稳定的 path
        try {
            await waitForPendingAttachmentSaves();
        } catch (e) {
            console.error('Failed to wait for attachments:', e);
        }

        // 如果处于等待选择答案状态，阻止发送
        if (isWaitingForAnswerSelection) {
            pushErrMsg(t('multiModel.waitingSelection'));
            isLoading = false;
            return;
        }

        // 检查设置
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig) {
            pushErrMsg(t('aiSidebar.errors.noProvider'));
            isLoading = false;
            return;
        }

        if (providerRequiresApiKey(currentProvider) && !providerConfig.apiKey) {
            pushErrMsg(t('aiSidebar.errors.noApiKey'));
            isLoading = false;
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            pushErrMsg(t('aiSidebar.errors.noModel'));
            isLoading = false;
            return;
        }

        // 解析自定义参数
        let customBody = {};
        if (modelConfig.customBody) {
            try {
                customBody = JSON.parse(modelConfig.customBody);
            } catch (e) {
                console.error('Failed to parse custom body:', e);
                pushErrMsg('自定义参数 JSON 格式错误');
                isLoading = false;
                return;
            }
        }

        // 如果启用了多模型模式且在问答模式
        if (enableMultiModel && chatMode === 'plan' && selectedMultiModels.length > 0) {
            try {
                await sendMultiModelMessage();
            } finally {
                // sendMultiModelMessage 内部会处理 isLoading，但为了安全这里也检查
            }
            return;
        }

        // 获取所有上下文文档的最新内容
        // 始终刷新为 Markdown；OpenCode 工具上下文由服务端会话维护。
        const contextDocumentsWithLatestContent: ContextDocument[] = [];
        if (contextDocuments.length > 0) {
            for (const doc of contextDocuments) {
                try {
                    let content: string;

                    const data = await exportMdContent(doc.id, false, false, 2, 0, false);
                    if (data && data.content) {
                        content = data.content;
                    } else {
                        content = doc.content;
                    }

                    contextDocumentsWithLatestContent.push({
                        id: doc.id,
                        title: doc.title,
                        content: content,
                        type: doc.type, // 保留类型信息
                    });
                } catch (error) {
                    console.error(`Failed to get latest content for block ${doc.id}:`, error);
                    // 出错时使用缓存的内容
                    contextDocumentsWithLatestContent.push(doc);
                }
            }
        }

        // 用户消息只保存原始输入（不包含文档内容）
        const userContent = currentInput.trim();
        const effectiveUserContent = memoryCommandPromptForRun || userContent;
        const effectiveChatMode: ChatMode = memoryCommandPromptForRun ? 'build' : chatMode;

        const userMessage: Message = {
            role: 'user',
            content: userContent,
            attachments: currentAttachments.length > 0 ? [...currentAttachments] : undefined,
            contextDocuments:
                contextDocumentsWithLatestContent.length > 0
                    ? [...contextDocumentsWithLatestContent]
                    : undefined,
        };

        messages = [...messages, userMessage];
        currentInput = '';
        attachmentController.replace([]);
        contextController.replace([]); // 发送后清空全局上下文
        // isLoading 已经在函数开始时设置为 true
        isAborted = false; // 重置中断标志
        streamingMessage = '';
        streamingThinking = '';
        openCodeToolParts = [];
        resetOpenCodeTimeline();
        streamingThinkingCollapsed = true;
        streamingToolCallsCollapsed = true;
        thinkingBeforeToolCalls = ''; // 重置工具调用前的思考内容
        isThinkingPhase = false;
        hasUnsavedChanges = true;
        autoScroll = true; // 发送新消息时启用自动滚动

        await scrollToBottom(true);

        // 如果是第一条用户消息且没有会话ID，立即创建会话
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length === 1 && !currentSessionId) {
            const now = Date.now();
            const newSession: ChatSession = {
                id: createSessionId(),
                title: generateSessionTitle(),
                messages: [...messages],
                createdAt: now,
                updatedAt: now,
                status: 'running',
            };
            sessions = [newSession, ...sessions];
            currentSessionId = newSession.id;
            replaceActiveDraftWithTask(newSession.id);
            await saveSessions();

            // 立即执行自动重命名
            autoRenameSession(userContent);
        }

        await scrollToBottom(true);

        const enableThinking =
            !!(modelConfig.capabilities?.thinking && (modelConfig.thinkingEnabled || false));
        const messagesToSend = await prepareMessagesForAI(
            messages,
            contextDocumentsWithLatestContent,
            effectiveUserContent,
            userMessage,
            enableThinking,
            modelConfig.id
        );
        lastPreparedContextTokens = estimateMessagesContextTokens(messagesToSend);

        // 创建新的 AbortController
        setController(currentSessionId, new AbortController());
        const runTaskId = currentSessionId;
        const runController = sessionControllers.get(runTaskId);
        taskStateController.saveForeground(runTaskId, captureActiveTaskState());
        const diagnosticLogger = await startDiagnosticLog(effectiveUserContent, modelConfig);

        try {
            // 准备联网搜索工具（如果启用）
            let webSearchTools: any[] | undefined = undefined;
            if (
                modelConfig.capabilities?.webSearch &&
                modelConfig.webSearchEnabled
            ) {
                // 根据模型类型构建不同的联网工具配置
                const modelIdLower = modelConfig.id.toLowerCase();

                if (modelIdLower.includes('gemini')) {
                    // Gemini 模型使用 googleSearch 函数
                    webSearchTools = [
                        {
                            type: 'function',
                            function: {
                                name: 'googleSearch',
                            },
                        },
                    ];
                } else if (modelIdLower.includes('claude')) {
                    // Claude 模型使用 web_search 工具
                    // webSearchTools = [
                    //     {
                    //         type: 'web_search_20250305',
                    //         name: 'web_search',
                    //         max_uses: modelConfig.webSearchMaxUses || 5,
                    //     },
                    // ];
                }
            }


                // 检查是否启用图片生成
                const enableImageGeneration = modelConfig.capabilities?.imageGeneration || false;
                // 用于保存生成的图片
                let generatedImages: any[] = [];

                await runChat(
                    currentProvider,
                    {
                        apiKey: providerConfig.apiKey,
                        model: modelConfig.id,
                        messages: messagesToSend,
                        temperature: tempModelSettings.temperatureEnabled
                            ? tempModelSettings.temperature
                            : modelConfig.temperature,
                        maxTokens: modelConfig.maxTokens > 0 ? modelConfig.maxTokens : undefined,
                        stream: true,
                        signal: abortController.signal,
                        enableThinking,
                        reasoningEffort: modelConfig.thinkingEffort || 'low',
                        mode: effectiveChatMode,
                        tools: webSearchTools, // 传递联网搜索工具
                        customBody,
                        diagnosticLogger: diagnosticLogger || undefined,
                        enableImageGeneration,
                        onImageGenerated: async (images: any[]) => {
                            // 立即保存生成的图片到 SiYuan 资源文件夹并转换为 blob URL
                            generatedImages = await Promise.all(
                                images.map(async (img, idx) => {
                                    const blob = base64ToBlob(
                                        img.data,
                                        img.mimeType || 'image/png'
                                    );
                                    const name = `generated-image-${Date.now()}-${idx + 1}.${
                                        img.mimeType?.split('/')[1] || 'png'
                                    }`;
                                    const assetPath = await saveAsset(blob, name);
                                    return {
                                        ...img,
                                        path: assetPath,
                                        // 给前端显示用的 blob url
                                        previewUrl: URL.createObjectURL(blob),
                                    };
                                })
                            );
                        },
                        onThinkingChunk: (chunk: string) => appendThinkingForTask(runTaskId, chunk),
                        onThinkingComplete: () => {
                            if (isActiveTask(runTaskId)) {
                                finishStreamingThinking(messages.length);
                            } else {
                                updateStoredTaskState(runTaskId, state => ({
                                    ...state,
                                    isThinkingPhase: false,
                                }));
                            }
                        },
                        onToolPartUpdate: (update: any) => updateToolPartForTask(runTaskId, update),
                        onPermissionAsked: handleOpenCodePermissionAsked,
                        onQuestionAsked: handleOpenCodeQuestionAsked,
                        onChunk: async (chunk: string) => {
                            appendStreamingTextForTask(runTaskId, chunk);
                            if (isActiveTask(runTaskId)) {
                                await scrollToBottom();
                            }
                        },
                        onComplete: async (fullText: string) => {
                            // 如果已经中断，不再添加消息（避免重复）
                            if (sessionIsAborted.get(runTaskId)) {
                                return;
                            }

                            // 转换 LaTeX 数学公式格式为 Markdown 格式
                            const convertedText = convertLatexToMarkdown(fullText);

                            // 处理content中的base64图片，保存为assets文件
                            const processedContent = await saveBase64ImagesInContent(convertedText);

                            const assistantMessage = createAssistantMessage(processedContent);
                            const taskIsActive = isActiveTask(runTaskId);
                            const backgroundState = taskIsActive ? null : getStoredTaskState(runTaskId);
                            const taskStreamingThinking = backgroundState?.streamingThinking ?? streamingThinking;
                            const taskToolParts = backgroundState?.openCodeToolParts ?? openCodeToolParts;
                            const taskTimeline = backgroundState?.openCodeTimeline ?? openCodeTimeline;

                            // 如果有思考内容，添加到消息中
                            if (taskStreamingThinking) {
                                assistantMessage.thinking = taskStreamingThinking;
                            }

                            if (taskToolParts.length > 0) {
                                assistantMessage.openCodeToolParts = taskToolParts.map(part => ({
                                    ...part,
                                }));
                            }
                            if (taskTimeline.length > 0) {
                                assistantMessage.openCodeTimeline = cloneOpenCodeTimelineItems(taskTimeline);
                            }

                            // 如果有生成的图片，保存到消息中
                            if (generatedImages.length > 0) {
                                // 保存图片信息（不包含base64数据，只保存路径）
                                assistantMessage.generatedImages = generatedImages.map(img => ({
                                    mimeType: img.mimeType,
                                    data: '', // 不保存base64数据，节省空间
                                    path: img.path,
                                }));

                                // 添加为附件以便显示（使用blob URL）
                                assistantMessage.attachments = generatedImages.map((img, idx) => ({
                                    type: 'image' as const,
                                    name: `generated-image-${idx + 1}.${
                                        img.mimeType?.split('/')[1] || 'png'
                                    }`,
                                    data: img.previewUrl, // 使用 blob URL 显示
                                    path: img.path, // 保存路径用于持久化
                                    mimeType: img.mimeType || 'image/png',
                                }));
                            }

                            if (!taskIsActive) {
                                markTaskUnread(runTaskId);
                                updateStoredTaskState(runTaskId, state => ({
                                    ...state,
                                    messages: [...state.messages, assistantMessage],
                                    streamingMessage: '',
                                    streamingThinking: '',
                                    openCodeToolParts: [],
                                    openCodeTimeline: [],
                                    isThinkingPhase: false,
                                    isLoading: false,
                                    hasUnsavedChanges: true,
                                }));
                                setController(runTaskId, null);
                                const completedState = getStoredTaskState(runTaskId);
                                await saveTaskStateSession(runTaskId, completedState);
                                await recordTokenUsage(
                                    messagesToSend,
                                    processedContent,
                                    modelConfig
                                );
                                await closeDiagnosticLog(diagnosticLogger, 'ui.completed', {
                                    messageCount: completedState.messages.length,
                                    finalTextChars: processedContent.length,
                                });
                                return;
                            }

                            messages = [...messages, assistantMessage];
                            streamingMessage = '';
                            streamingThinking = '';
                            openCodeToolParts = [];
                            resetOpenCodeTimeline();
                            isThinkingPhase = false;
                            isLoading = false;
                            setController(runTaskId, null);
                            hasUnsavedChanges = true;

                            await recordTokenUsage(messagesToSend, processedContent, modelConfig);

                            // AI 回复完成后，自动保存当前会话
                            await saveCurrentSession(true);

                            // 根据AI回答自动重命名会话标题
                            autoRenameSession(convertedText);
                            await closeDiagnosticLog(diagnosticLogger, 'ui.completed', {
                                messageCount: messages.length,
                                finalTextChars: processedContent.length,
                            });
                        },
                        onError: (error: Error) => {
                            if (!isActiveTask(runTaskId)) {
                                if (error.message !== 'Request aborted') {
                                    markTaskUnread(runTaskId);
                                }
                                updateStoredTaskState(runTaskId, state => ({
                                    ...state,
                                    messages:
                                        error.message !== 'Request aborted'
                                            ? [
                                                  ...state.messages,
                                                  {
                                                      role: 'assistant',
                                                      content: `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${error.message}`,
                                                  },
                                              ]
                                            : state.messages,
                                    streamingMessage: '',
                                    streamingThinking: '',
                                    openCodeToolParts: [],
                                    openCodeTimeline: [],
                                    isThinkingPhase: false,
                                    isLoading: false,
                                    hasUnsavedChanges: error.message !== 'Request aborted' || state.hasUnsavedChanges,
                                }));
                                setController(runTaskId, null);
                                void saveTaskStateSession(runTaskId, getStoredTaskState(runTaskId));
                                void closeDiagnosticLog(diagnosticLogger, 'ui.failed', {
                                    error,
                                });
                                return;
                            }
                            // 如果是主动中断，不显示错误
                            if (error.message !== 'Request aborted') {
                                // 将错误消息作为一条 assistant 消息添加
                                const errorMessage = createAssistantMessage(
                                    `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${error.message}`
                                );
                                messages = [...messages, errorMessage];
                                hasUnsavedChanges = true;
                            }
                            isLoading = false;
                            streamingMessage = '';
                            streamingThinking = '';
                            openCodeToolParts = [];
                            resetOpenCodeTimeline();
                            isThinkingPhase = false;
                            setController(runTaskId, null);
                            void closeDiagnosticLog(diagnosticLogger, 'ui.failed', {
                                error,
                            });
                        },
                    },
                    providerConfig.customApiUrl,
                    providerConfig.advancedConfig
                );
        } catch (error) {
            console.error('Send message error:', error);
            await closeDiagnosticLog(diagnosticLogger, 'ui.failed', {
                error,
            });
            // onError 回调已经处理了错误消息的添加，这里不需要重复添加
            // 只需要在 onError 没有被调用的情况下（比如网络错误导致的异常）清理状态
            if ((error as Error).name === 'AbortError') {
                // 中断错误已经在 abortMessage 中处理
            } else if (!isLoading) {
                // 如果 isLoading 已经是 false，说明 onError 已经被调用并处理了
                // 不需要做任何事情
            } else {
                // 如果 isLoading 还是 true，说明 onError 没有被调用
                // 这种情况下才需要添加错误消息（比如网络请求失败）
                const errorMessage = createAssistantMessage(
                    `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${(error as Error).message}`
                );
                messages = [...messages, errorMessage];
                hasUnsavedChanges = true;
                isLoading = false;
                streamingMessage = '';
                streamingThinking = '';
                openCodeToolParts = [];
        resetOpenCodeTimeline();
                isThinkingPhase = false;
            }
            setController(currentSessionId, null);
        }
    }

    async function sendMessageDuringExecution() {
        const trimmedInput = currentInput.trim();
        if (!trimmedInput || !currentSessionId) return;

        const executionMode = settings.executionMessageMode || 'guide';
        const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
        const userMessage: Message = {
            role: 'user',
            content: trimmedInput,
        };

        currentInput = '';
        messages = [...messages, userMessage];
        hasUnsavedChanges = true;
        await saveCurrentSession(true);
        await scrollToBottom(true);

        try {
            await sendStillPrompt(serverUrl, currentSessionId, trimmedInput, currentModelId, {
                agent: chatMode,
                noReply: executionMode === 'guide',
            });
            pushMsg(executionMode === 'guide' ? '已发送引导消息' : '已加入 OpenCode 队列');
        } catch (err: any) {
            pushErrMsg(`发送失败: ${err.message || err}`);
        }
    }

    // 中断消息生成
    function abortMessage() {
        if (abortController) {
            abortController.abort();
            setIsAborted(currentSessionId, true); // 设置中断标志，防止 onComplete 再次添加消息

            // 如果是多模型模式且正在等待选择答案
            if (isWaitingForAnswerSelection && multiModelResponses.length > 0) {
                // 找到第一个成功的响应作为默认选择
                const firstSuccessIndex = multiModelResponses.findIndex(
                    r => !r.error && !r.isLoading
                );

                if (firstSuccessIndex !== -1) {
                    const selectedResponse = multiModelResponses[firstSuccessIndex];
                    const updatedMultiModelResponses = multiModelResponses.map((response, i) => ({
                        ...response,
                        isSelected: i === firstSuccessIndex,
                        modelName: cleanModelName(response.modelName),
                    }));

                    // 【修复】检查是否已经存在该 turns 的助手消息，避免重复添加
                    const lastMessage = messages[messages.length - 1];
                    if (
                        lastMessage &&
                        lastMessage.role === 'assistant' &&
                        lastMessage.multiModelResponses
                    ) {
                        lastMessage.content = selectedResponse.content || '';
                        lastMessage.thinking = selectedResponse.thinking || '';
                        lastMessage.multiModelResponses = updatedMultiModelResponses;
                        messages = [...messages];
                    } else {
                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: selectedResponse.content || '',
                            thinking: selectedResponse.thinking,
                            multiModelResponses: updatedMultiModelResponses,
                        };
                        messages = [...messages, assistantMessage];
                    }
                    hasUnsavedChanges = true;
                }

                // 清除多模型状态
                multiModelResponses = [];
                isWaitingForAnswerSelection = false;
                selectedAnswerIndex = null;
                selectedTabIndex = 0;
                isLoading = false;
                setController(currentSessionId, null);
                return;
            }

            // 单模型模式：如果有已生成的部分，将其保存为消息
            if (streamingMessage || streamingThinking || openCodeToolParts.length > 0) {
                // 先保存到临时变量
                const tempStreamingMessage = streamingMessage;
                const tempStreamingThinking = streamingThinking;
                const tempOpenCodeToolParts = openCodeToolParts.map(part => ({ ...part }));
                const tempOpenCodeTimeline = cloneOpenCodeTimeline();

                // 立即清空流式消息和状态，避免重复渲染
                streamingMessage = '';
                streamingThinking = '';
                openCodeToolParts = [];
        resetOpenCodeTimeline();
                isThinkingPhase = false;
                isLoading = false;

                // 转换 LaTeX 数学公式格式为 Markdown 格式
                const convertedMessage = convertLatexToMarkdown(tempStreamingMessage);

                const message = createAssistantMessage(
                    convertedMessage + '\n\n' + t('aiSidebar.messages.interrupted')
                );
                if (tempStreamingThinking) {
                    message.thinking = tempStreamingThinking;
                }
                if (tempOpenCodeToolParts.length > 0) {
                    message.openCodeToolParts = tempOpenCodeToolParts;
                }
                if (tempOpenCodeTimeline.length > 0) {
                    message.openCodeTimeline = tempOpenCodeTimeline;
                }
                messages = [...messages, message];
                hasUnsavedChanges = true;
            } else {
                streamingMessage = '';
                streamingThinking = '';
                openCodeToolParts = [];
        resetOpenCodeTimeline();
                isThinkingPhase = false;
                isLoading = false;
            }
            setController(currentSessionId, null);
        }
    }

    // 复制对话为Markdown
    function copyAsMarkdown() {
        const markdown = buildSessionMarkdown(messages, getSessionExportContext());

        navigator.clipboard
            .writeText(markdown)
            .then(() => {
                pushMsg(t('aiSidebar.success.copyMarkdownSuccess'));
            })
            .catch(err => {
                pushErrMsg(t('aiSidebar.errors.copyFailed'));
                console.error('Copy failed:', err);
            });
    }

    // 清空对话
    function clearChat() {
        // 如果消息正在生成，先中断
        if (isLoading && abortController) {
            abortMessage();
        }

        // 如果有未选择的多模型响应，先保存它们
        if (isWaitingForAnswerSelection && multiModelResponses.length > 0) {
            const firstSuccessIndex = multiModelResponses.findIndex(r => !r.error && !r.isLoading);

            if (firstSuccessIndex !== -1) {
                const selectedResponse = multiModelResponses[firstSuccessIndex];
                const updatedMultiModelResponses = multiModelResponses.map((response, i) => ({
                    ...response,
                    isSelected: i === firstSuccessIndex,
                    modelName: cleanModelName(response.modelName),
                }));

                const lastMessage = messages[messages.length - 1];
                if (
                    lastMessage &&
                    lastMessage.role === 'assistant' &&
                    lastMessage.multiModelResponses
                ) {
                    lastMessage.content = selectedResponse.content || '';
                    lastMessage.thinking = selectedResponse.thinking || '';
                    lastMessage.multiModelResponses = updatedMultiModelResponses;
                    messages = [...messages];
                } else {
                    const assistantMessage: Message = {
                        role: 'assistant',
                        content: selectedResponse.content || '',
                        thinking: selectedResponse.thinking,
                        multiModelResponses: updatedMultiModelResponses,
                    };
                    messages = [...messages, assistantMessage];
                }
                hasUnsavedChanges = true;
            }
        }

        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            confirm(
                t('aiSidebar.confirm.clearChat.title'),
                t('aiSidebar.confirm.clearChat.message'),
                () => {
                    doClearChat();
                }
            );
        } else {
            doClearChat();
        }
    }

    function doClearChat() {
        messages = settings.aiSystemPrompt
            ? [{ role: 'system', content: settings.aiSystemPrompt }]
            : [];
        contextController.replace([]);
        streamingMessage = '';
        streamingThinking = '';
        isThinkingPhase = false;
        lastPreparedContextTokens = 0;
        thinkingCollapsed = {};
        currentSessionId = '';
        hasUnsavedChanges = false;

        // 清除多模型状态
        multiModelResponses = [];
        isWaitingForAnswerSelection = false;
        selectedAnswerIndex = null;
        selectedTabIndex = 0;

        pushMsg(t('aiSidebar.success.clearSuccess'));
    }

    // 处理键盘事件
    function handleModeShortcut(e: KeyboardEvent): boolean {
        if (shouldToggleChatModeFromKeydown(e)) {
            e.preventDefault();
            toggleChatMode();
            return true;
        }
        return false;
    }

    function handleTaskTabShortcut(e: KeyboardEvent): boolean {
        if (e.defaultPrevented || e.altKey || e.shiftKey) return false;
        if (!e.metaKey && !e.ctrlKey) return false;
        if (!/^[1-9]$/.test(e.key)) return false;
        const index = Number(e.key) - 1;
        const taskId = activeTaskIds[index];
        if (!taskId) return false;
        e.preventDefault();
        selectActiveTaskTab(taskId);
        return true;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (handleModeShortcut(e)) return;
        if (handleTaskTabShortcut(e)) return;

        // 命令面板键盘导航
        if (showCommandPalette) {
            const commands = getFilteredCommands();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                commandPaletteIndex = Math.min(commandPaletteIndex + 1, commands.length - 1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                commandPaletteIndex = Math.max(commandPaletteIndex - 1, 0);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (commands[commandPaletteIndex]) {
                    applyCommand(commands[commandPaletteIndex].name);
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                showCommandPalette = false;
                return;
            }
        }

        const sendMode = settings.sendMessageShortcut || 'ctrl+enter';

        if (shouldSendMessageFromKeydown(e, sendMode, undefined, isInputComposing)) {
            e.preventDefault();
            if (isLoading) {
                if (currentInput.trim()) {
                    sendMessageDuringExecution();
                } else {
                    abortMessage();
                }
            } else {
                sendMessage();
            }
            return;
        }
    }

    function getFilteredCommands() {
        return BUILTIN_COMMANDS.filter(c =>
            c.name.includes(commandPaletteFilter.toLowerCase())
        );
    }

    function applyCommand(cmdName: string) {
        if (cmdName === 'clear') {
            clearChat();
        } else {
            currentInput = `/${cmdName} `;
        }
        showCommandPalette = false;
        commandPaletteFilter = '';
        commandPaletteIndex = 0;
        textareaElement?.focus();
    }

    function handleInput() {
        const val = currentInput;
        if (val.startsWith('/') && !val.includes(' ') && val.length > 1) {
            commandPaletteFilter = val.slice(1);
            commandPaletteIndex = 0;
            showCommandPalette = true;
        } else if (val === '/') {
            commandPaletteFilter = '';
            commandPaletteIndex = 0;
            showCommandPalette = true;
        } else {
            showCommandPalette = false;
        }
    }

    // 将消息内容中的 base64 图片保存为 assets 文件并替换为路径
    async function saveBase64ImagesInContent(content: string): Promise<string> {
        // 匹配 Markdown 图片语法中的 base64 数据
        const base64ImageRegex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
        const matches = Array.from(content.matchAll(base64ImageRegex));

        if (matches.length === 0) {
            return content;
        }

        let result = content;
        for (const match of matches) {
            const fullMatch = match[0];
            const altText = match[1];
            const dataUrl = match[2];

            try {
                // 解析 data URL
                const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (!dataUrlMatch) continue;

                const mimeType = dataUrlMatch[1];
                const base64Data = dataUrlMatch[2];

                // 保存到 assets
                const blob = base64ToBlob(base64Data, mimeType);
                const ext = mimeType.split('/')[1] || 'png';
                const assetPath = await saveAsset(blob, `image-${Date.now()}.${ext}`);

                // 替换为 assets 路径
                result = result.replace(fullMatch, `![${altText}](${assetPath})`);

                debugSidebar(`Saved generated image to assets: ${assetPath}`);
            } catch (error) {
                console.error('Failed to save base64 image:', error);
            }
        }

        return result;
    }

    // 将消息内容中的 assets 路径替换为 blob URL（用于显示）
    async function replaceAssetPathsWithBlob(content: string): Promise<string> {
        // 匹配 Markdown 图片语法中的 assets 路径
        const assetImageRegex =
            /!\[([^\]]*)\]\((\/data\/storage\/petal\/(?:siyuan-copilot-opencode|siyuan-plugin-copilot)\/assets\/[^)]+)\)/g;
        const matches = Array.from(content.matchAll(assetImageRegex));

        if (matches.length === 0) {
            return content;
        }

        let result = content;
        for (const match of matches) {
            const fullMatch = match[0];
            const altText = match[1];
            const assetPath = match[2];

            try {
                const blobUrl = await loadAsset(assetPath);
                if (blobUrl) {
                    result = result.replace(fullMatch, `![${altText}](${blobUrl})`);
                }
            } catch (error) {
                console.error('Failed to load asset for display:', error);
            }
        }

        return result;
    }

    // 高亮代码块
    function handleContextMenu(
        event: MouseEvent,
        messageIndex: number,
        messageType: 'user' | 'assistant',
        isMultiModel = false
    ) {
        event.preventDefault();
        event.stopPropagation();

        // 设置菜单位置
        contextMenuX = event.clientX;
        contextMenuY = event.clientY;
        contextMenuMessageIndex = messageIndex;
        contextMenuMessageType = messageType;
        contextMenuIsMultiModel = !!isMultiModel;
        // 判断当前是否有选区，且选区位于当前消息元素内
        try {
            const sel = window.getSelection();
            selectionInMessage = false;
            selectionHtml = '';
            selectionText = '';

            if (sel && !sel.isCollapsed) {
                const currentTarget = event.currentTarget as HTMLElement | null;
                if (currentTarget) {
                    const anchorNode = sel.anchorNode;
                    const focusNode = sel.focusNode;
                    if (anchorNode && focusNode) {
                        const anchorEl = (anchorNode as Node).parentElement;
                        const focusEl = (focusNode as Node).parentElement;
                        if (
                            anchorEl &&
                            focusEl &&
                            currentTarget.contains(anchorEl) &&
                            currentTarget.contains(focusEl)
                        ) {
                            selectionInMessage = true;
                            // 获取选区的 HTML
                            const range = sel.getRangeAt(0);
                            const div = document.createElement('div');
                            div.appendChild(range.cloneContents());
                            selectionHtml = div.innerHTML;
                            selectionText = sel.toString();
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Context menu selection detection failed:', err);
            selectionInMessage = false;
            selectionHtml = '';
            selectionText = '';
        }

        contextMenuVisible = true;
    }

    // 关闭右键菜单
    function closeContextMenu() {
        contextMenuVisible = false;
        contextMenuMessageIndex = null;
        contextMenuMessageType = null;
    }

    // 处理右键菜单项点击
    async function handleContextMenuAction(
        action:
            | 'copy'
            | 'copy_md'
            | 'copy_plain'
            | 'copy_html'
            | 'edit'
            | 'delete'
            | 'regenerate'
            | 'save'
    ) {
        if (contextMenuMessageIndex === null) return;

        const messageIndex = contextMenuMessageIndex;
        closeContextMenu();

        switch (action) {
            case 'copy': {
                // 旧行为：复制整条消息文本（或多模型整条响应）
                if (contextMenuIsMultiModel) {
                    try {
                        const el = document.elementFromPoint(
                            contextMenuX,
                            contextMenuY
                        ) as HTMLElement | null;
                        const container = el?.closest(
                            '.ai-sidebar__multi-model-card-content, .ai-sidebar__multi-model-tab-panel-content'
                        ) as HTMLElement | null;
                        const text = container
                            ? container.innerText
                            : multiModelResponses[messageIndex]?.content || '';
                        await platformUtils.writeText(text);
                        pushMsg(t('aiSidebar.success.copySuccess'));
                    } catch (err) {
                        console.error('Copy multi-model response failed:', err);
                        pushErrMsg(t('aiSidebar.errors.copyFailed'));
                    }
                } else {
                    const message = messages[messageIndex];
                    if (message) {
                        copyMessage(message.content);
                    }
                }
                break;
            }
            case 'copy_md':
            case 'copy_plain':
            case 'copy_html': {
                // 如果有选区且选区属于消息，按类型复制选区
                if (selectionInMessage && selectionText) {
                    try {
                        if (action === 'copy_md') {
                            // Markdown: 尝试使用 Lute 转换 HTML->Markdown
                            if (window.Lute) {
                                const lute = window.Lute.New();
                                const md = lute.HTML2Md(selectionHtml || selectionText);
                                await platformUtils.writeText(md);
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            } else {
                                // 降级为纯文本
                                await platformUtils.writeText(selectionText);
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            }
                        } else if (action === 'copy_plain') {
                            await platformUtils.writeText(selectionText);
                            pushMsg(t('aiSidebar.success.copySuccess'));
                        } else if (action === 'copy_html') {
                            // 尝试写入富文本（text/html + text/plain）
                            if (navigator.clipboard && (navigator.clipboard as any).write) {
                                const blobPlain = new Blob([selectionText], { type: 'text/plain' });
                                const blobHtml = new Blob([selectionHtml || selectionText], {
                                    type: 'text/html',
                                });
                                const item: any = new ClipboardItem({
                                    'text/plain': blobPlain,
                                    'text/html': blobHtml,
                                });
                                await (navigator.clipboard as any).write([item]);
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            } else {
                                // 回退到纯文本
                                await platformUtils.writeText(selectionText);
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            }
                        }
                    } catch (err) {
                        console.error('Copy selection failed:', err);
                        pushErrMsg(t('aiSidebar.errors.copyFailed'));
                    }
                } else {
                    // 如果是多模型区域且没有选区，复制整个多模型响应内容
                    if (contextMenuIsMultiModel) {
                        try {
                            const el = document.elementFromPoint(
                                contextMenuX,
                                contextMenuY
                            ) as HTMLElement | null;
                            const container = el?.closest(
                                '.ai-sidebar__multi-model-card-content, .ai-sidebar__multi-model-tab-panel-content'
                            ) as HTMLElement | null;
                            const html = container
                                ? container.innerHTML
                                : multiModelResponses[messageIndex]?.content || '';
                            const text = container
                                ? container.innerText
                                : multiModelResponses[messageIndex]?.content || '';

                            if (action === 'copy_md') {
                                if (window.Lute) {
                                    const lute = window.Lute.New();
                                    const md = lute.HTML2Md(html || text);
                                    await platformUtils.writeText(md);
                                } else {
                                    await platformUtils.writeText(text);
                                }
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            } else if (action === 'copy_plain') {
                                await platformUtils.writeText(text);
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            } else if (action === 'copy_html') {
                                if (navigator.clipboard && (navigator.clipboard as any).write) {
                                    const blobPlain = new Blob([text], { type: 'text/plain' });
                                    const blobHtml = new Blob([html || text], {
                                        type: 'text/html',
                                    });
                                    const item: any = new ClipboardItem({
                                        'text/plain': blobPlain,
                                        'text/html': blobHtml,
                                    });
                                    await (navigator.clipboard as any).write([item]);
                                } else {
                                    await platformUtils.writeText(text);
                                }
                                pushMsg(t('aiSidebar.success.copySuccess'));
                            }
                        } catch (err) {
                            console.error('Copy multi-model content failed:', err);
                            pushErrMsg(t('aiSidebar.errors.copyFailed'));
                        }
                    } else {
                        pushErrMsg(t('aiSidebar.errors.noSelection'));
                    }
                }

                // 清理选区状态
                selectionInMessage = false;
                selectionHtml = '';
                selectionText = '';
                break;
            }
            case 'edit':
                startEditMessage(messageIndex);
                break;
            case 'delete':
                deleteMessage(messageIndex);
                break;
            case 'regenerate':
                regenerateMessage(messageIndex);
                break;
            case 'save':
                openSaveToNoteDialog(messageIndex);
                break;
        }
    }

    // 搜索文档
    async function searchDocuments() {
        isSearching = true;
        try {
            // 如果没有输入关键词，显示当前文档
            if (!searchKeyword.trim()) {
                const currentProtyle = getActiveEditor(false)?.protyle;
                const blockId = currentProtyle?.block?.id;

                if (blockId) {
                    // 获取当前文档信息
                    const blocks = await sql(
                        `SELECT * FROM blocks WHERE id = '${blockId}' OR root_id = '${blockId}'`
                    );
                    if (blocks && blocks.length > 0) {
                        // 查找文档块
                        const docBlock = blocks.find(b => b.type === 'd');
                        if (docBlock) {
                            searchResults = [docBlock];
                        } else {
                            // 如果当前块不是文档块，获取所属文档
                            const rootId = blocks[0].root_id;
                            const rootBlocks = await sql(
                                `SELECT * FROM blocks WHERE id = '${rootId}' AND type = 'd'`
                            );
                            searchResults = rootBlocks || [];
                        }
                    } else {
                        searchResults = [];
                    }
                } else {
                    searchResults = [];
                }
                isSearching = false;
                return;
            }

            // 将空格分隔的关键词转换为 SQL LIKE 查询
            // 转义单引号以防止SQL注入
            const results = await sql(buildDocumentSearchQuery(searchKeyword));
            searchResults = results || [];
        } catch (error) {
            console.error('Search error:', error);
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    // 自动搜索（带防抖）
    function autoSearch() {
        // 清除之前的定时器
        if (searchTimeout !== null) {
            clearTimeout(searchTimeout);
        }

        // 设置新的定时器，500ms后执行搜索
        searchTimeout = window.setTimeout(() => {
            searchDocuments();
        }, 500);
    }

    // 监听搜索关键词变化
    $: {
        if (isSearchDialogOpen && searchKeyword !== undefined) {
            autoSearch();
        }
    }

    // 监听对话框关闭，清理搜索状态
    $: {
        if (!isSearchDialogOpen) {
            if (searchTimeout !== null) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            // 不清空 searchKeyword 和 searchResults，保留用户的搜索历史
        }
    }

    // 添加文档到上下文
    async function addDocumentToContext(docId: string, docTitle: string) {
        // 检查是否已存在
        if (contextController.has(docId)) {
            pushMsg(t('aiSidebar.success.documentExists'));
            return;
        }

        try {
            // 获取文档内容
            const data = await exportMdContent(docId, false, false, 2, 0, false);
            if (data && data.content) {
                contextController.add({
                    id: docId,
                    title: docTitle,
                    content: data.content,
                    type: 'doc',
                });
                isSearchDialogOpen = false;
                searchKeyword = '';
                searchResults = [];
            }
        } catch (error) {
            console.error('Add document error:', error);
            pushErrMsg(t('aiSidebar.errors.addDocumentFailed'));
        }
    }

    // 一键添加当前文档到上下文
    async function addCurrentDocToContext() {
        const currentProtyle = getActiveEditor(false)?.protyle;
        const blockId = currentProtyle?.block?.id;
        if (!blockId) {
            pushErrMsg(t('aiSidebar.errors.noActiveDocument'));
            return;
        }
        const blocks = await sql(
            `SELECT * FROM blocks WHERE id = '${blockId}' OR root_id = '${blockId}'`
        );
        const docBlock = blocks?.find(b => b.type === 'd');
        if (!docBlock) {
            const rootId = blocks?.[0]?.root_id;
            if (rootId) {
                const rootBlocks = await sql(
                    `SELECT * FROM blocks WHERE id = '${rootId}' AND type = 'd'`
                );
                if (rootBlocks?.[0]) {
                    await addDocumentToContext(
                        rootBlocks[0].id,
                        rootBlocks[0].content || rootBlocks[0].fcontent || rootBlocks[0].id
                    );
                    return;
                }
            }
            pushErrMsg(t('aiSidebar.errors.noActiveDocument'));
            return;
        }
        await addDocumentToContext(
            docBlock.id,
            docBlock.content || docBlock.fcontent || docBlock.id
        );
    }

    // 基于已有上下文文档直接发送总结请求
    async function summarizeContextDoc() {
        if (contextDocuments.length === 0) return;
        currentInput = t('menu.summarizePrompt');
        await tick();
        sendMessage();
    }

    // 处理文档总结事件（从右键菜单触发）
    async function handleSummarizeDoc(event: CustomEvent) {
        const { docId } = event.detail;
        if (!docId) return;
        try {
            const blocks = await sql(`SELECT * FROM blocks WHERE id = '${docId}' AND type = 'd'`);
            const docBlock = blocks?.[0];
            if (!docBlock) return;
            const docTitle = docBlock.content || docBlock.fcontent || docId;
            // 添加文档到上下文
            await addDocumentToContext(docId, docTitle);
            // 设置输入并自动发送
            await tick();
            currentInput = t('menu.summarizePrompt');
            await tick();
            sendMessage();
        } catch (error) {
            console.error('Summarize doc error:', error);
            pushErrMsg(t('aiSidebar.errors.addDocumentFailed'));
        }
    }

    // 获取当前聚焦的编辑器
    function getProtyle() {
        return getActiveEditor(false)?.protyle;
    }

    // 获取当前聚焦的块ID
    function getFocusedBlockId(): string | null {
        const protyle = getProtyle();
        if (!protyle) return null;

        // 获取ID：当有聚焦块时获取聚焦块ID，否则获取文档ID
        return protyle.block?.id || protyle.options?.blockId || protyle.block?.parentID || null;
    }

    // 通过块ID添加文档
    async function addItemByBlockId(blockId: string, forceFocusedBlock: boolean = false) {
        try {
            // 如果是从拖放操作且有聚焦块，则使用聚焦块
            let targetBlockId = blockId;
            if (forceFocusedBlock) {
                const focusedId = getFocusedBlockId();
                if (focusedId) {
                    targetBlockId = focusedId;
                }
            }

            const safeTargetBlockId = targetBlockId.replace(/'/g, "''");
            const blocks = await sql(`
                SELECT b.id, b.type, b.content, b.root_id, d.content AS root_doc_content
                FROM blocks b
                LEFT JOIN blocks d ON d.id = b.root_id AND d.type = 'd'
                WHERE b.id = '${safeTargetBlockId}'
                LIMIT 1
            `);
            if (blocks && blocks.length > 0) {
                const block = blocks[0];
                let docId = targetBlockId;
                let docTitle = t('common.untitled');

                // 如果是文档块，直接添加
                if (block.type === 'd') {
                    docTitle = block.content || t('common.untitled');
                    await addDocumentToContext(docId, docTitle);
                } else {
                    // 普通块：文档标题已在联查中拿到
                    docTitle = block.root_doc_content || t('common.untitled');
                    // 添加该块的内容
                    await addBlockToContext(targetBlockId, docTitle, false);
                }
            }
        } catch (error) {
            console.error('Add block error:', error);
            pushErrMsg(t('aiSidebar.errors.addBlockFailed'));
        }
    }

    // 添加块到上下文（而不是整个文档）
    async function addBlockToContext(blockId: string, blockTitle: string, isDocOverride?: boolean) {
        // 检查是否已存在
        if (contextController.has(blockId)) {
            pushMsg(t('aiSidebar.success.blockExists'));
            return;
        }

        try {
            // 优先复用调用方传入的块类型，避免重复查询
            let isDoc = isDocOverride === true;
            if (isDocOverride === undefined) {
                const blockInfo = await getBlockByID(blockId);
                isDoc = blockInfo?.type === 'd'; // 'd' 表示文档块
            }

            // 获取块的Markdown内容
            const data = await exportMdContent(blockId, false, false, 2, 0, false);
            if (data && data.content) {
                // 检查是否为纯图片块（只包含图片Markdown语法）
                const content = data.content.trim();
                const imageRegex = /^!\[([^\]]*)\]\(([^)]+)\)$/;
                const match = content.match(imageRegex);

                if (match) {
                    // 这是一个纯图片块，自动上传图片
                    const imagePath = match[2]; // 图片路径，如 assets/xxx.png
                    const imageName = match[1] || '图片'; // 图片名称

                    try {
                        // 使用思源 API 获取图片文件
                        // 思源笔记的图片路径格式：assets/xxx-xxxxx.png
                        const blob = await getFileBlob(`/data/${imagePath}`);

                        if (blob) {
                            // 从文件路径提取文件名作为默认名称
                            const fileName = imagePath.split('/').pop() || 'image.png';
                            const file = new File([blob], imageName || fileName, {
                                type: blob.type,
                            });

                            // 使用统一的图片附件添加逻辑（包含保存到资源目录）
                            await addAttachmentFile(file);

                            pushMsg(t('aiSidebar.success.imageAutoUploaded'));
                            return; // 图片已作为附件添加，不需要再添加为上下文文档
                        } else {
                            console.warn('无法加载图片，将作为普通块处理');
                        }
                    } catch (error) {
                        console.error('自动上传图片失败:', error);
                        pushErrMsg(t('aiSidebar.errors.autoUploadImageFailed'));
                        // 失败时继续作为普通块处理
                    }
                }

                // 不是纯图片块或上传失败，按照原有逻辑处理
                // 从块内容中提取前20个字作为显示标题
                contextController.add({
                    id: blockId,
                    title: createContextTitle(
                        data.content,
                        blockTitle || (isDoc ? '文档内容' : '块内容')
                    ),
                    content: data.content,
                    type: isDoc ? 'doc' : 'block',
                });
            }
        } catch (error) {
            console.error('Add block error:', error);
            pushErrMsg(t('aiSidebar.errors.addBlockContentFailed'));
        }
    }

    // 删除上下文文档
    function removeContextDocument(docId: string) {
        contextController.remove(docId);
    }

    // 打开文档
    async function openDocument(docId: string) {
        try {
            await openBlock(docId);
        } catch (error) {
            console.error('Open document error:', error);
            pushErrMsg(t('aiSidebar.errors.openDocumentFailed'));
        }
    }

    // 处理拖放
    function handleDragOver(event: DragEvent) {
        const types = event.dataTransfer?.types;
        if (types && [...types].includes('application/multi-model-sort')) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        isDragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        const types = event.dataTransfer?.types;
        if (types && [...types].includes('application/multi-model-sort')) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        // 只在真正离开容器时才设置为false
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        if (
            event.clientX <= rect.left ||
            event.clientX >= rect.right ||
            event.clientY <= rect.top ||
            event.clientY >= rect.bottom
        ) {
            isDragOver = false;
        }
    }

    async function handleDrop(event: DragEvent) {
        const types = event.dataTransfer?.types;
        if (types && [...types].includes('application/multi-model-sort')) {
            return;
        }
        event.preventDefault();
        isDragOver = false;

        // 处理标准文件拖放
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            await attachmentWorkflow.addFiles(Array.from(files));
            return;
        }

        const type = event.dataTransfer.types[0];
        if (!type) return;

        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            const meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
            const info = meta.split(Constants.ZWSP);
            debugSidebar('Dropped gutter info:', info);
            const blockIdStr = info[2];
            const blockIds = blockIdStr
                .split(',')
                .map(id => id.trim())
                .filter(id => id && id !== '/');
            // 批量添加到上下文
            if (blockIds.length > 0) {
                for (const blockid of blockIds) {
                    await addItemByBlockId(blockid, false);
                }
            }
        } else if (type.startsWith(Constants.SIYUAN_DROP_FILE)) {
            // 支持单选和多选拖放
            const ele: HTMLElement = (window as any).siyuan?.dragElement;
            if (ele && ele.innerText) {
                // 获取块ID字符串，可能是单个ID或逗号分隔的多个ID
                const blockIdStr = ele.innerText;

                // 分割成多个块ID（多选时用逗号分隔）
                const blockIds = blockIdStr
                    .split(',')
                    .map(id => id.trim())
                    .filter(id => id && id !== '/');

                // 批量添加到上下文
                if (blockIds.length > 0) {
                    for (const blockid of blockIds) {
                        await addItemByBlockId(blockid, false);
                        // 恢复文档树节点的透明度
                        const item: HTMLElement = document.querySelector(
                            `.file-tree.sy__tree li[data-node-id="${blockid}"]`
                        );
                        if (item) {
                            item.style.opacity = '1';
                        }
                    }
                }

                (window as any).siyuan.dragElement = undefined;
            }
        } else if (event.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
            const data = event.dataTransfer.getData(Constants.SIYUAN_DROP_TAB);
            const payload = JSON.parse(data);

            // 检查是否是 webview 网页标签页
            // payload 中没有 type 字段，需要通过 customModelType 判断
            const customModelType = payload?.children?.customModelType;
            const tabTitle = payload?.title;
            const webviewUrl = payload?.children?.customModelData?.app?.url;

            // 判断是否是 webview 网页标签页：customModelType 包含 copilot-webapp
            const isWebViewTab = customModelType && customModelType.includes(WEBAPP_TAB_TYPE);
            debugSidebar(isWebViewTab, webviewUrl);
            debugSidebar(payload);
            if (isWebViewTab && webviewUrl) {
                // 是 webview 网页，直接使用 WebView 模式获取内容（因为已经是 webview 打开的）
                pushMsg(`正在获取网页内容: ${tabTitle || webviewUrl}`);

                try {
                    const webviewResult = await fetchWithWebView(webviewUrl);

                    if (webviewResult.success && webviewResult.markdown) {
                        // 从 URL 中提取文件名
                        const urlObj = new URL(webviewUrl);
                        const fileName = `${urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.md`;

                        // 保存为 SiYuan 资源
                        const assetPath = await saveAsset(
                            new Blob([webviewResult.markdown], { type: 'text/markdown' }),
                            fileName
                        );

                        // 添加到附件列表，标记为网页类型（与添加网页链接弹窗一致）
                        attachmentController.addWebPage(
                            webviewUrl,
                            webviewResult.markdown,
                            assetPath
                        );

                        pushMsg(`✓ 成功添加网页: ${webviewResult.title || tabTitle || webviewUrl}`);
                    } else {
                        pushErrMsg(`✗ 获取失败: ${webviewUrl} - ${webviewResult.error}`);
                    }
                } catch (error) {
                    console.error('获取网页内容失败:', error);
                    pushErrMsg(
                        `✗ 获取网页失败: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            } else {
                // 普通文档标签页
                const rootId = payload?.children?.rootId;
                if (rootId) {
                    await addItemByBlockId(rootId, false);
                }
            }

            const tab = document.querySelector(
                `li[data-type="tab-header"][data-id="${payload.id}"]`
            ) as HTMLElement;
            if (tab) {
                tab.style.opacity = 'unset';
            }
        }
    }

    // 会话管理函数
    async function loadSessions() {
        try {
            const loadedSessions = await sessionRepository.loadMetadataWithLegacy(
                () => plugin.loadData('chat-sessions.json')
            );
            sessions = loadedSessions.map(session => ({
                ...session,
                status: session.status || 'completed',
            }));
            // 会话迁移已在 index.ts 的 loadSettings 中统一处理
        } catch (error) {
            console.error('Load sessions error:', error);
            sessions = [];
        }
    }

    async function saveSessions(removedIds: string[] = []) {
        try {
            await sessionRepository.saveMetadata(sessions, activeSessions, removedIds);
        } catch (error) {
            console.error('Save sessions error:', error);
            pushErrMsg(t('aiSidebar.errors.saveSessionFailed'));
            throw error;
        }
    }

    function generateSessionTitle(): string {
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const firstMessage = getMessageText(userMessages[0].content);
            return firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        }
        return t('aiSidebar.session.new');
    }

    // 保存会话的锁，防止并发保存导致竞态条件
    let isSavingSession = false;
    let pendingSaveSilent: boolean | null = null;
    let isExtractingEpisodicMemory = false;

    async function triggerEpisodicMemoryExtraction() {
        if (isExtractingEpisodicMemory || !settings.memory?.enabled || !settings.memory?.autoExtract) {
            return;
        }
        if (!currentSessionId || !settings.memory?.notebookId) {
            return;
        }

        isExtractingEpisodicMemory = true;
        try {
            const docId = await extractEpisodicMemory({
                settings,
                sessionId: currentSessionId,
                messages,
                modelId: currentModelId,
                serverUrl: settings.aiProviders?.opencode?.serverUrl,
            });
            await plugin.saveSettings(settings);
            updateSettings(JSON.parse(JSON.stringify(settings)));
            if (docId) {
                console.info('[memory] episodic memory saved:', docId);
            }
        } catch (error) {
            console.warn('[memory] extract episodic memory failed:', error);
        } finally {
            isExtractingEpisodicMemory = false;
        }
    }

    async function saveCurrentSession(silent: boolean = false) {
        if (messages.filter(m => m.role !== 'system').length === 0) {
            if (!silent) {
                pushErrMsg(t('aiSidebar.errors.emptySession'));
            }
            return;
        }

        // 如果正在保存，标记待处理的保存请求
        if (isSavingSession) {
            pendingSaveSilent = silent;
            return;
        }

        isSavingSession = true;

        try {
            const sessionId = currentSessionId || createSessionId();
            const result = await sessionRepository.upsertConversation({
                sessions,
                sessionId,
                messages,
                activeSessionIds: activeSessions,
                fallbackTitle: generateSessionTitle(),
            });
            sessions = result.sessions;
            if (result.created) replaceActiveDraftWithTask(sessionId);
            currentSessionId = sessionId;
            hasUnsavedChanges = false;
            void triggerEpisodicMemoryExtraction();

            if (!silent) {
                pushMsg(t('aiSidebar.success.saveSessionSuccess'));
            }
        } catch (error) {
            hasUnsavedChanges = true;
            console.error('Save current session error:', error);
            if (!silent) {
                pushErrMsg(t('aiSidebar.errors.saveSessionFailed'));
            }
        } finally {
            isSavingSession = false;
            // 如果有待处理的保存请求，执行它
            if (pendingSaveSilent !== null) {
                const silentToUse = pendingSaveSilent;
                pendingSaveSilent = null;
                setTimeout(() => {
                    saveCurrentSession(silentToUse).catch(error => {
                        console.error('Pending save session error:', error);
                    });
                }, 0);
            }
        }
    }

    async function saveTaskStateSession(taskId: string, state: SidebarSessionState) {
        if (!taskId || state.messages.filter(m => m.role !== 'system').length === 0) {
            return;
        }

        const result = await sessionRepository.upsertConversation({
            sessions,
            sessionId: taskId,
            messages: state.messages,
            activeSessionIds: activeSessions,
            fallbackTitle: taskId.slice(0, 8),
        });
        sessions = result.sessions;
    }

    function finalizePendingSelection() {
        if (!isWaitingForAnswerSelection || multiModelResponses.length === 0) return;
        const finalized = finalizePendingMultiModel(messages, multiModelResponses);
        if (finalized !== messages) {
            messages = finalized;
            hasUnsavedChanges = true;
        }
    }

    async function loadSession(sessionId: string) {
        saveActiveTaskState();
        ensureActiveTaskTab(sessionId);
        clearTaskUnread(sessionId);

        finalizePendingSelection();
        const flushedState = flushBackgroundTaskState(sessionId);
        const storedState = taskStateController.getForeground(sessionId);
        if (flushedState || storedState) {
            currentSessionId = sessionId;
            activeDraftTaskId = '';
            applyTaskState(flushedState || storedState);
            await scrollToTop();
            return;
        }

        await doLoadSession(sessionId);
    }

    async function doLoadSession(sessionId: string) {
        const sessionMetadata = sessions.find(s => s.id === sessionId);
        if (sessionMetadata) {
            try {
                // 加载完整内容 (使用 getFileBlob 因为 saveData 路径不一致，或者由于前缀问题)
                // 或者继续使用 loadData 但它是相对的。
                // 如果我们用 putFile 存了，我们也应该用对应的 read 方式。
                const loadedMessages = await sessionRepository.loadMessages(sessionId);
                const hydrated = await hydrateSessionMessages(loadedMessages);
                messages = hydrated.messages;
                let sessionModified = hydrated.modified;

                // 清空全局上下文文档（上下文现在存储在各个消息中）
                contextController.replace([]);
                // 确保系统提示词存在且是最新的
                if (settings.aiSystemPrompt) {
                    const systemMsgIndex = messages.findIndex(m => m.role === 'system');
                    if (systemMsgIndex >= 0) {
                        messages[systemMsgIndex].content = settings.aiSystemPrompt;
                    } else {
                        messages.unshift({ role: 'system', content: settings.aiSystemPrompt });
                    }
                }
                currentSessionId = sessionId;
                activeDraftTaskId = '';
                ensureActiveTaskTab(sessionId);
                clearTaskUnread(sessionId);
                hasUnsavedChanges = false;

                // 如果会话被修改（迁移了 base64 图片或自动选择了模型），自动保存
                if (sessionModified) {
                    debugSidebar('Session was modified during load, saving...');
                    await saveCurrentSession(true); // 静默保存
                }

                // 清除多模型状态
                multiModelResponses = [];
                isWaitingForAnswerSelection = false;
                selectedAnswerIndex = null;
                selectedTabIndex = 0;

                // 切换到历史会话时默认显示最开头（最早消息）而不是底部
                await scrollToTop();
            } catch (e) {
                console.error('Failed to load session content:', e);
                pushErrMsg('加载会话失败');
            }
        }
    }

    async function newSession() {
        saveActiveTaskState();
        finalizePendingSelection();
        // 如果有未保存的更改，自动保存当前会话
        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            await saveCurrentSession();
        }
        doNewSession();
    }

    function doNewSession() {
        const draftId = createDraftTaskId();
        const state = blankTaskState();
        activeDraftTaskId = draftId;
        currentSessionId = '';
        clearTaskUnread(draftId);
        taskStateController.addDraft(draftId, state, activeTaskKey(), activeSessions);
        syncTaskControllerState();
        applyTaskState(state);
        contextController.replace(state.contextDocuments);
        currentSessionId = '';
        hasUnsavedChanges = false;

        // 清除多模型状态
        multiModelResponses = [];
        isWaitingForAnswerSelection = false;
        selectedAnswerIndex = null;
        selectedTabIndex = 0;
    }

    async function selectActiveTaskTab(taskId: string) {
        if (!taskId) return;
        clearTaskUnread(taskId);
        if (taskId === activeTaskKey()) return;
        saveActiveTaskState();
        if (isDraftTaskId(taskId)) {
            currentSessionId = '';
            activeDraftTaskId = taskId;
            const state = taskStateController.getForeground(taskId) || blankTaskState();
            taskStateController.saveForeground(taskId, state);
            applyTaskState(state);
            return;
        }
        await loadSession(taskId);
    }

    async function closeActiveTaskTab(taskId: string, event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (activeTaskIds.length <= 1) {
            doNewSession();
            return;
        }
        const isCurrent = taskId === activeTaskKey();
        const currentIndex = activeTaskIds.indexOf(taskId);
        taskStateController.removeTask(taskId);
        syncTaskControllerState();

        if (isCurrent) {
            const nextIndex = Math.min(Math.max(currentIndex, 0), activeTaskIds.length - 1);
            currentSessionId = '';
            activeDraftTaskId = '';
            await selectActiveTaskTab(activeTaskIds[nextIndex]);
        }
    }

    async function deleteSession(sessionId: string) {
        confirm(
            t('aiSidebar.confirm.deleteSession.title'),
            t('aiSidebar.confirm.deleteSession.message'),
            async () => {
                // 【修复】删除前重新加载最新的会话列表，避免多页签覆盖问题
                await loadSessions();
                sessions = sessions.filter(s => s.id !== sessionId);
                await saveSessions([sessionId]);

                // 删除独立会话文件 (SiYuan removeFile 路径相对于 workspace root)
                try {
                    await sessionRepository.delete(sessionId);
                } catch (e) {
                    // 忽略错误
                }

                if (currentSessionId === sessionId) {
                    doNewSession();
                }
                taskStateController.removeTask(sessionId);
                syncTaskControllerState();
            }
        );
    }

    // 批量删除会话
    async function batchDeleteSessions(sessionIds: string[]) {
        if (!sessionIds || sessionIds.length === 0) {
            return;
        }

        const count = sessionIds.length;
        confirm(
            '批量删除会话',
            `确定要删除选中的 ${count} 个会话吗？此操作不可恢复。`,
            async () => {
                // 【修复】删除前重新加载最新的会话列表，避免多页签覆盖问题
                await loadSessions();

                // 过滤掉要删除的会话
                sessions = sessions.filter(s => !sessionIds.includes(s.id));
                await saveSessions(sessionIds);

                // 批量删除独立会话文件
                for (const id of sessionIds) {
                    try {
                        await sessionRepository.delete(id);
                    } catch (e) {
                        // 忽略错误
                    }
                }

                // 如果当前会话被删除，创建新会话
                if (sessionIds.includes(currentSessionId)) {
                    doNewSession();
                }
                for (const id of sessionIds) {
                    taskStateController.removeTask(id);
                }
                syncTaskControllerState();

                pushMsg(`成功删除 ${count} 个会话`);
            }
        );
    }

    // 处理保存会话到笔记
    async function handleSaveSessionToNote(sessionId: string) {
        try {
            // 加载会话消息
            const path = getSessionPath(sessionId);
            const blob =
                await getPluginFileBlob(path) ||
                await getPluginFileBlob(getLegacySessionPath(sessionId));
            if (!blob) {
                pushErrMsg('会话文件不存在');
                return;
            }
            const text = await blob.text();
            const sessionData = JSON.parse(text);
            const sessionMessages = sessionData?.messages || [];

            if (sessionMessages.length === 0) {
                pushErrMsg(t('aiSidebar.errors.emptySession'));
                return;
            }

            const session = sessions.find(item => item.id === sessionId);
            const snapshot = createSessionExportSnapshot(
                sessionId,
                session?.title || generateSessionTitle(),
                sessionMessages
            );
            await openSaveToNoteDialog(null, snapshot);
        } catch (error) {
            console.error('Save session to note error:', error);
            pushErrMsg('加载会话失败: ' + error.message);
        }
    }

    async function handleExportSessionFile(sessionId: string) {
        try {
            const session = sessions.find(item => item.id === sessionId);
            if (!session) throw new Error('会话不存在');
            const blob =
                (await getPluginFileBlob(getSessionPath(sessionId))) ||
                (await getPluginFileBlob(getLegacySessionPath(sessionId)));
            if (!blob) throw new Error('会话文件不存在');
            const sessionData = JSON.parse(await blob.text());
            const markdownBody = buildSessionMarkdown(
                sessionData?.messages || [],
                getSessionExportContext()
            );
            if (!markdownBody.trim()) throw new Error('会话没有可导出的消息');

            const markdown = [
                `# ${session.title}`,
                `> 创建时间：${new Date(session.createdAt).toLocaleString('zh-CN')}`,
                `> 更新时间：${new Date(session.updatedAt).toLocaleString('zh-CN')}`,
                markdownBody,
            ].join('\n\n');
            const downloadBlob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(downloadBlob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${sanitizeDocumentName(session.title)}.md`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            pushMsg(t('aiSidebar.session.exportSuccess'));
        } catch (error) {
            console.error('Export session file error:', error);
            pushErrMsg(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // 处理会话更新（如钉住状态变化）
    async function handleSessionUpdate(updatedSessions: ChatSession[]) {
        // 【修复】更新前重新加载最新的会话列表，避免多页签覆盖问题
        await loadSessions();

        // 找到被更新的会话，只更新这些会话的数据
        for (const updatedSession of updatedSessions) {
            const index = sessions.findIndex(s => s.id === updatedSession.id);
            if (index >= 0) {
                // 只更新会话的属性，保留其他实例可能修改的 messages
                sessions[index] = {
                    ...sessions[index],
                    ...updatedSession,
                };
            }
        }

        await saveSessions();
    }

    async function resolveCurrentDocumentForExport(): Promise<{ path: string; notebookId: string }> {
        const focusedBlockId = getFocusedBlockId();
        if (!focusedBlockId) return { path: '/', notebookId: '' };
        try {
            const block = await getBlockByID(focusedBlockId);
            if (!block) return { path: '/', notebookId: '' };
            return {
                path: (await getHPathByID(block.root_id)) || '/',
                notebookId: block.box || '',
            };
        } catch (error) {
            console.error('Get current document info error:', error);
            return { path: '/', notebookId: '' };
        }
    }

    async function openSaveToNoteDialog(
        messageIndex: number | null = null,
        snapshot?: SessionExportSnapshot
    ) {
        const currentSession = sessions.find(session => session.id === currentSessionId);
        const sourceMessages = snapshot?.messages || messages;
        const messagesToExport =
            messageIndex === null
                ? sourceMessages.filter(
                      message => message?.role === 'user' || message?.role === 'assistant'
                  )
                : [sourceMessages[messageIndex]].filter(Boolean);
        if (messagesToExport.length === 0) {
            pushErrMsg(t('aiSidebar.errors.emptySession'));
            return;
        }
        await saveToNoteDialog.show(
            createSessionExportSnapshot(
                snapshot?.sessionId || currentSessionId,
                snapshot?.title || currentSession?.title || generateSessionTitle(),
                messagesToExport
            )
        );
    }
    // 打开插件设置
    function openSettings() {
        plugin.openSetting();
    }

    // 在页签打开
    function openInTab() {
        plugin.openAITab();
    }

    // 在新窗口打开
    function openInNewWindow() {
        plugin.openAIWindow();
    }

    // 提示词管理函数
    async function loadPrompts() {
        try {
            const data = await plugin.loadData('prompts.json');
            prompts = data?.prompts || [];
        } catch (error) {
            console.error('Load prompts error:', error);
            prompts = [];
        }
    }

    async function savePrompts() {
        try {
            await plugin.saveData('prompts.json', { prompts });
        } catch (error) {
            console.error('Save prompts error:', error);
            pushErrMsg(t('aiSidebar.errors.savePromptFailed'));
        }
    }

    function openPromptManager() {
        isAddMenuOpen = false;
        isPromptSelectorOpen = false;
        isPromptManagerOpen = true;
        editingPrompt = null;
        newPromptTitle = '';
        newPromptContent = '';
    }

    function closePromptManager() {
        isPromptManagerOpen = false;
        editingPrompt = null;
        newPromptTitle = '';
        newPromptContent = '';
    }

    async function saveNewPrompt() {
        if (!newPromptTitle.trim() || !newPromptContent.trim()) {
            pushErrMsg(t('aiSidebar.errors.emptyPromptContent'));
            return;
        }

        const now = Date.now();
        if (editingPrompt) {
            // 编辑现有提示词
            const index = prompts.findIndex(p => p.id === editingPrompt.id);
            if (index >= 0) {
                prompts[index] = {
                    ...prompts[index],
                    title: newPromptTitle.trim(),
                    content: newPromptContent.trim(),
                };
                prompts = [...prompts];
            }
        } else {
            // 创建新提示词
            const newPrompt: Prompt = {
                id: `prompt_${now}`,
                title: newPromptTitle.trim(),
                content: newPromptContent.trim(),
                createdAt: now,
            };
            prompts = [newPrompt, ...prompts];
        }

        await savePrompts();
        closePromptManager();
    }

    function editPrompt(prompt: Prompt) {
        editingPrompt = prompt;
        newPromptTitle = prompt.title;
        newPromptContent = prompt.content;
        isAddMenuOpen = false;
        isPromptSelectorOpen = false;
        isPromptManagerOpen = true;
    }

    // 删除提示词
    async function deletePrompt(promptId: string) {
        confirm(
            t('aiSidebar.confirm.deletePrompt.title'),
            t('aiSidebar.confirm.deletePrompt.message'),
            async () => {
                prompts = prompts.filter(p => p.id !== promptId);
                await savePrompts();
            }
        );
    }

    // 获取工具的显示名称
    function getToolDisplayName(toolName: string): string {
        const key = `tools.${toolName}.name`;
        const name = t(key);
        return name === key ? toolName : name;
    }

    function usePrompt(prompt: Prompt) {
        currentInput = prompt.content;
        isAddMenuOpen = false;
        isPromptSelectorOpen = false;
        tick().then(() => {
            autoResizeTextarea();
            textareaElement?.focus();
        });
    }

    // 点击外部关闭提示词选择器
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;

        if (
            isAddMenuOpen &&
            !target.closest('.ai-sidebar__add-menu') &&
            !target.closest('.ai-sidebar__add-trigger')
        ) {
            isAddMenuOpen = false;
            isPromptSelectorOpen = false;
        }

        if (
            isStatusMenuOpen &&
            !target.closest('.ai-sidebar__status-menu') &&
            !target.closest('.ai-sidebar__status-trigger') &&
            !target.closest('.multi-model-selector__dropdown')
        ) {
            isStatusMenuOpen = false;
            isModelSelectorOpen = false;
        }

        // 关闭右键菜单
        if (contextMenuVisible && !target.closest('.ai-sidebar__context-menu')) {
            closeContextMenu();
        }

        if (
            isTokenDetailsOpen &&
            !target.closest('.ai-sidebar__token-widget') &&
            !target.closest('.ai-sidebar__token-popover')
        ) {
            isTokenDetailsOpen = false;
        }

    }

    type ToolChangeContext = {
        operationType: 'update' | 'insert' | 'delete' | 'rename';
        docId: string;
        docTitle: string;
        oldDocTitle: string;
        affectedBlockId: string;
        renameTitleTo?: string;
    };

    async function getDocDisplayTitle(docId: string): Promise<string> {
        try {
            const hpath = await getHPathByID(docId);
            if (typeof hpath === 'string' && hpath.trim() && hpath !== docId) {
                return hpath;
            }
        } catch (error) {
            console.warn('获取文档路径失败:', error);
        }

        try {
            const docBlock = await getBlockByID(docId);
            if (docBlock?.content) {
                return docBlock.content;
            }
        } catch (error) {
            console.warn('通过 getBlockByID 获取文档标题失败:', error);
        }

        try {
            const safeDocId = escapeSqlString(docId);
            const rows = await sql(`SELECT content FROM blocks WHERE id = '${safeDocId}' LIMIT 1`);
            const title = rows?.[0]?.content;
            if (typeof title === 'string' && title.trim()) {
                return title;
            }
        } catch (error) {
            console.warn('通过 SQL 获取文档标题失败:', error);
        }

        return `文档 ${docId}`;
    }

    async function getDocNameById(docId: string): Promise<string> {
        try {
            const docBlock = await getBlockByID(docId);
            if (docBlock?.content && docBlock.content.trim()) {
                return docBlock.content.trim();
            }
        } catch (error) {
            console.warn('通过 getBlockByID 获取文档标题失败:', error);
        }

        try {
            const safeDocId = escapeSqlString(docId);
            const rows = await sql(`SELECT content FROM blocks WHERE id = '${safeDocId}' LIMIT 1`);
            const title = rows?.[0]?.content;
            if (typeof title === 'string' && title.trim()) {
                return title.trim();
            }
        } catch (error) {
            console.warn('通过 SQL 获取文档标题失败:', error);
        }

        return '';
    }

    async function resolveToolChangeContext(toolCall: ToolCall): Promise<ToolChangeContext | null> {
        const toolName = toolCall.function.name;
        if (
            toolName !== 'siyuan_update_block' &&
            toolName !== 'siyuan_insert_block' &&
            toolName !== 'siyuan_delete_block' &&
            toolName !== 'siyuan_rename_document'
        ) {
            return null;
        }

        try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            let operationType: ToolChangeContext['operationType'];
            let targetBlockId = '';

            if (toolName === 'siyuan_update_block') {
                operationType = 'update';
                targetBlockId = args.id || '';
            } else if (toolName === 'siyuan_insert_block') {
                operationType = 'insert';
                targetBlockId =
                    args.nextID || args.previousID || args.parentID || args.appendParentID || '';
            } else if (toolName === 'siyuan_rename_document') {
                operationType = 'rename';
                targetBlockId = args.id || '';
            } else {
                operationType = 'delete';
                targetBlockId = args.id || '';
            }

            if (!targetBlockId) {
                return null;
            }

            let blockInfo = await getBlockByID(targetBlockId);
            if (!blockInfo) {
                try {
                    const safeBlockId = escapeSqlString(targetBlockId);
                    const rows = await sql(
                        `SELECT id, root_id, type FROM blocks WHERE id = '${safeBlockId}' LIMIT 1`
                    );
                    blockInfo = rows?.[0] || null;
                } catch (error) {
                    console.warn('通过 SQL 获取块信息失败:', error);
                }
            }
            const docId =
                blockInfo?.type === 'd' ? blockInfo.id : blockInfo?.root_id || targetBlockId;

            const docTitle = await getDocDisplayTitle(docId);
            const currentDocName = (await getDocNameById(docId)) || docTitle;

            return {
                operationType,
                docId,
                docTitle,
                affectedBlockId: targetBlockId,
                renameTitleTo:
                    toolName === 'siyuan_rename_document'
                        ? String(args.title || '').trim()
                        : undefined,
                oldDocTitle: currentDocName,
            };
        } catch (error) {
            console.warn('解析工具调用参数失败，无法生成汇总差异记录:', error);
            return null;
        }
    }

    async function ensureDocDiffSnapshotBefore(
        messageIndex: number,
        changeContext: ToolChangeContext
    ) {
        if (messageIndex < 0) {
            return;
        }

        let messageDiffMap = pendingDocDiffsByMessage.get(messageIndex);
        if (!messageDiffMap) {
            messageDiffMap = new Map<string, PendingDocDiff>();
            pendingDocDiffsByMessage.set(messageIndex, messageDiffMap);
        }

        let pendingDiff = messageDiffMap.get(changeContext.docId);
        if (!pendingDiff) {
            const oldMdData = await exportMdContent(changeContext.docId, false, false, 2, 0, false);
            const oldContent = oldMdData?.content || '';

            pendingDiff = {
                docId: changeContext.docId,
                docTitle: changeContext.docTitle,
                oldDocTitle: changeContext.oldDocTitle || changeContext.docTitle,
                newDocTitle: changeContext.oldDocTitle || changeContext.docTitle,
                oldContent,
                newContent: oldContent,
                affectedBlockIds: new Set<string>(),
            };
            messageDiffMap.set(changeContext.docId, pendingDiff);
        }

        if (changeContext.renameTitleTo) {
            pendingDiff.newDocTitle = changeContext.renameTitleTo;
            pendingDiff.docTitle = changeContext.renameTitleTo;
        }
        pendingDiff.affectedBlockIds.add(changeContext.affectedBlockId);
    }

    async function refreshDocDiffSnapshotAfter(
        messageIndex: number,
        changeContext: ToolChangeContext
    ) {
        const messageDiffMap = pendingDocDiffsByMessage.get(messageIndex);
        const pendingDiff = messageDiffMap?.get(changeContext.docId);
        if (!pendingDiff) {
            return;
        }

        const newMdData = await exportMdContent(changeContext.docId, false, false, 2, 0, false);
        pendingDiff.newContent = newMdData?.content || '';
        if (!changeContext.renameTitleTo) {
            pendingDiff.newDocTitle = await getDocNameById(changeContext.docId);
            pendingDiff.docTitle = pendingDiff.newDocTitle || pendingDiff.docTitle;
        } else {
            pendingDiff.newDocTitle = changeContext.renameTitleTo;
            pendingDiff.docTitle = changeContext.renameTitleTo;
        }
        pendingDiff.affectedBlockIds.add(changeContext.affectedBlockId);
    }

    function commitPendingDocDiffsToMessage(messageIndex: number) {
        const messageDiffMap = pendingDocDiffsByMessage.get(messageIndex);
        if (!messageDiffMap || messageDiffMap.size === 0) {
            pendingDocDiffsByMessage.delete(messageIndex);
            return;
        }

        const message = messages[messageIndex];
        if (!message || message.role !== 'assistant') {
            pendingDocDiffsByMessage.delete(messageIndex);
            return;
        }

        const summaryDiffs: EditOperation[] = [];
        for (const pendingDiff of messageDiffMap.values()) {
            const contentChanged = pendingDiff.oldContent !== pendingDiff.newContent;
            const titleChanged = pendingDiff.oldDocTitle !== pendingDiff.newDocTitle;
            if (!contentChanged && !titleChanged) {
                continue;
            }

            summaryDiffs.push({
                operationType: 'update',
                blockId: pendingDiff.docId,
                docId: pendingDiff.docId,
                docTitle: pendingDiff.docTitle,
                oldDocTitle: pendingDiff.oldDocTitle,
                newDocTitle: pendingDiff.newDocTitle,
                affectedBlockIds: Array.from(pendingDiff.affectedBlockIds),
                oldContent: pendingDiff.oldContent,
                oldContentForDisplay: pendingDiff.oldContent,
                newContent: pendingDiff.newContent,
                newContentForDisplay: normalizeOperationContentForDiff(pendingDiff.newContent),
                status: 'applied',
            });
        }

        if (summaryDiffs.length === 0) {
            pendingDocDiffsByMessage.delete(messageIndex);
            return;
        }

        message.editOperations = [...(message.editOperations || []), ...summaryDiffs];
        messages = [...messages];
        hasUnsavedChanges = true;
        pendingDocDiffsByMessage.delete(messageIndex);
    }

    // 查看差异
    async function viewDiff(operation: EditOperation) {
        const operationType = operation.operationType || 'update';

        if (operationType === 'insert') {
            // 插入操作：旧内容为空，新内容为要插入的内容
            const newMdContent =
                operation.newContentForDisplay ||
                operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();

            currentDiffOperation = {
                ...operation,
                oldContent: '', // 插入操作没有旧内容
                newContent: operation.newContentForDisplay || newMdContent,
            };
        } else {
            // 更新操作
            // 使用保存的Markdown格式内容来显示差异
            // 这样可以看到真正的修改前内容，即使块已经被修改了
            let oldMdContent = operation.oldContentForDisplay || operation.oldContent || '';
            let newMdContent =
                operation.newContentForDisplay ||
                operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();

            // 文档重命名差异：在对比内容头部注入标题信息，确保即使正文不变也可见
            if (
                operation.oldDocTitle &&
                operation.newDocTitle &&
                operation.oldDocTitle !== operation.newDocTitle
            ) {
                const oldTitleLine = `# 文档标题: ${operation.oldDocTitle}\n\n`;
                const newTitleLine = `# 文档标题: ${operation.newDocTitle}\n\n`;
                oldMdContent = oldTitleLine + oldMdContent;
                newMdContent = newTitleLine + newMdContent;
            }

            // 如果没有保存的显示内容（兼容旧数据），尝试实时获取
            if (!operation.oldContentForDisplay) {
                try {
                    const oldMdData = await exportMdContent(
                        operation.blockId,
                        false,
                        false,
                        2,
                        0,
                        false
                    );
                    if (oldMdData?.content) {
                        operation.oldContentForDisplay = oldMdData.content;
                    }
                } catch (error) {
                    console.error('获取块内容失败:', error);
                }
            }

            // 创建用于显示的临时operation对象
            currentDiffOperation = {
                ...operation,
                oldContent: oldMdContent,
                newContent: newMdContent,
            };
        }

        isDiffDialogOpen = true;
    }

    // 关闭差异对话框
    function closeDiffDialog() {
        isDiffDialogOpen = false;
        currentDiffOperation = null;
    }

    // 消息操作函数
    // 开始编辑消息
    function startEditMessage(index: number) {
        editingMessageIndex = index;
        editingMessageContent = getActualMessageContent(messages[index]);
        isEditDialogOpen = true;
    }

    // 取消编辑消息
    function cancelEditMessage() {
        editingMessageIndex = null;
        editingMessageContent = '';
        isEditDialogOpen = false;
    }

    // 保存编辑的消息
    function saveEditMessage() {
        if (editingMessageIndex === null) return;

        const message = messages[editingMessageIndex];
        const newContent = editingMessageContent.trim();

        // 如果是多模型响应，更新被选中的模型的内容
        if (message.multiModelResponses && message.multiModelResponses.length > 0) {
            const selectedIndex = message.multiModelResponses.findIndex(r => r.isSelected);
            if (selectedIndex !== -1) {
                // 更新被选中模型的内容
                message.multiModelResponses[selectedIndex].content = newContent;
                // 记录用户对该模型答案的手动编辑，便于切换时保留改动
                if (!message._editedSelections) message._editedSelections = {};
                message._editedSelections[selectedIndex] = newContent;
            }
            // 同时更新主 content 字段（用于显示和其他操作）
            message.content = newContent;
        } else {
            // 普通消息，直接更新 content
            message.content = newContent;
        }

        messages = [...messages];
        hasUnsavedChanges = true;

        editingMessageIndex = null;
        editingMessageContent = '';
        isEditDialogOpen = false;
    }

    // 在历史消息的多模型响应中选择某个模型的答案（支持切换并保留手动编辑）
    function selectHistoryMultiModelAnswer(absMessageIndex: number, responseIndex: number) {
        const msg = messages[absMessageIndex];
        if (!msg || !msg.multiModelResponses || msg.multiModelResponses.length === 0) return;

        const prevSelected = msg.multiModelResponses.findIndex(r => r.isSelected);
        if (prevSelected === responseIndex) return;

        // 保存当前显示内容到编辑缓存（如果有）
        msg._editedSelections = msg._editedSelections || {};
        if (prevSelected !== -1) {
            msg._editedSelections[prevSelected] = msg.content;
        }

        // 更新选中标记并优化名称显示
        msg.multiModelResponses = msg.multiModelResponses.map((r, i) => {
            return {
                ...r,
                isSelected: i === responseIndex,
                modelName: cleanModelName(r.modelName),
            };
        });

        // 如果之前对目标答案有手动编辑，则恢复编辑内容，否则使用模型原始内容
        const edited = msg._editedSelections[responseIndex];
        msg.content = edited ?? msg.multiModelResponses[responseIndex].content;

        messages = [...messages];
        hasUnsavedChanges = true;
        // 保存会话状态
        saveCurrentSession(true);
    }

    // 删除消息
    function deleteMessage(index: number) {
        confirm(
            t('aiSidebar.confirm.deleteMessage.title'),
            t('aiSidebar.confirm.deleteMessage.message'),
            () => {
                messages = messages.filter((_, i) => i !== index);
                hasUnsavedChanges = true;
            }
        );
    }

    // 重新生成统一复用发送入口，避免维护第二套模型执行生命周期
    async function regenerateMessage(index: number) {
        if (isLoading) return pushErrMsg(t('aiSidebar.errors.generating'));
        const target = messages[index];
        if (!target) return pushErrMsg(t('aiSidebar.errors.noMessage'));

        let userIndex = target.role === 'user' ? index : -1;
        if (userIndex < 0) {
            for (let cursor = index - 1; cursor >= 0; cursor--) {
                if (messages[cursor].role === 'user') {
                    userIndex = cursor;
                    break;
                }
            }
        }
        if (userIndex < 0) return pushErrMsg(t('aiSidebar.errors.noUserMessage'));

        const userMessage = messages[userIndex];
        const responseMessage =
            target.role === 'assistant'
                ? target
                : messages
                      .slice(userIndex + 1)
                      .find(message => message.role === 'assistant');
        const previousChoices: MultiModelChoice[] = (
            responseMessage?.multiModelResponses || []
        ).map(response => ({
            provider: response.provider,
            modelId: response.modelId,
            thinkingEnabled: response.thinkingEnabled,
            thinkingEffort: response.thinkingEffort,
        }));

        messages = messages.slice(0, userIndex);
        currentInput = getMessageText(userMessage.content);
        attachmentController.replace(userMessage.attachments || []);
        contextController.replace(userMessage.contextDocuments || []);
        hasUnsavedChanges = true;

        const originalChoices = [...selectedMultiModels];
        const originalMultiModelEnabled = enableMultiModel;
        if (chatMode === 'plan' && enableMultiModel) {
            const currentValid = selectedMultiModels.filter(choice =>
                getProviderAndModelConfig(choice.provider, choice.modelId)
            );
            const previousValid = previousChoices.filter(choice =>
                getProviderAndModelConfig(choice.provider, choice.modelId)
            );
            selectedMultiModels = currentValid.length ? currentValid : previousValid;
            enableMultiModel = selectedMultiModels.length > 0;
            if (!currentValid.length && previousValid.length) {
                pushMsg('当前选择的多模型无效，将使用之前的模型重新生成');
            }
        }

        try {
            await sendMessage();
        } finally {
            selectedMultiModels = originalChoices;
            enableMultiModel = originalMultiModelEnabled;
        }
    }

    // 将消息数组分组，合并连续的 AI 相关消息
    interface MessageGroup {
        type: 'user' | 'assistant';
        messages: Message[];
        startIndex: number; // 原始消息数组中的起始索引
    }

    function groupMessages(messages: Message[]): MessageGroup[] {
        const groups: MessageGroup[] = [];
        let currentGroup: MessageGroup | null = null;

        messages.forEach((message, index) => {
            // 跳过 system 消息
            if (message.role === 'system') {
                return;
            }

            if (message.role === 'user') {
                // 用户消息：结束当前组，开始新的用户组
                if (currentGroup) {
                    groups.push(currentGroup);
                }
                currentGroup = {
                    type: 'user',
                    messages: [message],
                    startIndex: index,
                };
            } else if (message.role === 'assistant' || message.role === 'tool') {
                // AI 或工具消息
                if (!currentGroup || currentGroup.type === 'user') {
                    // 如果没有当前组或当前组是用户组，结束当前组并开始新的 AI 组
                    if (currentGroup) {
                        groups.push(currentGroup);
                    }
                    currentGroup = {
                        type: 'assistant',
                        messages: [message],
                        startIndex: index,
                    };
                } else {
                    // 继续添加到当前 AI 组
                    currentGroup.messages.push(message);
                }
            }
        });

        // 添加最后一个组
        if (currentGroup) {
            groups.push(currentGroup);
        }

        return groups;
    }

    // 响应式计算消息组
    $: messageGroups = groupMessages(messages);
</script>

<div
    class="ai-sidebar"
    class:ai-sidebar--fullscreen={isFullscreen}
    class:ai-sidebar--sidebar={mode === 'sidebar'}
    class:ai-sidebar--dialog={mode === 'dialog'}
    bind:this={sidebarContainer}
    on:keydown={handleModeShortcut}
>
    <!-- 顶部标题栏 -->
    <div class="ai-sidebar__header">
        <div class="ai-sidebar__brand">
            <div class="ai-sidebar__brand-icon">
                <img src={openCodeIconUrl} alt="" aria-hidden="true" />
            </div>
            <div class="ai-sidebar__brand-text">
                <div class="ai-sidebar__brand-name">OpenCode</div>
                <div
                    class="ai-sidebar__brand-status"
                    class:ai-sidebar__brand-status--connected={$connectionStatusStore.state === 'connected'}
                    class:ai-sidebar__brand-status--connecting={$connectionStatusStore.state === 'connecting'}
                    class:ai-sidebar__brand-status--disconnected={$connectionStatusStore.state === 'disconnected'}
                    title={$connectionStatusStore.error || $connectionStatusStore.serverUrl || 'OpenCode'}
                >
                    <span class="ai-sidebar__status-dot"></span>
                    <span>{getConnectionLabel($connectionStatusStore)}</span>
                    {#if $connectionStatusStore.state === 'disconnected' && $connectionStatusStore.serverUrl}
                        <button
                            type="button"
                            class="ai-sidebar__status-retry"
                            on:click={refreshHealth}
                        >
                            重连
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <TaskToolbar
        bind:sessions
        bind:currentSessionId
        bind:isSessionManagerOpen
        {isFullscreen}
        onNew={newSession}
        onLoad={loadSession}
        onDelete={deleteSession}
        onBatchDelete={batchDeleteSessions}
        onRefresh={loadSessions}
        onUpdate={handleSessionUpdate}
        onSaveToNote={handleSaveSessionToNote}
        onExportFile={handleExportSessionFile}
        onCopyAll={copyAsMarkdown}
        onSaveCurrent={() => openSaveToNoteDialog()}
        onClear={clearChat}
        onOpenTab={openInTab}
        onOpenWindow={openInNewWindow}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={openSettings}
    />

    <MessageList
        bind:messagesContainer
        bind:multiModelLayout
        bind:selectedTabIndex
        bind:toolCallResultsExpanded
        bind:toolCallsExpanded
        bind:streamingThinkingCollapsed
        bind:streamingToolCallsCollapsed
        {chatMode}
        {copyMessage}
        {deleteMessage}
        {enableMultiModel}
        {formatOpenCodeToolValue}
        {getActiveOpenCodeTimelineItemId}
        {getActualMessageContent}
        {getCurrentAssistantDisplayName}
        {getDisplayContent}
        {getGroupDisplayName}
        {getOpenCodeFinalAnswer}
        {getOpenCodeProcessKey}
        {getOpenCodeProcessTimeline}
        {getOpenCodeToolPartKey}
        {getOpenCodeToolStatusIcon}
        {getOpenCodeToolStatusText}
        {getToolDisplayName}
        {groupOpenCodeTimeline}
        {handleContextMenu}
        {handleScroll}
        {isLoading}
        {isContextCompactionLikely}
        {isThinkingCollapsed}
        {isThinkingPhase}
        {isToolCallGroupCollapsed}
        {isWaitingForAnswerSelection}
        {messageFontSize}
        {messages}
        {messageGroups}
        {multiModelResponses}
        {multiModelViewMode}
        {openCodeIconUrl}
        {openCodeProcessCollapsed}
        {openCodeTimeline}
        {openCodeToolParts}
        {openDocument}
        {openImageViewer}
        {openSaveToNoteDialog}
        {platformUtils}
        {pushMsg}
        {regenerateHistoryModelResponse}
        {regenerateMessage}
        {regenerateModelResponse}
        {selectHistoryMultiModelAnswer}
        {selectMultiModelAnswer}
        {selectedAnswerIndex}
        {selectedMultiModels}
        {startEditMessage}
        {streamingMessage}
        {streamingThinking}
        {thinkingCollapsed}
        {timelineCollapsed}
        {toggleOpenCodeProcessCollapsed}
        {toggleThinkingCollapsed}
        {toggleTimelineCollapsed}
        {toggleToolCallGroup}
        {toolCallGroupsCollapsed}
        {viewDiff}
    />

    <!-- 上下文文档和附件列表 -->
    {#if contextDocuments.length > 0 || currentAttachments.length > 0}
        <div
            class="ai-sidebar__context-docs"
            class:ai-sidebar__context-docs--drag-over={isDragOver && contextDocuments.length > 0}
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
        >
            <div class="ai-sidebar__context-docs-title">📎 {t('aiSidebar.context.content')}</div>
            <div class="ai-sidebar__context-docs-list">
                <!-- 显示上下文文档 -->
                {#each contextDocuments as doc (doc.id)}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeContextDocument(doc.id)}
                            title="移除文档"
                        >
                            ×
                        </button>
                        <button
                            class="ai-sidebar__context-doc-link"
                            on:click={() => openDocument(doc.id)}
                            title="点击查看文档"
                        >
                            📄 {doc.title}
                        </button>
                        <button
                            class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                            on:click|stopPropagation={() => copyMessage(doc.content || '')}
                            title={t('aiSidebar.actions.copyMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        </button>
                    </div>
                {/each}

                <!-- 显示当前附件 -->
                {#each currentAttachments as attachment, index}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeAttachment(index)}
                            title="移除附件"
                        >
                            ×
                        </button>
                        {#if attachment.type === 'image'}
                            <img
                                src={attachment.data}
                                alt={attachment.name}
                                class="ai-sidebar__context-attachment-preview"
                                title={attachment.name}
                            />
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                🖼️ {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制图片URL');
                                }}
                                title="复制图片URL"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {:else if attachment.isWebPage}
                            <span class="ai-sidebar__context-attachment-icon-emoji">🔗</span>
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制网页Markdown内容');
                                }}
                                title="复制网页Markdown"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {:else}
                            <svg class="ai-sidebar__context-attachment-icon">
                                <use xlink:href="#iconFile"></use>
                            </svg>
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                📄 {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制文件内容');
                                }}
                                title="复制文件内容"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    {#if activePermissionRequest}
        <div class="permission-dialog">
            <div class="permission-dialog__header">
                <svg class="permission-dialog__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span class="permission-dialog__title">OpenCode 请求权限</span>
            </div>
            <div class="permission-dialog__body">
                <div class="permission-dialog__tool">
                    <code>{activePermissionRequest.tool}</code>
                </div>
                {#if activePermissionRequest.input}
                    <pre class="permission-dialog__input">{activePermissionRequest.input}</pre>
                {/if}
                {#if activePermissionRequest.description && activePermissionRequest.description !== activePermissionRequest.input}
                    <p class="permission-dialog__desc">{activePermissionRequest.description}</p>
                {/if}
            </div>
            <div class="permission-dialog__actions">
                <button class="permission-dialog__btn permission-dialog__btn--once" on:click={() => handlePermissionResponse('once')}>
                    允许一次
                </button>
                <button class="permission-dialog__btn permission-dialog__btn--always" on:click={() => handlePermissionResponse('always')}>
                    始终允许
                </button>
                <button class="permission-dialog__btn permission-dialog__btn--reject" on:click={() => handlePermissionResponse('reject')}>
                    拒绝
                </button>
            </div>
        </div>
    {/if}
    {#if activeQuestionRequest}
        <div class="question-dialog" role="dialog" aria-modal={mode === 'dialog'} aria-label="OpenCode 需要确认">
            <div class="question-dialog__scrim"></div>
            <div class="question-dialog__panel">
                <div class="question-dialog__header">
                    <div class="question-dialog__mark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                            <path d="M9 9h6M9 13h4"></path>
                        </svg>
                    </div>
                    <div class="question-dialog__heading">
                        <div class="question-dialog__title">OpenCode 需要你的确认</div>
                        <div class="question-dialog__subtitle">选择一个选项，或在底部输入自己的回答。</div>
                    </div>
                </div>

                <div class="question-dialog__body">
                    {#each activeQuestionRequest.questions as question, questionIndex}
                        <section class="question-dialog__item">
                            {#if question.header}
                                <div class="question-dialog__item-header">{question.header}</div>
                            {/if}
                            <div class="question-dialog__question">{question.question}</div>
                            {#if question.options.length > 0}
                                <div class="question-dialog__options">
                                    {#each question.options as option}
                                        <button
                                            type="button"
                                            class="question-dialog__option"
                                            class:question-dialog__option--active={(questionDrafts[questionIndex]?.selected || []).includes(option.label)}
                                            on:click={() => toggleQuestionOption(questionIndex, option.label, question.multiple)}
                                        >
                                            <span class="question-dialog__option-check"></span>
                                            <span class="question-dialog__option-text">
                                                <span class="question-dialog__option-label">{option.label}</span>
                                                {#if option.description}
                                                    <span class="question-dialog__option-desc">{option.description}</span>
                                                {/if}
                                            </span>
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                            <label class="question-dialog__custom">
                                <span>其他</span>
                                <textarea
                                    rows="3"
                                    value={questionDrafts[questionIndex]?.custom || ''}
                                    on:input={(event) => updateQuestionCustom(questionIndex, event.currentTarget.value)}
                                    placeholder="输入自定义回答..."
                                ></textarea>
                            </label>
                        </section>
                    {/each}
                </div>

                <div class="question-dialog__actions">
                    <button class="question-dialog__button question-dialog__button--ghost" type="button" on:click={rejectQuestionAnswer}>
                        取消
                    </button>
                    <button class="question-dialog__button question-dialog__button--primary" type="button" on:click={submitQuestionAnswer}>
                        发送回答
                    </button>
                </div>
            </div>
        </div>
    {/if}
    <div
        class="ai-sidebar__input-container"
        class:ai-sidebar__input-container--drag-over={isDragOver && contextDocuments.length === 0}
        bind:this={inputContainer}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
    >
        <div class="ai-sidebar__task-tabs" aria-label="任务切换">
            <div class="ai-sidebar__task-tab-list">
                {#each activeTaskIds as taskId, index (taskId)}
                    {@const active = taskId === currentActiveTaskId}
                    {@const running = activeSessions.has(taskId)}
                    {@const unread = unreadTaskIds.has(taskId)}
                    <button
                        type="button"
                        class="ai-sidebar__task-tab"
                        class:ai-sidebar__task-tab--active={active}
                        class:ai-sidebar__task-tab--running={running}
                        class:ai-sidebar__task-tab--unread={unread}
                        title={`${index + 1}. ${getTaskTabTitle(taskId)} / Cmd/Ctrl + ${index + 1}`}
                        on:click={() => selectActiveTaskTab(taskId)}
                        on:contextmenu|preventDefault|stopPropagation={e => closeActiveTaskTab(taskId, e)}
                    >
                        <span class="ai-sidebar__task-tab-index">{index + 1}</span>
                        {#if unread}
                            <span class="ai-sidebar__task-tab-dot" aria-hidden="true"></span>
                        {/if}
                    </button>
                {/each}
                <button
                    type="button"
                    class="ai-sidebar__task-tab ai-sidebar__task-tab--add"
                    title={t('aiSidebar.session.new')}
                    on:click={newSession}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                </button>
            </div>
        </div>

        <!-- 大输入框 -->
        <div
            class="ai-sidebar__chat-input-box"
            class:ai-sidebar__chat-input-box--answer={chatMode === 'plan'}
            class:ai-sidebar__chat-input-box--revision={chatMode === 'build'}
        >
            {#if showCommandPalette}
                <div class="command-palette">
                    {#each getFilteredCommands() as cmd, i}
                        <button
                            class="command-palette__item"
                            class:command-palette__item--active={i === commandPaletteIndex}
                            on:click={() => applyCommand(cmd.name)}
                            on:mouseenter={() => { commandPaletteIndex = i; }}
                        >
                            <span class="command-palette__name">/{cmd.name}</span>
                            {#if cmd.args}
                                <span class="command-palette__args">{cmd.args}</span>
                            {/if}
                            <span class="command-palette__desc">{cmd.desc}</span>
                        </button>
                    {/each}
                </div>
            {/if}
            <textarea
                bind:this={textareaElement}
                bind:value={currentInput}
                on:keydown={handleKeydown}
                on:compositionstart={() => (isInputComposing = true)}
                on:compositionend={() => (isInputComposing = false)}
                on:input={handleInput}
                on:paste={handlePaste}
                placeholder={t('aiSidebar.input.placeholder')}
                class="ai-sidebar__chat-textarea"
                rows="1"
                spellcheck="false"
            ></textarea>

            <!-- 输入框底部工具栏 -->
            <div class="ai-sidebar__chat-input-toolbar">
                <div class="ai-sidebar__composer-action">
                    <button
                        type="button"
                        class="ai-sidebar__composer-icon-button ai-sidebar__add-trigger"
                        class:ai-sidebar__composer-icon-button--active={isAddMenuOpen}
                        aria-label="添加内容"
                        aria-expanded={isAddMenuOpen}
                        on:click|stopPropagation={toggleAddMenu}
                    >
                        {#if isUploadingFile}
                            <svg class="b3-button__icon ai-sidebar__loading-icon"><use xlink:href="#iconRefresh"></use></svg>
                        {:else}
                            <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                        {/if}
                    </button>

                    {#if isAddMenuOpen}
                        <div class="ai-sidebar__composer-menu ai-sidebar__add-menu" on:click|stopPropagation>
                            <div class="ai-sidebar__composer-menu-label">添加内容</div>
                            <button class="ai-sidebar__composer-menu-item" on:click={triggerFileUpload} disabled={isUploadingFile || isLoading}>
                                <svg><use xlink:href="#iconFile"></use></svg><span>上传文件</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={triggerImageUpload} disabled={isUploadingFile || isLoading}>
                                <svg><use xlink:href="#iconImage"></use></svg><span>上传图片</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; openWebLinkDialog(); }} disabled={isFetchingWebContent || isLoading}>
                                <svg><use xlink:href="#iconLink"></use></svg><span>添加链接</span>
                            </button>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; addCurrentDocToContext(); }}>
                                <svg><use xlink:href="#iconFile"></use></svg><span>添加当前文档到上下文</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; isSearchDialogOpen = true; if (!searchKeyword.trim()) searchDocuments(); }}>
                                <svg><use xlink:href="#iconSearch"></use></svg><span>搜索文档或块</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={addClipboardText}>
                                <svg><use xlink:href="#iconCopy"></use></svg><span>从剪贴板粘贴</span>
                            </button>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <button
                                class="ai-sidebar__composer-menu-item"
                                class:ai-sidebar__composer-menu-item--selected={isPromptSelectorOpen}
                                aria-expanded={isPromptSelectorOpen}
                                on:click={togglePromptList}
                            >
                                <svg><use xlink:href="#iconEdit"></use></svg><span>常用提示词</span>
                                <svg class="ai-sidebar__composer-menu-chevron" class:ai-sidebar__composer-menu-chevron--expanded={isPromptSelectorOpen}>
                                    <use xlink:href="#iconRight"></use>
                                </svg>
                            </button>
                            {#if isPromptSelectorOpen}
                                <div class="ai-sidebar__composer-prompt-list">
                                    <button class="ai-sidebar__prompt-item ai-sidebar__prompt-item--new" on:click={openPromptManager}>
                                        <svg class="ai-sidebar__prompt-item-icon"><use xlink:href="#iconAdd"></use></svg>
                                        <span class="ai-sidebar__prompt-item-title">{t('aiSidebar.prompt.new')}</span>
                                    </button>
                                    {#if prompts.length > 0}
                                        {#each prompts as prompt (prompt.id)}
                                            <button class="ai-sidebar__prompt-item" on:click={() => usePrompt(prompt)} title={prompt.content}>
                                                <span class="ai-sidebar__prompt-item-title">{prompt.title}</span>
                                                <div class="ai-sidebar__prompt-item-actions">
                                                    <button class="ai-sidebar__prompt-item-edit" on:click|stopPropagation={() => editPrompt(prompt)} title={t('aiSidebar.prompt.edit')}>
                                                        <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                                                    </button>
                                                    <button class="ai-sidebar__prompt-item-delete" on:click|stopPropagation={() => deletePrompt(prompt.id)} title={t('aiSidebar.prompt.delete')}>
                                                        <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                                                    </button>
                                                </div>
                                            </button>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div class="ai-sidebar__composer-spacer"></div>

                <div class="ai-sidebar__composer-action ai-sidebar__composer-action--status">
                    <button
                        type="button"
                        class="ai-sidebar__status-trigger"
                        aria-label={`配置${composerStatusSummary}`}
                        aria-expanded={isStatusMenuOpen}
                        on:click|stopPropagation={toggleStatusMenu}
                    >
                        <span class="ai-sidebar__status-dot" aria-hidden="true"></span>
                        <span class="ai-sidebar__status-summary">{composerStatusSummary}</span>
                        <svg class="ai-sidebar__composer-chevron"><use xlink:href="#iconDown"></use></svg>
                    </button>

                    {#if isStatusMenuOpen}
                        <div class="ai-sidebar__composer-menu ai-sidebar__status-menu" on:click|stopPropagation>
                            <section class="ai-sidebar__status-section">
                                <div class="ai-sidebar__composer-menu-label">模式</div>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={chatMode === 'plan'} on:click={() => selectComposerMode('plan')}>
                                    <span>问答</span>{#if chatMode === 'plan'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={chatMode === 'build'} on:click={() => selectComposerMode('build')}>
                                    <span>修订</span>{#if chatMode === 'build'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <section class="ai-sidebar__status-section">
                                <div class="ai-sidebar__composer-menu-label">模型</div>
                                <div class="ai-sidebar__status-model-picker">
                                    <MultiModelSelector
                                        {providers}
                                        bind:isOpen={isModelSelectorOpen}
                                        selectedModels={chatMode === 'plan' ? selectedMultiModels : []}
                                        enableMultiModel={chatMode === 'plan' ? enableMultiModel : false}
                                        currentProvider={currentProvider}
                                        currentModelId={currentModelId}
                                        {chatMode}
                                        on:select={handleModelSelect}
                                        on:change={handleMultiModelChange}
                                        on:toggleEnable={handleToggleMultiModel}
                                    />
                                </div>
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <section class="ai-sidebar__status-section" class:ai-sidebar__status-section--disabled={!showThinkingToggle}>
                                <div class="ai-sidebar__composer-menu-label">思考深度</div>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={currentThinkingSelectValue === 'off'} on:click={() => selectThinkingValue('off')} disabled={!showThinkingToggle}>
                                    <span>关闭</span>{#if currentThinkingSelectValue === 'off'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                                {#each THINKING_EFFORT_OPTIONS as option}
                                    <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={currentThinkingSelectValue === option.value} on:click={() => selectThinkingValue(option.value)} disabled={!showThinkingToggle}>
                                        <span>{option.label}</span>{#if currentThinkingSelectValue === option.value}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                    </button>
                                {/each}
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <div class="ai-sidebar__token-widget">
                                <button
                                    bind:this={tokenButtonElement}
                                    type="button"
                                    class="ai-sidebar__token-pill"
                                    class:ai-sidebar__token-pill--warn={displayedContextPercent >= 80}
                                    style={`--token-percent: ${displayedContextPercent};`}
                                    on:click={toggleTokenDetails}
                                    title="Token 使用详情"
                                >
                                    <span class="ai-sidebar__token-ring" aria-hidden="true"></span>
                                    <span>上下文 {currentContextLimit ? `${displayedContextPercent}%` : formatTokenCount(displayedContextTokens)}</span>
                                </button>
                                {#if isTokenDetailsOpen}
                                    <div class="ai-sidebar__token-popover" style={tokenPopoverStyle} on:click|stopPropagation>
                                        <div class="ai-sidebar__token-popover-header">
                                            <span>上下文长度</span>
                                            <button type="button" class="ai-sidebar__token-close" on:click={() => (isTokenDetailsOpen = false)} title="关闭">×</button>
                                        </div>
                                        <div class="ai-sidebar__token-meter">
                                            <div class="ai-sidebar__token-meter-fill" style={`width: ${currentContextLimit ? displayedContextPercent : 0}%`}></div>
                                        </div>
                                        {#if isContextCompactionLikely}
                                            <div class="ai-sidebar__token-status">正在接近上下文上限，OpenCode 可能会自动压缩上下文。</div>
                                        {/if}
                                        <div class="ai-sidebar__token-row"><span>上下文上限</span><strong>{currentContextLimit ? formatTokenCount(currentContextLimit) : '未设置'}</strong></div>
                                        <div class="ai-sidebar__token-row"><span>当前使用百分比</span><strong>{currentContextLimit ? `${displayedContextPercent}%` : '无法计算'}</strong></div>
                                        <div class="ai-sidebar__token-row"><span>当前使用的上下文</span><strong>{formatTokenCount(displayedContextTokens)}</strong></div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>

                <button
                    class="ai-sidebar__chat-send-btn"
                    class:ai-sidebar__chat-send-btn--abort={isLoading && !currentInput.trim()}
                    class:ai-sidebar__chat-send-btn--followup={isLoading && !!currentInput.trim()}
                    on:click={isLoading ? (currentInput.trim() ? sendMessageDuringExecution : abortMessage) : sendMessage}
                    disabled={!isLoading && !currentInput.trim() && currentAttachments.length === 0}
                    title={isLoading ? (currentInput.trim() ? '执行中发送消息' : '中断生成') : '发送消息'}
                >
                    {#if isLoading && !currentInput.trim()}
                        <svg class="b3-button__icon"><use xlink:href="#iconPause"></use></svg>
                    {:else}
                        <svg class="b3-button__icon" style="width:18px;height:18px"><use xlink:href="#iconUp"></use></svg>
                    {/if}
                </button>
            </div>
        </div>

        <!-- 隐藏的文件上传 input -->
        <input
            type="file"
            bind:this={fileInputElement}
            on:change={handleFileSelect}
            accept="image/*,.txt,.md,.json,.xml,.csv,text/*"
            multiple
            style="display: none;"
        />
        <input
            type="file"
            bind:this={imageInputElement}
            on:change={handleFileSelect}
            accept="image/*"
            multiple
            style="display: none;"
        />

    </div>

    <!-- 提示词管理对话框 -->
    {#if isPromptManagerOpen}
        <div class="ai-sidebar__prompt-dialog">
            <div class="ai-sidebar__prompt-dialog-overlay" on:click={closePromptManager}></div>
            <div class="ai-sidebar__prompt-dialog-content">
                <div class="ai-sidebar__prompt-dialog-header">
                    <h4>
                        {editingPrompt ? t('aiSidebar.prompt.edit') : t('aiSidebar.prompt.create')}
                    </h4>
                    <button class="b3-button b3-button--text" on:click={closePromptManager}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__prompt-dialog-body">
                    <div class="ai-sidebar__prompt-form">
                        <div class="ai-sidebar__prompt-form-field">
                            <label class="ai-sidebar__prompt-form-label">标题</label>
                            <input
                                type="text"
                                bind:value={newPromptTitle}
                                placeholder={t('aiSidebar.prompt.titlePlaceholder')}
                                class="b3-text-field"
                            />
                        </div>
                        <div class="ai-sidebar__prompt-form-field">
                            <label class="ai-sidebar__prompt-form-label">内容</label>
                            <textarea
                                bind:value={newPromptContent}
                                placeholder="输入提示词内容"
                                class="b3-text-field ai-sidebar__prompt-textarea"
                                rows="20"
                            ></textarea>
                        </div>
                        <div class="ai-sidebar__prompt-form-actions">
                            <button
                                class="b3-button b3-button--cancel"
                                on:click={closePromptManager}
                            >
                                取消
                            </button>
                            <button class="b3-button b3-button--primary" on:click={saveNewPrompt}>
                                {editingPrompt ? '更新' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- 网页链接对话框 -->
    {#if isWebLinkDialogOpen}
        <div class="ai-sidebar__prompt-dialog">
            <div class="ai-sidebar__prompt-dialog-overlay" on:click={closeWebLinkDialog}></div>
            <div class="ai-sidebar__prompt-dialog-content">
                <div class="ai-sidebar__prompt-dialog-header">
                    <h4>添加网页链接</h4>
                    <button class="b3-button b3-button--text" on:click={closeWebLinkDialog}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__prompt-dialog-body">
                    <div class="ai-sidebar__prompt-form">
                        <div class="ai-sidebar__prompt-form-field">
                            <label class="ai-sidebar__prompt-form-label">
                                网页链接（每行一个）
                            </label>
                            <textarea
                                bind:value={webLinkInput}
                                placeholder="输入一个或多个网页链接，每行一个&#10;示例：&#10;https://example.com&#10;https://example.org/page"
                                class="b3-text-field ai-sidebar__prompt-textarea"
                                rows="10"
                                disabled={isFetchingWebContent}
                            ></textarea>
                            <div
                                style="margin-top: 8px; font-size: 12px; color: var(--b3-theme-on-surface-light);"
                            >
                                💡 提示：
                                <ul style="margin: 4px 0; padding-left: 20px;">
                                    <li>由于浏览器安全限制，某些网站可能无法直接访问</li>
                                </ul>
                            </div>
                        </div>
                        <div class="ai-sidebar__prompt-form-actions">
                            <button
                                class="b3-button b3-button--cancel"
                                on:click={closeWebLinkDialog}
                                disabled={isFetchingWebContent}
                            >
                                取消
                            </button>
                            <button
                                class="b3-button b3-button--primary"
                                on:click={fetchWebPages}
                                disabled={isFetchingWebContent || !webLinkInput.trim()}
                            >
                                {isFetchingWebContent ? '获取中...' : '获取网页内容'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- 搜索对话框 -->
    {#if isSearchDialogOpen}
        <div class="ai-sidebar__search-dialog">
            <div
                class="ai-sidebar__search-dialog-overlay"
                on:click={() => (isSearchDialogOpen = false)}
            ></div>
            <div class="ai-sidebar__search-dialog-content">
                <div class="ai-sidebar__search-dialog-header">
                    <h4>{t('aiSidebar.search.title')}</h4>
                    <button
                        class="b3-button b3-button--text"
                        on:click={() => (isSearchDialogOpen = false)}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__search-dialog-body">
                    <div class="ai-sidebar__search-input-row">
                        <input
                            type="text"
                            bind:value={searchKeyword}
                            on:input={autoSearch}
                            on:paste={autoSearch}
                            placeholder={t('aiSidebar.search.placeholder')}
                            class="b3-text-field"
                        />
                        {#if isSearching}
                            <div class="ai-sidebar__search-loading">
                                <svg class="b3-button__icon ai-sidebar__loading-icon">
                                    <use xlink:href="#iconRefresh"></use>
                                </svg>
                            </div>
                        {/if}
                    </div>
                    <div class="ai-sidebar__search-results">
                        {#if searchResults.length > 0}
                            {#each searchResults as result (result.id)}
                                <div class="ai-sidebar__search-result-item">
                                    <div class="ai-sidebar__search-result-title">
                                        {result.content || t('common.untitled')}
                                        {#if !searchKeyword.trim()}
                                            <span class="ai-sidebar__search-current-doc-badge">
                                                {t('aiSidebar.search.currentDoc')}
                                            </span>
                                        {/if}
                                    </div>
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click={() =>
                                            addDocumentToContext(
                                                result.id,
                                                result.content || t('common.untitled')
                                            )}
                                    >
                                        {t('aiSidebar.search.add')}
                                    </button>
                                </div>
                            {/each}
                        {:else if !isSearching && searchKeyword}
                            <div class="ai-sidebar__search-empty">
                                {t('aiSidebar.search.noResults')}
                            </div>
                        {:else if !isSearching && !searchKeyword}
                            <div class="ai-sidebar__search-empty">
                                {t('aiSidebar.search.noCurrentDoc')}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- 编辑消息弹窗 -->
    {#if isEditDialogOpen}
        <div class="ai-sidebar__edit-dialog">
            <div class="ai-sidebar__edit-dialog-overlay" on:click={cancelEditMessage}></div>
            <div class="ai-sidebar__edit-dialog-content">
                <div class="ai-sidebar__edit-dialog-header">
                    <h3>{t('aiSidebar.actions.editMessage')}</h3>
                    <button class="b3-button b3-button--cancel" on:click={cancelEditMessage}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__edit-dialog-body">
                    <textarea
                        class="ai-sidebar__edit-dialog-textarea"
                        bind:value={editingMessageContent}
                        rows="15"
                        autofocus
                    ></textarea>
                </div>
                <div class="ai-sidebar__edit-dialog-footer">
                    <button class="b3-button b3-button--cancel" on:click={cancelEditMessage}>
                        {t('aiSidebar.actions.cancel')}
                    </button>
                    <button class="b3-button b3-button--text" on:click={saveEditMessage}>
                        {t('aiSidebar.actions.save')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- 差异对比对话框 -->
    {#if isDiffDialogOpen && currentDiffOperation}
        <div class="ai-sidebar__diff-dialog">
            <div class="ai-sidebar__diff-dialog-overlay" on:click={closeDiffDialog}></div>
            <div class="ai-sidebar__diff-dialog-content">
                <div class="ai-sidebar__diff-dialog-header">
                    <h3>
                        {#if currentDiffOperation.operationType === 'insert'}
                            {t('aiSidebar.edit.insertBlock')} - {t('aiSidebar.actions.viewDiff')}
                        {:else}
                            {t('aiSidebar.actions.viewDiff')}
                        {/if}
                    </h3>
                    {#if currentDiffOperation.operationType !== 'insert'}
                        <div class="ai-sidebar__diff-mode-selector">
                            <button
                                class="b3-button b3-button--text"
                                class:b3-button--primary={diffViewMode === 'diff'}
                                on:click={() => (diffViewMode = 'diff')}
                            >
                                {t('aiSidebar.diff.modeUnified')}
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                class:b3-button--primary={diffViewMode === 'split'}
                                on:click={() => (diffViewMode = 'split')}
                            >
                                {t('aiSidebar.diff.modeSplit')}
                            </button>
                        </div>
                    {/if}
                    <button class="b3-button b3-button--cancel" on:click={closeDiffDialog}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__diff-dialog-body">
                    <div class="ai-sidebar__diff-info">
                        {#if currentDiffOperation.docTitle}
                            <strong>文档:</strong>
                            {currentDiffOperation.docTitle}
                            <br />
                        {/if}
                        {#if currentDiffOperation.affectedBlockIds && currentDiffOperation.affectedBlockIds.length > 0}
                            <strong>块ID:</strong>
                            {currentDiffOperation.affectedBlockIds.join(', ')}
                            <br />
                        {/if}
                        {#if currentDiffOperation.oldDocTitle && currentDiffOperation.newDocTitle && currentDiffOperation.oldDocTitle !== currentDiffOperation.newDocTitle}
                            <strong>标题:</strong>
                            {currentDiffOperation.oldDocTitle} → {currentDiffOperation.newDocTitle}
                            <br />
                        {/if}
                        {#if currentDiffOperation.docId}
                            <strong>文档ID:</strong>
                            {currentDiffOperation.docId}
                        {:else if currentDiffOperation.operationType === 'insert'}
                            <strong>{t('aiSidebar.edit.insertBlock')}:</strong>
                            {currentDiffOperation.position === 'before'
                                ? t('aiSidebar.edit.before')
                                : t('aiSidebar.edit.after')}
                            {currentDiffOperation.blockId}
                        {:else}
                            <strong>{t('aiSidebar.edit.blockId')}:</strong>
                            {currentDiffOperation.blockId}
                        {/if}
                    </div>
                    {#if currentDiffOperation.operationType === 'insert'}
                        <!-- 插入操作：只显示新内容 -->
                        <div class="ai-sidebar__diff-content">
                            <div
                                class="ai-sidebar__diff-split-header"
                                style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;"
                            >
                                <span>{t('aiSidebar.edit.insertContent')}</span>
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        platformUtils.writeText(currentDiffOperation.newContent);
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyNewContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copy')}
                                </button>
                            </div>
                            <pre
                                class="ai-sidebar__diff-split-content"
                                style="border: 1px solid var(--b3-theme-success); background-color: var(--b3-theme-success-lighter);">{currentDiffOperation.newContent}</pre>
                        </div>
                    {:else if currentDiffOperation.oldContent}
                        {#if diffViewMode === 'diff'}
                            <!-- Diff模式：传统的行对比视图 -->
                            <div class="ai-sidebar__diff-actions">
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        platformUtils.writeText(currentDiffOperation.oldContent);
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyOldContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copyBefore')}
                                </button>
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        platformUtils.writeText(currentDiffOperation.newContent);
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyNewContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copyAfter')}
                                </button>
                            </div>
                            <div class="ai-sidebar__diff-content">
                                {#each generateSimpleDiff(currentDiffOperation.oldContent, currentDiffOperation.newContent) as line}
                                    <div
                                        class="ai-sidebar__diff-line ai-sidebar__diff-line--{line.type}"
                                    >
                                        {#if line.type === 'removed'}
                                            <span class="ai-sidebar__diff-marker">-</span>
                                        {:else if line.type === 'added'}
                                            <span class="ai-sidebar__diff-marker">+</span>
                                        {:else}
                                            <span class="ai-sidebar__diff-marker"></span>
                                        {/if}
                                        <span class="ai-sidebar__diff-text">{line.line}</span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <!-- Split模式：左右分栏视图 -->
                            <div class="ai-sidebar__diff-split">
                                <div class="ai-sidebar__diff-split-column">
                                    <div class="ai-sidebar__diff-split-header">
                                        <span>{t('aiSidebar.edit.before')}</span>
                                        <button
                                            class="b3-button b3-button--text b3-button--small"
                                            on:click={() => {
                                                platformUtils.writeText(
                                                    currentDiffOperation.oldContent
                                                );
                                                pushMsg(t('aiSidebar.success.copySuccess'));
                                            }}
                                            title={t('aiSidebar.actions.copyOldContent')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconCopy"></use>
                                            </svg>
                                        </button>
                                    </div>
                                    <div class="ai-sidebar__diff-split-content b3-typography">
                                        {@html renderMarkdownForSplitDiff(
                                            currentDiffOperation.oldContent
                                        )}
                                    </div>
                                </div>
                                <div class="ai-sidebar__diff-split-column">
                                    <div class="ai-sidebar__diff-split-header">
                                        <span>{t('aiSidebar.edit.after')}</span>
                                        <button
                                            class="b3-button b3-button--text b3-button--small"
                                            on:click={() => {
                                                platformUtils.writeText(
                                                    currentDiffOperation.newContent
                                                );
                                                pushMsg(t('aiSidebar.success.copySuccess'));
                                            }}
                                            title={t('aiSidebar.actions.copyNewContent')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconCopy"></use>
                                            </svg>
                                        </button>
                                    </div>
                                    <div class="ai-sidebar__diff-split-content b3-typography">
                                        {@html renderMarkdownForSplitDiff(
                                            currentDiffOperation.newContent
                                        )}
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {:else}
                        <div class="ai-sidebar__diff-loading">
                            {t('common.loading')}
                        </div>
                    {/if}
                </div>
                <div class="ai-sidebar__diff-dialog-footer">
                    <button class="b3-button b3-button--cancel" on:click={closeDiffDialog}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- 右键菜单 -->
    {#if contextMenuVisible}
        <div
            class="ai-sidebar__context-menu"
            style="left: {contextMenuX}px; top: {contextMenuY}px;"
        >
            {#if contextMenuIsMultiModel}
                {#if selectionInMessage}
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_md')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（Markdown，默认）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_plain')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（纯文本）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_html')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（富文本）</span>
                    </button>
                {:else}
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_md')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（Markdown，默认）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_plain')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（纯文本）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_html')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（富文本）</span>
                    </button>
                {/if}
            {:else}
                {#if selectionInMessage}
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_md')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（Markdown，默认）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_plain')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（纯文本）</span>
                    </button>
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy_html')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>复制（富文本）</span>
                    </button>
                {:else}
                    <button
                        class="ai-sidebar__context-menu-item"
                        on:click={() => handleContextMenuAction('copy')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        <span>{t('aiSidebar.actions.copyMessage')}</span>
                    </button>
                {/if}

                <button
                    class="ai-sidebar__context-menu-item"
                    on:click={() => handleContextMenuAction('edit')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                    <span>{t('aiSidebar.actions.editMessage')}</span>
                </button>
                <button
                    class="ai-sidebar__context-menu-item"
                    on:click={() => handleContextMenuAction('delete')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    <span>{t('aiSidebar.actions.deleteMessage')}</span>
                </button>
                <div class="ai-sidebar__context-menu-divider"></div>
                <button
                    class="ai-sidebar__context-menu-item"
                    on:click={() => handleContextMenuAction('save')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconDownload"></use></svg>
                    <span>{t('aiSidebar.actions.saveToNote')}</span>
                </button>
                <button
                    class="ai-sidebar__context-menu-item"
                    on:click={() => handleContextMenuAction('regenerate')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>
                    <span>
                        {contextMenuMessageType === 'user'
                            ? t('aiSidebar.actions.resend')
                            : t('aiSidebar.actions.regenerate')}
                    </span>
                </button>
            {/if}
        </div>
    {/if}


    <SaveToNoteDialog
        bind:this={saveToNoteDialog}
        {plugin}
        {settings}
        exportContext={getSessionExportContext()}
        fallbackTitle={generateSessionTitle()}
        resolveCurrentDocument={resolveCurrentDocumentForExport}
    />

    <!-- 工具批准对话框 -->

    <ImageViewer bind:this={imageViewer} />

</div>
