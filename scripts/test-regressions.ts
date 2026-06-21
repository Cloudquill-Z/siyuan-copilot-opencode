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
    getDockRestoreDecision({ lifecycleCurrent: false, elementReady: false, mounted: false }),
    'stop',
    '过期插件生命周期必须停止恢复'
);

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

console.log('Regression tests passed');
