import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/task-runner.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
    },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const { TaskRunner } = await import(moduleUrl);

const runner = new TaskRunner(2);

assert.equal(runner.start('a'), 'running');
assert.equal(runner.start('b'), 'running');
assert.equal(runner.start('c'), 'queued');
assert.deepEqual(runner.getActiveTaskIds(), ['a', 'b']);
assert.deepEqual(runner.getQueuedTaskIds(), ['c']);

assert.equal(runner.complete('a'), 'c');
assert.deepEqual(runner.getActiveTaskIds().sort(), ['b', 'c']);
assert.deepEqual(runner.getQueuedTaskIds(), []);

assert.equal(runner.start('d'), 'queued');
assert.equal(runner.cancel('d'), null);
assert.equal(runner.getState('d'), 'idle');

assert.equal(runner.cancel('b'), null);
assert.deepEqual(runner.getActiveTaskIds(), ['c']);
