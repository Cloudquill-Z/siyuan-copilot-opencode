# Todo 消息区吸底布局设计

## 目标

将 Todo 进度胶囊从聊天输入区移入消息对话区，使其显示在消息区底部中央、输入区分隔线上方，避免 Todo 出现时把输入区整体撑高。

## 选定方案

采用消息区内吸底布局：`TodoProgress` 由 `MessageList` 渲染，作为消息滚动容器的最后一个元素，通过 sticky 定位吸附在消息区底部。

## 布局与交互

- Todo 位于消息对话区内部，不再属于 `ChatComposer`。
- 胶囊水平居中，距离消息区底部保留少量间距。
- 消息滚动时 Todo 保持在当前消息视口底部；没有 Todo 时不占空间。
- 弹层继续向上展开，悬浮延时、点击锁定、外部点击关闭、Escape 关闭与长文本提示均保持不变。
- Todo 显示时为消息列表增加安全间距，避免最后一条消息被胶囊覆盖。
- 输入区从任务编号标签开始，恢复无 Todo 时的原始高度。

## 代码调整

- `src/components/chat/ChatComposer.svelte`：移除 Todo 组件、类型和属性。
- `src/components/chat/MessageList.svelte`：接收 Todo 数据并在消息容器末尾渲染 `TodoProgress`。
- `src/ai-sidebar.svelte`：将 `openCodeTodos` 从 `ChatComposer` 参数移动到 `MessageList` 参数。
- `src/styles/ai-sidebar.scss`：把 Todo 容器改为消息区 sticky 吸底样式。
- `scripts/test-regressions.ts`：验证组件归属和 sticky 布局，防止以后再次撑高输入区。

## 验收

按照项目约定，Codex 运行自动检查与生产构建，并确认 3.2.8 已安装到指定 SiYuan 插件目录；实际界面位置与交互由用户测试。
