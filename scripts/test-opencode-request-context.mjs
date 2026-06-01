import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
    new URL("../src/providers/opencode-provider.ts", import.meta.url),
    "utf8"
);

assert.match(
    source,
    /function getOpenCodeRequestContext\(/,
    "OpenCode provider should normalize directory/workspace request context"
);

assert.match(
    source,
    /normalizeQueryValue\(customBody\.directory\)/,
    "OpenCode provider should accept directory from customBody for model-level configuration"
);

assert.match(
    source,
    /normalizeQueryValue\(customBody\.workspace\)/,
    "OpenCode provider should accept workspace from customBody for model-level configuration"
);

assert.match(
    source,
    /normalizeQueryValue\(customBody\.directory\) \?\?\s+normalizeQueryValue\(config\?\.directory\)/,
    "Model customBody directory should override the default provider directory"
);

assert.match(
    source,
    /normalizeQueryValue\(customBody\.workspace\) \?\?\s+normalizeQueryValue\(config\?\.workspace\)/,
    "Model customBody workspace should override the default provider workspace"
);

assert.match(
    source,
    /withOpenCodeRequestContext\('\/session', requestContext\)/,
    "Session creation should carry OpenCode directory/workspace query parameters"
);

assert.match(
    source,
    /const asyncRequestPath = withOpenCodeRequestContext\(asyncPath, requestContext\)/,
    "Async prompt requests should carry OpenCode directory/workspace query parameters"
);

assert.match(
    source,
    /const messageRequestPath = withOpenCodeRequestContext\(messagePath, requestContext\)/,
    "Message requests should carry OpenCode directory/workspace query parameters"
);

assert.doesNotMatch(
    source,
    /for \(const key of \[[^\]]*'directory'[^\]]*\]/,
    "directory must stay out of the JSON body because OpenCode expects it as a query parameter"
);

assert.doesNotMatch(
    source,
    /for \(const key of \[[^\]]*'workspace'[^\]]*\]/,
    "workspace must stay out of the JSON body because OpenCode expects it as a query parameter"
);

const chatSource = readFileSync(
    new URL("../src/ai-chat.ts", import.meta.url),
    "utf8"
);

assert.match(
    chatSource,
    /function getManagedOpenCodeDirectory\(/,
    "Chat requests should derive the managed OpenCode workspace directory by default"
);

assert.match(
    chatSource,
    /directory: getManagedOpenCodeDirectory\(\)/,
    "OpenCode provider config should receive the managed directory"
);
