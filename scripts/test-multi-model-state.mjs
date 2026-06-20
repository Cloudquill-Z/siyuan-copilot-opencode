import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
    new URL('../src/chat/execution/multi-model-state.ts', import.meta.url),
    'utf8'
);

assert.match(source, /createMultiModelResponses/);
assert.match(source, /applyMultiModelSelection/);
assert.match(source, /finalizePendingMultiModel/);
assert.match(source, /for \(let index = next\.length - 1/,
    'selection must resolve the latest pending assistant response');
assert.match(source, /message\.role === 'tool'/,
    'tool response history must be preserved when selecting a model');

console.log('multi-model state verification passed');
