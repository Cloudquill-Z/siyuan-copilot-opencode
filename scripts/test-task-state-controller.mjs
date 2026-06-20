import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    });
    return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}

const { TaskStateController } = await importTypeScript('../src/chat/task-state-controller.ts');
const blank = () => ({ value: '', isLoading: false });
const controller = new TaskStateController(blank, ['draft:one'], 2);

controller.saveForeground('draft:one', { value: 'draft', isLoading: false });
controller.replaceDraft('draft:one', 'session-a');
assert.deepEqual(controller.activeTaskIds, ['session-a']);
assert.equal(controller.getState('session-a').value, 'draft');

controller.ensureTab('session-b', 'session-a', new Set());
controller.ensureTab('session-c', 'session-a', new Set(['session-b']));
assert.deepEqual(
    controller.activeTaskIds,
    ['session-a', 'session-b'],
    'tab eviction must retain both the active task and a running background task'
);

controller.markUnread('session-b', 'session-a');
assert.equal(controller.isUnread('session-b'), true);
controller.markUnread('session-a', 'session-a');
assert.equal(controller.isUnread('session-a'), false, 'active tasks cannot become unread');
controller.clearUnread('session-b');
assert.equal(controller.isUnread('session-b'), false);

controller.updateState('session-b', false, state => ({ ...state, value: 'background' }));
assert.equal(controller.getState('session-b').value, 'background');
assert.equal(controller.flushBackground('session-b').value, 'background');
assert.equal(controller.hasBackgroundState('session-b'), false);

controller.removeTask('session-b');
assert.deepEqual(controller.activeTaskIds, ['session-a']);
assert.equal(controller.hasState('session-b'), false);

console.log('task state controller verification passed');
