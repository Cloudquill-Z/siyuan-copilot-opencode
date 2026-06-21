import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const composerStyles = await readFile(
    new URL('../src/styles/ai-sidebar.scss', import.meta.url),
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

console.log('Regression tests passed');
