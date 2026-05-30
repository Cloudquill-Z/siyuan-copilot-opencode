import assert from 'node:assert/strict';

const { mergeOpenCodeModelLists, parseOpenCodeModelListOutput } = await import('../src/providers/opencode-models.ts');

const models = parseOpenCodeModelListOutput(`
opencode/big-pickle
opencode/deepseek-v4-flash-free
opencode/mimo-v2.5-free
opencode/nemotron-3-super-free
opencode-go/deepseek-v4-pro
`);

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
