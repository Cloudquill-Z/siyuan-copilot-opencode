import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
    new URL('../src/components/chat/MessageList.svelte', import.meta.url),
    'utf8'
);
const branchStart = source.indexOf("{#if message.role === 'assistant' && message.openCodeTimeline");
assert.notEqual(branchStart, -1, 'OpenCode timeline history branch should exist');

const branchEnd = source.indexOf("{#if message.role === 'assistant' && (message.thinkingBeforeToolCalls", branchStart);
assert.notEqual(branchEnd, -1, 'OpenCode timeline history branch should have a following thinking branch');

const branch = source.slice(branchStart, branchEnd);
const processToggleIndex = branch.indexOf('ai-message__process-toggle');
const finalAnswerIndex = branch.indexOf('finalDisplay');

assert.notEqual(processToggleIndex, -1, 'Process toggle should render for historical OpenCode timelines');
assert.notEqual(finalAnswerIndex, -1, 'Final answer should still render for historical OpenCode timelines');
assert.ok(
    processToggleIndex < finalAnswerIndex,
    'Execution process toggle should render above the final answer'
);
