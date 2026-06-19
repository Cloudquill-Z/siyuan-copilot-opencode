# Session Export Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every conversation export accurate, current, complete, and failure-aware while preventing session metadata loss.

**Architecture:** Move export formatting into pure TypeScript helpers, pass immutable export snapshots through UI flows, and centralize session metadata mutation behind a serialized merge helper. Keep component changes limited to orchestration and lifecycle cleanup.

**Tech Stack:** Svelte 4, TypeScript, SiYuan kernel API, Node assertion scripts.

---

### Task 1: Export formatter

**Files:**
- Create: `src/utils/sessionExport.ts`
- Create: `scripts/test-session-export.mjs`
- Modify: `src/ai-sidebar.svelte`

1. Add failing tests for current display-name resolution, role filtering, multi-model deduplication and clean model names.
2. Run the test and confirm it fails because the formatter does not exist.
3. Implement the pure formatter and replace inline Markdown assembly.
4. Run the new test and TypeScript check.

### Task 2: Historical export snapshots and file downloads

**Files:**
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/components/SessionManager.svelte`
- Extend: `scripts/test-session-export.mjs`

1. Add source-level regression assertions for snapshot ownership and parent-dispatched file export.
2. Confirm the assertions fail on the current implementation.
3. Store immutable pending export state and route file export through the parent after loading session JSON.
4. Confirm the focused tests pass.

### Task 3: Failure propagation and safe paths

**Files:**
- Modify: `src/api.ts`
- Modify: `src/ai-sidebar.svelte`
- Create: `scripts/test-save-to-note-safety.mjs`

1. Add failing assertions for nonzero kernel responses, document-ID validation and document-name sanitization.
2. Implement error propagation and validation.
3. Run focused tests.

### Task 4: State consistency and lifecycle

**Files:**
- Create: `src/session-metadata.ts`
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/components/ModelPreset.svelte`
- Modify: `src/components/SessionManager.svelte`
- Create: `scripts/test-session-metadata.mjs`

1. Add failing tests for serialized metadata merges, empty model synchronization and listener cleanup.
2. Implement a module-level mutation queue and lifecycle cleanup.
3. Remove all writes of selection checkmarks into `modelName`.
4. Run focused and full behavior tests.

### Task 5: Version and verification

**Files:**
- Modify: `plugin.json`
- Modify: `package.json`
- Modify: `scripts/test-chat-mode-behavior.mjs`

1. Set both versions to `3.1.0` and update the stale context-limit assertion.
2. Run all 16+ behavior tests and `npx tsc --noEmit`.
3. Run a production build with the configured install behavior.
4. Run `graphify update .`, review the diff, and create one Chinese commit summarizing fixes and verification.
