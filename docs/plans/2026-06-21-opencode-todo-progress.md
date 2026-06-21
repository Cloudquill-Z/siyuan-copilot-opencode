# OpenCode Todo Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在聊天输入区顶部实时展示当前 OpenCode 会话的 Todo 完成进度，并提供可悬浮、可点击、支持长文本提示的详细清单。

**Architecture:** 由 `opencode-provider.ts` 在现有全局事件流中识别 `todo.updated`，沿 `ChatOptions` 和单模型运行器回调传递完整列表。界面运行态按插件任务 ID 保存规范化后的 Todo；独立 Svelte 组件只负责进度与弹层交互，OpenCode 服务端始终是唯一事实来源。

**Tech Stack:** TypeScript、Svelte 4、SCSS、OpenCode SSE、Node assert 回归脚本、Vite。

---

### Task 1: Todo 数据模型与纯函数

**Files:**
- Create: `src/chat/todo-state.ts`
- Modify: `scripts/test-regressions.ts`

**Step 1: Write the failing test**

在回归脚本中导入尚不存在的 `normalizeOpenCodeTodos` 与 `getTodoProgress`，验证：合法状态保留、未知状态降级为 `pending`、空内容获得占位、`completed` 才计入完成数、取消项目保留在总数中。

**Step 2: Run test to verify it fails**

Run: `npm run test:regressions`

Expected: FAIL，提示无法找到 `src/chat/todo-state.ts`。

**Step 3: Write minimal implementation**

定义：

```ts
export type OpenCodeTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export interface OpenCodeTodo { content: string; status: OpenCodeTodoStatus; priority: string; }
export function normalizeOpenCodeTodos(value: unknown): OpenCodeTodo[];
export function getTodoProgress(todos: OpenCodeTodo[]): { completed: number; total: number };
```

**Step 4: Run test to verify it passes**

Run: `npm run test:regressions`

Expected: PASS 并输出 `Regression tests passed`。

### Task 2: 接入 OpenCode `todo.updated` 事件

**Files:**
- Modify: `src/providers/opencode-provider.ts`
- Modify: `src/ai-chat.ts`
- Modify: `src/chat/execution/single-model-runner.ts`
- Modify: `scripts/test-regressions.ts`

**Step 1: Write the failing test**

在回归脚本中对 Provider 源码加入结构回归断言：事件流必须显式处理 `todo.updated`，必须校验目标 `sessionID`，并调用 `onTodoUpdated`；`ChatOptions` 与单模型运行器也必须公开该回调。

**Step 2: Run test to verify it fails**

Run: `npm run test:regressions`

Expected: FAIL，指出缺少 `todo.updated` 或 `onTodoUpdated`。

**Step 3: Write minimal implementation**

- `OpenCodeChatOptions` 增加 `onTodoUpdated?: (todos: OpenCodeTodo[]) => void`。
- `EventStreamClient.connect` 回调增加 Todo 更新入口。
- 仅当事件 `sessionID` 等于目标 OpenCode 会话时规范化并转发列表。
- 沿 `ChatOptions`、`chat()` 与 `runSingleModelTarget()` 原样透传。
- Todo 更新计为实时活动，防止执行 Todo 时完成监视器误判停滞。

**Step 4: Run test to verify it passes**

Run: `npm run test:regressions`

Expected: PASS。

### Task 3: 按插件任务隔离 Todo 运行态

**Files:**
- Modify: `src/task-types.ts`
- Modify: `src/ai-sidebar.svelte`
- Modify: `scripts/test-regressions.ts`

**Step 1: Write the failing test**

增加结构回归断言：`TaskViewState` 必须包含 `openCodeTodos`；前台状态捕获、应用、空状态和后台更新都必须处理该字段；发送新消息时必须清空当前任务 Todo。

**Step 2: Run test to verify it fails**

Run: `npm run test:regressions`

Expected: FAIL，指出任务状态缺少 Todo。

**Step 3: Write minimal implementation**

- 为当前任务增加 `openCodeTodos` 响应式变量。
- 纳入 `captureActiveTaskState`、`applyTaskState`、`blankTaskState`。
- 新增 `updateTodosForTask(runTaskId, todos)`，复用 `TaskStateController.updateState` 隔离后台任务。
- `runSingleModelTarget` 的回调闭包使用插件 `runTaskId` 路由更新。
- 每次发送开始清空该任务 Todo；完成或错误后不清空最终列表。

**Step 4: Run test to verify it passes**

Run: `npm run test:regressions`

Expected: PASS。

### Task 4: Todo 进度胶囊与弹层

**Files:**
- Create: `src/components/chat/TodoProgress.svelte`
- Modify: `src/components/chat/ChatComposer.svelte`
- Modify: `src/styles/ai-sidebar.scss`
- Modify: `scripts/test-regressions.ts`

**Step 1: Write the failing test**

增加组件源码与样式断言，覆盖：`aria-expanded`、点击切换、`Escape` 关闭、悬浮延时、单行省略、行级 `title`、弹层最大高度和内部滚动。

**Step 2: Run test to verify it fails**

Run: `npm run test:regressions`

Expected: FAIL，提示 Todo 组件或样式不存在。

**Step 3: Write minimal implementation**

- 组件接收 `todos`，为空时不渲染。
- 胶囊显示 `Todo {completed}/{total}`，状态标记使用 SiYuan 图标或纯 CSS 圆点/勾选样式。
- 150ms 打开定时器；胶囊与弹层共享容器，离开容器时仅关闭未锁定弹层。
- 点击切换锁定状态；文档点击和 `Escape` 关闭，并在销毁时清理监听器与定时器。
- Todo 行使用 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`，并用 `title={todo.content}` 提供完整文本。
- 在 `ChatComposer` 的任务标签之前挂载组件。

**Step 4: Run test to verify it passes**

Run: `npm run test:regressions`

Expected: PASS。

### Task 5: 版本、图谱与完整验证

**Files:**
- Modify: `plugin.json`
- Modify: `package.json`
- Update: `graphify-out/*`

**Step 1: Synchronize version**

将两个清单的 patch 版本同步提升一次，确保发布元数据一致。

**Step 2: Run all available tests**

Run: `npm run test:utils && npm run test:regressions`

Expected: 两个命令退出码均为 0。

**Step 3: Run production build**

Run: `SIYUAN_PLUGIN_DIR=/Users/lance/Documents/Siyuan/data/plugins npm run build`

Expected: Vite 构建和自动安装退出码均为 0，生成 `package.zip`。

**Step 4: Update knowledge graph**

Run: `graphify update .`

Expected: AST 图谱更新成功。

**Step 5: Inspect the rendered UI**

在 SiYuan 中触发包含 Todo 的 OpenCode 任务，检查胶囊进度、悬浮展开、点击锁定、长文本提示、任务切换、窄侧栏与明暗主题。若当前环境不能产生 Todo 事件，则至少通过构建与组件结构回归验证，并明确记录未执行的手工项。

**Step 6: Final verification and commit**

Run: `git diff --check && git status --short`

Expected: 无空白错误，只包含本功能与预期的 Graphify 更新；随后使用中文标题和中文摘要提交。
