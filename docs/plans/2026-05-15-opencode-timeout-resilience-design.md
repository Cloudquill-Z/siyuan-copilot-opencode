# OpenCode Timeout Resilience Design

## Problem

Complex OpenCode tasks that call tools can run longer than the plugin's current fixed idle wait. The plugin waits up to five minutes for a `session.idle` event after sending `prompt_async`. If that event is delayed or lost, the plugin reports a timeout even when the session is still doing useful work.

The timeout is currently tied to total wait time, not real inactivity. That makes long tool runs fail for the wrong reason.

## Goal

Make OpenCode chat resilient during complex tool workflows:

- Do not fail a running task merely because it exceeds a fixed duration.
- Treat text, thinking, tool updates, permission events, and status changes as activity.
- Detect real stalls through inactivity plus session status checks.
- Preserve partial output and session state when a stall is detected.

## Recommended Approach

Replace the fixed `waitForRealtimeIdle()` wait with a completion watcher:

1. Track `lastActivityAt` for every meaningful realtime event.
2. Wait for either `session.idle`, `session.status` idle, or a status poll that reports idle.
3. Poll `/session/status` while waiting, especially during tool execution.
4. Only fail when both conditions are true:
   - no activity has happened for a configured idle threshold
   - status polling cannot confirm that the session is still running or waiting
5. Surface a more precise error message for true stalls.

## State Model

- `running`: text or thinking is streaming.
- `tool-running`: OpenCode reports tool start, progress, or pending tool part.
- `waiting-permission`: OpenCode asks for permission; timeout is paused while the user decides.
- `silent`: no events recently, but the session status still appears active.
- `stalled`: no activity and status checks do not show an active session.
- `completed`: OpenCode reports idle through realtime events or status polling.

## Components

- `src/providers/opencode-provider.ts`
  - Add a reusable realtime completion watcher.
  - Emit activity updates from text, thinking, tool, permission, and status events.
  - Add a status polling fallback for `/session/status`.
  - Keep the synchronous `/session/:id/message` path behavior intact.

- `src/opencode-runner.ts`
  - Keep the existing status endpoint assumptions. No runner lifecycle change is required.

- `src/ai-sidebar.svelte`
  - Continue using the current `onToolPartUpdate`, `onPermissionAsked`, `onChunk`, and `onComplete` callbacks.
  - Optionally consume a future progress callback, but that is not required for this fix.

## Error Handling

When a task appears stalled, return a message that explains the difference between a long task and a silent connection. Do not delete newly created OpenCode sessions on this specific stall if partial output exists, because the user may be able to continue from the OpenCode session.

Abort remains explicit: if the user clicks stop, the plugin should still abort immediately and show the existing interrupted behavior.

## Testing Strategy

The project has no test script, so add a small unit-style verification for the completion watcher using fake events and fake status polling. Cover:

- activity refreshes the idle deadline
- tool-running sessions do not fail while status polling reports running
- completion succeeds when polling reports idle even if the realtime idle event is missing
- true silence eventually fails
- user abort still wins immediately

Run the verification directly with the local TypeScript toolchain, then run the production build.
