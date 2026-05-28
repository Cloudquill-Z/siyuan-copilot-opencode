import { putFile } from "./api";
import {
    OPENCODE_WORKSPACE_AGENTS_PATH,
    OPENCODE_WORKSPACE_CONFIG_PATH,
    OPENCODE_WORKSPACE_DIR,
    OPENCODE_WORKSPACE_OPENCODE_DIR,
} from "./pluginPaths";
import {
    buildManagedOpenCodeAgentsMd,
    buildManagedOpenCodeConfig,
} from "./opencode-intelligence-constraints";

export async function ensureManagedOpenCodeWorkspace(): Promise<void> {
    await putFile(OPENCODE_WORKSPACE_DIR, true, new Blob([]));
    await putFile(OPENCODE_WORKSPACE_OPENCODE_DIR, true, new Blob([]));
    await putFile(
        OPENCODE_WORKSPACE_AGENTS_PATH,
        false,
        new Blob([buildManagedOpenCodeAgentsMd()], { type: "text/markdown;charset=utf-8" })
    );
    await putFile(
        OPENCODE_WORKSPACE_CONFIG_PATH,
        false,
        new Blob([buildManagedOpenCodeConfig()], { type: "application/json;charset=utf-8" })
    );
}
