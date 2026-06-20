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

const { AttachmentController, validateAttachmentFile } =
    await importTypeScript('../src/chat/attachment-controller.ts');
const workflowSource = await readFile(
    new URL('../src/chat/attachment-workflow.ts', import.meta.url),
    'utf8'
);
assert.match(workflowSource, /class AttachmentWorkflow/);
assert.match(workflowSource, /addFromPaste/);
assert.match(workflowSource, /addWebPages/);

assert.equal(validateAttachmentFile(new File(['x'], 'bad.pdf', { type: 'application/pdf' })), 'unsupported');
assert.equal(
    validateAttachmentFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' })),
    'too_large'
);

const changes = [];
let finishSave;
let saveCount = 0;
const saveAsset = () => {
    saveCount++;
    return saveCount === 1
        ? new Promise(resolve => { finishSave = resolve; })
        : Promise.resolve('/assets/note.md');
};
const controller = new AttachmentController(saveAsset, attachments => changes.push(attachments));
const image = new File(['image'], 'image.png', { type: 'image/png' });
const pending = controller.addImage(image, 'blob:preview');
assert.equal(controller.attachments[0].data, 'blob:preview');
assert.equal(controller.isSaving, true);
finishSave('/assets/image.png');
await pending;
assert.equal(controller.attachments[0].path, '/assets/image.png');
assert.equal(controller.isSaving, false);

await controller.addText(new File(['hello'], 'note.md', { type: 'text/markdown' }));
assert.equal(controller.attachments[1].data, 'hello');
controller.remove(0);
assert.equal(controller.attachments.length, 1);
assert.ok(changes.length >= 3);

console.log('attachment controller verification passed');
