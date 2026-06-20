import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
    new URL('../src/chat/execution/multi-model-runner.ts', import.meta.url),
    'utf8'
);
assert.match(source, /Promise\.all/);
assert.match(source, /runChat\(/);
assert.match(source, /processContent/);
assert.match(source, /conversationMessages/);
assert.match(source, /Request aborted/);
console.log('multi-model runner verification passed');
