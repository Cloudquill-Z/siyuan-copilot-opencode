import { MEMORY_CORE_FILENAME, MEMORY_OVERVIEW_FILENAME, memoryPath } from "./storage";

export function isMemoryDreamCommand(input: string): boolean {
    const normalized = String(input || "").trim().toLowerCase();
    return normalized === "/dream" || normalized.startsWith("/dream ");
}

export function buildMemoryDreamPrompt(settings: any): string {
    const memory = settings.memory || {};
    const memoryNotebookId = String(memory.notebookId || "").trim();
    const rootPath = String(memory.rootPath || "AI记忆").trim() || "AI记忆";
    const overviewDocId = String(memory.overviewDocId || "").trim();
    const coreDocId = String(settings.soulDocId || memory.coreDocId || "").trim();

    return [
        "你正在执行 SiYuan Copilot 的 /dream 记忆整理任务。请整理这个用户已有的长期记忆，让记忆变得更少、更准、更有纲领。",
        "",
        "任务目标：",
        "- 扫描记忆目录中的情景记忆，识别过时、重复、低价值或相互冲突的记忆。",
        "- 删除明显过时或低价值的情景记忆。",
        "- 合并相似情景记忆，把重复事实沉淀成更稳定的总结。",
        "- 将稳定偏好、长期项目、协作约定和反复出现的主题更新到核心档案或 Agent 总览。",
        "- 最后在当前对话中汇报删除、合并、沉淀了什么，以及哪些内容需要用户确认。",
        "",
        "记忆位置：",
        `- 记忆笔记本 ID：${memoryNotebookId}`,
        `- 记忆根目录：${rootPath}`,
        `- 情景记忆目录：${memoryPath(settings, "02-情景记忆")}`,
        `- Agent 总览路径：${memoryPath(settings, MEMORY_OVERVIEW_FILENAME)}`,
        `- 核心档案路径：${memoryPath(settings, MEMORY_CORE_FILENAME)}`,
        overviewDocId ? `- Agent 总览文档块 ID：${overviewDocId}` : "- Agent 总览文档块 ID：未设置",
        coreDocId ? `- 核心档案/Soul 文档块 ID：${coreDocId}` : "- 核心档案/Soul 文档块 ID：未设置",
        "",
        "整理规则：",
        "- 优先使用本环境可用的 SiYuan 工具或 CLI（例如 siyuan-sisyphus）读取、更新、删除记忆文档。",
        "- 高置信度的重复、过时、低价值情景记忆可以直接删除或合并；不确定的内容不要删除，列入“需要确认”。",
        "- 不要处理记忆目录之外的用户原始笔记。",
        "- 不要编造不存在的记忆；如果工具不可用，请停止并说明阻塞点。",
        "- 保留有明确长期价值的用户偏好、项目约束、决策、待办线索和协作习惯。",
        "- 合并后尽量减少碎片文件，让情景记忆只保留近期或难以归纳的具体上下文。",
        "",
        "建议步骤：",
        "1. 列出记忆根目录，重点读取 02-情景记忆 下的文档及其 front matter。",
        "2. 按主题、项目、时间和 importance 分组，找出重复、冲突、过时、低价值条目。",
        "3. 对高置信度重复内容，创建或更新合并后的记忆文档，再删除被合并的旧文档。",
        "4. 将稳定结论更新到核心档案或 Agent 总览；保持中文 Markdown，结构清晰，避免冗长。",
        "5. 输出整理报告：读取数量、删除数量、合并数量、沉淀到纲领的要点、需要用户确认的疑点。",
    ].join("\n");
}
