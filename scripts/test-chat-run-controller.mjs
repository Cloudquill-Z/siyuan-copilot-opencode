import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/execution/run-controller.ts', import.meta.url), 'utf8');
const harness = source
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/export const chatRunController[\s\S]*$/, '');
const compiled = ts.transpileModule(harness, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const { ChatRunController } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const events = [];
const transport = async (_provider, options) => {
    options.onThinkingChunk('thought');
    options.onChunk('hello ');
    options.onToolPartUpdate({ callID: 'tool-1', status: 'running' });
    options.onChunk('world');
    options.onComplete('hello world');
    return { sessionId: 'remote-session' };
};
const controller = new ChatRunController(transport);
const result = await controller.run({
    provider: 'opencode',
    options: { model: 'provider/model', messages: [] },
    onEvent: event => events.push(event),
});

assert.equal(result.text, 'hello world');
assert.equal(result.thinking, 'thought');
assert.equal(result.sessionId, 'remote-session');
assert.deepEqual(events.map(event => event.type), ['thinking', 'text', 'tool', 'text', 'complete']);

const failing = new ChatRunController(async () => { throw new Error('network'); });
await assert.rejects(() => failing.run({ provider: 'opencode', options: { model: 'm', messages: [] } }), /network/);

console.log('chat run controller verification passed');
