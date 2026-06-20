import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/session-repository.ts', import.meta.url), 'utf8');
const harness = source.replace(/^import[\s\S]*?;\n/gm, '').replace('export class SessionRepository', 'class SessionRepository');
const compiled = ts.transpileModule(`${harness}\nexport { prepareMessagesForStorage, toSessionMetadata, deriveSessionTitle };`, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const stored = module.prepareMessagesForStorage([
    {
        role: 'user',
        content: 'hello',
        attachments: [
            { type: 'image', name: 'saved', path: '/asset.png', data: 'blob:preview' },
            { type: 'file', name: 'inline', data: 'text' },
        ],
        generatedImages: [{ path: '/generated.png', data: 'large-base64' }],
    },
]);
assert.equal(stored[0].attachments[0].data, '');
assert.equal(stored[0].attachments[1].data, 'text');
assert.equal(stored[0].generatedImages[0].data, '');

const metadata = module.toSessionMetadata([
    { id: 'a', title: 'A', messages: [{ role: 'user' }, { role: 'system' }], createdAt: 1, updatedAt: 2 },
], new Set(['a']));
assert.equal(metadata[0].messages, undefined);
assert.equal(metadata[0].messageCount, 1);
assert.equal(metadata[0].status, 'running');
assert.equal(
    module.deriveSessionTitle([{ role: 'user', content: '123456789012345678901234567890more' }], 'fallback'),
    '123456789012345678901234567890...'
);

console.log('session repository verification passed');
