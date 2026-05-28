export const SIYUAN_TASK_SKILL_ROUTING = [
    {
        task: "search/query/SQL",
        skills: ["siyuan-sisyphus-search-query"],
    },
    {
        task: "browse/read existing notes or blocks",
        skills: ["siyuan-sisyphus-browse-read"],
    },
    {
        task: "create/edit/update/delete SiYuan content",
        skills: ["siyuan-sisyphus-create-edit", "siyuan-markup-guide"],
    },
] as const;

export function buildManagedOpenCodeAgentsMd(): string {
    return [
        "# Managed OpenCode Rules for SiYuan",
        "",
        "This workspace is managed by the SiYuan OpenCode plugin. Follow these rules before and during every SiYuan task.",
        "",
        "## SiYuan Access Boundary",
        "",
        "- Use the full CLI command `siyuan-sisyphus` for any SiYuan note search, read, edit, export, database, tag, or system task.",
        "- Do not inspect SiYuan notes by reading local workspace directories, `.sy` files, `data/storage`, `data/assets`, or notebook folders directly.",
        "- If SiYuan content is needed, use `siyuan-sisyphus` commands only.",
        "- Prefer the full command name `siyuan-sisyphus`; do not rely on the `siyuan` alias.",
        "",
        "## Skill Routing",
        "",
        "- Before SiYuan work in a fresh environment, run `siyuan-sisyphus skill install` or inspect installed skills.",
        "- Search, query, or SQL tasks: read/use `siyuan-sisyphus-search-query` first.",
        "- Browse or read existing notes/blocks: read/use `siyuan-sisyphus-browse-read` first.",
        "- Create, edit, update, replace, delete, or write content: read/use `siyuan-sisyphus-create-edit` first; use `siyuan-markup-guide` for markdown/kramdown formatting.",
        "- If command syntax is uncertain, run `siyuan-sisyphus help <tool> [action]` before trying mutations.",
        "",
        "## Failure Discipline",
        "",
        "- Do not repeat the same failing command shape across multiple block IDs, documents, or months.",
        "- After one failed command with `Unknown action`, `validation_error`, `Unknown flag`, or invalid arguments: stop, read the error text, then run the relevant `siyuan-sisyphus help` command or load the matching skill before continuing.",
        "- Specific known pitfall: `siyuan-sisyphus block get` is not a valid action. Use `siyuan-sisyphus block get_kramdown`, `siyuan-sisyphus block dom`, `siyuan-sisyphus block info`, or `siyuan-sisyphus block get_children` as appropriate.",
        "- Specific known pitfall: complex object or array arguments usually require JSON flags such as `--edit-json`; do not keep retrying shell-escaped `--edit` variants after validation fails.",
        "",
        "## Edit Workflow",
        "",
        "- Before changing SiYuan content, prepare a short evidence table with: target ID, observed problem, exact old snippet, intended new snippet, command to run, and verification method.",
        "- Test the mutation on one representative block first. If it succeeds, batch the same proven command shape across the remaining matching blocks.",
        "- Verify the final state using `siyuan-sisyphus`, not by inspecting local files.",
        "- Keep final replies concise: summarize root cause, changed targets, and verification result.",
        "",
    ].join("\n");
}

export function buildManagedOpenCodeConfig(): string {
    return JSON.stringify(
        {
            $schema: "https://opencode.ai/config.json",
        },
        null,
        2
    );
}
