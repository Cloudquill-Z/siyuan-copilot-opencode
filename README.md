# SiYuan OpenCode

> 独立的思源笔记 OpenCode AI 对话插件

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 这是什么

独立的思源笔记 AI 对话插件，将 [OpenCode](https://opencode.ai) 作为唯一的 AI 后端。支持 Plan/Build 双模式、实时思考/工具执行流、嵌入式浏览器标签页，可在 Electron 环境中自动启动 OpenCode 服务。

## 功能特点

- **Plan / Build 双模式**：Switch 式切换，Plan 模式用于需求分析与方案设计，Build 模式用于编码执行
- **实时流式响应**：EventStream 实时推送文本增量、思考过程、工具调用，pending→running→completed 状态流转
- **OpenCode 工具系统**：支持工具调用手动/自动批准、时间线分组展示、思考→工具→结果完整链路可视化
- **嵌入式 WebView 标签页**：Electron `<webview>` / fallback `<iframe>` 浏览器，支持地址栏、历史搜索、Favicon 自动获取
- **自动启动 OpenCode**：Electron 环境下自动检测并启动 `opencode serve`，无需手动启动
- **多模型支持**：通过 OpenCode `/provider` 自动获取所有可用模型，支持独立配置参数
- **Session 管理**：自动创建/清理 OpenCode 会话，支持多轮对话上下文
- **思源原生 UI**：使用思源原生组件和主题变量，完美适配亮/暗主题

---

## 工作原理

```text
用户输入（思源侧边栏）
    |
    v
ai-chat.ts（路由到 OpenCode）
    |
    v
opencode-provider.ts（REST + SSE 客户端）
    |
    +-- GET  /global/health           健康检查
    +-- GET  /provider                获取模型列表
    +-- POST /session                 创建会话
    +-- POST /session/{id}/message    发送消息（SSE 流式）
    +-- DELETE /session/{id}          清理会话
    |
    v
OpenCode 本地服务 (localhost:4096)
    |
    v
EventStream → onTextDelta / onReasoningDelta / onToolCall / onPermissionAsked / onQuestion
    |
    v
聊天 UI（实时渲染文本 + 思考折叠区 + 工具卡片 + 时间线）
```

---

## 安装

### 从源码构建

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

将构建输出复制到思源插件目录：

- **Linux**: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- **Windows**: `%APPDATA%\siyuan\data\plugins\siyuan-copilot-opencode\`
- **macOS**: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`

### 下载 Release

从 [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases) 获取最新版本。

---

## 前置条件

1. **OpenCode CLI**：已安装 `opencode` 命令行工具（参见 [opencode.ai](https://opencode.ai)）
2. **思源笔记桌面版**：仅桌面版支持插件功能

---

## 设置

1. 在思源中打开 **集市 -> 插件**，启用 **SiYuan OpenCode**
2. 打开插件设置，确认服务器地址为 `http://localhost:4096`（默认）
3. 可在设置中启用/禁用自动启动、修改端口
4. 保存设置，开始对话

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
