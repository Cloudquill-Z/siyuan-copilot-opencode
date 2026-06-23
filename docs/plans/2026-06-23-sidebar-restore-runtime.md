# 侧栏恢复与任务耗时统计实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让重启后已打开的 AI 侧栏稳定恢复内容，并在任务运行时显示实时耗时。

**Architecture:** Dock 恢复逻辑使用纯函数描述可重挂载状态，入口文件只负责读取真实 Dock model 并执行幂等挂载。任务耗时作为任务运行态时间戳保存，组件用单个当前时间刷新值派生显示。

**Tech Stack:** Svelte 4、TypeScript、SiYuan Plugin API、Node.js regression scripts、Vite。

---

### Task 1: 写失败的回归检查

**Files:**
- Modify: `scripts/test-regressions.ts`

**Steps:**
1. 增加 Dock 空面板恢复判定测试。
2. 增加任务耗时格式化与开始/结束时间流转测试。
3. 运行 `npm run test:regressions`，确认旧实现失败。

### Task 2: 实现 Dock 恢复修复

**Files:**
- Modify: `src/utils/dockRestore.ts`
- Modify: `src/index.ts`
- Modify: `src/ai-sidebar.svelte`

**Steps:**
1. 扩展 Dock 恢复状态与决策函数。
2. 在入口中使用真实 Dock model 和幂等挂载函数补挂载空面板。
3. 给 `AISidebar` 根节点增加稳定标记。
4. 运行回归检查确认相关测试通过。

### Task 3: 实现任务耗时统计

**Files:**
- Modify: `src/task-types.ts`
- Modify: `src/ai-sidebar.svelte`
- Modify: `src/components/chat/MessageList.svelte`
- Modify: `src/components/SessionManager.svelte`
- Modify: `src/components/chat/TaskToolbar.svelte`

**Steps:**
1. 增加运行态时间戳与纯函数。
2. 在发送、完成、失败、中断路径写入开始/结束时间。
3. 在流式消息头和任务列表中显示耗时。
4. 运行工具测试和回归检查。

### Task 4: 最终验证与交付

**Files:**
- Modify: `plugin.json`
- Modify: `package.json`
- Update: `graphify-out/`

**Steps:**
1. 同步提升 patch 版本。
2. 执行生产构建并安装。
3. 执行 `graphify update .`。
4. 检查差异并中文提交。
