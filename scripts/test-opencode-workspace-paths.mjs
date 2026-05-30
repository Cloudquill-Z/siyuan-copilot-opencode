import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pluginPaths.ts", import.meta.url), "utf8");

function extractExportedConst(name) {
    const match = source.match(new RegExp(`export const ${name} = ([^;]+);`));
    assert.ok(match, `Expected ${name} to be exported`);
    return match[1].trim();
}

assert.equal(
    extractExportedConst("OPENCODE_WORKSPACE_DIR"),
    "`${RUNTIME_DIR}/opencode-workspace`"
);
assert.equal(
    extractExportedConst("OPENCODE_WORKSPACE_OPENCODE_DIR"),
    "`${OPENCODE_WORKSPACE_DIR}/.opencode`"
);
assert.equal(
    extractExportedConst("OPENCODE_WORKSPACE_AGENTS_PATH"),
    "`${OPENCODE_WORKSPACE_DIR}/AGENTS.md`"
);
assert.equal(
    extractExportedConst("OPENCODE_WORKSPACE_CONFIG_PATH"),
    "`${OPENCODE_WORKSPACE_DIR}/opencode.json`"
);
