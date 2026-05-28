import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/opencode-intelligence-constraints.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/settingsSchema.ts", import.meta.url), "utf8");

for (const exportedName of [
    "buildManagedOpenCodeAgentsMd",
    "buildManagedOpenCodeConfig",
    "SIYUAN_TASK_SKILL_ROUTING",
]) {
    assert.match(source, new RegExp(`export (const|function) ${exportedName}`), `${exportedName} must be exported`);
}

for (const requiredText of [
    "siyuan-sisyphus skill install",
    "siyuan-sisyphus-create-edit",
    "siyuan-sisyphus-browse-read",
    "siyuan-sisyphus-search-query",
    "Do not repeat the same failing command shape",
    "evidence table",
    "block get",
    "block get_kramdown",
    "--edit-json",
]) {
    assert.ok(source.includes(requiredText), `constraints must include: ${requiredText}`);
}

assert.ok(
    indexSource.includes("ensureManagedOpenCodeWorkspace"),
    "index.ts must ensure the managed OpenCode workspace before starting serve"
);
assert.ok(
    settingsSource.includes("DEFAULT_AI_SYSTEM_PROMPT"),
    "settings normalization must keep using the managed default prompt"
);

console.log("opencode intelligence constraints checks passed");
