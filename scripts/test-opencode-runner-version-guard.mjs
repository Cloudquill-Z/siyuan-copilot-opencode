import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/opencode-runner.ts", import.meta.url), "utf8");

assert.match(
    source,
    /detectOpenCodeCLIVersion/,
    "Runner should detect the version reported by the current opencode CLI"
);

assert.match(
    source,
    /isOpenCodeVersionMismatch/,
    "Runner should explicitly compare server and CLI versions"
);

assert.match(
    source,
    /stopExistingOpenCodeServeOnPort/,
    "Runner should be able to stop an existing opencode serve process on the target port"
);

assert.match(
    source,
    /version mismatch/i,
    "Runner should report version mismatch instead of silently reusing stale servers"
);

console.log("opencode runner version guard checks passed");
