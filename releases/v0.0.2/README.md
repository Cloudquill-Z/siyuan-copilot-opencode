<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118224558-e1kdo6x.png" />

# SiYuan OpenCode

> 独立的思源笔记 OpenCode AI 对话插件

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 这是什么

一个独立的思源笔记 AI 对话插件，将 [OpenCode](https://opencode.ai) 作为唯一的 AI 后端接入思源笔记。支持基于笔记上下文进行智能对话，通过 OpenCode 服务统一管理多个模型供应商。

## 功能特点

- **独立插件**：不依赖其他 Copilot 插件，开箱即用
- **多模型支持**：通过 OpenCode `/provider` API 自动获取所有可用模型（Anthropic、OpenAI 等多供应商模型）
- **流式响应**：支持 SSE 流式输出，实时显示 AI 回复
- **Session 管理**：自动管理 OpenCode 会话，支持多轮对话上下文
- **思源原生 UI**：使用思源原生组件和主题变量，完美适配亮/暗主题

---

## 工作原理

```text
用户输入（思源侧边栏）
    |
    v
ai-chat.ts（始终路由到 OpenCode）
    |
    v
opencode-provider.ts（OpenCode 客户端）
    |
    +-- chatOpenCode() -> POST /session/{id}/message（SSE 流式）
    +-- fetchOpenCodeModels() -> GET /provider
    +-- deleteOpenCodeSession() -> DELETE /session/{id}
    |
    v
OpenCode 本地服务 (localhost:4096)
    |
    v
SSE streaming -> onChunk -> 聊天 UI
```

OpenCode Provider 直接调用 OpenCode REST API：

- `GET /provider` — 获取模型列表
- `POST /session` — 创建会话
- `POST /session/{id}/message` — 发送消息（SSE 流式响应）
- `DELETE /session/{id}` — 清理会话

---

## 安装

### 从源码构建

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

将构建输出（`dist/`、`plugin.json`、`icon.png`、`i18n/` 等）复制到思源插件目录：

- **Linux**: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- **Windows**: `%APPDATA%\siyuan\data\plugins\siyuan-copilot-opencode\`
- **macOS**: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`

### 下载 Release

从 [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases) 获取最新版本。

---

## 前置条件

1. **OpenCode 服务运行中**：确保 OpenCode 在 `http://localhost:4096` 启动
2. **思源笔记桌面版**：仅支持桌面版，Docker 和移动端不支持插件

---

## 设置

1. 在思源中打开 **集市 -> 插件**，启用 **SiYuan OpenCode**
2. 打开插件设置，确认服务器地址为 `http://localhost:4096`（默认）
3. 保存设置，开始对话

---

## 开发

```bash
npm run dev          # 开发构建 + watch，自动同步到思源插件目录
npm run build        # 生产构建 -> dist/ + package.zip
npm run make-install # 构建并复制到思源插件目录
```

---

## Changelog

详见 [CHANGELOG.md](./CHANGELOG.md)

---

## License

MIT License
