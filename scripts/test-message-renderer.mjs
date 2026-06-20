import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    });
    const url = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
    return import(url);
}

const { escapeHtml, renderMessageHtml } =
    await importTypeScript('../src/chat/message-renderer.ts');

assert.equal(escapeHtml(`<script>alert('x')</script>`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
assert.equal(
    renderMessageHtml('**bold** and `code`\nnext', null),
    '<strong>bold</strong> and <code>code</code><br>next'
);

const calls = [];
const fakeLute = {
    New() {
        return {
            SetSanitize(value) { calls.push(['sanitize', value]); },
            SetInlineMath(value) { calls.push(['inlineMath', value]); },
            SetInlineMathAllowDigitAfterOpenMarker(value) { calls.push(['digitAfterMarker', value]); },
            Md2HTML(value) { calls.push(['render', value]); return '<p>rendered</p>'; },
        };
    },
};
assert.equal(renderMessageHtml('$7.24 s$', fakeLute), '<p>rendered</p>');
assert.deepEqual(calls, [
    ['sanitize', true],
    ['inlineMath', true],
    ['digitAfterMarker', true],
    ['render', '$7.24 s$'],
]);

const brokenLute = { New() { throw new Error('broken renderer'); } };
assert.equal(renderMessageHtml('<unsafe>', brokenLute), '&lt;unsafe&gt;');

console.log('message renderer verification passed');
