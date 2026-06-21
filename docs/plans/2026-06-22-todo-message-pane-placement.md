# Todo Message Pane Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Todo 进度胶囊从输入区移动到消息对话区底部，并保持吸底可见和原有交互。

**Architecture:** `openCodeTodos` 状态与数据流不变，仅调整展示所有权。`MessageList` 接收并渲染 `TodoProgress`，SCSS 使用 sticky 吸底；`ChatComposer` 完全移除 Todo 依赖，恢复原始输入区高度。

**Tech Stack:** Svelte 4、TypeScript、SCSS、Node assert 回归脚本、Vite。

---

### Task 1: 用回归检查定义新布局

**Files:**
- Modify: `scripts/test-regressions.ts`

**Step 1: Write the failing test**

修改结构断言，要求 `MessageList.svelte` 导入并渲染 `<TodoProgress {openCodeTodos} />`，要求 `ChatComposer.svelte` 不再引用 Todo，并要求 `.ai-sidebar__todo-progress` 使用 `position: sticky` 与底部定位。

**Step 2: Run test to verify it fails**

Run: `npm run test:regressions`

Expected: FAIL，指出 Todo 仍属于输入区或尚未使用 sticky。

### Task 2: 移动 Todo 展示组件

**Files:**
- Modify: `src/components/chat/ChatComposer.svelte`
- Modify: `src/components/chat/MessageList.svelte`
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/styles/ai-sidebar.scss`

**Step 1: Write minimal implementation**

- 从 `ChatComposer` 删除 `TodoProgress`、`OpenCodeTodo`、`openCodeTodos` 属性和模板节点。
- 在 `MessageList` 导入上述组件与类型，接收 `openCodeTodos`，并在消息容器末尾渲染组件。
- 在 `ai-sidebar.svelte` 中将 Todo 参数传给 `MessageList`，不再传给 `ChatComposer`。
- 将 Todo 容器改为 `position: sticky; bottom: 8px; margin-top: auto;`，维持居中与弹层向上展开。

**Step 2: Run test to verify it passes**

Run: `npm run test:regressions`

Expected: PASS。

### Task 3: 版本、图谱、构建与安装

**Files:**
- Modify: `plugin.json`
- Modify: `package.json`
- Update: `graphify-out/*`

**Step 1: Synchronize version**

将两个清单的 patch 版本同步提升至 3.2.10。

**Step 2: Run full verification**

Run: `graphify update . && npm run test:utils && npm run test:regressions && SIYUAN_PLUGIN_DIR=/Users/lance/Documents/Siyuan/data/plugins npm run build`

Expected: 全部命令退出码为 0。

**Step 3: Verify installed version**

读取 `/Users/lance/Documents/Siyuan/data/plugins/siyuan-copilot-opencode/plugin.json`，确认版本为 3.2.10。

**Step 4: Commit**

使用中文标题和摘要提交布局调整与验证结果，不提交用户已有的 `.codex/config.toml`。
