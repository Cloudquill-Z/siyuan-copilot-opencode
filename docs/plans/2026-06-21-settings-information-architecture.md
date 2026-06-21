# Settings Information Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将设置页重构为五个按用户任务组织的一级页面，并用渐进展开表达功能依赖。

**Architecture:** 保留当前设置对象和持久化流程，在 `SettingsPanel.svelte` 中引入稳定的页面标识与页面元数据，将现有控件移动到对应页面。通过条件渲染显示自动命名、长期记忆和诊断日志的依赖项，Token 统计与恢复默认设置合并到诊断维护页。

**Tech Stack:** Svelte、TypeScript、SCSS、SiYuan B3 组件、Node 回归脚本。

---

### Task 1: 固化五页导航契约

**Files:**
- Modify: `scripts/test-regressions.ts`
- Modify: `src/SettingsPanel.svelte`

**Step 1:** 在回归脚本中断言五个稳定页面标识存在，旧的八组同级导航不再作为页面来源。

**Step 2:** 运行 `npm run test:regressions`，确认测试因新页面结构尚不存在而失败。

**Step 3:** 在设置组件中新增五页元数据和稳定页面标识，替代以翻译文本作为状态键的导航。

**Step 4:** 再次运行回归测试，确认导航契约通过。

### Task 2: 重排功能并实现依赖展开

**Files:**
- Modify: `src/SettingsPanel.svelte`
- Modify: `scripts/test-regressions.ts`

**Step 1:** 添加断言，覆盖系统提示词归入对话体验、自动命名与导出归入自动化、记忆独立、Token 与重置归入诊断维护。

**Step 2:** 运行回归测试，确认旧结构无法满足断言。

**Step 3:** 重排现有控件；为自动命名、记忆和诊断日志加入条件内容。

**Step 4:** 运行回归测试并修复结构问题。

### Task 3: 完成样式、构建与应用验收

**Files:**
- Modify: `src/SettingsPanel.svelte`
- Modify: `plugin.json`
- Modify: `package.json`

**Step 1:** 补充功能区标题、提示区与危险区域样式，继续使用思源主题变量和现有响应式布局。

**Step 2:** 同步升级两个版本文件的 patch 版本。

**Step 3:** 运行 `git diff --check`、`npm run test:regressions`、`npm run test:utils` 和 `npm run build`。

**Step 4:** 重载思源插件，检查五页导航、设置回显、依赖展开和侧边栏存续。

**Step 5:** 运行 `graphify update .` 并提交中文 Git 记录。
