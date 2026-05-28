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
