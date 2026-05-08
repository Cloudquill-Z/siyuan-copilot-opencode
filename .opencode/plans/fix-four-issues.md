# Fix Plan: siyuan-copilot-opencode v0.0.2

## Issue 1: Model display not working properly
- **File**: `src/ai-sidebar.svelte` line ~1319
- **Root cause**: During auto-fetch of OpenCode models, `currentProvider` is not set alongside `currentModelId`
- **Fix**: Add `settings.currentProvider = 'opencode'` before setting `currentModelId`

## Issue 2: Soul documents not loading
- **File**: `src/ai-sidebar.svelte` line 61
- **Root cause**: `soul()` function is a stub returning `{ success: false, content: '' }`
- **Fix**: Replace stub with real implementation using `settings.soulDocId` + `exportMdContent()`

## Issue 3: Cannot drag blocks into context
- **File**: `src/ai-sidebar.svelte` lines 6875, 6885, 6903
- **Root cause**: `event.dataTransfer.types.includes()` throws TypeError when `types` is null or DOMStringList without includes method
- **Fix**: Add null-safety check: `const types = event.dataTransfer?.types; const isMultiModelSort = types && [...types].includes('application/multi-model-sort');`

## Issue 4: Cannot select thinking intensity based on OpenCode config
- **File 4a**: `src/providers/opencode-provider.ts` line ~253 — Extract enableThinking/reasoningEffort from modelInfo
- **File 4a**: `src/ai-chat.ts` line ~147 — Pass thinking config through fetchModels()
- **File 4b**: `src/ai-sidebar.svelte` line ~1307 — Use OpenCode thinking config in auto-fetch
- **File 4b**: `src/components/ProviderConfigPanel.svelte` line ~152 — Use OpenCode thinking config when adding models
