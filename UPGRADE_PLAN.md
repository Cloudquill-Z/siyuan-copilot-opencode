# OpenCode 插件全面升级方案

v0.0.2 → v0.1.0

---

## 模块一：连接状态指示器

**当前**：`checkServerAvailable()` 只在后端静默检测，UI 完全无感知。

| 功能 | 实现 |
|---|---|
| 健康轮询 | `startHealthPoll()` 每 5s 调 `GET /global/health`，更新全局状态 |
| 状态 Store | 新建 `src/stores/connectionStatus.ts`：`{ status: 'connected'/'disconnected'/'connecting', version, lastChecked }` |
| 聊天栏顶部指示灯 | 新建 `src/components/ConnectionStatus.svelte`：已连接 + 版本号 / 未连接 + 一键重连按钮 |
| 设置页状态 | `SettingsPannel.svelte` 中 OpenCode 配置区展示连接状态 |
| 自动重连 | 断连后在 UI 显示重试按钮，触发 `ensureServerRunning()` |

---

## 模块二：多任务会话 —— 切换不中断

**根因**：`ai-sidebar.svelte:138` 全局单例 `AbortController`。`loadSession()`、`newSession()`、`clearChat()` 全部调用 `abortMessage()` → `abortController.abort()`，一刀切。

| 项 | 当前 | 改进 |
|---|---|---|
| 中断控制器 | 全局单例 | `Map<sessionId, AbortController>`，每会话独立 |
| 切换会话 | 无条件 abort | 保留旧会话控制器，后台继续生成 |
| 停止按钮 | abort 全部 | 只 abort 当前激活会话 |
| 会话列表 | 无状态 | 旁显示运行中 / 空闲 |
| 后台完成 | 不感知 | toast 通知 + 自动保存已完成会话 |

**新增 API 调用**：`GET /session/status` 获取所有会话运行状态，驱动 UI 状态图标。

---

## 模块三：优化 SSE 传输与 Tool/Thinking 实时展示

| 功能 | 实现 |
|---|---|
| 双通道 SSE | `/event` 全局事件流（主通道，`message.part.updated` 增量更新）+ `/session/:id/message` SSE（备用） |
| 工具调用卡片 | 聊天消息中渲染 Tool Part 卡片，`pending → running → completed/error` 状态流，显示 tool name + input/output 摘要 |
| 思考折叠区 | thinking/reasoning 渲染为可折叠面板，标题"思考中…"，默认折叠 |
| 分块策略 | SSE 模式直接流式 delta，不做人为分块；仅 JSON 回退模式保留 chunk 逻辑 |
| 增量输出 | `onToolPartUpdate` 支持 `status === 'running'` 时的实时增量输出 |

---

## 模块四：OpenCode 指令系统

**当前**：API 有 `GET /command` + `POST /session/:id/command`，插件完全未用。

| 功能 | 实现 |
|---|---|
| 命令获取 | `fetchCommands()` 调 `GET /command` 获取全部命令列表 |
| 命令执行 | `executeCommand()` 调 `POST /session/:id/command`，传 `{ command, arguments }` |
| 输入框 `/` 触发 | 输入 `/` 弹出命令补全菜单：`/init` `/still` `/undo` `/redo` `/compact` `/connect` `/share` |
| 命令模式 | 输入框按 `/` 进入命令模式，提交走 `command` API；回车/空格回聊天模式 |
| 特殊端点 | `/init` → `POST /session/:id/init`；`/still` → `POST /session/:id/prompt_async` |

**新增到 `opencode-provider.ts`**：
- `listCommands()` → GET /command
- `executeCommand()` → POST /session/:id/command
- `runShell()` → POST /session/:id/shell
- `initSession()` → POST /session/:id/init

---

## 模块五：思考强度精确匹配

**根因**：`opencode-provider.ts:557` 只有 `enableThinking && reasoningEffort` 同时真时才传参，未利用模型元数据。

| 项 | 当前 | 改进 |
|---|---|---|
| 模型能力 | 忽略模型自身 `enableThinking` | 从 `/provider` 响应读取每模型能力 |
| 强度选择器 | 对全部模型显示 | 仅对 `enableThinking: true` 的模型显示 |
| 传参逻辑 | `&&` 双重判断 | 模型支持思考时直接传 `reasoningEffort` |
| 默认值 | 硬编码 `'low'` | 使用 OpenCode 返回的模型默认 `reasoningEffort` |
| 选项范围 | 固定 low/medium/high | 根据模型元数据动态调整 |

---

## 模块六：移除多模型同时询问

移除范围：
- `src/components/MultiModelSelector.svelte` 整个文件
- `ai-sidebar.svelte` 中 `multiModelResponses`、`isWaitingForAnswerSelection`、`selectedAnswerIndex` 所有逻辑
- 简化 `sendMessage()` 调用链，去掉并发多模型分支
- `Message` 接口中 `multiModelResponses` 字段保留但标弃用（向后兼容旧会话数据）

---

## 模块七：OpenCode 品牌标识

| 位置 | 内容 |
|---|---|
| 聊天栏顶部 | OpenCode 官方 logo（SVG 内嵌）+ 版本号 + 连接状态灯 |
| 设置页 | OpenCode 配置区 header 加图标 + "由 OpenCode 驱动" |
| AI 消息头像 | 使用 OpenCode logo 替代通用 AI 图标 |
| 页脚 | `Powered by OpenCode` + 官网链接 |

---

## 模块八：UI 全面重新设计

基于 ui-ux-pro-max skill 生成设计系统：

| 维度 | 方案 |
|---|---|
| 风格 | Dark Mode OLED — 深黑 `#0A0A0A` 背景 + 微光效果，契合终端/code 工具 |
| 主色 | `#2563EB` 蓝 + `#F97316` 橙强调 + Success Green `#22C55E` |
| 字体 | Inter（全局统一，标题/正文） |
| 布局 | 顶部状态栏 → 消息列表（flex-1 滚动）→ 思考折叠区 → 工具卡片区 → 输入区（固定底部） |
| 消息气泡 | 用户右对齐浅蓝底，AI 左对齐深灰底，圆角 12px |
| 过渡 | 150-300ms ease-out 所有交互动画，reduced-motion 尊重 |
| 输入框 | 底部固定，多行 textarea + 发送/停止按钮 + 模式切换 + 指令提示 |
| 会话列表 | 左侧可折叠 sidebar，每项显示状态灯 + 标题 + 时间 |

---

## 实施顺序

```
模块一  连接状态指示器       ← 基础设施
模块二  多任务会话            ← 架构改动最大
模块三  SSE/Tool 展示优化     ← 依赖模块二的 AbortController 改造
模块四  指令系统              ← 新功能，依赖会话管理
模块五  思考强度匹配          ← API 层精准修复
模块六  移除多模型            ← 简化代码
模块七  OpenCode 品牌         ← UI 标识
模块八  UI 重新设计           ← 最终视觉改版
```

---

状态：✅ 已完成（模块 1-8，v0.0.2 → v0.1.0）
最后一次构建：2026-05-13 ✓ built in 11.47s
