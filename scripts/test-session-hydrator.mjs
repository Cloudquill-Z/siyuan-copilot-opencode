import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/session-hydrator.ts', import.meta.url), 'utf8');
const harness = source.replace(/^import[\s\S]*?;\n/gm, '');
const compiled = ts.transpileModule(`
const cleanModelName = name => String(name || '').replace(/^\\s*✅+\\s*/, '');
const base64ToBlob = (data, type) => new Blob([data], { type });
const loadAsset = async path => 'blob:' + path;
const readAssetAsText = async path => 'text:' + path;
const saveAsset = async (_blob, name) => '/assets/' + name;
${harness}
`, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } });
const { hydrateSessionMessages } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const result = await hydrateSessionMessages([{
    role: 'assistant',
    content: '',
    attachments: [{ type: 'file', name: 'note.txt', data: '', path: '/note.txt' }],
    multiModelResponses: [
        { modelName: '✅ Model A', content: 'answer', error: '', isSelected: false },
        { modelName: 'Model B', content: '', error: 'failed', isSelected: false },
    ],
}]);

assert.equal(result.messages[0].attachments[0].data, 'text:/note.txt');
assert.equal(result.messages[0].multiModelResponses[0].modelName, 'Model A');
assert.equal(result.messages[0].multiModelResponses[0].isSelected, true);
assert.equal(result.messages[0].content, 'answer');
assert.equal(result.modified, true);

console.log('session hydrator verification passed');
