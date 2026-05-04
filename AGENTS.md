# AGENTS.md

## Project identity

SiYuan Note plugin (Svelte + TypeScript) that adds an **OpenCode Provider** to a fork of `siyuan-plugin-copilot`. Keeps the original multi-provider architecture (Achuan, gemini, deepseek, openai, moonshot, volcano) and adds `opencode` as an additional provider.

## Commands

```bash
npm run dev          # dev build with watch → dev/ (auto-copies to SiYuan plugins dir)
npm run build        # production build → dist/ + package.zip
npm run make-install # build + copy dist/ to SiYuan plugins dir (requires SiYuan running)
npm run update-version  # bump version in plugin.json
```

No test, lint, or typecheck scripts exist.

## Build output

- **Entry**: `src/index.ts` → `dist/index.js` (CJS format, `siyuan` is external)
- `vite.config.ts` copies `README*.md`, `plugin.json`, `icon.png`, `preview.png`, `assets/`, `i18n/` into output dir
- Production build strips `i18n/*.yaml` and `i18n/*.md` from dist and creates `package.zip`
- Dev build runs `scripts/make_dev_copy.js` after each bundle to sync into SiYuan's plugin dir

## Architecture

```
src/index.ts          — Plugin entry (extends Plugin from "siyuan"), lifecycle, tab registration
src/ai-chat.ts        — AI chat routing, multi-provider dispatch, streaming
src/providers/opencode-provider.ts  — OpenCode REST API client (localhost:4096)
src/api.ts            — SiYuan kernel API wrappers (fetchSyncPost)
src/components/       — Svelte UI (ChatDialog, SettingsPanel, TranslateDialog, etc.)
src/libs/             — Reusable Svelte components (b3-typography, setting-item, dialog)
src/tools/index.ts    — Agent-mode tool implementations
src/stores/settings.ts — Svelte writable store for plugin settings
src/utils/            — i18n, hotkey, assets, modelCapabilities, webParser
```

## Key conventions

- **Path alias**: `@/` → `src/` (configured in both tsconfig.json and vite.config.ts)
- **tsconfig**: `strict: false`, but `noUnusedLocals`/`noUnusedParameters` are enabled
- **Settings**: Deep-merged with defaults via `src/settingsSchema.ts`. The `opencode` provider config lives at `aiProviders.opencode` with `serverUrl` and `models` fields
- **Versioning**: `plugin.json` version is canonical (used for releases). `package.json` version may differ
- **i18n**: JSON files in `i18n/`; the yaml-plugin.js Vite plugin converts `.yaml` i18n sources to JSON at build time

## Environment / prerequisites

- **SiYuan must be running** on port 6806 for `make_dev_copy` and `make-install` to auto-detect the plugin directory. Otherwise set `SIYUAN_PLUGIN_DIR` env var
- **OpenCode service** expected at `http://localhost:4096` (default `serverUrl` in settings)
- `make_dev_copy.js` has a hardcoded Windows fallback path; set env var or edit the script for other platforms

## OpenCode provider details

- Calls OpenCode REST API directly (`GET /provider`, `POST /session`, `POST /session/{id}/message`)
- Default model: `opencode/big-pickle`
- Each conversation creates a new session (no session reuse)
- No SSE streaming — receives full response JSON, extracts text from `parts` array
- Error format handling: `{ error: string }`, `{ error: { message } }`, `{ success: false, error: [...] }`

## Release flow

```bash
bash gh_release.sh   # commits, pushes main, builds, creates GitHub release with package.zip
```

Version tag is read from `plugin.json` (e.g. `v2.3.5`). Release notes extracted from `CHANGELOG.md` section matching the version.
