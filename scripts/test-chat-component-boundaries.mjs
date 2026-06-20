import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const messages = await readFile(
    new URL('../src/components/chat/MessageList.svelte', import.meta.url),
    'utf8'
);
const toolbar = await readFile(
    new URL('../src/components/chat/TaskToolbar.svelte', import.meta.url),
    'utf8'
);

assert.match(shell, /<MessageList/);
assert.match(shell, /<TaskToolbar/);
assert.doesNotMatch(shell, /class="ai-sidebar__messages"/,
    'message markup must not remain in the composition shell');
assert.match(messages, /class="ai-sidebar__messages"/);
assert.match(messages, /multiModelResponses/);
assert.match(toolbar, /<SessionManager/);

console.log('chat component boundary verification passed');
