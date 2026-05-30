import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/sendShortcut.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
    },
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const { shouldSendMessageFromKeydown } = await import(moduleUrl);

const enterEvent = overrides => ({
    key: 'Enter',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 13,
    which: 13,
    ...overrides,
});

assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ metaKey: true }), 'ctrl+enter', 'MacIntel'),
    true,
    'Mac should send with Command+Enter',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ ctrlKey: true }), 'ctrl+enter', 'MacIntel'),
    false,
    'Mac should not send with Control+Enter',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ ctrlKey: true }), 'ctrl+enter', 'Win32'),
    true,
    'Windows should send with Ctrl+Enter',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ metaKey: true }), 'ctrl+enter', 'Win32'),
    false,
    'Windows should not send with Command/Meta+Enter',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent(), 'enter', 'Win32'),
    true,
    'Plain Enter should send in Enter mode',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ shiftKey: true }), 'enter', 'Win32'),
    false,
    'Shift+Enter should keep inserting a line break in Enter mode',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ isComposing: true }), 'enter', 'Win32'),
    false,
    'IME composition Enter should not send',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent({ keyCode: 229, which: 229 }), 'enter', 'Win32'),
    false,
    'IME process Enter should not send',
);
assert.equal(
    shouldSendMessageFromKeydown(enterEvent(), 'enter', 'Win32', true),
    false,
    'Tracked composition state should block sending',
);
