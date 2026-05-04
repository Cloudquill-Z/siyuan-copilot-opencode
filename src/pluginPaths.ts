import { getFileBlob } from "./api";

export const PLUGIN_ID = "siyuan-copilot-opencode";

export const PETAL_DIR = `/data/storage/petal/${PLUGIN_ID}`;

export const ASSET_DIR = `${PETAL_DIR}/assets`;
export const SESSION_DIR = `${PETAL_DIR}/sessions`;
export const WEBAPP_ICON_DIR = `${PETAL_DIR}/webappIcon`;

export function getPluginDataPath(fileName: string): string {
    return `${PETAL_DIR}/${fileName}`;
}

export function getSessionPath(sessionId: string): string {
    return `${SESSION_DIR}/${sessionId}.json`;
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
