## Unreleased
- 📝 更新 `README.md`、`README_en_US.md` 与 `README_zh_CN.md`，统一为独立 OpenCode 插件说明
- 📝 补充当前功能、安装方式、开发命令、已知说明与 OpenCode 连接能力文档

## v2.0.0 / 20260524
- ✨ Plan/Build 模式切换重构为单个 toggle 开关，带滑动动画
- 🎨 思考/工具折叠状态管理重构，提取统一 `toggleThinkingCollapsed`/`isThinkingCollapsed` 函数
- 🎨 移除会话固定按钮、工具调用次数徽标、提示词文字标签
- 🎨 调试日志全面清理：`console.log` 替换为带开关控制的 `debugSidebar`/`debugRunner`/`debugOpenCode` 函数
- 🔥 `graphify-out` 加入 `.gitignore`

## v1.2.1 / 20260523
- ✨ 实时流稳定性提升：EventStream 断线重连、超时保护
- ✨ 聊天 UI 全新设计，对齐 OpenCode 视觉风格
- 🎨 移除 WebApp Manager，简化标签页管理
- 🐛 修复 OpenCode 工具任务超时不响应的问题
- 🐛 修复提问对话框在侧边栏中的位置问题
- 🎨 实时思考/工具执行流支持时间线分组显示

## v1.2.0 / 20260515
- ✨ 实时事件流重构：EventStream 客户端支持 Tool/Thinking/Permission/Question 实时推送
- ✨ 异步提示模式：支持自定义 API URL，灵活对接不同 OpenCode 端点
- ✨ WebApp 增强：嵌入式浏览器标签页（Electron `<webview>` / fallback `<iframe>`）
- ✨ WebApp 功能：地址栏、历史搜索、收藏夹图标自动获取
- 🎨 工具调用卡片：pending → running → completed 三种状态流转
- 🎨 思考折叠区支持增量流式输出
- 🐛 修复 OpenCode 工具任务超时后连接卡死
- 🐛 修复 Session 切换时的竞态条件

## v1.1.0 / 20260513
- ✨ 全新 UI 设计：Dark Mode OLED 深黑主题，Inter 字体，消息气泡/输入区/会话列表全面重制
- ✨ 连接状态指示器：健康轮询 + ConnectionStatus 组件，已连接/断连状态实时显示
- ✨ 多任务会话管理：每会话独立 AbortController，切换不中断，后台继续生成
- ✨ SSE/Tool/Thinking 实时展示：工具调用卡片（pending→running→completed 状态流），思考折叠区增量输出
- ✨ OpenCode 指令系统：输入 `/` 触发命令补全（init/still/undo/redo/compact/connect/share）
- ✨ OpenCode 品牌标识：聊天栏/设置页/AI 消息头像使用 OpenCode logo
- 🎨 思考强度精确匹配：从模型元数据读取 `enableThinking`/`reasoningEffort`，动态调整选项范围
- 🎨 SSE 流式模式下直接用增量 delta，仅 JSON 回退模式保留分块逻辑
- 🎨 设置页新增连接状态展示 + 一键重连按钮
- 🔥 移除多模型同时询问，简化消息处理链路
- 🐛 修复 Electron 环境 opener URL 未正确传递的问题
- 🐛 修复 Auto-start 逻辑中的竞态条件
- 🐛 修复思考强度传参 `&&` 双重门控逻辑
- 🐛 修复模型默认值使用 OpenCode 返回的默认 `reasoningEffort`

## v1.0.1 / 20260511
- 🎨 macOS 兼容优化：提取 `getIsWin()` 公共函数，新增 `expandPathForMacOS()` 自动扩展 PATH 以查找 opencode CLI（支持 `~/.opencode/bin`、`/opt/homebrew/bin` 等路径）

## v1.0.0 / 20260509
- ✨ 模式选择改为 Plan / Build，对应 OpenCode 模式，可通过 API 传递 `mode` 参数
- 🐛 修复模型显示问题：自动获取模型时同步设置 `currentProvider`
- 🐛 修复 SOUL 文档加载：替换桩代码为真实实现，通过 `exportMdContent` 读取文档
- 🐛 修复无法拖入块作为上下文：`dataTransfer.types` 添加空值保护
- 🐛 修复思考强度无法选择：从 OpenCode `/provider` 接口提取 `enableThinking`/`reasoningEffort`
- 🐛 修复思考强度选择器不显示：移除 Gemini/Claude 门控，OpenCode 原生支持所有模型的 `reasoningEffort`
- 🐛 修复插件启动时自动获取模型覆盖用户设置：改用合并逻辑保留 `hidden`/`temperature` 等配置
- 🐛 修复已有模型缺失 capabilities：`onMount` 时自动补充

## v0.0.2 / 20260508
- 🐛 修复模型显示问题：自动获取模型时同步设置 `currentProvider`
- 🐛 修复 SOUL 文档加载：替换桩代码为真实实现，通过 `exportMdContent` 读取文档
- 🐛 修复无法拖入块作为上下文：`dataTransfer.types` 添加空值保护
- 🐛 修复思考强度无法选择：从 OpenCode `/provider` 接口提取 `enableThinking`/`reasoningEffort`，移除 Gemini/Claude 门控

## v0.0.1 / 20260504
- 🏗️ 重构为独立 OpenCode 插件，移除所有其他 Provider（Achuan、gemini、deepseek、openai、moonshot、volcano）
- 🔥 移除 Agent 模式和工具系统
- 🐛 修复 serverUrl 配置被忽略的 bug
- 🐛 修复多轮对话上下文丢失问题
- ✨ 新增 SSE 流式响应支持
- ✨ 新增 Session 复用和自动清理
- 🎨 UI 配色重构，采用 OpenCode 品牌风格
- 📝 更新 README 和 i18n
