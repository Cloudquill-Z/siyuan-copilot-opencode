# Code Review 2026-05-22

项目：siyuan-copilot-opencode  
评审日期：2026-05-22  
评审范围：全项目源码（src/）

---

## 🔴 Bug 1: `sendMessage` 中 `isLoading` 在多个校验失败路径未重置

**文件**: `src/ai-sidebar.svelte:4032-4076`

```js
isLoading = true;  // line 4032

// line 4049-4053: providerConfig 为 null 时直接 return，isLoading 永远为 true
if (!providerConfig) {
    pushErrMsg(t('aiSidebar.errors.noProvider'));
    return;  // ← isLoading 未重置
}

// line 4055-4058: apiKey 缺失时同样
if (providerRequiresApiKey(currentProvider) && !providerConfig.apiKey) {
    pushErrMsg(t('aiSidebar.errors.noApiKey'));
    return;  // ← isLoading 未重置
}

// line 4060-4064: modelConfig 为 null 时同样
if (!modelConfig) {
    pushErrMsg(t('aiSidebar.errors.noModel'));
    return;  // ← isLoading 未重置
}

// line 4068-4076: customBody JSON 解析失败时同样
catch (e) {
    pushErrMsg('自定义参数 JSON 格式错误');
    return;  // ← isLoading 未重置
}
```

**影响**: 用户遇到这些错误后，输入框永久锁定为加载状态，无法再发送消息。必须切换会话或重载插件才能恢复。

**修复建议**: 每个 `return` 前添加 `isLoading = false;`。

---

## 🔴 Bug 2: `loadAsset` 创建 Blob URL 从不释放 → 内存泄漏

**文件**: `src/utils/assets.ts:71`

```js
export async function loadAsset(path: string): Promise<string | null> {
    const blob = await getFileBlob(path);
    if (!blob) return null;
    return URL.createObjectURL(blob);  // ← 创建了 Blob URL，但从不 revoke
}
```

`ai-sidebar.svelte` 中有 **10 处** 调用 `loadAsset`（行 3487, 3511, 3531, 4414, 5768, 7834, 7887, 9609, 9633, 9653），每次调用都创建一个新的 Blob URL，但没有任何地方调用 `URL.revokeObjectURL()` 来释放。

**影响**: 长时间使用或频繁查看图片时，浏览器内存持续增长。对于大图片或长会话，可能导致页面卡顿甚至崩溃。

**修复建议**: 在组件 `onDestroy` 或图片不再需要时调用 `URL.revokeObjectURL()`；或者改用缓存 Map 管理 Blob URL 生命周期。

---

## 🔴 Bug 3: `ToolCall` 类型从 `ai-chat.ts` 导入但不存在

**文件**: `src/ai-sidebar.svelte:8`

```js
import {
    chat,
    type Message,
    type MessageAttachment,
    type EditOperation,
    type ToolCall,        // ← 这个类型在 ai-chat.ts 中不存在
    ...
} from './ai-chat';
```

`ai-chat.ts` 中没有定义或导出 `ToolCall` 类型。搜索整个 `ai-chat.ts`，`ToolCall` 只在 `onToolCallComplete?: (toolCalls: any[]) => void` 的参数类型中以 `any[]` 形式出现。

**影响**: 由于 `tsconfig.json` 中 `strict: false`，TypeScript 不会报错，但 `ToolCall` 实际是 `any`。代码中大量使用 `toolCall.id`、`toolCall.function.name`、`toolCall.function.arguments` 等属性，没有任何类型保护。传入错误结构的对象不会被编译器捕获。

**修复建议**: 在 `ai-chat.ts` 中定义并导出 `ToolCall` 接口。

---

## 🟡 Bug 4: `getBlockByID` 存在 SQL 注入风险

**文件**: `src/api.ts:424-428`

```js
export async function getBlockByID(blockId: string): Promise<Block> {
    let sqlScript = `select * from blocks where id ='${blockId}'`;
    let data = await sql(sqlScript);
    return data[0];
}
```

`blockId` 直接拼接到 SQL 字符串中。虽然 SiYuan 的 SQL 接口可能有内部防护，但这仍然是不安全的编码实践。如果 `blockId` 包含 `'` 字符，可能导致意外行为。

**影响**: 低概率安全风险，但值得用参数化查询或转义修复。

**修复建议**: 对 `blockId` 进行转义（如 `blockId.replace(/'/g, "''")`），或确认 SiYuan 的 `sql()` 接口是否支持参数化查询。

---

## 🟡 Bug 5: 工具审批使用全局 `window.__toolApprovalResolve` 存在竞态

**文件**: `src/ai-sidebar.svelte:4878-4881`

```js
const approved = await new Promise<boolean>(resolve => {
    (window as any).__toolApprovalResolve = resolve;
});
```

如果同时有多个工具调用需要手动审批（虽然当前 Agent 循环是顺序的，但多模型并行模式下可能出现），后一个 `__toolApprovalResolve` 会覆盖前一个，导致第一个审批永远挂起。

**影响**: 在极端并发场景下，工具审批 Promise 可能永远不会 resolve，导致聊天卡死。

**修复建议**: 使用局部变量或 Map 管理审批 Promise，避免全局单例。

---

## 🟡 Bug 6: `getContentHash` 使用 32 位简单哈希，碰撞概率高

**文件**: `src/ai-sidebar.svelte:310-318`

```js
function getContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString();
}
```

这是 Java 的 `String.hashCode` 算法，只有 32 位。对于长文本（AI 回复通常很长），碰撞概率不可忽略。碰撞会导致不同消息共享同一缓存条目，显示错误的内容。

**影响**: 低概率但可能导致显示混乱——一条消息显示了另一条消息的处理结果。

**修复建议**: 使用更强的哈希算法（如 SHA-256 截断），或直接用内容前 N 个字符 + 长度作为缓存键。

---

## 🟡 Bug 7: `sendMessage` 中重复了 `prepareMessagesForAI` 的逻辑

**文件**: `src/ai-sidebar.svelte:4215-4641` vs `3310-3700`

`sendMessage` 函数内部（4215-4641行）有一大段消息准备逻辑（过滤、map、上下文注入、系统提示词、tool_call 链修复），与 `prepareMessagesForAI` 函数（3310-3700行）**功能高度重复但实现不一致**：

- `sendMessage` 中的版本检查 `isDeepSeekReasonerModel` 和 `isDeepseekThinkingAgent`
- `prepareMessagesForAI` 中的版本检查 `shouldKeepReasoning = thinkingEnabled && userToolCount > 0`
- `sendMessage` 中不处理 `includeHistoricalContext`
- `prepareMessagesForAI` 中处理了 `generatedImages`

**影响**: 维护困难，修一个忘另一个。两个路径行为不一致可能导致相同输入在不同调用路径下产生不同的发送内容。

**修复建议**: 统一使用 `prepareMessagesForAI` 函数，消除重复代码。

---

## 🟡 Bug 8: `saveCurrentSession` 递归调用可能栈溢出

**文件**: `src/ai-sidebar.svelte:7680-7688`

```js
} finally {
    isSavingSession = false;
    if (pendingSaveSilent !== null) {
        const silentToUse = pendingSaveSilent;
        pendingSaveSilent = null;
        await saveCurrentSession(silentToUse);  // ← 递归调用
    }
}
```

如果保存操作很快完成而前端持续触发保存（如流式消息更新时 `hasUnsavedChanges = true`），理论上可能形成深度递归。虽然 `isSavingSession` 标志提供了保护，但在 `finally` 块中先设 `false` 再递归调用，中间有一个短暂窗口。

**影响**: 低概率，但在高频保存场景下可能出现栈溢出。

**修复建议**: 改用 while 循环代替递归：在 `finally` 中检查 `pendingSaveSilent` 并用循环处理，而非递归调用自身。

---

## 🟡 Bug 9: 空的 if-else 块

**文件**: `src/ai-sidebar.svelte:4567-4569`

```js
if (baseSystemPrompt.trim()) {
} else {
}
```

这是一个空的 if-else 块，什么都不做。可能是开发过程中遗留的代码。

**影响**: 无功能影响，但代码可读性差。

**修复建议**: 删除这段死代码。

---

## 🟡 Bug 10: 会话 ID 使用 `Date.now()` 可能冲突

**文件**: `src/ai-sidebar.svelte:4173`

```js
const newSession: ChatSession = {
    id: `session_${Date.now()}`,
    ...
};
```

如果用户快速创建多个会话（自动化脚本或极端手速），`Date.now()` 可能返回相同值，导致 ID 冲突。应使用 `crypto.randomUUID()` 或添加随机后缀。

**影响**: 低概率，但 ID 冲突会导致会话数据覆盖。

**修复建议**: 改为 `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` 或使用 `crypto.randomUUID()`。

---

## 🟢 注意 11: 未使用的导入

**文件**: `src/index.ts`

| 行号 | 导入项 | 状态 |
|------|--------|------|
| 11 | `Protyle` | 未使用 |
| 15 | `ICard` | 未使用 |
| 16 | `ICardData` | 未使用 |
| 19 | `deleteBlock` | 未使用 |
| 19 | `setBlockAttrs` | 未使用 |
| 19 | `getBlockAttrs` | 未使用 |
| 19 | `renderSprig` | 未使用 |
| 19 | `getChildBlocks` | 未使用 |
| 19 | `insertBlock` | 未使用 |
| 19 | `renameDocByID` | 未使用 |
| 19 | `prependBlock` | 未使用 |
| 19 | `updateBlock` | 未使用 |
| 19 | `createDocWithMd` | 未使用 |
| 19 | `getBlockKramdown` | 未使用 |
| 19 | `getBlockDOM` | 未使用 |
| 19 | `readDir` | 未使用 |

---

## 🟢 注意 12: `lsNotebooks` 三元运算符优先级有歧义

**文件**: `src/api.ts:84`

```js
res.notebooks = res.notebooks.filter((n: any) =>
    n.closed === false || n.closed === 0 || n.closed === 'false' ? true : false
);
```

由于 `?:` 优先级低于 `||`，实际解析为 `A || B || (C ? true : false)`。结果恰好正确，但写法令人困惑。

**修复建议**: 改为 `!n.closed` 或 `n.closed === false || n.closed === 0 || n.closed === 'false'`（去掉三元运算符）。

---

## 总结

| 严重度 | 编号 | 问题 | 位置 |
|--------|------|------|------|
| 🔴 高 | 1 | `isLoading` 校验失败路径未重置，UI 永久锁定 | ai-sidebar.svelte:4049-4076 |
| 🔴 高 | 2 | Blob URL 内存泄漏（10 处调用无 revoke） | assets.ts:71 + ai-sidebar.svelte |
| 🔴 高 | 3 | `ToolCall` 类型不存在，实际为 `any` | ai-sidebar.svelte:8 |
| 🟡 中 | 4 | SQL 注入风险 | api.ts:425 |
| 🟡 中 | 5 | 全局 window 属性存储审批 Promise | ai-sidebar.svelte:4880 |
| 🟡 中 | 6 | 32 位哈希碰撞风险 | ai-sidebar.svelte:310-318 |
| 🟡 中 | 7 | 消息准备逻辑重复且不一致 | ai-sidebar.svelte:4215 vs 3310 |
| 🟡 中 | 8 | saveCurrentSession 递归调用 | ai-sidebar.svelte:7686 |
| 🟡 低 | 9 | 空 if-else 块 | ai-sidebar.svelte:4567 |
| 🟡 低 | 10 | 会话 ID 碰撞风险 | ai-sidebar.svelte:4173 |
| 🟢 | 11 | 未使用的导入 | index.ts |
| 🟢 | 12 | 三元运算符优先级歧义 | api.ts:84 |
