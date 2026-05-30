import { chat, cleanupSession } from "../ai-chat";
import { lsNotebooks, sql } from "../api";
import {
    MEMORY_OVERVIEW_FILENAME,
    createOrUpdateMemoryDoc,
    ensureMemoryBase,
    isMemoryEnabled,
    normalizeMemoryRootPath,
} from "./storage";
import type { MemoryScanOptions, MemoryScanResult } from "./types";

function escapeSql(value: string): string {
    return value.replace(/'/g, "''");
}

function parseModel(modelId?: string): string {
    return String(modelId || "").trim() || "opencode/big-pickle";
}

function formatDateTime(date = new Date()): string {
    return date.toISOString();
}

function clip(text: string, max = 300): string {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

async function collectNotebookDocs(settings: any): Promise<Array<{ notebookId: string; notebookName: string; hpath: string; content: string; updated: string }>> {
    const notebooks = await lsNotebooks();
    const memory = settings.memory || {};
    const memoryNotebookId = String(memory.notebookId || "").trim();
    const memoryRoot = normalizeMemoryRootPath(memory.rootPath);
    const docs: Array<{ notebookId: string; notebookName: string; hpath: string; content: string; updated: string }> = [];

    for (const notebook of notebooks?.notebooks || []) {
        if (notebook.closed) continue;
        const notebookId = String(notebook.id);
        const rows = await sql(`
            SELECT box, hpath, content, updated
            FROM blocks
            WHERE type='d' AND box='${escapeSql(notebookId)}'
            ORDER BY updated DESC
            LIMIT 300
        `);
        for (const row of rows || []) {
            const hpath = String(row.hpath || "");
            if (notebookId === memoryNotebookId && memoryRoot && hpath.includes(memoryRoot)) {
                continue;
            }
            docs.push({
                notebookId,
                notebookName: notebook.name || notebookId,
                hpath,
                content: row.content || "",
                updated: String(row.updated || ""),
            });
        }
    }
    return docs.slice(0, 1200);
}

function buildOverviewPrompt(docs: Awaited<ReturnType<typeof collectNotebookDocs>>): string {
    const grouped = new Map<string, typeof docs>();
    for (const doc of docs) {
        const list = grouped.get(doc.notebookName) || [];
        list.push(doc);
        grouped.set(doc.notebookName, list);
    }

    const inventory = Array.from(grouped.entries())
        .map(([name, items]) => {
            const sample = items
                .slice(0, 80)
                .map(doc => `- ${doc.hpath || doc.content || "未命名"}${doc.content ? `：${clip(doc.content, 120)}` : ""}`)
                .join("\n");
            return `## ${name}（${items.length} 篇）\n${sample}`;
        })
        .join("\n\n");

    return [
        "请根据下面的思源笔记仓库目录和标题片段，为这个用户生成一份 Agent 总览文档。",
        "",
        "要求：",
        "- 使用中文 Markdown。",
        "- 只做高层概括，不要编造具体事实。",
        "- 识别主要主题、长期项目、可能偏好、给 Agent 的协作建议。",
        "- 不要输出隐私敏感原文，不要逐条复述笔记列表。",
        "- 保留这些章节：仓库概况、主要主题、长期项目、可能的长期偏好、给 Agent 的工作建议、扫描信息。",
        "",
        `扫描时间：${formatDateTime()}`,
        `文档数量：${docs.length}`,
        "",
        inventory || "没有可扫描的文档。",
    ].join("\n");
}

function fallbackOverview(docs: Awaited<ReturnType<typeof collectNotebookDocs>>, error?: unknown): string {
    const notebookNames = Array.from(new Set(docs.map(doc => doc.notebookName)));
    return [
        "# Agent 总览",
        "",
        "## 仓库概况",
        `- 扫描文档数：${docs.length}`,
        `- 涉及笔记本：${notebookNames.join("、") || "无"}`,
        "",
        "## 主要主题",
        "- AI 暂时未能完成自动总结，请稍后重试扫描。",
        "",
        "## 给 Agent 的工作建议",
        "- 回答前优先询问用户当前关注的笔记或项目。",
        "",
        "## 扫描信息",
        `- generated-at: ${formatDateTime()}`,
        "- source: 扫描失败后的本地兜底摘要，用户可编辑",
        error ? `- error: ${String((error as Error)?.message || error)}` : "",
        "",
    ].filter(Boolean).join("\n");
}

async function summarizeWithOpenCode(options: MemoryScanOptions, docs: Awaited<ReturnType<typeof collectNotebookDocs>>): Promise<string> {
    let completed = "";
    const serverUrl = options.serverUrl || "http://localhost:4096";
    const result = await chat(
        "opencode",
        {
            apiKey: "",
            model: parseModel(options.modelId),
            messages: [
                {
                    role: "system",
                    content: "你是一个谨慎的知识库分析助手，只基于用户提供的目录和标题片段生成可编辑的 Markdown 总览。",
                },
                { role: "user", content: buildOverviewPrompt(docs) },
            ],
            stream: false,
            signal: options.signal,
            onComplete: text => {
                completed = text;
            },
        },
        serverUrl,
        undefined,
        serverUrl
    );
    if (result.sessionId) {
        await cleanupSession(serverUrl, result.sessionId);
    }
    return completed.trim();
}

export async function scanMemoryOverview(options: MemoryScanOptions): Promise<MemoryScanResult> {
    const { settings, onProgress } = options;
    if (!isMemoryEnabled(settings)) {
        throw new Error("请先启用长期记忆并选择记忆笔记本");
    }

    await ensureMemoryBase(settings);

    onProgress?.({ phase: "collecting", message: "正在收集笔记仓库目录..." });
    const docs = await collectNotebookDocs(settings);
    const scannedNotebookIds = Array.from(new Set(docs.map(doc => doc.notebookId)));

    onProgress?.({
        phase: "summarizing",
        message: `正在总结 ${docs.length} 篇文档...`,
        current: docs.length,
        total: docs.length,
    });

    let markdown: string;
    try {
        markdown = await summarizeWithOpenCode(options, docs);
        if (!markdown.trim()) {
            markdown = fallbackOverview(docs);
        }
    } catch (error) {
        console.warn("[memory] OpenCode overview scan failed:", error);
        markdown = fallbackOverview(docs, error);
    }

    if (!/^#\s+/.test(markdown.trim())) {
        markdown = `# Agent 总览\n\n${markdown.trim()}`;
    }

    onProgress?.({ phase: "writing", message: "正在写入 Agent 总览..." });
    const overviewDocId = await createOrUpdateMemoryDoc(
        settings,
        "overviewDocId",
        MEMORY_OVERVIEW_FILENAME,
        markdown
    );

    settings.pluginData = {
        ...(settings.pluginData || {}),
        memoryOverviewScanState: {
            lastScanAt: Date.now(),
            lastScanDocCount: docs.length,
            lastScanNotebookIds: scannedNotebookIds,
            status: "completed",
        },
    };

    onProgress?.({ phase: "completed", message: "Agent 总览已生成", current: docs.length, total: docs.length });
    return { overviewDocId, markdown, scannedDocCount: docs.length, scannedNotebookIds };
}
