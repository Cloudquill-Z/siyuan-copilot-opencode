# OpenCode Timeout Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent complex OpenCode tool workflows from failing just because they exceed a fixed wait for `session.idle`.

**Architecture:** Extract realtime completion waiting into a small testable watcher that tracks meaningful activity, polls `/session/status`, and completes when either realtime or polling reports idle. Keep the public chat API stable and preserve existing UI callbacks.

**Tech Stack:** Svelte, TypeScript, Vite, OpenCode REST/SSE APIs.

---

### Task 1: Add Testable Realtime Completion Watcher

**Files:**
- Modify: `src/providers/opencode-provider.ts`
- Create: `scripts/test-opencode-completion-watcher.mjs`

**Step 1: Write the failing verification**

Create `scripts/test-opencode-completion-watcher.mjs` that imports exported test helpers from `dist-test/opencode-provider-test.mjs` after TypeScript emits a temporary build.

The verification should cover:

```js
assert.equal(await completesWhenStatusTurnsIdle(), true);
assert.equal(await staysAliveWhenToolStatusIsRunning(), true);
assert.equal(await failsWhenNoActivityAndNoRunningStatus(), true);
assert.equal(await abortWinsImmediately(), true);
```

**Step 2: Run it to verify it fails**

Run: `node scripts/test-opencode-completion-watcher.mjs`

Expected: FAIL because the watcher helper does not exist yet.

**Step 3: Implement the helper**

In `src/providers/opencode-provider.ts`, add exported internal helpers:

```ts
export interface RealtimeCompletionWatcherOptions {
    signal?: AbortSignal;
    idleTimeoutMs: number;
    pollIntervalMs: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    getSessionStatus?: () => Promise<'idle' | 'running' | 'error' | 'unknown'>;
}

export interface RealtimeCompletionWatcher {
    markActivity(reason?: string): void;
    markPermissionWaiting(isWaiting: boolean): void;
    resolveIdle(): void;
    reject(error: Error): void;
    wait(): Promise<void>;
}
```

The watcher should reset inactivity on `markActivity`, pause stall failure while permission is waiting, resolve on `resolveIdle`, and use `getSessionStatus` as a fallback.

**Step 4: Run verification again**

Run: `node scripts/test-opencode-completion-watcher.mjs`

Expected: PASS.

### Task 2: Wire Watcher Into OpenCode Realtime Flow

**Files:**
- Modify: `src/providers/opencode-provider.ts`

**Step 1: Replace fixed idle wait**

Replace `waitForRealtimeIdle()` with the new watcher. In `chatOpenCode()`, create the watcher before connecting the event stream.

**Step 2: Mark activity from all meaningful events**

Call `watcher.markActivity()` from:

- `onTextDelta`
- `onReasoningDelta`
- `onToolPartUpdate`
- `onPermissionAsked`
- `onSessionIdle`
- `onSessionError`

Set permission waiting when permission is asked. Resolve idle on `session.idle` and `session.status` idle.

**Step 3: Add polling fallback**

Use `fetchSessionStatuses()`-equivalent provider-local polling against `/session/status`. For the active session:

- idle resolves the watcher
- running refreshes activity
- error rejects the watcher
- unknown only contributes to stall detection after inactivity

**Step 4: Preserve behavior outside realtime**

Do not change the synchronous `/session/:id/message` streaming parser except for shared helper imports or types.

### Task 3: Improve Stall Handling

**Files:**
- Modify: `src/providers/opencode-provider.ts`

**Step 1: Add specific stall error**

When the watcher fails because there was no activity and status polling did not confirm progress, throw:

```text
OpenCode task appears stalled: no text, thinking, tool, permission, or status activity for N minutes.
```

**Step 2: Avoid deleting useful partial sessions**

In `chatOpenCode()` error handling, skip automatic deletion when a realtime task has partial text, thinking, or tool activity. Keep cleanup for failed session creation and immediate request failures.

### Task 4: Verify Build

**Files:**
- No code changes expected.

**Step 1: Run watcher verification**

Run: `node scripts/test-opencode-completion-watcher.mjs`

Expected: PASS.

**Step 2: Run production build**

Run: `npm run build`

Expected: build exits successfully and emits `dist/` plus `package.zip`.

### Task 5: Commit and Push Branch

**Files:**
- All changed files.

**Step 1: Review diff**

Run: `git diff --stat`

Expected: only docs, provider, and verification script changed.

**Step 2: Commit**

Run:

```bash
git add docs/plans/2026-05-15-opencode-timeout-resilience-design.md docs/plans/2026-05-15-opencode-timeout-resilience.md src/providers/opencode-provider.ts scripts/test-opencode-completion-watcher.mjs
git commit -m "fix: make OpenCode tool tasks timeout resilient"
```

**Step 3: Push**

Run: `git push -u origin codex/opencode-timeout-resilience`

Expected: remote branch is created or updated on GitHub.
