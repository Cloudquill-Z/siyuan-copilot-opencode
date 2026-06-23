import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const composerStyles = await readFile(
    new URL('../src/styles/ai-sidebar.scss', import.meta.url),
    'utf8'
);
const saveToNoteDialogSource = await readFile(
    new URL('../src/components/chat/dialogs/SaveToNoteDialog.svelte', import.meta.url),
    'utf8'
);
const settingsPanelSource = await readFile(
    new URL('../src/SettingsPanel.svelte', import.meta.url),
    'utf8'
);
const openCodeProviderSource = await readFile(
    new URL('../src/providers/opencode-provider.ts', import.meta.url),
    'utf8'
);
const aiChatSource = await readFile(new URL('../src/ai-chat.ts', import.meta.url), 'utf8');
const singleModelRunnerSource = await readFile(
    new URL('../src/chat/execution/single-model-runner.ts', import.meta.url),
    'utf8'
);
const taskTypesSource = await readFile(new URL('../src/task-types.ts', import.meta.url), 'utf8');
const sidebarSource = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const chatComposerSource = await readFile(
    new URL('../src/components/chat/ChatComposer.svelte', import.meta.url),
    'utf8'
);
const messageListSource = await readFile(
    new URL('../src/components/chat/MessageList.svelte', import.meta.url),
    'utf8'
);
const todoProgressSource = await readFile(
    new URL('../src/components/chat/TodoProgress.svelte', import.meta.url),
    'utf8'
).catch(() => '');

const { getTodoProgress, normalizeOpenCodeTodos } = await import('../src/chat/todo-state.ts');

const normalizedTodos = normalizeOpenCodeTodos([
    { content: '完成事件接入', status: 'completed', priority: 'high' },
    { content: '实现进度组件', status: 'in_progress', priority: 'medium' },
    { content: '  ', status: 'unexpected', priority: 12 },
    { content: '取消旧方案', status: 'cancelled', priority: 'low' },
]);
assert.deepEqual(
    normalizedTodos.map(todo => todo.status),
    ['completed', 'in_progress', 'pending', 'cancelled'],
    'Todo 状态应被规范化为插件支持的四种状态'
);
assert.equal(normalizedTodos[2].content, '未命名任务', '空 Todo 内容应提供稳定占位');
assert.deepEqual(
    getTodoProgress(normalizedTodos),
    { completed: 1, total: 4 },
    '只有 completed 计入完成数，cancelled 仍保留在总数中'
);

assert.match(openCodeProviderSource, /eventType === 'todo\.updated'/, 'Provider 应处理 todo.updated 事件');
assert.match(
    openCodeProviderSource,
    /todo\.updated'[\s\S]*?if \(!sessionID \|\| sessionID !== this\.targetSessionId\) return;[\s\S]*?onTodoUpdated/,
    'Todo 事件必须按目标 OpenCode 会话过滤后再转发'
);
assert.match(aiChatSource, /onTodoUpdated\?:/, '聊天选项应公开 Todo 更新回调');
assert.match(singleModelRunnerSource, /onTodoUpdated:/, '单模型运行器应透传 Todo 更新回调');
assert.match(taskTypesSource, /openCodeTodos:\s*OpenCodeTodo\[\]/, '任务运行态应包含 Todo 列表');
assert.match(sidebarSource, /openCodeTodos,\s*openCodeTimeline/, '前台任务快照应保存 Todo');
assert.match(sidebarSource, /openCodeTodos = state\.openCodeTodos/, '切换任务时应恢复对应 Todo');
assert.match(sidebarSource, /function updateTodosForTask/, 'Todo 更新应通过任务 ID 路由');
assert.match(sidebarSource, /openCodeTodos = \[\];[\s\S]*?resetOpenCodeTimeline/, '新请求应清空旧 Todo');
assert.match(messageListSource, /<TodoProgress\s+\{openCodeTodos\}/, 'Todo 胶囊应显示在消息对话区内');
assert.doesNotMatch(chatComposerSource, /TodoProgress|openCodeTodos/, '输入区不应继续持有 Todo 组件或状态');
assert.match(todoProgressSource, /aria-expanded=\{isOpen\}/, 'Todo 胶囊应暴露展开状态');
assert.match(todoProgressSource, /OPEN_DELAY_MS\s*=\s*150/, '悬浮展开应有轻微防误触延时');
assert.match(todoProgressSource, /event\.key === 'Escape'/, 'Todo 弹层应支持 Escape 关闭');
assert.match(todoProgressSource, /title=\{todo\.content\}/, '截断项目应能显示完整内容');
assert.match(composerStyles, /\.ai-sidebar__todo-item-text[\s\S]*?text-overflow:\s*ellipsis/, 'Todo 行必须单行截断');
assert.match(composerStyles, /\.ai-sidebar__todo-popover[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto/, 'Todo 长列表应在弹层内部滚动');
assert.match(
    composerStyles,
    /\.ai-sidebar__todo-progress[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*8px;/,
    'Todo 胶囊应吸附在消息区底部'
);

assert.match(
    composerStyles,
    /\.ai-sidebar__chat-input-box\s*\{[\s\S]*?&::after\s*\{[\s\S]*?border:\s*1px solid color-mix\(in srgb, var\(--composer-accent\)/,
    '状态边框应由独立伪元素完整绘制'
);

const { getDockRestoreDecision } = await import('../src/utils/dockRestore.ts');

assert.equal(
    getDockRestoreDecision({ lifecycleCurrent: true, elementReady: false, mounted: false }),
    'wait',
    'Dock 面板尚未生成时必须继续等待'
);
assert.equal(
    getDockRestoreDecision({
        lifecycleCurrent: true,
        elementReady: true,
        mounted: false,
        buttonActive: true,
        panelVisible: false,
    }),
    'mount',
    '恢复为 active 的 Dock 应重新挂载组件'
);
assert.equal(
    getDockRestoreDecision({
        lifecycleCurrent: true,
        elementReady: true,
        elementConnected: true,
        mounted: false,
        hasSidebarRoot: false,
        buttonActive: true,
        panelVisible: false,
    }),
    'mount',
    'Dock 面板已恢复但内容为空时必须补挂载组件'
);
assert.equal(
    getDockRestoreDecision({
        lifecycleCurrent: true,
        elementReady: true,
        elementConnected: true,
        mounted: true,
        hasSidebarRoot: true,
        buttonActive: true,
        panelVisible: true,
    }),
    'stop',
    '已挂载且已有侧栏根节点时应停止恢复'
);
assert.equal(
    getDockRestoreDecision({ lifecycleCurrent: false, elementReady: false, mounted: false }),
    'stop',
    '过期插件生命周期必须停止恢复'
);

const {
    finishTaskRuntime,
    formatTaskElapsed,
    getTaskElapsedMs,
    startTaskRuntime,
} = await import('../src/task-types.ts');

const runtimeStarted = startTaskRuntime({
    ...{
        messages: [],
        currentInput: '',
        currentAttachments: [],
        contextDocuments: [],
        streamingMessage: '',
        streamingThinking: '',
        openCodeToolParts: [],
        openCodeTodos: [],
        openCodeTimeline: [],
        isThinkingPhase: false,
        isLoading: false,
        hasUnsavedChanges: false,
        lastPreparedContextTokens: 0,
    },
}, 1_000);
assert.equal(runtimeStarted.startedAt, 1_000, '任务开始时应记录 startedAt');
assert.equal(runtimeStarted.finishedAt, undefined, '任务开始时不应记录 finishedAt');
assert.equal(getTaskElapsedMs(runtimeStarted, 62_500), 61_500, '运行中任务应按当前时间计算耗时');
assert.equal(formatTaskElapsed(61_500), '01:01', '分钟级耗时应格式化为 mm:ss');
assert.equal(formatTaskElapsed(3_661_000), '1:01:01', '小时级耗时应格式化为 h:mm:ss');
const runtimeFinished = finishTaskRuntime(runtimeStarted, 63_000);
assert.equal(runtimeFinished.finishedAt, 63_000, '任务结束时应记录 finishedAt');
assert.equal(getTaskElapsedMs(runtimeFinished, 70_000), 62_000, '已结束任务应固定使用 finishedAt 计算耗时');

const { buildSessionMarkdown, refreshSessionExportContext } = await import(
    '../src/utils/sessionExport.ts'
);
const latestExportContext = await refreshSessionExportContext(
    async () => ({ userName: '子亮' }),
    { userName: '', userFallback: '用户' }
);
assert.match(
    buildSessionMarkdown([{ role: 'user', content: '你好' }], latestExportContext),
    /^## 子亮\n\n你好/,
    '下载会话应优先使用持久化设置中的最新用户名'
);

assert.match(
    saveToNoteDialogSource,
    /refreshSessionExportContext\([\s\S]*?buildSessionMarkdown\(snapshot\.messages, latestExportContext\)/,
    '保存到笔记也应在执行时读取最新用户名'
);

const { canStartConcurrentTask, coerceSelectOptionValue, normalizeConcurrentTaskLimit } =
    await import('../src/utils/settingsBehavior.ts');

assert.equal(coerceSelectOptionValue('4', 4), 4, '数字设置重新载入后应保持数字类型');
assert.equal(coerceSelectOptionValue('queue', 'guide'), 'queue');
assert.equal(normalizeConcurrentTaskLimit('3'), 3);
assert.equal(canStartConcurrentTask(2, 3), true);
assert.equal(canStartConcurrentTask(3, 3), false, '达到并发上限后必须阻止新任务');

assert.match(settingsPanelSource, /class="settings-layout"/, '设置页应使用清晰的双栏布局');
assert.match(settingsPanelSource, /class="settings-page-header"/, '设置内容应提供统一页头');

for (const pageId of ['connection', 'conversation', 'automation', 'memory', 'diagnostics']) {
    assert.match(
        settingsPanelSource,
        new RegExp(`id: '${pageId}'`),
        `设置页应包含 ${pageId} 一级页面`
    );
}
assert.doesNotMatch(
    settingsPanelSource,
    /let groups: ISettingGroup\[\]/,
    '设置导航不应继续直接暴露旧的八组设置模块'
);
assert.match(
    settingsPanelSource,
    /activePageId === 'conversation'[\s\S]*?aiSystemPrompt/,
    '系统提示词应归入对话体验页'
);
assert.match(
    settingsPanelSource,
    /activePageId === 'automation'[\s\S]*?autoRenameSession[\s\S]*?exportNotebook/,
    '会话自动命名与保存到笔记应归入自动化与导出页'
);
assert.match(
    settingsPanelSource,
    /activePageId === 'diagnostics'[\s\S]*?tokenUsageSummary[\s\S]*?diagnosticLogMode[\s\S]*?resetSettings/,
    'Token 统计、诊断日志与恢复默认设置应归入诊断维护页'
);

console.log('Regression tests passed');
