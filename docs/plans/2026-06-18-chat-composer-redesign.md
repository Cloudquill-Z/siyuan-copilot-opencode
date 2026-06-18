# Chat Composer Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将聊天输入区改为白色主体、单一“＋”能力菜单和统一状态胶囊，并以克制的绿/红边框区分问答与修订模式。

**Architecture:** 保留现有附件、上下文、提示词、模型和思考设置的数据流，只重组 `ai-sidebar.svelte` 的触发入口与布局。新增纯函数模块负责摘要文案与模式视觉语义，让核心显示规则可通过现有 Node 工具测试验证；Svelte 组件继续作为唯一交互状态来源。

**Tech Stack:** Svelte 4、TypeScript、SCSS、SiYuan `--b3-*` 主题变量、Node `assert` 工具测试、Vite。

---

### Task 1: 输入区摘要规则

**Files:**
- Create: `src/utils/composerControls.ts`
- Modify: `scripts/test-utils.ts`

**Step 1: Write the failing test**

在 `scripts/test-utils.ts` 中导入待新增函数，并断言：`plan` 映射为问答/绿色语义，`build` 映射为修订/红色语义；模型名称为空时使用“选择模型”；思考关闭或不受支持时显示“关闭”；摘要使用 `模式 · 模型 · 思考深度` 格式。

**Step 2: Run test to verify it fails**

Run: `npm run test:utils`

Expected: FAIL，提示无法找到 `src/utils/composerControls.ts`。

**Step 3: Write minimal implementation**

新增无 UI 依赖的 `getComposerModeMeta`、`getThinkingDisplayLabel` 和 `formatComposerStatusSummary`，只处理本次需要的显示规则。

**Step 4: Run test to verify it passes**

Run: `npm run test:utils`

Expected: `Utility tests passed`。

### Task 2: 菜单状态与事件收口

**Files:**
- Modify: `src/ai-sidebar.svelte:324-420`
- Modify: `src/ai-sidebar.svelte:9200-9370`

**Step 1: Add menu state**

新增 `isAddMenuOpen`、`isStatusMenuOpen`，以及互斥开关函数。打开一个菜单时关闭另一个菜单、提示词选择器和 Token 弹层。

**Step 2: Reuse existing actions**

为上传、链接、当前文档、搜索上下文、剪贴板和提示词入口增加轻量包装函数；动作触发后关闭“＋”菜单，不复制现有业务逻辑。

**Step 3: Extend outside-click handling**

让现有 `handleClickOutside` 识别新菜单和触发按钮，同时保留提示词选择器的二级弹出行为。

**Step 4: Verify TypeScript/Svelte compilation**

Run: `npm run build`

Expected: Vite build exits 0 and emits `dist/index.js`、`dist/index.css`、`package.zip`。

### Task 3: 重组输入框标记

**Files:**
- Modify: `src/ai-sidebar.svelte:14388-14728`

**Step 1: Replace scattered toolbar actions**

将多个独立图标按钮替换为单一 44px “＋”按钮和向上弹出的分组菜单。菜单包含上传文件、上传图片、添加链接、添加当前文档、搜索文档/块、剪贴板粘贴、常用提示词。

**Step 2: Merge mode/model/thinking controls**

移除输入框下方独立 `composer-controls`。在输入框底部增加状态胶囊，显示聚合摘要；弹层内按“模式 / 模型 / 思考深度”分组。模型区复用 `MultiModelSelector`，思考区调用现有 `handleThinkingSelectChange`，模式区调用现有模式切换逻辑。

**Step 3: Preserve send/abort semantics**

保留发送、执行中追问、中止三种现有状态，仅为按钮增加模式类名和可访问标签。

**Step 4: Build after markup change**

Run: `npm run build`

Expected: Svelte compilation succeeds without new warnings or errors。

### Task 4: 模式色与响应式样式

**Files:**
- Modify: `src/ai-sidebar.svelte:19636-20410`

**Step 1: Define restrained mode tokens**

在输入框根节点定义问答绿与修订红的边框、光晕和按钮色变量。背景始终使用思源主题背景变量。

**Step 2: Style menus and status capsule**

实现轻边框、适度阴影、分组标题、选中勾选、hover/active/focus/disabled 状态。使用真实 SiYuan SVG symbol 图标，不新增手绘资源。

**Step 3: Update narrow layouts**

在 430px 和 320px 容器断点下压缩摘要、限制弹层宽度并保持 44px 主要触控目标；菜单向上展开且可滚动。

**Step 4: Check stylesheet and build**

Run: `git diff --check && npm run build`

Expected: 无空白错误，生产构建退出 0。

### Task 5: 版本、回归验证与提交

**Files:**
- Modify: `plugin.json`
- Modify: `package.json`
- Update: `graphify-out/*`

**Step 1: Synchronize patch version**

将 `plugin.json` 和 `package.json` patch 版本同步增加一次。

**Step 2: Run complete verification**

Run: `npm run test:utils && npm run build && git diff --check`

Expected: 工具测试通过、生产构建退出 0、无 diff 空白错误。

**Step 3: Update knowledge graph**

Run: `graphify update .`

Expected: 图谱增量更新完成；仅提交本次变更关联的图谱文件。

**Step 4: Review scoped diff**

Run: `git status --short && git diff --stat && git diff -- src/ai-sidebar.svelte src/utils/composerControls.ts scripts/test-utils.ts plugin.json package.json`

Expected: 仅包含输入区改版、测试、版本和图谱更新。

**Step 5: Commit**

```bash
git add src/ai-sidebar.svelte src/utils/composerControls.ts scripts/test-utils.ts plugin.json package.json graphify-out
git commit -m "feat: 重构聊天输入区交互" -m "统一加号菜单与状态胶囊，增加问答/修订模式边框提示。验证：工具测试与生产构建通过。"
```
