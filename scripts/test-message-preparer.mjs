import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/chat/execution/message-preparer.ts', import.meta.url), 'utf8');
const harness = source.replace(/^import[\s\S]*?;\n/gm, '');
const compiled = ts.transpileModule(`
const buildMemoryPrompt = async () => '';
const isPluginAssetPath = () => false;
const loadAsset = async () => '';
const getMessageText = content => typeof content === 'string' ? content : content.filter(p => p.type === 'text').map(p => p.text).join('\\n');
${harness}
`, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } });
const { prepareMessagesForAI } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const userMessage = {
    role: 'user',
    content: 'question',
    attachments: [{ type: 'file', name: 'note.txt', data: 'attachment body' }],
};
const result = await prepareMessagesForAI({
    messages: [userMessage],
    contextDocumentsWithLatestContent: [{ id: 'doc-1', title: 'Doc', content: 'document body', type: 'doc' }],
    userContent: 'question',
    lastUserMessage: userMessage,
    modelId: 'provider/model',
    chatMode: 'build',
    userToolCount: 0,
    settings: {},
    contextCount: -1,
    buildSystemPromptForCurrentRequest: async () => ({ baseSystemPrompt: 'system', hasToolInstruction: false }),
});

assert.equal(result[0].role, 'system');
assert.match(result[1].content, /attachment body/);
assert.match(result[1].content, /document body/);
assert.equal(userMessage.content, 'question', 'request preparation must not mutate source messages');

console.log('message preparer verification passed');
