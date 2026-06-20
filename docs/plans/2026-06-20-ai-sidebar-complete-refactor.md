# AI Sidebar Complete Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `ai-sidebar.svelte` from a 20k-line god component into a composition shell with tested rendering, persistence, execution, attachment/context, and UI component boundaries.

**Architecture:** Preserve all visible behavior while moving pure logic into `src/chat/`, stateful workflows into controllers/repositories, and markup/styles into focused Svelte components. The shell remains the integration root and owns only top-level selection and component wiring; each mutable state domain has one owner.

**Tech Stack:** Svelte 4, TypeScript, SiYuan Plugin API, OpenCode REST/SSE, Node behavior scripts, Vite.

---

## Completion contract

- `src/ai-sidebar.svelte` script is at most 5,000 lines and contains no persistence, attachment ingestion, Markdown rendering, or model execution implementation.
- Message rendering, session/task persistence, attachment/context management, and model execution each have a typed module or controller and focused regression tests.
- Single-model, multi-model, regeneration, abort, and background execution share common request/result primitives instead of copying completion logic.
- Message list, composer/task toolbar, and dialogs are separate Svelte components with colocated styles.
- All existing 21 behavior tests plus new characterization tests pass; TypeScript and production build pass.
- The plugin is installed into the active SiYuan workspace, smoke-tested for core flows, graphify is updated, versions are synchronized, and every phase has a Chinese commit.

## Phase 0: Characterization and dependency map

**Files:**
- Create: `scripts/test-ai-sidebar-boundaries.mjs`
- Create: `src/chat/types.ts`
- Modify: `plugin.json`, `package.json`

1. Add tests that inventory current public behaviors and enforce one-way dependency boundaries.
2. Add shared chat-facing types without changing behavior.
3. Set version to 3.1.2, run baseline tests/build, and commit the plan plus characterization harness.

## Phase 1: Message content and rendering pipeline

**Files:**
- Create: `src/chat/message-content.ts`
- Create: `src/chat/message-renderer.ts`
- Create: `src/chat/dom-enhancers.ts`
- Create: `scripts/test-message-content.mjs`
- Create: `scripts/test-message-renderer.mjs`
- Modify: `src/ai-sidebar.svelte`

1. Write failing tests for text extraction, selected multi-model content, LaTeX conversion, HTML sanitization, code language selection, formula placeholders, and asset replacement.
2. Extract pure content/Markdown functions and DOM enhancement functions.
3. Replace component-local implementations with imports.
4. Verify message rendering, copy, diff, code, formula, block links, and images.
5. Bump patch version and commit.

## Phase 2: Session repository and task state controller

**Files:**
- Create: `src/chat/session-repository.ts`
- Create: `src/chat/task-state-controller.ts`
- Create: `scripts/test-session-repository.mjs`
- Create: `scripts/test-task-state-controller.mjs`
- Modify: `src/ai-sidebar.svelte`, `src/task-types.ts`

1. Characterize session migration, metadata merge, save/load/delete, background state and unread behavior.
2. Move all SiYuan session-file I/O into `SessionRepository`.
3. Move active/background task maps and transitions into `TaskStateController`.
4. Keep the shell subscribed to state snapshots only.
5. Bump patch version, verify concurrent tabs, and commit.

## Phase 3: Attachments and context controller

**Files:**
- Create: `src/chat/attachment-controller.ts`
- Create: `src/chat/context-controller.ts`
- Create: `scripts/test-attachment-controller.mjs`
- Create: `scripts/test-context-controller.mjs`
- Modify: `src/ai-sidebar.svelte`

1. Characterize image/text/URL/drop ingestion and document/block context refresh.
2. Move validation, persistence, batching and pending-save tracking into `AttachmentController`.
3. Move search, current-document discovery, block/document normalization and context refresh into `ContextController`.
4. Expose immutable snapshots to the composer.
5. Bump patch version, verify attachments/context in both modes, and commit.

## Phase 4: Unified model execution engine

**Files:**
- Create: `src/chat/execution/types.ts`
- Create: `src/chat/execution/request-builder.ts`
- Create: `src/chat/execution/run-controller.ts`
- Create: `src/chat/execution/multi-model-runner.ts`
- Create: `scripts/test-chat-run-controller.mjs`
- Modify: `src/ai-sidebar.svelte`, `src/ai-chat.ts`

1. Characterize single/multi-model, regeneration, OpenCode timeline, permission/question, abort, and error completion.
2. Introduce one request builder and one normalized run result.
3. Route single, multi, regeneration and background tasks through the same run controller.
4. Remove copied completion/tool-loop branches from the Svelte component.
5. Bump patch version, verify all execution modes, and commit.

## Phase 5: UI components and styles

**Files:**
- Create: `src/components/chat/MessageList.svelte`
- Create: `src/components/chat/MessageItem.svelte`
- Create: `src/components/chat/ChatComposer.svelte`
- Create: `src/components/chat/TaskToolbar.svelte`
- Create: `src/components/chat/dialogs/*.svelte`
- Modify: `src/ai-sidebar.svelte`, `src/index.scss`

1. Add component contract tests and rendered smoke fixtures.
2. Move message/template sections without changing DOM classes or semantics.
3. Move composer/task toolbar and dialogs with typed props/events.
4. Colocate component styles and delete migrated shell styles.
5. Confirm the shell script is at most 5,000 lines and all five responsibility boundaries are enforced.
6. Bump patch version, run visual smoke checks in SiYuan, and commit.

## Final audit and integration

1. Run every Node behavior test, TypeScript check, runtime dependency audit, and production build.
2. Install to the active SiYuan workspace and exercise send, stream, abort, multi-model, session switch, attachment, context, export, and dialogs.
3. Run `graphify update .` and inspect the new component communities.
4. Merge the feature branch into `main`, push GitHub, and verify local/remote commit identity.
