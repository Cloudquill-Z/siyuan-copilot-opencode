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

// Tighten these ceilings after every extraction so the shell cannot silently
// regain responsibilities that have moved into dedicated modules.
assert.ok(metrics.totalLines <= 20_550, `unexpected sidebar growth: ${metrics.totalLines}`);
assert.ok(metrics.scriptLines <= 10_900, `unexpected script growth: ${metrics.scriptLines}`);

console.log('ai sidebar boundary baseline', metrics);
