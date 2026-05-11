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