import { MEMORY_OVERVIEW_FILENAME, buildDefaultOverview, ensureMemoryDoc, memoryPath } from "./storage";

export function isMemoryInitCommand(input: string): boolean {
    const normalized = String(input || "").trim().toLowerCase();
    return normalized === "/init" || normalized.startsWith("/init ");
}

export async function ensureMemoryOverviewTarget(settings: any): Promise<string> {
    return ensureMemoryDoc(
        settings,
        "overviewDocId",
        MEMORY_OVERVIEW_FILENAME,
        buildDefaultOverview()
    );
}

export function buildMemoryInitPrompt(settings: any, overviewDocId: string): string {
    const memory = settings.memory || {};
    const memoryNotebookId = String(memory.notebookId || "").trim();
    const rootPath = String(memory.rootPath || "AI记忆").trim() || "AI记忆";
    const overviewPath = memoryPath(settings, MEMORY_OVERVIEW_FILENAME);
    const coreDocId = String(settings.soulDocId || memory.coreDocId || "").trim();

    return [
        "你正在执行 SiYuan Copilot 的记忆系统初始化任务。请真实探索这个用户的思源笔记仓库，并把结果写入 Agent 总览文档。",
        "",
        "重要约束：",
        "- 这是一次真正的仓库扫描任务，不要只创建空文档，不要只根据这条消息做泛泛总结。",
        "- 需要主动读取思源笔记的笔记本、文档树、标签、近期文档和代表性正文片段。",
        "- 优先使用本环境可用的 SiYuan 工具或 CLI（例如 siyuan-sisyphus）。如果工具不可用，请说明阻塞点，不要编造扫描结果。",
        "- 扫描时跳过记忆笔记本中的记忆目录，避免把生成的记忆文件再当成用户原始笔记。",
        "- 只写高层结构和协作建议，不要泄露大量原文，不要逐条搬运隐私内容。",
        "",
        "记忆目标：",
        `- 记忆笔记本 ID：${memoryNotebookId}`,
        `- 记忆目录：${rootPath}`,
        `- Agent 总览文档路径：${overviewPath}`,
        `- Agent 总览文档块 ID：${overviewDocId}`,
        coreDocId ? `- 核心档案/Soul 文档块 ID：${coreDocId}` : "- 核心档案/Soul 文档块 ID：未设置",
        "",
        "建议执行步骤：",
        "1. 列出所有已打开笔记本和顶层文档树，识别主要区域、长期项目和知识主题。",
        "2. 对每个主要区域抽样读取代表性文档，结合标题、路径、标签、更新时间、引用关系和少量正文片段形成判断。",
        "3. 如果发现日记、项目、读书、研究、工作流等稳定结构，请总结它们的组织方式和给 Agent 的协作入口。",
        "4. 更新 Agent 总览文档，使用中文 Markdown，保留并填充这些章节：仓库概况、主要主题、长期项目、知识组织方式、可能的长期偏好、给 Agent 的工作建议、扫描信息。",
        "5. 扫描信息中写明扫描时间、覆盖的笔记本数量、代表性文档数量、跳过的范围，以及任何无法访问的限制。",
        "",
        "完成后，请在当前对话里简短汇报：已经写入哪个文档、扫描覆盖范围、最重要的 3-5 个发现、后续是否需要用户确认。",
    ].join("\n");
}
