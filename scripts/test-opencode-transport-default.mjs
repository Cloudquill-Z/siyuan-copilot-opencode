import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/providers/opencode-provider.ts", import.meta.url), "utf8");

assert.match(
  source,
  /wantRealtime\s*=\s*true\s*;/,
  "OpenCode chat should default to prompt_async + event stream instead of the fragile synchronous /message route"
);

assert.match(
  source,
  /purpose:\s*'message-fallback'/,
  "Synchronous /message should remain only as an explicit fallback transport"
);

console.log("opencode transport default checks passed");
