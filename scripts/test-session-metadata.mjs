import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/session-metadata.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const { mutateSessionMetadata } = await import(moduleUrl);

let stored = [];
const read = async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return stored.map(item => ({ ...item }));
};
const write = async next => {
    await new Promise(resolve => setTimeout(resolve, 5));
    stored = next.map(item => ({ ...item }));
};

await Promise.all([
    mutateSessionMetadata(read, write, current => [{ id: 'a' }, ...current]),
    mutateSessionMetadata(read, write, current => [{ id: 'b' }, ...current]),
]);

assert.deepEqual(new Set(stored.map(item => item.id)), new Set(['a', 'b']));
console.log('session metadata serialization verification passed');
