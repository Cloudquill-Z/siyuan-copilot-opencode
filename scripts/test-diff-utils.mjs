import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/diff-utils.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const utils = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

assert.equal(utils.normalizeOperationContentForDiff('text\n{: id="abc" }'), 'text');
assert.equal(utils.escapeSqlString("it's"), "it''s");
assert.deepEqual(utils.generateSimpleDiff('same\nold', 'same\nnew'), [
    { type: 'unchanged', line: 'same' },
    { type: 'removed', line: 'old' },
    { type: 'added', line: 'new' },
]);
assert.match(utils.renderMarkdownForSplitDiff('<unsafe>'), /&lt;unsafe&gt;/);

console.log('diff utils verification passed');
