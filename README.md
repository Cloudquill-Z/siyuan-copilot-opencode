<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118224558-e1kdo6x.png" />

# SiYuan Copilot OpenCode

> 思源笔记 Copilot 插件扩展，支持将 **OpenCode** 作为 AI Provider 调用

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📝 这是什么

本仓库是基于 [siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) 的扩展 fork，在原插件基础上**新增 OpenCode Provider**，让用户可以在 Copilot 的 Provider 选择器中直接选用 OpenCode 作为 AI 后端。

OpenCode 是 [OpenCode MCP Server](https://github.com/Traves-Theberge/opencode-mcp) 驱动的本地 AI Coding Agent，支持多模型、热插拔工具调用。本扩展让 Copilot 用户无需改变现有使用习惯，即可享受 OpenCode 的推理和代码能力。

---

## ✨ 核心功能

- **OpenCode Provider**：在 Copilot 的 Provider 下拉中直接选择 OpenCode，无需额外部署
- **多模型支持**：自动拉取 OpenCode 所有可用模型（通过 `/provider` API）
- **流式响应**：完整支持 SSE 流式输出，聊天界面实时显示回复
- **Session 管理**：自动管理 OpenCode 会话，支持多轮对话上下文
- **原生 UI 体验**：复用 Copilot 已有界面，Provider 切换无感知

---

## 🔧 工作原理

```
用户输入（Copilot 侧边栏）
    │
    ▼
ai-chat.ts（Provider 路由）
    │
    ▼
opencode-provider.ts（OpenCode Provider 实现）
    │
    ├── chatOpenCode() → POST /session/{id}/message
    └── fetchOpenCodeModels() → GET /provider
    │
    ▼
OpenCode 本地服务（localhost:4096）
    │
    ▼
SSE 流式响应 → onChunk → Copilot 聊天界面
```

OpenCode Provider 不走 MCP tools 接口，而是直接调用 OpenCode REST API：
- `GET /provider` — 获取模型列表
- `POST /session` — 创建会话
- `POST /session/{id}/message` — 发送消息，获取流式响应

---

## 📦 安装

### 方式一：从源码构建

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

将构建产物（`dist/`、`plugin.json`、`icon.png`、`i18n/` 等）放入思源笔记插件目录：
- **Linux**：`~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- **Windows**：`%APPDATA%\siyuan\data\plugins\siyuan-copilot-opencode\`
- **macOS**：`~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`

### 方式二：下载 Release 包

前往 [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases) 下载最新版本，解压后放入插件目录。

---

## 🚀 前置要求

1. **OpenCode 运行中**：确保 OpenCode 服务在 `http://localhost:4096` 运行
2. **思源笔记**：桌面版（Docker 和移动版不支持插件）

---

## ⚙️ 配置

1. 在思源笔记中打开 **集市 → 插件**，启用 **SiYuan Copilot**
2. 打开 Copilot 设置 → 选择 Provider → **OpenCode**
3. 确认 Server 地址为 `http://localhost:4096`（默认）
4. 保存后即可开始使用

---

## 🐛 已知限制

- ❌ **不支持图片上传**：OpenCode Provider 不支持图片附件
- ❌ **不支持思考模式（Thinking）**
- ❌ **不支持 Agent 工具调用**：工具调用走 Copilot 原生工具链
- ⚠️ **Session 每次新建**：当前版本每次对话创建新 Session，不做 Session 复用

---

## 🔗 参考项目

本扩展站在以下开源项目的肩膀上：

| 项目 | 仓库 | 说明 |
|------|------|------|
| **原插件** | [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) | 思源笔记 Copilot 插件，提供了完整的 Provider 架构 |
| **OpenCode MCP Server** | [Traves-Theberge/opencode-mcp](https://github.com/Traves-Theberge/opencode-mcp) | OpenCode 的 MCP Server，提供 REST API 接口 |
| **OpenCode 官方** | [opencode.ai](https://opencode.ai) | OpenCode 官方网站 |

---

## 📝 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

---

## 📄 License

MIT License，继承自 [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot)
