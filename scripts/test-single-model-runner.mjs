import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const runner = await readFile(
    new URL('../src/chat/execution/single-model-runner.ts', import.meta.url),
    'utf8'
);
assert.match(runner, /runChat\(/);
assert.match(runner, /onPermissionAsked/);
assert.match(runner, /onQuestionAsked/);
assert.match(runner, /onImageGenerated/);
assert.doesNotMatch(shell, /runChat\(/,
    'the composition shell must not implement model transport');
assert.doesNotMatch(shell, /import\('\.\/ai-chat'\)/,
    'the shell must use the static transport boundary');
assert.match(shell, /onMount\(async/);
assert.match(shell, /onDestroy\(async/);
console.log('single-model runner boundary verification passed');
