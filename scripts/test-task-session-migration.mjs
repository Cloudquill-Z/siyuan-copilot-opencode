import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/task-types.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
    },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const { normalizeTaskSession } = await import(moduleUrl);

const migrated = normalizeTaskSession({
    id: 'session-1',
    title: 'Old session',
    createdAt: 100,
    updatedAt: 200,
    messageCount: 3,
});

assert.equal(migrated.id, 'session-1');
assert.equal(migrated.title, 'Old session');
assert.equal(migrated.status, 'completed');
assert.equal(migrated.messageCount, 3);

const running = normalizeTaskSession({
    id: 'session-2',
    title: 'Running',
    status: 'running',
});

assert.equal(running.status, 'running');
assert.ok(running.createdAt > 0);
assert.ok(running.updatedAt > 0);
