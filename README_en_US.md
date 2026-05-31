# SiYuan OpenCode

Standalone SiYuan plugin for note-aware OpenCode chat, task execution, and lightweight in-app web workflows.

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

This repository is now a standalone SiYuan desktop plugin. It uses [OpenCode](https://opencode.ai) as the only AI backend and no longer follows the old multi-provider Copilot plugin shape.

Core capabilities:

- note-aware chat inside the SiYuan sidebar
- `Plan` / `Build` chat mode switching
- real-time streaming for text, reasoning, tool updates, permission prompts, and follow-up questions
- OpenCode session lifecycle management with concurrent task handling
- embedded WebApp / WebView tab for browsing alongside chat
- optional auto-start of `opencode serve` in Electron environments

## Features

### OpenCode chat workflow

- SSE / EventStream incremental rendering
- grouped timeline for reasoning, tool calls, and final output
- in-UI handling for permission requests and questions from OpenCode
- slash-command support for available OpenCode commands

### Model and provider management

- fetch model catalog from OpenCode `/provider`
- manually add models when needed
- per-model settings for temperature, max output, visibility, and custom JSON body
- model capability badges for reasoning, vision, tool calling, image generation, and web search

### Sessions and tasks

- create, switch, rename, pin, and batch-delete sessions
- export conversations to a SiYuan note or Markdown file
- configurable background task concurrency
- token usage statistics in settings

### WebApp / browser helper

- dedicated `opencode-webapp` tab type
- Electron `<webview>` with `<iframe>` fallback
- address bar, history search, built-in sites, and favicon fetching
- webpage-to-Markdown parsing for chat context

### OpenCode connection management

- default server URL: `http://localhost:4096`
- startup health check
- optional auto-start attempt when the desktop app detects no running server
- connection indicator, retry action, and diagnostic logging

## Main API endpoints

The plugin primarily talks to these OpenCode endpoints:

- `GET /global/health`
- `GET /provider`
- `POST /session`
- `POST /session/{id}/message`
- `DELETE /session/{id}`

The codebase also includes support for related command and async-task endpoints used by newer workflows.

## Installation

### Option 1: Download a release

Download the latest package from [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases) and place it in the SiYuan plugins directory:

- macOS: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`
- Linux: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- Windows: `%APPDATA%\\siyuan\\data\\plugins\\siyuan-copilot-opencode\\`

### Option 2: Build from source

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

Build output:

- `dist/`
- `package.zip`

If `SIYUAN_PLUGIN_DIR` is set, the build step will also try to install the production output automatically.

## Prerequisites

1. Install the OpenCode CLI and make sure `opencode` is available in your shell.
2. Use the SiYuan desktop app.
3. Confirm that the OpenCode server is reachable, defaulting to `http://localhost:4096`.

## Quick start

1. Enable `SiYuan OpenCode` in SiYuan.
2. Open plugin settings and verify the `OpenCode Server` URL.
3. Refresh the model list and choose the models you want to expose.
4. Open the sidebar and start chatting in `Plan` or `Build` mode.

## Development commands

```bash
npm run dev
npm run build
npm run make-link
npm run make_dev_copy
npm run make-install
npm run update-version
```

- `npm run dev`: build into `dev/` and auto-copy into the SiYuan plugins directory
- `npm run build`: build into `dist/`, create `package.zip`, and try auto-install
- `npm run make-link`: symlink `dev/` into the SiYuan plugins directory
- `npm run make_dev_copy`: one-shot copy from `dev/` into the plugins directory
- `npm run make-install`: same as `npm run build`
- `npm run update-version`: update both `plugin.json` and `package.json`

## Notes

- The project currently has no built-in `test`, `lint`, or `typecheck` script.
- Auto-starting OpenCode depends on the Electron desktop runtime.
- The plugin is intentionally focused on OpenCode only, not the legacy multi-provider Copilot setup.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
