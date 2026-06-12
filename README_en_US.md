# SiYuan OpenCode

> An experimental SiYuan desktop plugin that connects [OpenCode](https://opencode.ai) to SiYuan Note.

[![GitHub](https://img.shields.io/badge/GitHub-Cloudquill--Z/siyuan--copilot--opencode-green.svg)](https://github.com/Cloudquill-Z/siyuan-copilot-opencode)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

This project is a fork of [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot).

The original project provided much of the SiYuan plugin foundation: sidebar UI, chat panels, settings, and note-context workflows. This fork keeps that foundation, removes the old multi-provider direction, and focuses only on OpenCode. Thanks to Achuan-2 and the original contributors for the base work.

This fork is currently a personal OpenCode entry point for SiYuan, not a polished all-purpose AI assistant. Its clearest practical advantage is simple: it makes it easier to use the free or low-cost models available through OpenCode from inside SiYuan.

## Who It Is For

This plugin may be useful if you already use OpenCode and want a chat sidebar inside SiYuan.

It is probably not what you want if you expect a fully automatic, stable knowledge-base agent out of the box. OpenCode handles models, sessions, and tool calls. This plugin mainly connects that workflow to the SiYuan interface.

## Use With Sisyphus MCP

If you want OpenCode to read, search, create, or modify SiYuan notes, use it together with:

[yangtaihong59/siyuan-plugins-mcp-sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus)

In short:

- This plugin provides the OpenCode chat entry inside SiYuan.
- OpenCode handles model calls and MCP tool usage.
- Sisyphus MCP exposes SiYuan note operations to OpenCode.

Without Sisyphus MCP, you can still chat, summarize, rewrite, and work with content you provide manually, but OpenCode will not automatically gain full note-operation capabilities.

## Basic Usage

1. Install and configure OpenCode, and make sure `opencode` is available in your shell.
2. Install and enable this plugin in the SiYuan desktop app.
3. Open plugin settings and confirm the OpenCode server URL. The default is `http://localhost:4096`.
4. Refresh the model list and choose which models to show.
5. Open the sidebar and start chatting.

To let OpenCode operate on SiYuan notes, install and configure Sisyphus MCP separately, then enable the corresponding MCP tools in OpenCode.

## Installation

### From Release

Download `package.zip` from [Releases](https://github.com/Cloudquill-Z/siyuan-copilot-opencode/releases), unzip it, and place it in the SiYuan plugins directory:

- macOS: `~/Library/Application Support/siyuan/data/plugins/siyuan-copilot-opencode/`
- Linux: `~/.config/siyuan/data/plugins/siyuan-copilot-opencode/`
- Windows: `%APPDATA%\\siyuan\\data\\plugins\\siyuan-copilot-opencode\\`

Then restart SiYuan or refresh the plugin list.

### Build From Source

```bash
git clone https://github.com/Cloudquill-Z/siyuan-copilot-opencode.git
cd siyuan-copilot-opencode
pnpm install
pnpm run build
```

You can also use npm:

```bash
npm install
npm run build
```

The build creates `dist/` and `package.zip`. If the build script can detect your SiYuan workspace, it will also try to install the plugin automatically.

## Development Commands

```bash
npm run dev
npm run build
npm run make-link
npm run make_dev_copy
npm run make-install
npm run update-version
```

The common ones are:

- `npm run dev`: build into `dev/` and try to copy it into the SiYuan plugin directory.
- `npm run build`: build into `dist/` and create `package.zip`.
- `npm run update-version`: update both `plugin.json` and `package.json`.

## Current Limits

- Mainly targets the SiYuan desktop app.
- Auto-starting OpenCode depends on the Electron desktop runtime.
- The project currently has no built-in `test`, `lint`, or `typecheck` script.
- Real note reading, writing, and searching should be provided through Sisyphus MCP.
- This is a personally maintained fork, and future changes will prioritize the OpenCode workflow.

## Thanks

- Thanks to [Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot) for the original project foundation.
- Thanks to [OpenCode](https://opencode.ai) for the local AI coding and tool-calling workflow.
- Thanks to [yangtaihong59/siyuan-plugins-mcp-sisyphus](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus) for SiYuan MCP capabilities.

## License

MIT
