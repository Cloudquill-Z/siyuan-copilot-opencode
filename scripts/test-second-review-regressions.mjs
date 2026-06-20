import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const settingsSource = await readFile(new URL('../src/settingsSchema.ts', import.meta.url), 'utf8');
const settingsWithoutImports = settingsSource.replace(/^import .*?;\n/gm, '');
const settingsHarness = `
const DEFAULT_AI_SYSTEM_PROMPT = 'default prompt';
const normalizeTokenUsageRecords = value => value || [];
const getDefaultSettings = () => ({
  settingsVersion: 2, migrationVersion: 1, userName: '', aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  maxConcurrentTasks: 2, aiProviders: { opencode: { serverUrl: 'http://localhost:4096', models: [] } },
  memory: { enabled: false, notebookId: '', rootPath: 'AI记忆', overviewDocId: '', coreDocId: '', autoExtract: true,
    saveFullConversation: false, maxOverviewChars: 3000, maxCoreChars: 4000, maxEpisodicItems: 5,
    maxTopicItems: 2, maxMemoryPromptChars: 12000, minImportance: 0.35 },
  pluginData: { tokenUsageRecords: [], memoryExtractionState: {} }
});
${settingsWithoutImports}`;
const settingsCompiled = ts.transpileModule(settingsHarness, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const settingsModule = await import(`data:text/javascript;base64,${Buffer.from(settingsCompiled.outputText).toString('base64')}`);
const normalized = settingsModule.normalizeSettings({
    aiSystemPrompt: 'custom',
    memory: { maxEpisodicItems: 0, maxTopicItems: 0, minImportance: 0 },
});
assert.equal(normalized.memory.maxEpisodicItems, 0);
assert.equal(normalized.memory.maxTopicItems, 0);
assert.equal(normalized.memory.minImportance, 0);
const normalizedNulls = settingsModule.normalizeSettings({
    aiSystemPrompt: 'custom',
    memory: { maxEpisodicItems: null, maxTopicItems: '', minImportance: null },
});
assert.equal(normalizedNulls.memory.maxEpisodicItems, 5);
assert.equal(normalizedNulls.memory.maxTopicItems, 2);
assert.equal(normalizedNulls.memory.minImportance, 0.35);

const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const putFileBlock = apiSource.slice(apiSource.indexOf('export async function putFile'), apiSource.indexOf('export async function removeFile'));
assert.match(putFileBlock, /throw new Error\(/, 'putFile must throw when the kernel rejects a write');

const sidebarSource = await readFile(new URL('../src/ai-sidebar.svelte', import.meta.url), 'utf8');
assert.match(
    sidebarSource,
    /\$:\s*currentReactiveModelConfig\s*=\s*getLatestCurrentModelConfig\(\s*settings,\s*providers,\s*currentProvider,\s*currentModelId\s*\)/,
    'Svelte must see every model-state dependency or thinking controls stay disabled after async settings load'
);
const saveSessionsBlock = sidebarSource.slice(sidebarSource.indexOf('async function saveSessions'), sidebarSource.indexOf('function generateSessionTitle'));
assert.match(saveSessionsBlock, /throw error/, 'metadata write failures must propagate to saveCurrentSession');
const saveCurrentBlock = sidebarSource.slice(sidebarSource.indexOf('async function saveCurrentSession'), sidebarSource.indexOf('async function saveTaskStateSession'));
assert.match(saveCurrentBlock, /catch \(error\)/, 'saveCurrentSession must retain dirty state while handling persistence failures');
const domEnhancerSource = await readFile(new URL('../src/chat/dom-enhancers.ts', import.meta.url), 'utf8');
const highlightBlock = domEnhancerSource.slice(domEnhancerSource.indexOf('function highlightCodeBlocks'), domEnhancerSource.indexOf('// 初始化 KaTeX'));
assert.equal(
    (highlightBlock.match(/querySelectorAll\(\s*['"]pre > code:not\(\[data-highlighted\]\)['"]\s*\)/g) || []).length,
    1,
    'code blocks should be highlighted by one reachable path'
);
assert.match(highlightBlock, /highlighted = hljs\.highlight\(code/, 'explicit languages must retain the highlight result');
assert.match(highlightBlock, /highlightAuto\(code\)/, 'automatic highlighting must receive code text');
const messageRendererSource = await readFile(new URL('../src/chat/message-renderer.ts', import.meta.url), 'utf8');
assert.match(messageRendererSource, /lute\.SetSanitize\(true\)/, 'Lute rendering must sanitize untrusted chat HTML');
assert.match(messageRendererSource, /escapeHtml\(textContent\)/, 'fallback rendering must escape untrusted chat HTML');
const diffRenderBlock = await readFile(new URL('../src/chat/diff-utils.ts', import.meta.url), 'utf8');
assert.match(diffRenderBlock, /lute\.SetSanitize\(true\)/, 'diff rendering must sanitize untrusted markdown HTML');

const healthSource = await readFile(new URL('../src/stores/connectionStatus.ts', import.meta.url), 'utf8');
assert.match(healthSource, /healthPollGeneration/, 'health polling must reject stale responses');
assert.match(healthSource, /healthController\?\.abort\(\)/, 'stopping health polling must abort the active request');
const healthHarness = healthSource.replace(
    /^import .*?;\n/,
    `const writable = initial => { let value = initial; return { update: fn => { value = fn(value); }, set: next => { value = next; }, __get: () => value }; };\nconst get = store => store.__get();\n`
);
const healthCompiled = ts.transpileModule(healthHarness, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const healthModule = await import(`data:text/javascript;base64,${Buffer.from(healthCompiled.outputText).toString('base64')}`);
const originalFetch = globalThis.fetch;
const pendingRequests = [];
globalThis.fetch = (url, options = {}) =>
    new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
        pendingRequests.push({ url, resolve });
    });
healthModule.startHealthPoll('http://old-server', 60_000);
healthModule.startHealthPoll('http://new-server', 60_000);
assert.equal(pendingRequests.length, 2);
pendingRequests[1].resolve({ ok: true, json: async () => ({ version: 'new' }) });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(healthModule.getConnectionStatus().serverUrl, 'http://new-server');
assert.equal(healthModule.getConnectionStatus().version, 'new');
healthModule.stopHealthPoll();
globalThis.fetch = originalFetch;

const memorySource = await readFile(new URL('../src/memory/extractor.ts', import.meta.url), 'utf8');
assert.match(memorySource, /shouldRemember:\s*parsed\.shouldRemember === true/, 'memory writes require explicit model approval');

console.log('second review regression verification passed');
