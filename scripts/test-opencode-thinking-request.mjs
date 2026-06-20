import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
    new URL('../src/providers/opencode-provider.ts', import.meta.url),
    'utf8'
);

assert.match(
    source,
    /options\.enableThinking\s*===\s*true[\s\S]*variant:\s*options\.reasoningEffort/,
    'OpenCode 1.16+ expects the reasoning level in the top-level variant field'
);
assert.doesNotMatch(
    source,
    /model\.enableThinking\s*=/,
    'OpenCode model references reject non-schema enableThinking properties'
);
assert.doesNotMatch(
    source,
    /model\.reasoningEffort\s*=/,
    'OpenCode model references reject non-schema reasoningEffort properties'
);

console.log('OpenCode thinking request verification passed');
