import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
    findOpenCodeModelConfigMatch,
    mergeOpenCodeModelLists,
    parseOpenCodeModelListOutput,
    parseOpenCodeProviderModels,
    uniqueOpenCodeModelRefs,
    shouldRefreshOpenCodeModelCatalog,
} = await import('../src/providers/opencode-models.ts');

const cliOutput = `
opencode/big-pickle
opencode/deepseek-v4-flash-free
opencode/mimo-v2.5-free
opencode/nemotron-3-super-free
opencode-go/deepseek-v4-pro
`;
const models = parseOpenCodeModelListOutput(cliOutput, 'opencode');
const allCliModels = parseOpenCodeModelListOutput(cliOutput);

assert.deepEqual(
    models.map(model => model.id),
    ['big-pickle', 'deepseek-v4-flash-free', 'mimo-v2.5-free', 'nemotron-3-super-free']
);
assert.deepEqual(
    models.map(model => model.providerID),
    ['opencode', 'opencode', 'opencode', 'opencode']
);
assert.deepEqual(
    models.map(model => model.name),
    ['Big Pickle', 'DeepSeek V4 Flash Free', 'MiMo V2.5 Free', 'Nemotron 3 Super Free']
);
assert.deepEqual(
    allCliModels.map(model => `${model.providerID}/${model.id}`),
    [
        'opencode/big-pickle',
        'opencode/deepseek-v4-flash-free',
        'opencode/mimo-v2.5-free',
        'opencode/nemotron-3-super-free',
        'opencode-go/deepseek-v4-pro',
    ]
);

const merged = mergeOpenCodeModelLists(
    [
        { id: 'big-pickle', name: 'Big Pickle', providerID: 'opencode' },
        { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super Free', providerID: 'opencode' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', providerID: 'opencode-go' },
    ],
    models
);

assert.deepEqual(
    merged.map(model => `${model.providerID}/${model.id}`),
    [
        'opencode/big-pickle',
        'opencode/nemotron-3-super-free',
        'opencode-go/deepseek-v4-pro',
        'opencode/deepseek-v4-flash-free',
        'opencode/mimo-v2.5-free',
    ]
);

console.log('OpenCode model list parser verification passed');

const providerModels = parseOpenCodeProviderModels({
    connected: ['opencode'],
    all: [
        {
            id: 'opencode',
            models: {
                'big-pickle': {
                    name: 'Big Pickle',
                    limit: { context: 200000, input: 160000, output: 32000 },
                },
            },
        },
        {
            id: 'opencode-go',
            models: {
                'deepseek-v4-pro': {
                    name: 'DeepSeek V4 Pro',
                    limit: { context: 1000000, output: 384000 },
                },
            },
        },
        {
            id: 'deepseek',
            models: [
                {
                    id: 'deepseek-chat',
                    name: 'DeepSeek Chat',
                    limit: { context: 1000000, output: 384000 },
                },
            ],
        },
    ],
});

assert.deepEqual(
    providerModels.map(model => `${model.providerID}/${model.id}`),
    ['opencode/big-pickle', 'opencode-go/deepseek-v4-pro', 'deepseek/deepseek-chat']
);
assert.deepEqual(
    providerModels.map(model => model.contextLimit),
    [200000, 1000000, 1000000]
);
assert.deepEqual(
    providerModels.map(model => model.outputLimit),
    [32000, 384000, 384000]
);

const existingModelConfigs = [
    { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
];

assert.equal(
    findOpenCodeModelConfigMatch(existingModelConfigs, 'opencode-go/deepseek-v4-pro', 'opencode-go'),
    undefined,
    'opencode-go model must not reuse a DeepSeek provider model with the same bare model id'
);
assert.equal(
    findOpenCodeModelConfigMatch(existingModelConfigs, 'deepseek/deepseek-v4-pro', 'deepseek')?.id,
    'deepseek/deepseek-v4-pro'
);

const duplicatedModelConfigs = [
    { id: 'deepseek/deepseek-v4-flash', providerID: 'deepseek', name: 'DeepSeek V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro', providerID: 'deepseek', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek/deepseek-v4-flash', providerID: 'deepseek', name: 'DeepSeek V4 Flash copy' },
    { id: 'deepseek/deepseek-v4-pro', providerID: 'deepseek', name: 'DeepSeek V4 Pro copy' },
    { id: 'opencode-go/deepseek-v4-flash', providerID: 'opencode-go', name: 'OpenCode Go DeepSeek V4 Flash' },
    { id: 'opencode-go/deepseek-v4-pro', providerID: 'opencode-go', name: 'OpenCode Go DeepSeek V4 Pro' },
];

assert.deepEqual(
    uniqueOpenCodeModelRefs(duplicatedModelConfigs).map(model => model.id),
    [
        'deepseek/deepseek-v4-flash',
        'deepseek/deepseek-v4-pro',
        'opencode-go/deepseek-v4-flash',
        'opencode-go/deepseek-v4-pro',
    ],
    'Only exact provider/model duplicates should be removed; DeepSeek and OpenCode Go models must both remain'
);

const aiSidebarSource = fs.readFileSync('src/ai-sidebar.svelte', 'utf8');
assert(
    aiSidebarSource.includes('findOpenCodeModelConfigMatch'),
    'ai-sidebar auto-fetch path must use provider-aware OpenCode model matching'
);
assert(
    !aiSidebarSource.includes('function getModelMatchKeys'),
    'ai-sidebar must not match OpenCode models by bare model id because providers can share model names'
);

assert.equal(shouldRefreshOpenCodeModelCatalog([]), true);
assert.equal(shouldRefreshOpenCodeModelCatalog(Array.from({ length: 20 }, () => ({ contextLimit: 200000 }))), true);
assert.equal(shouldRefreshOpenCodeModelCatalog(Array.from({ length: 120 }, () => ({ contextLimit: 200000 }))), false);
assert.equal(
    shouldRefreshOpenCodeModelCatalog([
        ...Array.from({ length: 120 }, () => ({ contextLimit: 200000 })),
        {},
    ]),
    true
);
