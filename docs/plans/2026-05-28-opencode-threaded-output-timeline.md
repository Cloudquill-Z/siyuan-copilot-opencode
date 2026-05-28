# OpenCode Threaded Output Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display OpenCode text, thinking, and tool calls in their real execution order, then collapse completed process details so the user sees the final answer by default.

**Architecture:** Extend the existing `openCodeTimeline` model in `src/ai-sidebar.svelte` from `thinking | tool` to `text | thinking | tool`. During streaming, every `onChunk`, thinking chunk, and tool update writes to the same timeline; after completion, the assistant message stores the full timeline plus a final-answer view. Rendering uses one timeline component path for streaming and history, with process details collapsed after completion and individual thinking/tool details still independently expandable.

**Tech Stack:** Svelte 4, TypeScript, existing SiYuan `b3-*` UI classes, existing OpenCode SSE callbacks, Vite build, source-level verification scripts.

---

## Current Problem

The current UI keeps `streamingMessage` separate from `openCodeTimeline`.

- `openCodeTimeline` contains thinking/tool entries only.
- `streamingMessage` contains all visible assistant text as one accumulated string.
- Rendering therefore shows all thinking/tool activity first, then a single block of all assistant text at the bottom.

The target behavior is:

1. While running, show text/thinking/tool in the exact order they arrive.
2. After completion, show only the final answer by default.
3. Provide one compact "过程" toggle to expand previous intermediate visible replies, thinking, and tools.
4. Inside the expanded process, thinking remains separately collapsed and requires another click to expand.
5. Tool details remain separately collapsed and require another click to expand.

---

## Acceptance Criteria

- A new OpenCode timeline item type exists for visible assistant text.
- Streaming text chunks are appended into timeline order, not only into `streamingMessage`.
- Consecutive text chunks merge into one text timeline item until a thinking/tool item interrupts them.
- Consecutive thinking chunks merge into one thinking timeline item until a text/tool item interrupts them.
- Existing tool updates keep updating the same tool timeline item by tool key.
- During streaming, the user can see:
  - visible text segment
  - collapsed/expandable thinking segment
  - tool segment
  - next visible text segment
- Completed messages show final answer first.
- Completed messages hide the process timeline by default behind a single toggle.
- Expanding process shows previous visible text segments, thinking segments, and tool segments in chronological order.
- Thinking content inside the expanded process is still collapsed by default.
- Tool input/output details are still collapsed by default.
- Existing sessions without text timeline items still render through the old fallback path.
- Build passes with the existing warning profile.

---

## Task 1: Add Source Checks For The New Timeline Contract

**Files:**

- Create: `scripts/test-opencode-threaded-timeline.mjs`
- Read: `src/ai-sidebar.svelte`

**Step 1: Write the failing test**

Create `scripts/test-opencode-threaded-timeline.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/ai-sidebar.svelte", import.meta.url), "utf8");

for (const requiredText of [
  "| { type: 'text'; id: string; content: string",
  "appendOpenCodeTimelineText",
  "getOpenCodeFinalAnswer",
  "getOpenCodeProcessTimeline",
  "openCodeProcessCollapsed",
  "过程",
]) {
  assert.ok(source.includes(requiredText), `missing threaded timeline marker: ${requiredText}`);
}

assert.ok(
  source.includes("appendOpenCodeTimelineText(chunk)") ||
    source.includes("appendOpenCodeTimelineText(text)"),
  "streaming onChunk must append visible text into the OpenCode timeline"
);

console.log("opencode threaded timeline checks passed");
```

**Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-opencode-threaded-timeline.mjs
```

Expected: FAIL because the text timeline type and helpers do not exist yet.

---

## Task 2: Extend The Timeline Data Model

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Update timeline types**

Change:

```ts
type OpenCodeTimelineItem =
    | { type: 'thinking'; id: string; content: string }
    | { type: 'tool'; id: string; toolPart: any };
```

To:

```ts
type OpenCodeTimelineItem =
    | { type: 'text'; id: string; content: string; isFinal?: boolean }
    | { type: 'thinking'; id: string; content: string }
    | { type: 'tool'; id: string; toolPart: any };
```

Update `OpenCodeTimelineDisplayItem` with the same `text` type.

**Step 2: Add collapse state for completed process**

Add near existing collapse state:

```ts
let openCodeProcessCollapsed: Record<string, boolean> = {};

function isOpenCodeProcessCollapsed(key: string): boolean {
    return openCodeProcessCollapsed[key] ?? true;
}

function toggleOpenCodeProcessCollapsed(key: string) {
    openCodeProcessCollapsed = {
        ...openCodeProcessCollapsed,
        [key]: !isOpenCodeProcessCollapsed(key),
    };
}
```

**Step 3: Update cloning**

Update `cloneOpenCodeTimeline()` so text items are copied:

```ts
function cloneOpenCodeTimeline() {
    return openCodeTimeline.map(item => {
        if (item.type === 'tool') {
            return { ...item, toolPart: { ...item.toolPart } };
        }
        return { ...item };
    });
}
```

**Step 4: Run source check**

Run:

```bash
node scripts/test-opencode-threaded-timeline.mjs
```

Expected: still FAIL because helper functions and `onChunk` integration are not done.

---

## Task 3: Write Text Chunks Into The Timeline

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Add text append helper**

Add near `appendStreamingThinking`:

```ts
function appendOpenCodeTimelineText(chunk: string) {
    if (!chunk) return;

    const lastItem = openCodeTimeline[openCodeTimeline.length - 1];
    if (lastItem?.type === 'text' && !lastItem.isFinal) {
        openCodeTimeline = openCodeTimeline.map((item, index) =>
            index === openCodeTimeline.length - 1 && item.type === 'text'
                ? { ...item, content: item.content + chunk }
                : item
        );
        return;
    }

    openCodeTimeline = [
        ...openCodeTimeline,
        {
            type: 'text',
            id: `text-${Date.now()}-${openCodeTimelineCounter++}`,
            content: chunk,
        },
    ];
}
```

**Step 2: Add final answer helper**

Add:

```ts
function getOpenCodeFinalAnswer(message: Message): string {
    if (typeof message.finalReply === 'string' && message.finalReply.trim()) {
        return message.finalReply;
    }
    return typeof message.content === 'string' ? message.content : '';
}
```

**Step 3: Add process timeline helper**

Add:

```ts
function getOpenCodeProcessTimeline(message: Message): OpenCodeTimelineItem[] {
    const timeline = message.openCodeTimeline || [];
    const finalAnswer = getOpenCodeFinalAnswer(message).trim();
    if (!finalAnswer) return timeline;

    let lastTextIndex = -1;
    for (let index = timeline.length - 1; index >= 0; index--) {
        const item = timeline[index];
        if (item.type === 'text' && item.content.trim() === finalAnswer) {
            lastTextIndex = index;
            break;
        }
    }

    if (lastTextIndex < 0) return timeline;
    return timeline.filter((_item, index) => index !== lastTextIndex);
}
```

This keeps the final answer from being duplicated in the process area when the last text item equals `message.content`.

**Step 4: Wire streaming `onChunk`**

For each primary OpenCode `onChunk` handler that currently does:

```ts
streamingMessage += chunk;
await scrollToBottom();
```

Change to:

```ts
streamingMessage += chunk;
appendOpenCodeTimelineText(chunk);
await scrollToBottom();
```

Important locations to check in `src/ai-sidebar.svelte`:

- Around the main send flow near the first `onChunk`.
- Around the non-agent OpenCode send flow.
- Around regenerate/duplicated legacy flow if still active.

**Step 5: Run source check**

Run:

```bash
node scripts/test-opencode-threaded-timeline.mjs
```

Expected: PASS.

---

## Task 4: Render Timeline Text In Order During Streaming

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Update `groupOpenCodeTimeline`**

Ensure text items pass through without grouping with tools:

```ts
if (item.type === 'text') {
    grouped.push({ ...item });
    continue;
}
```

Keep existing consecutive tool grouping.

**Step 2: Render text items inside streaming timeline**

Inside the streaming timeline loop:

```svelte
{#if item.type === 'text'}
    {@const timelineTextDisplay = getDisplayContent(item.content)}
    <div
        class="ai-message__timeline-text b3-typography"
        style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
    >
        {@html timelineTextDisplay}
    </div>
{:else if item.type === 'thinking'}
    ...
{:else}
    ...
{/if}
```

**Step 3: Avoid duplicate streaming bottom content**

Change the bottom streaming content condition from:

```svelte
{#if streamingMessage}
```

To:

```svelte
{#if streamingMessage && openCodeTimeline.length === 0}
```

This preserves fallback behavior if no timeline exists.

**Step 4: Add compact styles**

Add CSS near existing timeline styles:

```scss
.ai-message__timeline-text {
    margin: 8px 0;
    color: var(--b3-theme-on-background);
    line-height: 1.6;
}
```

Keep styling minimal and integrated with current SiYuan theme variables.

---

## Task 5: Render Completed Messages As Final Answer Plus Collapsed Process

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Replace current completed timeline block behavior**

For completed assistant messages with `message.openCodeTimeline`, render:

1. Final answer content first.
2. A process toggle button below it.
3. Chronological process timeline only when expanded.

Pseudo-Svelte:

```svelte
{#if message.role === 'assistant' && message.openCodeTimeline && message.openCodeTimeline.length > 0 && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
    {@const finalAnswer = getOpenCodeFinalAnswer(message)}
    {@const processTimeline = getOpenCodeProcessTimeline(message)}
    {@const processKey = `opencode-process-${messageIndex}-${msgIndex}`}
    {@const processCollapsed = isOpenCodeProcessCollapsed(processKey)}

    {#if finalAnswer.trim()}
        {@const finalDisplay = getDisplayContent(finalAnswer)}
        <div class="ai-message__content b3-typography" style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}>
            {@html finalDisplay}
        </div>
    {/if}

    {#if processTimeline.length > 0}
        <button
            type="button"
            class="ai-message__process-toggle"
            on:click={() => toggleOpenCodeProcessCollapsed(processKey)}
            title={processCollapsed ? '展开过程' : '折叠过程'}
        >
            <svg class="ai-message__thinking-icon" class:collapsed={processCollapsed}>
                <use xlink:href="#iconRight"></use>
            </svg>
            <span>过程</span>
            <span class="ai-message__timeline-toggle-count">{groupOpenCodeTimeline(processTimeline).length}</span>
        </button>

        {#if !processCollapsed}
            <div class="ai-message__timeline ai-message__timeline--history">
                <!-- render text/thinking/tools chronologically -->
            </div>
        {/if}
    {/if}
{/if}
```

**Step 2: Render text items in completed process**

In the expanded process timeline, render text items as smaller previous-reply snippets:

```svelte
<div class="ai-message__timeline-text ai-message__timeline-text--process b3-typography">
    {@html processTextDisplay}
</div>
```

**Step 3: Keep thinking double-collapsed**

Inside the process timeline, thinking items must remain collapsed by default using existing `thinkingCollapsed`.

The flow should be:

1. Click "过程" to show process timeline.
2. Click "思考" inside process to show actual thinking text.

**Step 4: Keep tool details double-collapsed**

Tool rows appear when process is expanded, but input/output details stay collapsed unless the individual tool row is clicked.

---

## Task 6: Make Saved Messages Store The Full Interleaved Timeline

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Ensure assistant messages save timeline**

The existing non-agent completion already stores:

```ts
if (openCodeTimeline.length > 0) {
    assistantMessage.openCodeTimeline = cloneOpenCodeTimeline();
}
```

Keep this, but after Task 3 it will include text items.

**Step 2: Prevent final answer duplication**

If the last timeline text item is equal to `processedContent`, do not render it in the collapsed process by default. `getOpenCodeProcessTimeline()` handles this.

**Step 3: Agent-loop final replies**

For agent-loop paths that store `finalReply`, ensure either:

- final answer is rendered from `message.finalReply`, or
- the final text exists as the last text timeline item and `message.content` remains compatible.

Do not refactor the entire agent-loop storage in this task. Keep changes narrowly scoped.

---

## Task 7: Styling Polish

**Files:**

- Modify: `src/ai-sidebar.svelte`

**Step 1: Add process toggle style**

Add:

```scss
.ai-message__process-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    margin-top: 8px;
    padding: 4px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    cursor: pointer;
}

.ai-message__process-toggle:hover {
    background: var(--b3-list-hover);
}

.ai-message__timeline-text--process {
    padding: 8px 10px;
    border-left: 2px solid var(--b3-border-color);
    color: var(--b3-theme-on-surface);
    opacity: 0.9;
}
```

**Step 2: Avoid cards-inside-cards**

Do not add another large card around the process area. The assistant message is already the containing surface.

**Step 3: Check compactness**

The process toggle should look like metadata, not a primary action.

---

## Task 8: Verification

**Files:**

- Test: `scripts/test-opencode-threaded-timeline.mjs`

**Step 1: Run source-level checks**

Run:

```bash
node scripts/test-opencode-threaded-timeline.mjs
node scripts/test-diagnostic-logger.mjs
node scripts/test-opencode-intelligence-constraints.mjs
node scripts/test-opencode-workspace-paths.mjs
```

Expected: all PASS.

**Step 2: Build**

Run:

```bash
npm run build
```

Expected: build succeeds. Existing Sass/Svelte warnings may remain.

**Step 3: Update graph**

Run:

```bash
graphify update .
```

Expected: graph rebuild succeeds.

**Step 4: Manual UI check**

In SiYuan:

1. Start a new OpenCode task that emits text, thinking, tools, and more text.
2. Confirm streaming view shows interleaved text/thinking/tool order.
3. Wait for completion.
4. Confirm final answer is visible by default.
5. Confirm process is collapsed by default.
6. Expand process.
7. Confirm earlier visible replies appear in chronological order.
8. Confirm thinking text is still collapsed until clicking the thinking row.
9. Confirm tool details are still collapsed until clicking the tool row.

---

## Task 9: Commit

**Files:**

- Stage only files touched for this feature.

Run:

```bash
git add src/ai-sidebar.svelte scripts/test-opencode-threaded-timeline.mjs
git commit -m "feat: interleave opencode output timeline"
```

Only commit if the working tree does not contain unrelated staged changes. If unrelated dirty files exist, stage explicitly by path and verify with:

```bash
git diff --cached --stat
```

Expected staged files:

- `src/ai-sidebar.svelte`
- `scripts/test-opencode-threaded-timeline.mjs`

