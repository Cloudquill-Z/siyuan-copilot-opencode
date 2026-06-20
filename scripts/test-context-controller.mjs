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

const { ContextController, buildDocumentSearchQuery, createContextTitle } =
    await importTypeScript('../src/chat/context-controller.ts');

assert.match(buildDocumentSearchQuery("alpha beta's"), /content LIKE '%alpha%'/);
assert.match(buildDocumentSearchQuery("alpha beta's"), /content LIKE '%beta''s%'/);
assert.equal(createContextTitle('a\nvery long block content that exceeds twenty chars', 'fallback'), 'a very long block co...');

const snapshots = [];
const controller = new ContextController(docs => snapshots.push(docs));
assert.equal(controller.add({ id: 'doc', title: 'Doc', content: 'body', type: 'doc' }), true);
assert.equal(controller.add({ id: 'doc', title: 'Duplicate', content: 'body', type: 'doc' }), false);
controller.add({ id: 'block', title: 'Block', content: 'body', type: 'block' });
controller.remove('doc');
assert.deepEqual(controller.documents.map(doc => doc.id), ['block']);
assert.ok(snapshots.length >= 3);

console.log('context controller verification passed');
