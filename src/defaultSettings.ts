import type { ThinkingEffort } from "./ai-chat";

export interface ModelConfig {
    id: string;
    name: string;
    temperature: number;
    maxTokens: number;
    customBody?: string;
    capabilities?: {
        thinking?: boolean;
        vision?: boolean;
        imageGeneration?: boolean;
        toolCalling?: boolean;
        webSearch?: boolean;
    };
    thinkingEnabled?: boolean;
    thinkingEffort?: ThinkingEffort;
    webSearchEnabled?: boolean;
    webSearchMaxUses?: number;
    hidden?: boolean;
};

export interface ProviderConfig {
    serverUrl?: string;
    models: ModelConfig[];
    customApiUrl?: string;
    apiKey?: string;
    advancedConfig?: {
        customModelsUrl?: string;
        customChatUrl?: string;
    };
}

export const DEFAULT_AI_SYSTEM_PROMPT = [
    '你是一个思源笔记操作小助手。任何思源笔记读取、搜索、编辑、整理任务都必须使用 siyuan-sisyphus CLI，不要直接读取本地工作区、.sy 文件、data/storage 或笔记本目录来检查笔记内容。',
    '执行思源任务前先安装或检查 skill：siyuan-sisyphus skill install。搜索/SQL 先看 siyuan-sisyphus-search-query；读取内容先看 siyuan-sisyphus-browse-read；创建/编辑/替换/删除先看 siyuan-sisyphus-create-edit，排版再看 siyuan-markup-guide。',
    '命令失败后不要平铺式重复同一种失败命令。遇到 Unknown action、validation_error、Unknown flag 或参数错误，只允许失败一次；随后必须先读错误、运行 siyuan-sisyphus help <tool> [action] 或查看对应 skill，再继续。',
    '已知坑：siyuan-sisyphus block get 不是有效动作，应使用 block get_kramdown、block dom、block info 或 block get_children；复杂对象参数优先使用 --edit-json 等 JSON flag，不要反复尝试 shell 转义。',
    '修改思源内容前，先列一个简短证据表：目标 ID、观察到的问题、旧片段、新片段、准备执行的命令、验证方法。先在一个代表块上试成功，再批量应用到其他同类块，最后用 siyuan-sisyphus 验证。',
].join('\n');

export const getDefaultSettings = () => ({
    settingsVersion: 2,
    migrationVersion: 1,

    // AI 设置 - OpenCode
    aiProviders: {
        opencode: {
            serverUrl: 'http://localhost:4096',
            models: [],
        } as {
            serverUrl: string;
            models: ModelConfig[];
        },
        providerOrder: ['opencode'] as string[]
    } as Record<string, any>,
    selectedProviderId: 'opencode' as string,
    currentProvider: 'opencode' as string,
    currentModelId: '' as string,
    aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,

    // 操作设置
    userName: '' as string, // 聊天消息中显示的用户名称
    sendMessageShortcut: 'ctrl+enter' as 'ctrl+enter' | 'enter', // 发送消息的快捷键
    executionMessageMode: 'guide' as 'guide' | 'queue', // 执行中发送消息的处理方式
    maxConcurrentTasks: 2 as number, // 最大并行任务数
    diagnosticLogMode: 'off' as 'off' | 'next' | 'always', // OpenCode 诊断日志模式
    diagnosticLogLevel: 'safe' as 'safe' | 'full', // OpenCode 诊断日志详细程度
    diagnosticLastLogPath: '' as string, // 最近一次诊断日志路径
    // 搜索引擎选择，支持 'google' 或 'bing'
    searchEngine: 'google' as 'google' | 'bing',

    // 显示设置
    messageFontSize: 14 as number, // 消息字体大小
    multiModelViewMode: 'tab' as 'tab' | 'card', // 多模型回答样式：tab (页签视图) | card (卡片视图)

    // 多模型设置
    selectedMultiModels: [] as Array<{ provider: string; modelId: string }>, // 选中的多模型列表

    // 模型预设设置
    modelPresets: [] as Array<{
        id: string;
        name: string;
        contextCount: number;
        temperature: number;
        systemPrompt: string;
        createdAt: number;
    }>,
    selectedModelPresetId: '' as string,

    // 笔记导出设置
    exportNotebook: '' as string,  // 导出笔记本ID
    exportDefaultPath: '' as string,  // 全局保存文档位置（支持sprig语法）
    exportLastPath: '' as string,  // 上次保存的路径
    exportLastNotebook: '' as string,  // 上次保存的笔记本ID

    // 会话自动重命名设置
    autoRenameSession: false as boolean,  // 是否启用会话自动重命名
    autoRenameProvider: '' as string,  // 自动重命名使用的平台
    autoRenameModelId: '' as string,  // 自动重命名使用的模型ID
    autoRenamePrompt: '请根据以下用户消息生成一个简洁的会话标题（不超过20个字，不要使用引号，标题前添加一个合适的emoji）：\n\n{message}' as string,  // 自动重命名提示词模板

    lastUsedChatMode: 'plan' as 'plan' | 'build', // 上次使用的对话模式

    // 小程序设置
    webApps: [
        {
            "id": "builtin-achuan",
            "name": "A API",
            "url": "https://gpt.achuan-2.top/register?aff=ZndO",
            "createdAt": 1770447043461,
            "updatedAt": 1770449770236,        },
        {
            "id": "mlc05nrijzlaxnvmkr8",
            "name": "NotebookLM",
            "url": "https://notebooklm.google.com/",            "createdAt": 1770449897358,
            "updatedAt": 1770449897358
        },
        {
            "id": "builtin-gemini",
            "name": "Gemini",
            "url": "https://gemini.google.com/",
            "createdAt": 1770447043461,
            "updatedAt": 1770449814115,        },
        {
            "id": "builtin-doubao",
            "name": "豆包",
            "url": "https://www.doubao.com/chat/",
            "createdAt": 1770447043461,
            "updatedAt": 1770449428136,        },
        {
            "id": "builtin-deepseek",
            "name": "DeepSeek",
            "url": "https://chat.deepseek.com/",
            "createdAt": 1770447043461,
            "updatedAt": 1770449454411,        },
        {
            "id": "builtin-kimi",
            "name": "Kimi",
            "url": "https://www.kimi.com/",
            "createdAt": 1770447043461,
            "updatedAt": 1770449441326,        },
        {
            "id": "mlc104axkiphy5u0r3",
            "name": "Qwen",
            "url": "https://chat.qwen.ai/",            "createdAt": 1770451318473,
            "updatedAt": 1770451318473
        }
    ] as Array<{
        id: string;
        name: string;
        url: string;
        icon?: string; // icon 文件名（存储在 data/storage/petal/siyuan-copilot-opencode/webappIcon/ 下）
        createdAt: number;
        updatedAt: number;
    }>,

    // WebApp 相关设置
    openLinksInWebView: false, // 是否在 webview 中打开外部链接

    // Python 解释器路径设置
    pythonPath: '' as string,  // Python 可执行文件路径，用于运行 Python 代码

    // SOUL 文档设置
    soulDocId: '' as string,  // SOUL 数据存储的文档ID

    pluginData: {
        legacyImportCompleted: true,
        sessionStorageMigrated: true,
        modelCapabilitiesInitialized: true,
        tokenUsageRecords: [] as any[],
    },

});
