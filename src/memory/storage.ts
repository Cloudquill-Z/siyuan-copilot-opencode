import { createDocWithMd, exportMdContent, getBlockByID, updateBlock } from "../api";
import type { MemorySettings } from "./types";

export const DEFAULT_MEMORY_ROOT_PATH = "AI记忆";
export const MEMORY_OVERVIEW_FILENAME = "00-Agent总览";
export const MEMORY_CORE_FILENAME = "01-核心档案";

export function normalizeMemoryRootPath(rootPath?: string): string {
    return String(rootPath || DEFAULT_MEMORY_ROOT_PATH)
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

export function memoryPath(settings: { memory?: Partial<MemorySettings> }, name: string): string {
    const rootPath = normalizeMemoryRootPath(settings.memory?.rootPath);
    return rootPath ? `${rootPath}/${name}` : name;
}

export function isMemoryEnabled(settings: any): boolean {
    return !!settings?.memory?.enabled && !!settings?.memory?.notebookId;
}

export async function readDocMarkdown(docId?: string): Promise<string> {
    const id = String(docId || "").trim();
    if (!id) return "";
    try {
        const result = await exportMdContent(id, false, false, 2, 0, false);
        return result?.content || "";
    } catch (error) {
        console.warn("[memory] read doc failed:", error);
        return "";
    }
}

export async function ensureMemoryDoc(
    settings: any,
    key: "overviewDocId" | "coreDocId",
    filename: string,
    markdown: string
): Promise<string> {
    const memory = settings.memory || {};
    const notebookId = String(memory.notebookId || "").trim();
    if (!notebookId) {
        throw new Error("未选择记忆笔记本");
    }

    const existingId = String(memory[key] || "").trim();
    if (existingId) {
        try {
            const block = await getBlockByID(existingId);
            if (block?.id) return existingId;
        } catch {
            // Recreate below when the stored document id is stale.
        }
    }

    const docId = await createDocWithMd(notebookId, memoryPath(settings, filename), markdown);
    settings.memory = { ...memory, [key]: docId };
    return docId;
}

export async function createOrUpdateMemoryDoc(
    settings: any,
    key: "overviewDocId" | "coreDocId",
    filename: string,
    markdown: string
): Promise<string> {
    const memory = settings.memory || {};
    const existingId = String(memory[key] || "").trim();
    if (existingId) {
        try {
            const block = await getBlockByID(existingId);
            if (block?.id) {
                await updateBlock("markdown", markdown, existingId);
                return existingId;
            }
        } catch (error) {
            console.warn("[memory] update existing memory doc failed, recreating:", error);
        }
    }

    const docId = await createDocWithMd(
        String(memory.notebookId || "").trim(),
        memoryPath(settings, filename),
        markdown
    );
    settings.memory = { ...memory, [key]: docId };
    return docId;
}

export function buildDefaultCoreProfile(): string {
    return [
        "# Agent 核心档案",
        "",
        "## 用户偏好",
        "- ",
        "",
        "## 当前长期项目",
        "- ",
        "",
        "## 沟通约定",
        "- ",
        "",
        "## 成长记录",
        `- ${new Date().toISOString().slice(0, 10)}：初始化记忆系统。`,
        "",
    ].join("\n");
}

export function buildDefaultOverview(): string {
    return [
        "# Agent 总览",
        "",
        "## 仓库概况",
        "- 尚未扫描。请在聊天中发送 `/init`，让 OpenCode 探索思源笔记仓库后填充本页。",
        "",
        "## 主要主题",
        "- ",
        "",
        "## 给 Agent 的工作建议",
        "- ",
        "",
        "## 扫描信息",
        "- generated-at: 尚未生成",
        "- source: 用户可编辑",
        "",
    ].join("\n");
}

export async function ensureMemoryBase(settings: any): Promise<void> {
    if (!isMemoryEnabled(settings)) return;
    if (!String(settings.soulDocId || "").trim()) {
        await ensureMemoryDoc(settings, "coreDocId", MEMORY_CORE_FILENAME, buildDefaultCoreProfile());
    }
}
