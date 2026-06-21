# AGENTS.md

## Project identity

Standalone SiYuan Note plugin (Svelte + TypeScript) that connects to a local [OpenCode](https://opencode.ai) service. v0.0.2 was refactored from `siyuan-plugin-copilot` — only the `opencode` provider remains. The plugin can auto-start `opencode serve` in Electron environments.

## Commands

```bash
npm run dev            # dev build with watch → dev/; auto-copies to SiYuan after each bundle
npm run build          # production build → dist/ + package.zip; auto-installs to SiYuan plugins dir if reachable
npm run make-link      # create symlink from dev/ to SiYuan plugins dir (admin rights may need elevate.ps1)
npm run make_dev_copy  # one-shot copy dev/ → SiYuan plugins dir (env SIYUAN_PLUGIN_DIR or detect)
npm run make-install   # same as `npm run build` (build now includes auto-install)
npm run update-version # bump version in plugin.json AND package.json
```

- `pnpm` is also used (gh_release.sh uses `pnpm run build`); `pnpm-lock.yaml` and `package-lock.json` are both gitignored
- No test, lint, or typecheck scripts

## Dev copy flow

- `npm run dev` bundles to `dev/`, then a Vite `writeBundle` hook auto-runs `scripts/make_dev_copy.js`
- `npm run build` bundles to `dist/`, then auto-runs `scripts/make_install.js` to copy the production output to the SiYuan plugins dir
- `make_dev_copy.js` has a hardcoded Windows path as fallback; set `SIYUAN_PLUGIN_DIR` env var to override, or edit the script
- `make_dev_copy.js` does incremental copy (not full delete+recreate)
- `elevate.ps1` re-runs any script with admin rights (needed for symlink creation)

## Build output

- **Entry**: `src/index.ts` → `dist/index.js` (CJS, external: `siyuan`, `process`, `child_process`, `net`, `os`)
- `vite.config.ts` copies `README*`, `plugin.json`, `icon.png`, `preview.png`, `assets/`, `i18n/` into output dir
- Production build strips `i18n/*.yaml` + `i18n/*.md` from dist, then zips as `package.zip`
- Dev build uses `emptyOutDir: false` (incremental)

## Architecture

```
src/index.ts                      — Plugin entry (extends Plugin from "siyuan"), auto-starts OpenCode
src/ai-chat.ts                    — Chat routing, dispatches to OpenCode, manages session cleanup
src/opencode-runner.ts            — Auto-start/stop opencode serve process (Electron only)
src/providers/opencode-provider.ts — REST+SSE client for OpenCode, error handling
src/api.ts                        — SiYuan kernel API wrappers (fetchSyncPost)
src/components/                   — Svelte UI (ChatDialog, SettingsPanel, TranslateDialog, etc.)
src/libs/                         — Reusable Svelte components (b3-typography, setting-item, dialog)
src/stores/settings.ts            — Svelte writable store for plugin settings
src/utils/                        — i18n, hotkey, assets, modelCapabilities, webParser
```

- **Only one provider**: OpenCode. No multi-provider dispatch or agent-mode tools.
- Plugin registers two tab types: `opencode-ai-tab` (chat sidebar) and `opencode-webapp` (embedded browser with navbar, search, favicon fetch, history)
- Registers three event bus hooks: `open-menu-doctree`, `click-editortitleicon`, `open-menu-link`
- WebView tab: Electron `<webview>` or fallback `<iframe>`; includes address bar with history search, favicon auto-fetch (multiple fallback sources), optional search engine
- `opencode-runner.ts` uses `window.require('child_process')` in Electron; can't use static imports (Vite bundles for browser)

## Auto-start flow

1. Plugin `onload()` calls `initOpenCodeServer()` which checks if `opencode serve` is reachable
2. If not, tries to auto-start via `child_process.spawn('opencode', ['serve', ...])` (Electron desktop only)
3. Waits up to 15s for the server to become ready
4. If auto-start fails, shows user-friendly error messages
5. Plugin `onunload()` calls `stopServe()` to clean up the spawned process

## Key conventions

- **Path alias**: `@/` → `src/` (in tsconfig.json and vite.config.ts)
- **tsconfig**: `strict: false`, `noUnusedLocals`/`noUnusedParameters` enabled
- **Versioning**: `plugin.json` version is canonical (used for releases & tags). `package.json` may differ
- **i18n**: JSON files in `i18n/`; the `yaml-plugin.js` Vite plugin converts `.yaml` sources to JSON at build time
- **Settings**: Deep-merged with defaults in `src/settingsSchema.ts`. Provider config at `aiProviders.opencode` with `serverUrl` and `models`
- **Svelte config** suppresses `a11y-click-events-have-key-events`, `a11y-no-static-element-interactions`, and `a11y-no-noninteractive-element-interactions` warnings
- **Auto-install**: `npm run build` automatically installs to the SiYuan plugins directory after bundling. Set the `SIYUAN_PLUGIN_DIR` environment variable (e.g. `/Users/lance/Documents/Siyuan/data/plugins`) to target a fixed path; if unset and SiYuan is not running, the install step is skipped without failing the build.

## Git commit convention

- 每次完成修改并验证后，都执行一次 Git commit；提交标题和提交摘要使用中文，简洁说明本次修改内容与验证结果。
- 同一个用户任务中的中途提交只记录阶段性修改，不提升版本号，也不构建或安装插件。
- 当整个用户任务的代码、文档和配置修改全部完成后，再将 `plugin.json` 与 `package.json` 的 patch 小版本号统一同步提升一次（例如 `3.0.0` → `3.0.1`）。
- 最终版本提升后统一执行自动检查、生产构建和插件安装，并把版本修改与最终实现一起提交；一个用户任务原则上只提升一次版本、安装一次插件。

## 验收与测试分工

- Codex 负责执行可用的自动检查、生产构建，并通过构建流程将插件安装到 SiYuan 插件目录；不再代替用户操作 SiYuan 界面进行功能测试。
- 用户负责安装后的实际界面与交互测试，并根据体验结果反馈需要继续调整的内容。
- 不在任务的设计、计划或中途实现阶段构建、安装插件；只在整个任务完成并统一提升版本后安装一次。
- 最终生产构建成功且插件已成功安装到用户指定或自动检测到的 SiYuan 插件目录，即视为 Codex 本轮交付成功；交付说明中应明确最终版本、安装结果与目标目录。

## OpenCode provider API

```
GET  /global/health          → health check (used by auto-start detection)
GET  /provider               → list models (from .all or .providers)
POST /session                → create session
POST /session/{id}/message   → send message (SSE stream or JSON response)
DELETE /session/{id}         → cleanup session
```

- Default model: `opencode/big-pickle`
- Each conversation creates a new session; sessions are cleaned up after errors
- SSE mode: parses `data: {...}` lines, extracts `parts[].text`; ignores `event:` lines
- JSON mode: extracts `parts[].text`, chunks output adaptively (chunk size = max(1, text/100))
- Request timeout: 120s with pre-abort signal checking
- Default server URL: `http://localhost:4096`
- Connection errors produce user-friendly messages explaining how to start OpenCode

## Release flow

```bash
bash gh_release.sh   # commits, pushes main, builds, creates GitHub release with package.zip
```

Version tag from `plugin.json` (e.g. `v0.0.2`). Release notes extracted from `CHANGELOG.md` section matching the version. Overwrites existing tags/releases if they exist.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
