import { sql } from "../api";
import {
    MEMORY_CORE_FILENAME,
    MEMORY_OVERVIEW_FILENAME,
    isMemoryEnabled,
    readDocMarkdown,
} from "./storage";
import type { MemoryContext, MemoryContextItem, MemoryPromptOptions } from "./types";

function clip(text: string, maxChars: number): string {
    const normalized = String(text || "").trim();
    if (!maxChars || normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars).trim()}\n\n...`;
}

function escapeSql(value: string): string {
    return value.replace(/'/g, "''");
}

function extractKeywords(query: string): string[] {
    const text = String(query || "").toLowerCase();
    const tokens = new Set<string>();
    for (const match of text.matchAll(/[a-z0-9_./-]{3,}/gi)) {
        tokens.add(match[0]);
    }
    for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
        tokens.add(match[0]);
    }
    return Array.from(tokens).slice(0, 8);
}

function isInMemoryPath(hpath: string, rootPath: string, subdir: string): boolean {
    const path = String(hpath || "").replace(/^\/+/, "");
    const root = String(rootPath || "").replace(/^\/+|\/+$/g, "");
    const needle = root ? `${root}/${subdir}` : subdir;
    return path.includes(needle);
}

async function queryMemoryDocs(settings: any, query: string, subdir: string, limit: number): Promise<MemoryContextItem[]> {
    const memory = settings.memory || {};
    const notebookId = String(memory.notebookId || "").trim();
    if (!notebookId || limit <= 0) return [];

    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const contentFilter = keywords
        .map(keyword => `content LIKE '%${escapeSql(keyword)}%'`)
        .join(" OR ");
    const rootPath = String(memory.rootPath || "").replace(/^\/+|\/+$/g, "");
    const hpathFilter = rootPath
        ? ` AND hpath LIKE '%${escapeSql(rootPath)}%${escapeSql(subdir)}%'`
        : ` AND hpath LIKE '%${escapeSql(subdir)}%'`;

    const stmt = `
        SELECT root_id as id, hpath, content, updated
        FROM blocks
        WHERE box='${escapeSql(notebookId)}'
          AND (${contentFilter})
          ${hpathFilter}
        ORDER BY updated DESC
        LIMIT ${Math.max(1, limit * 4)}
    `;

    try {
        const rows = await sql(stmt);
        const seen = new Set<string>();
        const items: MemoryContextItem[] = [];
        for (const row of rows || []) {
            const id = row.id || row.root_id;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            if (!isInMemoryPath(row.hpath || "", rootPath, subdir)) continue;
            items.push({
                id,
                title: String(row.hpath || "").split("/").pop() || id,
                hpath: row.hpath,
                content: row.content || "",
                updated: Number(row.updated || 0),
            });
            if (items.length >= limit) break;
        }
        return items;
    } catch (error) {
        console.warn("[memory] query memory docs failed:", error);
        return [];
    }
}

export async function retrieveMemoryContext(options: MemoryPromptOptions): Promise<MemoryContext> {
    const { settings, query, skipCoreDocId } = options;
    const memory = settings.memory || {};
    const context: MemoryContext = { episodic: [], topics: [] };
    if (!isMemoryEnabled(settings)) return context;

    const overviewText = await readDocMarkdown(memory.overviewDocId);
    if (overviewText.trim()) {
        context.overview = {
            id: memory.overviewDocId,
            title: MEMORY_OVERVIEW_FILENAME,
            content: clip(overviewText, Number(memory.maxOverviewChars || 3000)),
        };
    }

    const coreDocId = String(settings.soulDocId || memory.coreDocId || "").trim();
    if (coreDocId && coreDocId !== skipCoreDocId) {
        const coreText = await readDocMarkdown(coreDocId);
        if (coreText.trim()) {
            context.core = {
                id: coreDocId,
                title: MEMORY_CORE_FILENAME,
                content: clip(coreText, Number(memory.maxCoreChars || 4000)),
            };
        }
    }

    const episodic = await queryMemoryDocs(settings, query, "02-情景记忆", Number(memory.maxEpisodicItems || 5));
    context.episodic = episodic.map(item => ({
        ...item,
        content: clip(item.content, 800),
    }));

    const topics = await queryMemoryDocs(settings, query, "03-主题记忆", Number(memory.maxTopicItems || 2));
    context.topics = topics.map(item => ({
        ...item,
        content: clip(item.content, 1200),
    }));

    return context;
}
