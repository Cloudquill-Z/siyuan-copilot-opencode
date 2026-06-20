import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebar = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const chatApi = await readFile(new URL('../src/ai-chat.ts', import.meta.url), 'utf8');

assert.doesNotMatch(sidebar, /onToolCallComplete|while \(shouldContinue/);
assert.doesNotMatch(chatApi, /onToolCallComplete/);
assert.match(sidebar, /onToolPartUpdate/);
assert.match(sidebar, /onPermissionAsked/);
assert.match(sidebar, /onQuestionAsked/);

console.log('OpenCode native tool flow verification passed');
