# 对话框边框、侧栏恢复与导出署名修复实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让暗色模式边框完整、插件重启后侧栏自动恢复，并让下载会话使用最新自定义用户名。

**Architecture:** 以轻量纯函数表达 Dock 恢复状态，生命周期代码只负责调度；CSS 伪元素单独绘制状态边框；导出前刷新持久化设置。使用 Node 内置测试执行回归用例。

**Tech Stack:** Svelte 4、TypeScript、SCSS、Node.js test runner、Vite。

---

### Task 1: 建立回归用例

**Files:**
- Create: `scripts/test-regressions.ts`
- Modify: `package.json`

1. 为 Dock 面板未就绪时必须继续等待、用户名优先使用配置值、边框伪元素规则存在编写测试。
2. 运行测试，确认测试因当前实现缺失而失败。

### Task 2: 修复三项根因

**Files:**
- Modify: `src/styles/ai-sidebar.scss`
- Modify: `src/index.ts`
- Modify: `src/utils/sessionExport.ts`
- Modify: `src/ai-sidebar.svelte`

1. 为输入框添加不影响弹出层的完整圆角边框绘制层。
2. 将 Dock 恢复状态判定提取为纯函数，并让重试等待实际 DOM 就绪。
3. 导出文件前读取最新设置，并统一通过用户名解析函数生成标题。
4. 运行回归用例，确认全部通过。

### Task 3: 验证与交付

**Files:**
- Modify: `package.json`
- Modify: `plugin.json`
- Update: `graphify-out/`

1. 同步提升 patch 版本号。
2. 执行生产构建。
3. 执行 `graphify update .`。
4. 检查工作区差异并用中文提交修改和验证结果。
