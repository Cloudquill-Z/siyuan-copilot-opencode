# SiYuan OpenCode

> 一个把 [OpenCode](https://opencode.ai) 接入思源笔记桌面端的实验性插件。

[![GitHub](https://img.shields.io/badge/GitHub-Cloudquill--Z/siyuan--copilot--opencode-green.svg)](https://github.com/Cloudquill-Z/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 项目说明

本项目是从 [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) fork 而来的分支。

原项目做了大量思源插件侧栏、对话界面、设置面板和上下文能力的基础工作。本分支在此基础上删去了多 Provider 方向的复杂适配，转为只面向 OpenCode 使用。感谢原作者 Achuan-2 和原项目贡献者提供的基础工程。

这个分支目前更像是一个个人维护的 OpenCode 接入口，而不是一个成熟、完整、通用的 AI 助手插件。坦白说，它现在最明确的优势可能只有一个：可以在思源里更方便地使用 OpenCode 里能白嫖或低成本使用的模型。

## 适合谁

如果你已经在使用 OpenCode，并且希望在思源笔记里直接打开一个对话侧栏，这个插件可能有用。

如果你期待的是一个开箱即用、能力完整、能稳定自动整理整个知识库的 AI Agent，那它现在还不适合你。OpenCode 本身负责模型、会话和工具调用，本插件主要负责把它接进思源界面。

## 和 Sisyphus MCP 配合使用

如果你希望 OpenCode 不只是聊天，而是能真正读取、搜索、创建或修改思源笔记，需要搭配这个项目使用：

[yangtaihong59/siyuan-plugins-mcp-sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus)

简单理解：

- 本插件负责在思源中提供 OpenCode 对话入口。
- OpenCode 负责调用模型和 MCP 工具。
- Sisyphus MCP 负责把“操作思源笔记”的能力暴露给 OpenCode。

没有 Sisyphus MCP 时，你仍然可以用本插件聊天、总结、改写和处理手动提供的内容，但 OpenCode 不能凭空获得完整的思源笔记操作能力。

## 基本用法

1. 安装并配置 OpenCode，确保系统里可以执行 `opencode`。
2. 在思源笔记桌面端安装并启用本插件。
3. 打开插件设置，确认 OpenCode 服务地址，默认是 `http://localhost:4096`。
4. 刷新模型列表，选择你想在界面里显示的模型。
5. 打开侧栏开始对话。

如果要让 OpenCode 操作思源笔记，请另外安装并配置 Sisyphus MCP，然后在 OpenCode 中启用对应 MCP 工具。

## 安装

### 从 Release 安装

前往 [Releases](https://github.com/Cloudquill-Z/siyuan-copilot-opencode/releases) 下载 `package.zip`，解压后放入思源插件目录：

- macOS: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`
- Linux: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- Windows: `%APPDATA%\\siyuan\\data\\plugins\\siyuan-copilot-opencode\\`

然后重启思源或在插件市场中刷新插件列表。

### 从源码构建

```bash
git clone https://github.com/Cloudquill-Z/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
pnpm install
pnpm run build
```

如果你习惯使用 npm，也可以执行：

```bash
npm install
npm run build
```

构建后会生成 `dist/` 和 `package.zip`。如果能自动识别到思源工作空间，构建脚本会尝试把插件安装到思源插件目录。

## 开发命令

```bash
npm run dev
npm run build
npm run make-link
npm run make_dev_copy
npm run make-install
npm run update-version
```

常用的是：

- `npm run dev`：开发构建到 `dev/`，并尝试复制到思源插件目录。
- `npm run build`：生产构建到 `dist/`，生成 `package.zip`。
- `npm run update-version`：同步更新 `plugin.json` 与 `package.json` 里的版本号。

## 目前限制

- 主要面向思源桌面端。
- 自动启动 OpenCode 依赖 Electron 桌面环境。
- 项目暂时没有内置 `test`、`lint`、`typecheck` 脚本。
- 真实的笔记读写和搜索能力需要依赖 Sisyphus MCP，不是本插件单独完成。
- 这是一个 fork 后的个人维护分支，后续功能会优先围绕 OpenCode 使用体验调整。

## 致谢

- 感谢 [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) 提供原始项目基础。
- 感谢 [OpenCode](https://opencode.ai) 提供本地 AI 编程与工具调用工作流。
- 感谢 [yangtaihong59/siyuan-plugins-mcp-sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus) 提供思源笔记 MCP 能力。

## License

MIT
