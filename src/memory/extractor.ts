import { chat, cleanupSession, type Message } from "../ai-chat";
import { createDocWithMd } from "../api";
import { isMemoryEnabled, memoryPath } from "./storage";
import type { ExtractedMemoryDraft, MemoryExtractionInput } from "./types";

function textFromMessage(message: Message): string {
    if (typeof message.content === "string") return message.content;
    return (message.content || [])
        .filter(part => part.type === "text" && part.text)
        .map(part => part.text || "")
        .join("\n");
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function sanitizeTitle(title: string): string {
    const clean = String(title || "对话记忆")
        .replace(/[\\/:*?"<>|#\[\]\n\r]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return clean || "对话记忆";
}

function parseDraft(text: string): ExtractedMemoryDraft | null {
    const raw = String(text || "").trim();
    const jsonText = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    try {
        const parsed = JSON.parse(jsonText);
        return {
            title: String(parsed.title || "对话记忆"),
            summary: String(parsed.summary || ""),
            facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
            followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(String) : [],
            topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : [],
            importance: Math.max(0, Math.min(1, Number(parsed.importance) || 0)),
            shouldRemember: parsed.shouldRemember !== false,
        };
    } catch (error) {
        console.warn("[memory] parse extracted memory failed:", error);
        return null;
    }
}

function formatDateParts(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return { yyyy, mm, dd, hh, min };
}

function buildMarkdown(draft: ExtractedMemoryDraft, sessionId: string, messageCount: number, messageHash: string): string {
    const now = new Date();
    const topics = draft.topics.join(", ");
    return [
        "---",
        `memory-id: ep_${now.getTime().toString(36)}_${messageHash}`,
        "memory-type: episodic",
        `session-id: ${sessionId}`,
        `message-count: ${messageCount}`,
        `message-hash: ${messageHash}`,
        `created-at: ${now.toISOString()}`,
        `topics: ${topics}`,
        `importance: ${draft.importance}`,
        "---",
        "",
        `# ${draft.title}`,
        "",
        "## 概述",
        draft.summary || "本轮对话没有可提取摘要。",
        "",
        "## 可复用事实",
        ...(draft.facts.length ? draft.facts.map(fact => `- ${fact}`) : ["- 无"]),
        "",
        "## 后续线索",
        ...(draft.followUps.length ? draft.followUps.map(item => `- ${item}`) : ["- 无"]),
        "",
        "## 原始会话索引",
        `- session-id: ${sessionId}`,
        `- 消息数: ${messageCount}`,
        "",
    ].join("\n");
}

function buildExtractionPrompt(messages: Message[]): string {
    const visibleMessages = messages
        .filter(message => message.role === "user" || message.role === "assistant")
        .slice(-16)
        .map(message => `[${message.role}]\n${textFromMessage(message).slice(0, 4000)}`)
        .join("\n\n---\n\n");

    return [
        "请从下面这轮对话中提取长期记忆草稿。",
        "",
        "只返回 JSON，不要写解释。结构：",
        "{",
        '  "title": "不超过20字的标题",',
        '  "summary": "一段简洁摘要",',
        '  "facts": ["可复用事实"],',
        '  "followUps": ["后续线索"],',
        '  "topics": ["主题"],',
        '  "importance": 0.0,',
        '  "shouldRemember": true',
        "}",
        "",
        "规则：",
        "- 只记录未来有帮助的偏好、项目、决策、约定和待办线索。",
        "- 不要记录密码、token、密钥、身份证、电话、地址等敏感信息。",
        "- 如果只是闲聊或无长期价值，shouldRemember=false。",
        "",
        "对话：",
        visibleMessages,
    ].join("\n");
}

export function getMemoryMessageHash(messages: Message[]): string {
    const visible = messages.filter(message => message.role !== "system");
    const lastUser = [...visible].reverse().find(message => message.role === "user");
    const lastAssistant = [...visible].reverse().find(message => message.role === "assistant");
    return hashString(`${textFromMessage(lastUser as Message)}\n---\n${textFromMessage(lastAssistant as Message)}`);
}

export async function extractEpisodicMemory(input: MemoryExtractionInput): Promise<string | null> {
    const { settings, sessionId, messages } = input;
    const memory = settings.memory || {};
    if (!isMemoryEnabled(settings) || !memory.autoExtract || !sessionId) return null;

    const visibleMessages = messages.filter(message => message.role === "user" || message.role === "assistant");
    if (visibleMessages.length < 2) return null;

    const messageCount = messages.filter(message => message.role !== "system").length;
    const messageHash = getMemoryMessageHash(messages);
    const existing = settings.pluginData?.memoryExtractionState?.[sessionId];
    if (existing?.messageCount === messageCount && existing?.messageHash === messageHash) {
        return null;
    }

    const serverUrl = input.serverUrl || "http://localhost:4096";
    let responseText = "";
    const result = await chat(
        "opencode",
        {
            apiKey: "",
            model: input.modelId || "opencode/big-pickle",
            messages: [
                { role: "system", content: "你是谨慎的长期记忆提取器，只输出 JSON。" },
                { role: "user", content: buildExtractionPrompt(messages) },
            ],
            stream: false,
            onComplete: text => {
                responseText = text;
            },
        },
        serverUrl,
        undefined,
        serverUrl
    );
    if (result.sessionId) {
        await cleanupSession(serverUrl, result.sessionId);
    }

    const draft = parseDraft(responseText);
    if (!draft || !draft.shouldRemember || draft.importance < Number(memory.minImportance || 0.35)) {
        return null;
    }

    const { yyyy, mm, dd, hh, min } = formatDateParts();
    const filename = `${yyyy}-${mm}-${dd}-${hh}${min}-${sanitizeTitle(draft.title)}`;
    const path = memoryPath(settings, `02-情景记忆/${yyyy}/${mm}/${filename}`);
    const markdown = buildMarkdown(draft, sessionId, messageCount, messageHash);
    const docId = await createDocWithMd(String(memory.notebookId), path, markdown);

    settings.pluginData = {
        ...(settings.pluginData || {}),
        memoryExtractionState: {
            ...(settings.pluginData?.memoryExtractionState || {}),
            [sessionId]: {
                messageCount,
                messageHash,
                memoryDocId: docId,
                updatedAt: Date.now(),
            },
        },
    };
    return docId;
}
