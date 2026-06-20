import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
const scriptEnd = source.indexOf('</script>');
const styleStart = source.indexOf('<style');

assert.ok(scriptEnd > 0, 'sidebar must retain a valid Svelte script section');

const metrics = {
    totalLines: source.split('\n').length,
    scriptLines: source.slice(0, scriptEnd).split('\n').length,
    styleLines: styleStart >= 0 ? source.slice(styleStart).split('\n').length : 0,
};

// Tighten these ceilings after every extraction so the shell cannot silently
// regain responsibilities that have moved into dedicated modules.
assert.ok(metrics.totalLines <= 15_200, `unexpected sidebar growth: ${metrics.totalLines}`);
assert.ok(metrics.scriptLines <= 10_900, `unexpected script growth: ${metrics.scriptLines}`);
assert.ok(metrics.styleLines <= 2, `sidebar styles must remain external: ${metrics.styleLines}`);

console.log('ai sidebar boundary baseline', metrics);
