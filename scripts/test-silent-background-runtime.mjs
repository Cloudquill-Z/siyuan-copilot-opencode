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
const {
    appendTaskRuntimeText,
    appendTaskRuntimeThinking,
    applyTaskRuntimeToolUpdate,
} = await import(moduleUrl);

const blank = {
    messages: [],
    currentInput: '',
    currentAttachments: [],
    contextDocuments: [],
    streamingMessage: '',
    streamingThinking: '',
    openCodeToolParts: [],
    openCodeTimeline: [],
    isThinkingPhase: false,
    isLoading: false,
    hasUnsavedChanges: false,
    lastPreparedContextTokens: 0,
};

const withText = appendTaskRuntimeText(appendTaskRuntimeText(blank, 'hel'), 'lo');
assert.equal(withText.streamingMessage, 'hello');
assert.equal(withText.openCodeTimeline.length, 1);
assert.deepEqual(withText.openCodeTimeline[0], {
    type: 'text',
    id: 'text-0',
    content: 'hello',
});
assert.equal(withText.isLoading, true);

const withThinking = appendTaskRuntimeThinking(
    appendTaskRuntimeThinking(withText, 'plan'),
    ' more'
);
assert.equal(withThinking.streamingThinking, 'plan more');
assert.equal(withThinking.openCodeTimeline.length, 2);
assert.deepEqual(withThinking.openCodeTimeline[1], {
    type: 'thinking',
    id: 'thinking-1',
    content: 'plan more',
});
assert.equal(withThinking.isThinkingPhase, true);

const withToolStart = applyTaskRuntimeToolUpdate(withThinking, {
    callID: 'call-1',
    toolName: 'read',
    status: 'running',
});
const withToolDone = applyTaskRuntimeToolUpdate(withToolStart, {
    callID: 'call-1',
    toolName: 'read',
    status: 'completed',
    output: 'ok',
});

assert.equal(withToolDone.openCodeToolParts.length, 1);
assert.equal(withToolDone.openCodeToolParts[0].status, 'completed');
assert.equal(withToolDone.openCodeToolParts[0].output, 'ok');
assert.equal(withToolDone.openCodeTimeline.length, 3);
assert.equal(withToolDone.openCodeTimeline[2].type, 'tool');
assert.equal(withToolDone.openCodeTimeline[2].toolPart.status, 'completed');
