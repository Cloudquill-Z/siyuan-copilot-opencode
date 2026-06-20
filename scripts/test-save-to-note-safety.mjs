import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const sidebarSource = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const saveDialogSource = await readFile(
    new URL('../src/components/chat/dialogs/SaveToNoteDialog.svelte', import.meta.url),
    'utf8'
);
const presetSource = await readFile(new URL('../src/components/ModelPreset.svelte', import.meta.url), 'utf8');
const managerSource = await readFile(new URL('../src/components/SessionManager.svelte', import.meta.url), 'utf8');

assert.match(apiSource, /throw new Error\(/, 'kernel API failures should throw');
assert.match(saveDialogSource, /if \(!docId\)/, 'save-to-note should validate the created document id');
assert.match(saveDialogSource, /let snapshot:/, 'save dialog should own its export snapshot');
assert.doesNotMatch(
    sidebarSource,
    /createDocWithMd|searchSavePath|pendingSessionExport/,
    'the sidebar shell should not implement note persistence'
);
assert.match(managerSource, /dispatch\('exportFile'/, 'session file export should be delegated to the parent');
assert.match(presetSource, /onDestroy\(/, 'ModelPreset should clean global listeners on destroy');
assert.match(managerSource, /onDestroy\(/, 'SessionManager should clean global listeners on destroy');

console.log('save-to-note safety source verification passed');
