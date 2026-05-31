# SiYuan OpenCode

> 独立的思源笔记 OpenCode 插件，提供基于笔记上下文的本地 AI 对话、任务执行与 WebView 辅助工作流。

[![GitHub](https://img.shields.io/badge/GitHub-zzl793780096--creator/siyuan--copilot--opencode-green.svg)](https://github.com/zzl793780096-creator/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 项目简介

这是一个独立的思源笔记桌面端插件，只连接 [OpenCode](https://opencode.ai) 作为唯一 AI 后端，不再依赖旧版 Copilot 的多 Provider 架构。

插件当前重点能力：

- 在思源侧栏中进行基于当前笔记上下文的对话
- 支持 `Plan` / `Build` 两种 OpenCode 对话模式切换
- 实时显示文本、思考过程、工具调用、权限请求和追问问题
- 自动管理 OpenCode Session，并支持多任务并发与会话列表
- 内置 WebApp / WebView 标签页，方便边聊边查网页
- 在 Electron 桌面环境下可尝试自动拉起 `opencode serve`

## 主要功能

### 1. OpenCode 对话体验

- 实时 SSE / EventStream 增量输出
- 思考内容、工具调用、结果时间线分组展示
- 工具权限请求和追问问题在界面内直接响应
- 支持 `/` 命令列表与 OpenCode 命令执行

### 2. 模型与配置管理

- 从 OpenCode `/provider` 自动拉取可用模型
- 支持手动补充模型
- 为每个模型单独配置温度、最大输出、隐藏状态、附加 JSON 请求体
- 根据模型能力展示思考、视觉、工具调用、联网搜索等标记

### 3. 会话与任务管理

- 会话新建、切换、重命名、置顶、批量删除
- 可将会话导出到笔记或 Markdown 文件
- 支持后台任务并发控制
- 支持对话 Token 使用统计

### 4. WebApp / 浏览辅助

- 独立 `opencode-webapp` 标签页
- Electron 环境使用 `<webview>`，非 Electron 回退到 `<iframe>`
- 地址栏、历史记录搜索、常用站点、图标自动抓取
- 可把网页内容解析成 Markdown 作为对话上下文

### 5. OpenCode 服务连接

- 默认服务地址：`http://localhost:4096`
- 插件启动时会做健康检查
- 若桌面端检测到未启动，会尝试自动执行 `opencode serve`
- 提供连接状态显示、重试连接、诊断日志记录

## OpenCode 接口

插件当前主要对接这些接口：

- `GET /global/health`
- `GET /provider`
- `POST /session`
- `POST /session/{id}/message`
- `DELETE /session/{id}`

另外，源码中也已经接入了部分扩展接口用于命令与异步任务能力。

## 安装

### 方式一：下载 Release

前往 [Releases](https://github.com/zzl793780096-creator/siyuan-copilot-opencode/releases) 下载最新包，将内容放入思源插件目录：

- macOS: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`
- Linux: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- Windows: `%APPDATA%\\siyuan\\data\\plugins\\siyuan-copilot-opencode\\`

### 方式二：从源码构建

```bash
git clone https://github.com/zzl793780096-creator/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
npm install
npm run build
```

构建完成后会生成：

- `dist/`
- `package.zip`

如果已设置 `SIYUAN_PLUGIN_DIR`，构建脚本会自动尝试安装到目标插件目录。

## 使用前准备

1. 安装 OpenCode CLI，并确保系统里可以直接执行 `opencode`
2. 使用思源笔记桌面版
3. 首次使用时确认 OpenCode 服务地址可访问，默认是 `http://localhost:4096`

## 快速开始

1. 在思源中启用 `SiYuan OpenCode`
2. 打开插件设置，确认 `OpenCode Server` 地址
3. 刷新模型列表，并选择要显示的模型
4. 打开侧栏开始聊天，按需要切换 `Plan` 或 `Build`

## 开发命令

```bash
npm run dev
npm run build
npm run make-link
npm run make_dev_copy
npm run make-install
npm run update-version
```

命令说明：

- `npm run dev`：开发构建到 `dev/`，并自动复制到思源插件目录
- `npm run build`：生产构建到 `dist/`，打包 `package.zip`，并自动尝试安装
- `npm run make-link`：把 `dev/` 软链接到思源插件目录
- `npm run make_dev_copy`：手动复制 `dev/` 到思源插件目录
- `npm run make-install`：等同于 `npm run build`
- `npm run update-version`：同步更新 `plugin.json` 与 `package.json` 中的版本号

## 当前已知说明

- 本项目没有内置 `test`、`lint`、`typecheck` 脚本
- 自动启动 OpenCode 依赖 Electron 桌面环境
- 插件聚焦 OpenCode 单一后端，不再维护旧版多 Provider 兼容层

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
