import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/ai-sidebar.svelte", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../src/chat/timeline-display.ts", import.meta.url), "utf8");
const combinedSource = `${source}\n${timelineSource}`;

for (const requiredText of [
  "| { type: 'text'; id: string; content: string",
  "appendOpenCodeTimelineText",
  "getOpenCodeFinalAnswer",
  "getOpenCodeProcessTimeline",
  "getOpenCodeProcessKey",
  "openCodeProcessCollapsed",
  "过程",
]) {
  assert.ok(combinedSource.includes(requiredText), `missing threaded timeline marker: ${requiredText}`);
}

assert.ok(
  !source.includes("opencode-process-${messageIndex}-${msgIndex}"),
  "historical OpenCode process expansion key must not depend on unstable message indexes"
);

assert.ok(
  source.includes("appendOpenCodeTimelineText(chunk)") ||
    source.includes("appendOpenCodeTimelineText(text)"),
  "streaming onChunk must append visible text into the OpenCode timeline"
);

console.log("opencode threaded timeline checks passed");
