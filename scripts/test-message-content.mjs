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

const { convertLatexToMarkdown, getActualMessageContent, getMessageText } =
    await importTypeScript('../src/chat/message-content.ts');

assert.equal(getMessageText('plain text'), 'plain text');
assert.equal(
    getMessageText([
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        { type: 'text', text: 'first' },
        { type: 'text' },
        { type: 'text', text: 'second' },
    ]),
    'first\nsecond'
);

assert.equal(
    getActualMessageContent({ role: 'assistant', content: 'streaming', finalReply: 'final' }),
    'final',
    'tool-loop final replies must take precedence'
);
assert.equal(
    getActualMessageContent({
        role: 'assistant',
        content: 'fallback',
        multiModelResponses: [
            { content: 'model A', isSelected: false },
            { content: 'model B', isSelected: true },
        ],
    }),
    'model B'
);
assert.equal(
    getActualMessageContent({
        role: 'assistant',
        content: 'fallback',
        multiModelResponses: [{ content: '' }, { content: 'first available' }],
    }),
    'first available'
);

assert.equal(
    convertLatexToMarkdown('before \\[ x + y \\] after \\(z\\)'),
    'before \n\n$$\nx + y\n$$\n\n after $z$'
);

console.log('message content verification passed');
