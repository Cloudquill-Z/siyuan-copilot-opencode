# OpenCode Todo 进度展示设计

## 目标

在聊天消息列表下方、任务编号标签上方增加一个紧凑的 Todo 进度胶囊。它读取 OpenCode 原生 Todo 状态，实时显示总项目数与已完成项目数，并通过悬浮或点击展开具体清单。

## 数据来源

采用 OpenCode 原生 `todo.updated` 事件，不解析回复文本，也不依赖 `todowrite` 工具调用参数。事件包含 `sessionID` 和完整 Todo 列表，可以稳定支持增删、状态变化与并发任务隔离。

Todo 状态支持：

- `pending`：尚未开始
- `in_progress`：正在进行
- `completed`：已经完成
- `cancelled`：已经取消

完成进度只统计 `completed`，取消项目仍计入总数，但不计入完成数。

## 交互设计

### 进度胶囊

- 仅在当前任务存在 Todo 时显示；空列表不占据布局空间。
- 文案采用 `Todo 2/5`，清晰表达已完成数与总数。
- 胶囊位于输入区顶部、任务编号标签上方，跟随输入区固定，不随消息列表滚动。
- 视觉沿用 SiYuan 主题变量、现有圆角、边框和主色，同时兼容明暗主题。

### Todo 弹层

- 鼠标进入胶囊约 150ms 后展开，避免经过时误触。
- 点击胶囊可锁定弹层；再次点击、点击外部或按 `Escape` 关闭。
- 鼠标可以从胶囊移动到弹层，二者视为同一个悬浮区域，避免弹层闪退。
- 弹层逐行展示 Todo 状态图标与名称，单行截断，不主动换行。
- 鼠标停留在具体行时显示完整内容提示。
- 弹层限制最大宽度与高度；项目过多时内部滚动，窄侧栏下不超出可视区域。

## 状态与生命周期

- Provider 将 `todo.updated` 事件转换为 `onTodoUpdated(sessionID, todos)` 回调。
- 每个聊天任务维护自己的 Todo 列表，通过 OpenCode `sessionID` 将事件路由到对应任务。
- 切换任务编号标签时，界面展示该任务自己的 Todo，不与其他任务串联。
- 新一轮消息发送前清空该任务旧 Todo，防止旧计划在新请求期间误导用户。
- 请求结束后保留最终 Todo 清单，直到该任务再次发送消息、被关闭或插件卸载。
- 第一版不将 Todo 写入聊天记录或持久化存储；重新加载历史会话后不展示旧 Todo。

## 代码结构

- `src/providers/opencode-provider.ts`：识别 `todo.updated`，增加 Todo 类型和回调。
- `src/chat/todo-state.ts`：集中放置 Todo 规范化、进度统计等纯函数，便于独立验证。
- `src/task-types.ts` 与 `src/ai-sidebar.svelte`：把 Todo 纳入前台与后台任务运行状态，并按会话路由更新。
- `src/components/chat/TodoProgress.svelte`：负责胶囊、弹层、行级截断和交互状态。
- `src/components/chat/ChatComposer.svelte`：在任务编号标签上方挂载 Todo 组件。
- `src/styles/ai-sidebar.scss`：提供与现有输入区一致的主题化样式和窄屏适配。

## 容错策略

- 忽略缺少 `sessionID` 的 Todo 事件，避免错误归属。
- 对未知状态降级为 `pending`，对空内容使用简短占位文本。
- 收到空 Todo 数组时清空对应任务的显示。
- 重复事件用完整列表覆盖，保持 OpenCode 服务端为唯一事实来源。

## 验证范围

- 纯函数验证：状态规范化、完成数、空列表、取消状态、未知状态。
- Provider 验证：只转发目标会话的 `todo.updated`，且不影响文本、思考和工具事件。
- 运行时验证：前台任务与后台任务分别更新，切换后互不串状态。
- 界面验证：悬浮延时、点击锁定、点击外部、Escape、单行截断、完整内容提示、长列表滚动。
- 视觉验证：侧栏与全屏模式、明暗主题、窄宽度布局。
- 工程验证：生产构建成功，Graphify 知识图谱同步更新。
