import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    });
    const url = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
    return import(url);
}

const {
    buildSessionMarkdown,
    cleanModelName,
    createSessionExportSnapshot,
    resolveAssistantDisplayName,
} = await importTypeScript('../src/utils/sessionExport.ts');

const providers = {
    opencode: {
        models: [
            { id: 'anthropic/claude-sonnet-4', name: '当前配置的 Sonnet' },
            { id: 'openai/gpt-5', name: '当前配置的 GPT-5' },
        ],
    },
};

const splitIdProviders = {
    opencode: {
        models: [{ id: 'claude-sonnet-4', providerID: 'anthropic', name: '当前短 ID Sonnet' }],
    },
};

assert.equal(cleanModelName(' ✅✅ Claude'), 'Claude');
assert.equal(cleanModelName('✅ GPT-5'), 'GPT-5');

assert.equal(
    resolveAssistantDisplayName(
        { role: 'assistant', content: 'answer', provider: 'opencode', modelId: 'anthropic/claude-sonnet-4', modelName: '旧名称' },
        { providers, currentProvider: 'opencode', currentModelId: 'openai/gpt-5' }
    ),
    'anthropic / 当前配置的 Sonnet'
);

assert.equal(
    resolveAssistantDisplayName(
        { role: 'assistant', content: 'answer', provider: 'opencode', modelId: 'anthropic/claude-sonnet-4' },
        { providers: splitIdProviders, currentProvider: 'opencode', currentModelId: '' }
    ),
    'anthropic / 当前短 ID Sonnet',
    'configured short IDs must not erase the provider encoded in the message model ID'
);

assert.equal(
    resolveAssistantDisplayName(
        { role: 'assistant', content: 'answer' },
        { providers, currentProvider: 'opencode', currentModelId: 'openai/gpt-5' }
    ),
    'openai / 当前配置的 GPT-5'
);

const messages = [
    { role: 'system', content: 'secret system prompt' },
    { role: 'user', content: '问题' },
    { role: 'tool', content: 'internal tool result' },
    {
        role: 'assistant',
        content: '答案 A',
        multiModelResponses: [
            { provider: 'opencode', modelId: 'anthropic/claude-sonnet-4', modelName: ' ✅旧 Sonnet', content: '答案 A', isSelected: true },
            { provider: 'opencode', modelId: 'openai/gpt-5', modelName: '旧 GPT', content: '答案 B', isSelected: false },
        ],
    },
];

const markdown = buildSessionMarkdown(messages, {
    userName: '兰斯',
    providers,
    currentProvider: 'opencode',
    currentModelId: 'openai/gpt-5',
});

assert.match(markdown, /## 兰斯/);
assert.match(markdown, /### 多模型对比/);
assert.match(markdown, /#### anthropic \/ 当前配置的 Sonnet ✅/);
assert.match(markdown, /#### openai \/ 当前配置的 GPT-5/);
assert.equal((markdown.match(/答案 A/g) || []).length, 1, 'selected multi-model response must not be duplicated');
assert.doesNotMatch(markdown, /secret system prompt|internal tool result|旧 Sonnet|旧 GPT/);

const sourceMessages = [{ role: 'user', content: 'original' }];
const snapshot = createSessionExportSnapshot('session-1', '标题', sourceMessages);
sourceMessages[0].content = 'mutated';
assert.equal(snapshot.messages[0].content, 'original');
assert.equal(snapshot.sessionId, 'session-1');
assert.equal(snapshot.title, '标题');

console.log('session export verification passed');
