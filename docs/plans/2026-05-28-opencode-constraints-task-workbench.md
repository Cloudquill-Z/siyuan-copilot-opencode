# OpenCode Constraints and Task Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** First constrain the plugin-managed OpenCode instance so SiYuan work must use the installed `siyuan-sisyphus` CLI and bundled skills, then refactor the existing history/session UI into a unified task workbench that supports switching and concurrent running tasks.

**Architecture:** Phase 1 adds a plugin-managed OpenCode workspace with generated `opencode.json`, `AGENTS.md`, installed Sisyphus skills, and a guard plugin that blocks direct local SiYuan filesystem access. Phase 2 upgrades the existing `ChatSession` history model into a single `TaskSession` model with persistent task metadata, per-task runtime state, a task repository/store, and a task navigator that replaces the current session manager rather than creating a second system.

**Tech Stack:** SiYuan Plugin API, Svelte 4, TypeScript, OpenCode REST/SSE API, OpenCode config/plugins, `siyuan-sisyphus` CLI, existing plugin storage helpers, Vite build.

---

## Constraints

- Do not build a new SiYuan CLI or MCP layer. Reuse the user-installed `siyuan-plugins-mcp-sisyphus` and its `siyuan-sisyphus` CLI.
- Do not modify the user's global OpenCode config. All generated OpenCode config must apply only to the plugin-managed OpenCode process/workspace.
- Do not create a parallel task system beside existing sessions. Historical sessions become tasks through a compatibility migration.
- Keep old session files readable. Existing `chat-sessions.json` and `sessions/{id}.json` data must continue to load.
- There are no dedicated test/typecheck scripts in this repo. Use focused Node scripts where useful and `npm run build` as the main verification command.
- After code changes, run `graphify update .` as required by project instructions.

## Phase 1 - OpenCode Intelligence and Boundary Constraints

### Task 1: Add Managed Workspace Path Helpers

**Files:**
- Modify: `src/pluginPaths.ts`
- Modify: `src/index.ts`
- Test: `scripts/test-opencode-workspace-paths.mjs`

**Step 1: Define expected behavior**

The plugin needs a stable workspace root under plugin data:

```ts
export const OPENCODE_WORKSPACE_DIR = `${PETAL_DIR}/opencode-workspace`;
export const OPENCODE_WORKSPACE_OPENCODE_DIR = `${OPENCODE_WORKSPACE_DIR}/.opencode`;
export const OPENCODE_WORKSPACE_AGENTS_PATH = `${OPENCODE_WORKSPACE_DIR}/AGENTS.md`;
export const OPENCODE_WORKSPACE_CONFIG_PATH = `${OPENCODE_WORKSPACE_DIR}/opencode.json`;
```

**Step 2: Write a small path verification script**

Create `scripts/test-opencode-workspace-paths.mjs` that imports or mirrors the constants and asserts:

```js
import assert from "node:assert/strict";

const pluginId = "siyuan-copilot-opencode";
const petalDir = `/data/storage/petal/${pluginId}`;
assert.equal(`${petalDir}/opencode-workspace`, "/data/storage/petal/siyuan-copilot-opencode/opencode-workspace");
assert.equal(`${petalDir}/opencode-workspace/.opencode`, "/data/storage/petal/siyuan-copilot-opencode/opencode-workspace/.opencode");
```

Run:

```bash
node scripts/test-opencode-workspace-paths.mjs
```

Expected: PASS with no output.

**Step 3: Implement constants**

Add the constants to `src/pluginPaths.ts`.

**Step 4: Replace `getOpenCodeWorkingDir()` behavior**

In `src/index.ts`, change the OpenCode working directory logic from `process.cwd()` / home fallback to a managed workspace path. Because `child_process.spawn` needs an OS filesystem path, add a resolver that uses SiYuan workspace information when available:

```ts
private getSiYuanWorkspaceDir(): string {
    return (window as any)?.siyuan?.config?.system?.workspaceDir || '';
}

private getOpenCodeWorkingDir(): string {
    const workspaceDir = this.getSiYuanWorkspaceDir();
    if (workspaceDir) {
        return `${workspaceDir}/data/storage/petal/siyuan-copilot-opencode/opencode-workspace`;
    }
    return this.getFallbackOpenCodeWorkingDir();
}
```

Keep a fallback only for unusual environments, but do not choose user home as the normal target.

**Step 5: Run verification**

Run:

```bash
node scripts/test-opencode-workspace-paths.mjs
npm run build
```

Expected: path script passes; Vite production build completes.

**Step 6: Commit**

```bash
git add src/pluginPaths.ts src/index.ts scripts/test-opencode-workspace-paths.mjs
git commit -m "feat: add managed opencode workspace paths"
```

### Task 2: Initialize Workspace Files

**Files:**
- Create: `src/opencode-workspace.ts`
- Modify: `src/index.ts`
- Test: `scripts/test-opencode-workspace-init.mjs`

**Step 1: Write a pure generator test**

Create `scripts/test-opencode-workspace-init.mjs` that validates generated text includes:

- `siyuan-sisyphus skill install`
- `siyuan-sisyphus`
- "do not read SiYuan local data"
- `.opencode/plugins/sisyphus-guard.js`

Use pure exported generator functions so this test does not need SiYuan runtime.

**Step 2: Create workspace module**

Create `src/opencode-workspace.ts` with pure functions:

```ts
export function buildManagedOpenCodeConfig(): string { ... }
export function buildManagedAgentsMd(): string { ... }
export function buildSisyphusGuardPlugin(): string { ... }
```

And an async initializer:

```ts
export async function ensureManagedOpenCodeWorkspace(putFileFn, readDirFn, options): Promise<void> { ... }
```

Use existing `putFile` for writes so paths stay in SiYuan storage conventions.

**Step 3: Generate `AGENTS.md`**

The generated `AGENTS.md` must contain hard rules:

- For any SiYuan task, use `siyuan-sisyphus`.
- Before SiYuan work in a fresh environment, run `siyuan-sisyphus skill install` or inspect installed skills.
- Search/query tasks use `siyuan-sisyphus-search-query`.
- Browse/read tasks use `siyuan-sisyphus-browse-read`.
- Create/edit tasks use `siyuan-sisyphus-create-edit` and `siyuan-markup-guide`.
- Do not read `data/storage`, `data/assets`, `.sy` files, or workspace directories to inspect notes.
- Prefer full command `siyuan-sisyphus`, not alias `siyuan`.

**Step 4: Generate `opencode.json`**

Recommended initial config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "allow",
    "edit": "ask",
    "external_directory": "deny",
    "bash": {
      "*": "allow",
      "sudo *": "deny",
      "rm -rf *": "deny"
    }
  },
  "plugin": [
    ".opencode/plugins/sisyphus-guard.js"
  ],
  "instructions": [
    "AGENTS.md"
  ]
}
```

Tune the exact bash deny patterns during implementation, but keep the default low-friction.

**Step 5: Generate guard plugin**

The guard plugin should intercept `tool.execute.before` and deny or rewrite risky bash calls:

- Allow `siyuan-sisyphus ...`
- Allow `siyuan-sisyphus skill ...`, `list`, `help`, `system get-version`
- Block direct reads/searches under SiYuan storage paths
- Block commands that search for `.sy` files as a substitute for CLI
- Return a clear message telling the model to use `siyuan-sisyphus`

**Step 6: Call initializer before OpenCode start**

In `src/index.ts`, call `ensureManagedOpenCodeWorkspace(...)` before `ensureServerRunning(...)`.

**Step 7: Run verification**

Run:

```bash
node scripts/test-opencode-workspace-init.mjs
npm run build
```

Expected: generator test passes; build completes.

**Step 8: Commit**

```bash
git add src/opencode-workspace.ts src/index.ts scripts/test-opencode-workspace-init.mjs
git commit -m "feat: initialize managed opencode workspace"
```

### Task 3: Ensure OpenCode Uses Managed Config

**Files:**
- Modify: `src/opencode-runner.ts`
- Modify: `src/index.ts`
- Test: `scripts/test-opencode-runner-options.mjs`

**Step 1: Add runner option for config content/path**

Extend `OpenCodeRunnerOptions`:

```ts
export interface OpenCodeRunnerOptions {
    cliPath?: string;
    port?: number;
    hostname?: string;
    workingDir?: string;
    env?: Record<string, string>;
    configContent?: string;
}
```

**Step 2: Inject process-local config**

When spawning OpenCode, merge env:

```ts
const env = {
  ...processEnv,
  ...(options?.configContent ? { OPENCODE_CONFIG_CONTENT: options.configContent } : {}),
  ...(options?.env || {}),
};
```

This prevents global OpenCode instances from being affected.

**Step 3: Add external service warning path**

If `checkServerAvailable(hostname, port)` succeeds before this plugin starts a process, mark it as an external OpenCode server. In that case:

- Do not claim managed constraints are active.
- Show a warning in connection/status UI or a toast: "当前连接的是外部 OpenCode 服务，插件无法保证工作目录和 Sisyphus 约束。"

**Step 4: Write option script**

Create `scripts/test-opencode-runner-options.mjs` with pure assertions around an exported env builder if possible:

```js
assert.equal(buildOpenCodeEnv({ configContent: "{}" }).OPENCODE_CONFIG_CONTENT, "{}");
```

If extracting a pure helper is too invasive, skip the script and verify through build/manual code review.

**Step 5: Run verification**

Run:

```bash
node scripts/test-opencode-runner-options.mjs
npm run build
```

Expected: script passes if added; build completes.

**Step 6: Commit**

```bash
git add src/opencode-runner.ts src/index.ts scripts/test-opencode-runner-options.mjs
git commit -m "feat: run opencode with managed config"
```

### Task 4: Add Sisyphus CLI Detection and Status

**Files:**
- Create: `src/sisyphus-cli.ts`
- Modify: `src/index.ts`
- Modify: `src/stores/connectionStatus.ts`
- Modify: `src/components/ConnectionStatus.svelte`
- Test: `scripts/test-sisyphus-cli-detection.mjs`

**Step 1: Create pure detection helpers**

Add helpers that can build detection commands without running them:

```ts
export const SISYPHUS_CLI = 'siyuan-sisyphus';
export function getSisyphusProbeCommands() {
  return [
    ['siyuan-sisyphus', '--version'],
    ['siyuan-sisyphus', 'skill', 'list', '--json'],
    ['siyuan-sisyphus', 'system', 'get-version', '--json'],
  ];
}
```

**Step 2: Add Electron detection**

Use `window.require('child_process')` only in Electron, matching `opencode-runner.ts` style. Detect:

- CLI missing
- CLI exists but plugin/config not initialized
- CLI and skills ready

**Step 3: Surface status**

Expose status in the connection store:

```ts
sisyphus: {
  state: 'unknown' | 'missing' | 'needs_init' | 'ready' | 'error';
  message: string;
}
```

Show concise status in `ConnectionStatus.svelte`.

**Step 4: Run verification**

Run:

```bash
node scripts/test-sisyphus-cli-detection.mjs
npm run build
```

Expected: pure detection script passes; build completes.

**Step 5: Commit**

```bash
git add src/sisyphus-cli.ts src/index.ts src/stores/connectionStatus.ts src/components/ConnectionStatus.svelte scripts/test-sisyphus-cli-detection.mjs
git commit -m "feat: detect siyuan sisyphus cli readiness"
```

### Task 5: Tighten Prompt and Request Body Semantics

**Files:**
- Modify: `src/defaultSettings.ts`
- Modify: `src/settingsSchema.ts`
- Modify: `src/ai-chat.ts`
- Modify: `src/providers/opencode-provider.ts`
- Test: `scripts/test-opencode-prompt-body.mjs`

**Step 1: Change default system prompt**

Replace the broad default prompt with a managed-workspace prompt:

```ts
export const DEFAULT_AI_SYSTEM_PROMPT = [
  '你运行在 SiYuan Copilot OpenCode 托管工作区。',
  '任何思源笔记读取、搜索、编辑、整理任务都必须使用 siyuan-sisyphus CLI。',
  '执行思源任务前先使用/读取对应的 siyuan-sisyphus skill。',
  '禁止通过本地文件系统读取 SiYuan 数据目录、.sy 文件或 assets 来替代 CLI。'
].join('\\n');
```

**Step 2: Preserve real system field when possible**

Currently `src/ai-chat.ts` flattens system messages into prompt text. Update `chat()` to preserve a system string separately:

```ts
const systemPrompt = options.messages
  .filter(m => m.role === 'system')
  .map(...)
  .join('\n\n');
```

Pass it to `chatOpenCode` through `customBody.system` or a first-class `system` option, depending on OpenCode API compatibility.

**Step 3: Add prompt body test**

Use a pure exported helper or extracted builder to assert:

- System text is in `system`
- User text is in `parts`
- `agent` still maps plan/build correctly

**Step 4: Run verification**

Run:

```bash
node scripts/test-opencode-prompt-body.mjs
npm run build
```

Expected: prompt body test passes; build completes.

**Step 5: Commit**

```bash
git add src/defaultSettings.ts src/settingsSchema.ts src/ai-chat.ts src/providers/opencode-provider.ts scripts/test-opencode-prompt-body.mjs
git commit -m "feat: enforce sisyphus-first opencode prompts"
```

## Phase 2 - Unified Task Workbench Refactor

### Task 6: Define Task Types and Compatibility Mapping

**Files:**
- Create: `src/task-types.ts`
- Modify: `src/ai-chat.ts`
- Modify: `src/components/SessionManager.svelte`
- Modify: `src/ai-sidebar.svelte`
- Test: `scripts/test-task-session-migration.mjs`

**Step 1: Create task model**

Add:

```ts
export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  messageCount?: number;
  status: TaskStatus;
  openCodeSessionId?: string;
  lastError?: string;
}

export interface TaskRuntime {
  streamingMessage: string;
  streamingThinking: string;
  openCodeTimeline: OpenCodeTimelineItem[];
  openCodeToolParts: any[];
  isThinkingPhase: boolean;
  abortController: AbortController | null;
}
```

Move shared timeline item types here or to a nearby type module.

**Step 2: Add migration helper**

Create:

```ts
export function normalizeTaskSession(raw: any): TaskSession {
  return {
    ...raw,
    status: raw.status || 'completed',
  };
}
```

Existing sessions without status become completed unless active runtime says otherwise.

**Step 3: Update local interfaces**

Replace local `ChatSession` definitions with imported `TaskSession`, preserving event names for now.

**Step 4: Run verification**

Run:

```bash
node scripts/test-task-session-migration.mjs
npm run build
```

Expected: migration script passes; build completes.

**Step 5: Commit**

```bash
git add src/task-types.ts src/ai-chat.ts src/components/SessionManager.svelte src/ai-sidebar.svelte scripts/test-task-session-migration.mjs
git commit -m "refactor: introduce unified task session model"
```

### Task 7: Extract Task Repository

**Files:**
- Create: `src/task-repository.ts`
- Modify: `src/ai-sidebar.svelte`
- Test: `scripts/test-task-repository-serialization.mjs`

**Step 1: Extract serialization helpers**

Move message cleanup logic into pure functions:

```ts
export function serializeMessagesForTask(messages: Message[]): Message[] { ... }
export function buildTaskMetadata(task: TaskSession, messages?: Message[]): TaskSession { ... }
```

Keep image/blob restoration in `ai-sidebar.svelte` initially if extracting it would be too risky.

**Step 2: Extract metadata load/save**

Create repository functions:

```ts
export async function loadTaskIndex(plugin): Promise<TaskSession[]> { ... }
export async function saveTaskIndex(plugin, tasks: TaskSession[]): Promise<void> { ... }
export async function saveTaskTranscript(taskId: string, messages: Message[]): Promise<void> { ... }
export async function loadTaskTranscript(taskId: string): Promise<Message[]> { ... }
export async function deleteTaskTranscript(taskId: string): Promise<void> { ... }
```

Use existing `chat-sessions.json` and `getSessionPath(id)` for compatibility in this task.

**Step 3: Replace sidebar persistence calls**

Update `loadSessions`, `saveSessions`, and transcript save/load call sites to delegate to repository functions. Keep wrapper function names temporarily to reduce diff size.

**Step 4: Run verification**

Run:

```bash
node scripts/test-task-repository-serialization.mjs
npm run build
```

Expected: serialization script passes; build completes.

**Step 5: Commit**

```bash
git add src/task-repository.ts src/ai-sidebar.svelte scripts/test-task-repository-serialization.mjs
git commit -m "refactor: extract task repository"
```

### Task 8: Introduce Task Store and Per-Task Runtime

**Files:**
- Create: `src/stores/tasks.ts`
- Modify: `src/ai-sidebar.svelte`
- Test: `scripts/test-task-runtime-store.mjs`

**Step 1: Create store shape**

Add a Svelte store:

```ts
interface TaskState {
  tasks: TaskSession[];
  activeTaskId: string;
  messagesByTaskId: Record<string, Message[]>;
  runtimeByTaskId: Record<string, TaskRuntime>;
}
```

Provide helper methods:

- `setTasks`
- `setActiveTask`
- `ensureTask`
- `updateTask`
- `appendTaskMessage`
- `updateTaskRuntime`
- `resetTaskRuntime`

**Step 2: Replace controller maps**

Move `sessionControllers`, `sessionIsAborted`, and `activeSessions` behavior into task runtime helpers.

**Step 3: Keep compatibility aliases**

During this task, retain reactive aliases in `ai-sidebar.svelte`:

```ts
$: activeMessages = getMessages(activeTaskId);
$: messages = activeMessages;
```

Do this only as a transitional step so later tasks can remove direct global mutation.

**Step 4: Run verification**

Run:

```bash
node scripts/test-task-runtime-store.mjs
npm run build
```

Expected: store helper script passes; build completes.

**Step 5: Commit**

```bash
git add src/stores/tasks.ts src/ai-sidebar.svelte scripts/test-task-runtime-store.mjs
git commit -m "refactor: add per-task runtime store"
```

### Task 9: Refactor Send/Stream Flow to Address Tasks by ID

**Files:**
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/providers/opencode-provider.ts` if helper exports are needed
- Test: manual verification plus `npm run build`

**Step 1: Capture task ID at send start**

At the start of send/regenerate/continue flows:

```ts
const taskId = activeTaskId || createTask(...);
```

Never rely on `currentSessionId` inside async callbacks after the request starts.

**Step 2: Update callbacks by task ID**

Every OpenCode callback must update the captured task:

- `onChunk`
- `onThinkingChunk`
- `onToolPartUpdate`
- `onPermissionAsked`
- `onQuestionAsked`
- `onComplete`
- `onError`

Example:

```ts
onChunk: (chunk) => {
  tasks.updateRuntime(taskId, runtime => ({
    ...runtime,
    streamingMessage: runtime.streamingMessage + chunk,
  }));
}
```

**Step 3: Save task transcript by task ID**

When a response finishes, append assistant message to that task even if the user has switched away.

**Step 4: Update active view binding**

The visible chat should render active task messages plus active task runtime. Background task updates should change badges/status but not steal focus.

**Step 5: Run verification**

Run:

```bash
npm run build
```

Manual:

- Start task A.
- Switch to task B before A completes.
- Confirm A continues updating in the task list.
- Return to A and see final output.

**Step 6: Commit**

```bash
git add src/ai-sidebar.svelte src/providers/opencode-provider.ts
git commit -m "refactor: route opencode streams to task ids"
```

### Task 10: Rename Session Manager into Task Navigator In Place

**Files:**
- Move: `src/components/SessionManager.svelte` to `src/components/TaskNavigator.svelte`
- Modify: `src/ai-sidebar.svelte`
- Modify: `i18n/zh_CN.json`
- Modify: `i18n/en_US.json`
- Test: `npm run build`

**Step 1: Rename component**

Rename component but keep most behavior:

- New task
- Switch task
- Rename
- Delete
- Batch delete
- Pin
- Export/save to note

**Step 2: Add task status display**

Each item shows:

- title
- status badge
- message count
- last updated
- running pulse for `running`
- warning style for `failed`
- waiting style for `waiting_permission`

**Step 3: Update events**

Use task terms in event names if feasible:

- `load` can remain for compatibility, or become `select`
- `new`
- `delete`
- `batchDelete`
- `update`

Avoid introducing a second component that duplicates the old one.

**Step 4: Update i18n**

Add task labels while preserving existing session keys where needed. Do not remove old keys until all references are migrated.

**Step 5: Run verification**

Run:

```bash
npm run build
```

Expected: build completes and UI compiles with new component name.

**Step 6: Commit**

```bash
git add src/components/TaskNavigator.svelte src/ai-sidebar.svelte i18n/zh_CN.json i18n/en_US.json
git rm src/components/SessionManager.svelte
git commit -m "refactor: convert session manager to task navigator"
```

### Task 11: Add Concurrency Scheduler

**Files:**
- Create: `src/task-runner.ts`
- Modify: `src/defaultSettings.ts`
- Modify: `src/settingsSchema.ts`
- Modify: `src/SettingsPanel.svelte`
- Modify: `src/ai-sidebar.svelte`
- Test: `scripts/test-task-runner-scheduler.mjs`

**Step 1: Add settings**

Add:

```ts
maxConcurrentTasks: 2
```

Normalize to a safe range, e.g. 1-4.

**Step 2: Create scheduler**

`TaskRunner` manages:

- active task IDs
- queued task IDs
- start next task when capacity frees
- cancel queued task
- cancel running task

Keep it model-level, not UI-level.

**Step 3: Write scheduler test**

Script asserts:

- With max 2, starting 3 tasks runs first 2 and queues third.
- Completing one starts queued third.
- Cancelling queued removes it.
- Cancelling running frees capacity.

**Step 4: Integrate with send flow**

If capacity is available, send immediately. Otherwise:

- status becomes `queued`
- task appears in navigator
- runner starts it later

**Step 5: Run verification**

Run:

```bash
node scripts/test-task-runner-scheduler.mjs
npm run build
```

Expected: scheduler script passes; build completes.

**Step 6: Commit**

```bash
git add src/task-runner.ts src/defaultSettings.ts src/settingsSchema.ts src/SettingsPanel.svelte src/ai-sidebar.svelte scripts/test-task-runner-scheduler.mjs
git commit -m "feat: add task concurrency scheduler"
```

### Task 12: Final Migration and Cleanup

**Files:**
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/task-repository.ts`
- Modify: `src/task-types.ts`
- Modify: `src/pluginPaths.ts` if new task path names are introduced
- Test: full verification

**Step 1: Remove transitional globals**

Remove or minimize:

- global `messages`
- global `streamingMessage`
- global `streamingThinking`
- global `openCodeTimeline`
- global `isLoading`
- global controller maps

Use active task selectors instead.

**Step 2: Decide storage naming**

Keep existing storage filenames for compatibility in this milestone:

- `chat-sessions.json`
- `sessions/{id}.json`

Optionally add comments in `task-repository.ts` explaining these are legacy-compatible task storage names.

**Step 3: Run full verification**

Run:

```bash
npm run build
graphify update .
```

Manual smoke:

- Existing historical sessions load as tasks.
- New task can be created from empty state.
- Task A can run while Task B is active.
- Switching tasks does not interrupt background execution.
- Cancelling Task A does not cancel Task B.
- Sisyphus commands still route through managed OpenCode workspace.
- External OpenCode server warning appears when relevant.

**Step 4: Commit**

```bash
git add src/ai-sidebar.svelte src/task-repository.ts src/task-types.ts src/pluginPaths.ts graphify-out
git commit -m "refactor: complete unified task workbench migration"
```

## Final Acceptance Checklist

- Plugin-managed OpenCode starts with cwd under the plugin managed workspace.
- Generated `AGENTS.md`, `opencode.json`, and guard plugin exist in the managed workspace.
- SiYuan work is directed to `siyuan-sisyphus` and corresponding skills.
- Direct local filesystem access to SiYuan data is blocked or clearly warned.
- Existing history loads into the task navigator without data loss.
- There is no separate duplicate task/session system.
- Multiple tasks can run or wait according to the configured concurrency limit.
- Switching tasks preserves each task's independent stream, timeline, messages, permissions, and cancellation state.
- `npm run build` passes.
- `graphify update .` has been run after code modifications.

## Open Questions Before Execution

- Should `edit` in managed `opencode.json` be `ask` or `deny` by default? Recommendation: `ask`, because the workspace may contain harmless generated config files.
- Should external OpenCode servers be blocked entirely or only warned? Recommendation: warn first, because some users may intentionally manage OpenCode themselves.
- Should old UI labels say "任务" immediately, or keep "会话" until migration is complete? Recommendation: switch visible labels to "任务" in the same commit that introduces `TaskNavigator`.
