import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/execution/request-builder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const { buildChatRunOptions } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const messages = [{ role: 'user', content: 'hello' }];
const onChunk = () => undefined;
const result = buildChatRunOptions({ apiKey: '', model: 'provider/model', messages, onChunk });
assert.equal(result.stream, true);
assert.equal(result.onChunk, onChunk);
assert.notEqual(result.messages, messages);
result.messages[0].content = 'changed';
assert.equal(messages[0].content, 'hello');

console.log('chat request builder verification passed');
