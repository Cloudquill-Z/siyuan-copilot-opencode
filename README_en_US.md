# SiYuan OpenCode

Independent SiYuan OpenCode plugin for note-aware AI chat with real-time streaming, tool execution, and embedded WebView browser.

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

A standalone SiYuan Note plugin that uses [OpenCode](https://opencode.ai) as the sole AI backend. Features Plan/Build dual modes, real-time thinking and tool execution streams, an embedded WebView browser tab, and auto-start of the OpenCode serve process in Electron environments.

## Features

- **Plan / Build Dual Modes**: Toggle switch between Plan (analysis & design) and Build (coding & execution)
- **Real-Time Event Stream**: SSE-based live streaming of text deltas, reasoning steps, and tool calls with pending→running→completed state transitions
- **OpenCode Tool System**: Tool call approval workflow (manual/auto), timeline group display, full think→tool→result chain visualization
- **Embedded WebView Tab**: Electron `<webview>` or fallback `<iframe>` browser with address bar, history search, auto-favicon fetch
- **Auto-Start OpenCode**: Electron desktop automatically detects and starts `opencode serve` on demand
- **Multi-Model Support**: Auto-fetch all available models via OpenCode `/provider` API with per-model configuration
- **Session Management**: Automatic OpenCode session creation and cleanup for multi-turn conversations
- **SiYuan Native UI**: Uses SiYuan native components and theme variables, perfect for light/dark mode

---

## Architecture

```text
User Input (SiYuan Sidebar)
    |
    v
ai-chat.ts (routes to OpenCode)
    |
    v
opencode-provider.ts (REST + SSE client)
    |
    +-- GET  /global/health           health check
    +-- GET  /provider                fetch model list
    +-- POST /session                 create session
    +-- POST /session/{id}/message    send message (SSE streaming)
    +-- DELETE /session/{id}          cleanup session
    |
    v
OpenCode Local Service (localhost:4096)
    |
    v
EventStream → onTextDelta / onReasoningDelta / onToolCall / onPermissionAsked / onQuestion
    |
    v
Chat UI (real-time text + collapsible thinking + tool cards + timeline)
```

---

## Installation

### Build from Source

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

Copy the build output to the SiYuan plugins directory:

- **Linux**: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- **Windows**: `%APPDATA%\siyuan\data\plugins\siyuan-copilot-opencode\`
- **macOS**: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`

### Download Release

Get the latest release from [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases).

---

## Prerequisites

1. **OpenCode CLI**: Install the `opencode` command-line tool (see [opencode.ai](https://opencode.ai))
2. **SiYuan Desktop**: Plugin support is only available in the desktop app

---

## Setup

1. Open **Marketplace → Plugins** in SiYuan, enable **SiYuan OpenCode**
2. Open plugin settings, confirm server URL is `http://localhost:4096` (default)
3. Configure auto-start and port options as needed
4. Save settings and start chatting

---

## Development

```bash
npm run dev          # dev build + watch, auto-copy to SiYuan plugin dir
npm run build        # production build → dist/ + package.zip
npm run make-install # build + copy to SiYuan plugin dir
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

---

## License

MIT License
