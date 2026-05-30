import { retrieveMemoryContext } from "./retriever";
import type { MemoryContext, MemoryPromptOptions } from "./types";

function section(title: string, body?: string): string {
    const content = String(body || "").trim();
    return content ? `${title}：\n${content}` : "";
}

function formatItems(title: string, items: Array<{ title: string; content: string; hpath?: string }>): string {
    if (!items.length) return "";
    const lines = items.map(item => {
        const source = item.hpath || item.title;
        return `- [${source}] ${item.content.replace(/\s+/g, " ").trim()}`;
    });
    return `${title}：\n${lines.join("\n")}`;
}

export function formatMemoryPrompt(context: MemoryContext, maxChars: number = 12000): string {
    const parts = [
        section("Agent 总览", context.overview?.content),
        section("核心档案", context.core?.content),
        formatItems("相关往事", context.episodic),
        formatItems("主题记忆", context.topics),
    ].filter(Boolean);

    if (parts.length === 0) return "";

    const prompt = [
        "=== 长期记忆 ===",
        "",
        ...parts.flatMap(part => [part, ""]),
        "使用规则：",
        "- 这些内容是可参考的长期记忆，不要声称绝对确定。",
        "- 如果当前问题与记忆冲突，以用户当前输入为准。",
    ].join("\n");

    if (prompt.length <= maxChars) return prompt;
    return `${prompt.slice(0, maxChars).trim()}\n\n...`;
}

export async function buildMemoryPrompt(options: MemoryPromptOptions): Promise<string> {
    const context = await retrieveMemoryContext(options);
    return formatMemoryPrompt(context, Number(options.settings?.memory?.maxMemoryPromptChars || 12000));
}
