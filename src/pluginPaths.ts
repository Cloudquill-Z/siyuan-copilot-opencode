import { getFileBlob, putFile } from "./api";

export const PLUGIN_ID = "siyuan-copilot-opencode";

export const PETAL_DIR = `/data/storage/petal/${PLUGIN_ID}`;
export const RUNTIME_DIR = `/data/storage/${PLUGIN_ID}`;

export const ASSET_DIR = `${RUNTIME_DIR}/assets`;
export const SESSION_DIR = `${RUNTIME_DIR}/sessions`;
export const WEBAPP_ICON_DIR = `${RUNTIME_DIR}/webappIcon`;
export const DIAGNOSTIC_LOG_DIR = `${RUNTIME_DIR}/diagnostics`;
export const OPENCODE_WORKSPACE_DIR = `${RUNTIME_DIR}/opencode-workspace`;
export const OPENCODE_WORKSPACE_OPENCODE_DIR = `${OPENCODE_WORKSPACE_DIR}/.opencode`;
export const OPENCODE_WORKSPACE_AGENTS_PATH = `${OPENCODE_WORKSPACE_DIR}/AGENTS.md`;
export const OPENCODE_WORKSPACE_CONFIG_PATH = `${OPENCODE_WORKSPACE_DIR}/opencode.json`;
export const CHAT_SESSIONS_PATH = `${RUNTIME_DIR}/chat-sessions.json`;
export const WEBVIEW_HISTORY_PATH = `${RUNTIME_DIR}/webview-history.json`;

export function getPluginDataPath(fileName: string): string {
    return `${PETAL_DIR}/${fileName}`;
}

export function getRuntimeDataPath(fileName: string): string {
    return `${RUNTIME_DIR}/${fileName}`;
}

export function getSessionPath(sessionId: string): string {
    return `${SESSION_DIR}/${sessionId}.json`;
}

export function getLegacySessionPath(sessionId: string): string {
    return `${PETAL_DIR}/sessions/${sessionId}.json`;
}

export function getWebAppIconPath(icon: string): string {
    return `${WEBAPP_ICON_DIR}/${icon}`;
}

export function isPluginAssetPath(path: string): boolean {
    return path.includes(ASSET_DIR);
}

export async function getPluginFileBlob(path: string): Promise<Blob | null> {
    return await getFileBlob(path);
}

export async function loadJsonFile<T>(path: string, fallback: T): Promise<T> {
    const blob = await getFileBlob(path);
    if (!blob) return fallback;

    try {
        return JSON.parse(await blob.text()) as T;
    } catch (error) {
        console.warn(`Failed to parse JSON file: ${path}`, error);
        return fallback;
    }
}

export async function saveJsonFile(path: string, data: unknown): Promise<void> {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
    });
    await putFile(path, false, blob);
}
