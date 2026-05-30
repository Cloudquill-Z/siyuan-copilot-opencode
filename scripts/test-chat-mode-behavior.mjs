import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/chatMode.ts', import.meta.url), 'utf8');
const sidebarSource = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
    },
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const {
    getChatModeLabel,
    getChatModeDescription,
    getChatModeSystemInstruction,
    getContextLimitForActiveModels,
    getContextLimitForDisplay,
    getOpenCodeAgentForChatMode,
    shouldToggleChatModeFromKeydown,
} = await import(moduleUrl);

const tabEvent = overrides => ({
    key: 'Tab',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    ...overrides,
});

assert.equal(getChatModeLabel('plan'), '问答模式');
assert.equal(getChatModeLabel('build'), '修订模式');
assert.match(getChatModeDescription('plan'), /查询\/阅读笔记/);
assert.match(getChatModeDescription('build'), /直接修改笔记/);
assert.match(getChatModeSystemInstruction('plan'), /不要修改/);
assert.match(getChatModeSystemInstruction('build'), /可以直接修改/);
assert.match(getChatModeSystemInstruction('build'), /siyuan-sisyphus skill install/);
assert.equal(getOpenCodeAgentForChatMode('plan'), 'plan');
assert.equal(getOpenCodeAgentForChatMode('build'), 'build');
assert.equal(getContextLimitForDisplay({}), undefined);
assert.equal(getContextLimitForDisplay({ currentProvider: 'opencode', currentModelId: '' }), undefined);
assert.equal(getContextLimitForDisplay({ currentProvider: 'opencode', currentModelId: 'anthropic/claude-sonnet-4' }), undefined);
assert.equal(
    getContextLimitForDisplay({
        currentProvider: 'opencode',
        currentModelId: 'custom-model',
        modelConfig: { limit: { context: 12345 } },
    }),
    12345
);
assert.equal(
    getContextLimitForActiveModels({
        enableMultiModel: true,
        chatMode: 'plan',
        modelConfig: undefined,
        selectedModelConfigs: [
            { contextLimit: 1000000 },
            { limit: { context: 200000 } },
        ],
    }),
    200000,
    'multi-model context display should use the smallest selected model context limit'
);
assert.equal(
    getContextLimitForActiveModels({
        enableMultiModel: true,
        chatMode: 'build',
        modelConfig: { contextLimit: 300000 },
        selectedModelConfigs: [{ contextLimit: 1000000 }],
    }),
    300000,
    'build mode should still use the current single model limit'
);
const contextLimitStatementStart = sidebarSource.indexOf('$: currentContextLimit = (');
assert.notEqual(contextLimitStatementStart, -1, 'currentContextLimit should use an explicit reactive dependency expression');
const contextLimitStatement = sidebarSource.slice(
    contextLimitStatementStart,
    sidebarSource.indexOf(');', contextLimitStatementStart) + 2
);
for (const dependency of [
    'currentProvider',
    'currentModelId',
    'providers',
    'selectedMultiModels',
    'enableMultiModel',
    'chatMode',
    'getCurrentContextLimit()',
]) {
    assert.ok(
        contextLimitStatement.includes(dependency),
        `currentContextLimit reactive statement should depend on ${dependency}`
    );
}
assert.equal(shouldToggleChatModeFromKeydown(tabEvent()), true, 'plain Tab toggles chat mode');
assert.equal(shouldToggleChatModeFromKeydown(tabEvent({ shiftKey: true })), false, 'Shift+Tab no longer toggles');
assert.equal(shouldToggleChatModeFromKeydown(tabEvent({ ctrlKey: true })), false, 'Ctrl+Tab is left alone');
assert.equal(shouldToggleChatModeFromKeydown(tabEvent({ isComposing: true })), false, 'IME composition is left alone');
