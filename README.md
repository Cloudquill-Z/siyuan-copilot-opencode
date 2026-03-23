<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118224558-e1kdo6x.png" />

# SiYuan Copilot OpenCode

> SiYuan Note Copilot plugin extension — use **OpenCode** as an AI Provider

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📝 What is this

This repository is a fork of [siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) with a new **OpenCode Provider** added. Users can select OpenCode as the AI backend directly from the Copilot Provider dropdown — without changing their existing workflow.

OpenCode is a local AI Coding Agent powered by the [OpenCode MCP Server](https://github.com/Traves-Theberge/opencode-mcp), supporting multiple models and hot-swappable tool calls. This extension brings OpenCode's reasoning and coding capabilities to the SiYuan Copilot sidebar.

---

## ✨ Features

- **OpenCode Provider**: Select OpenCode directly from Copilot's Provider dropdown — no extra deployment needed
- **Multi-Model Support**: Auto-fetches all available OpenCode models via the `/provider` API
- **Streaming Responses**: Full SSE streaming support — AI replies appear in real time
- **Session Management**: Auto-manages OpenCode sessions, supporting multi-turn conversations
- **Native UI**: Reuses Copilot's existing interface — Provider switching is seamless

---

## 🔧 How it works

```
User input (Copilot sidebar)
    │
    ▼
ai-chat.ts (Provider router)
    │
    ▼
opencode-provider.ts (OpenCode Provider implementation)
    │
    ├── chatOpenCode() → POST /session/{id}/message
    └── fetchOpenCodeModels() → GET /provider
    │
    ▼
OpenCode local service (localhost:4096)
    │
    ▼
SSE streaming → onChunk → Copilot chat UI
```

The OpenCode Provider does not use MCP tools — it calls the OpenCode REST API directly:
- `GET /provider` — fetch model list
- `POST /session` — create a session
- `POST /session/{id}/message` — send a message, receive streaming response

---

## 📦 Installation

### Build from source

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

Copy the build output (`dist/`, `plugin.json`, `icon.png`, `i18n/` etc.) into the SiYuan plugin directory:
- **Linux**: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- **Windows**: `%APPDATA%\siyuan\data\plugins\siyuan-copilot-opencode\`
- **macOS**: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`

### Download Release

Get the latest release from [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases).

---

## 🚀 Prerequisites

1. **OpenCode running**: Make sure OpenCode is serving at `http://localhost:4096`
2. **SiYuan Note**: Desktop version only (Docker and mobile do not support plugins)

---

## ⚙️ Setup

1. Open **Marketplace → Plugins** in SiYuan Note and enable **SiYuan Copilot**
2. Open Copilot settings → Select Provider → **OpenCode**
3. Confirm Server URL is `http://localhost:4096` (default)
4. Save and start chatting

---

## 🐛 Known Limitations

- ❌ **No image upload**: OpenCode Provider does not support image attachments
- ❌ **Thinking mode not supported**
- ❌ **Agent tool calling not supported**: Tool calling uses Copilot's native toolchain
- ⚠️ **Session not reused**: Each conversation creates a new session (no session pooling)

---

## 🔗 Related Projects

This extension stands on the shoulders of these open-source projects:

| Project | Repository | Description |
|---------|-----------|-------------|
| **Original Plugin** | [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) | SiYuan Copilot plugin — provides the full Provider architecture |
| **OpenCode MCP Server** | [Traves-Theberge/opencode-mcp](https://github.com/Traves-Theberge/opencode-mcp) | OpenCode's MCP Server with REST API endpoints |
| **OpenCode** | [opencode.ai](https://opencode.ai) | Official OpenCode website |

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md)

---

## 📄 License

MIT License — inherited from [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot)
