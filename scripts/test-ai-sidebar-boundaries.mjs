import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const scriptEnd = source.indexOf('</script>');
const styleStart = source.indexOf('<style');

assert.ok(scriptEnd > 0 && styleStart > scriptEnd, 'sidebar must retain valid Svelte sections');

const metrics = {
    totalLines: source.split('\n').length,
    scriptLines: source.slice(0, scriptEnd).split('\n').length,
    styleLines: source.slice(styleStart).split('\n').length,
};

// Baseline characterization. The final phase replaces these ceilings with the
// completion-contract limits after responsibilities have moved out of the shell.
assert.ok(metrics.totalLines <= 21_000, `unexpected sidebar growth: ${metrics.totalLines}`);
assert.ok(metrics.scriptLines <= 11_500, `unexpected script growth: ${metrics.scriptLines}`);

console.log('ai sidebar boundary baseline', metrics);
