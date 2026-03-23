export const PLUGIN_ID = "siyuan-copilot-opencode";
export const LEGACY_PLUGIN_ID = "siyuan-plugin-copilot";

export const PETAL_DIR = `/data/storage/petal/${PLUGIN_ID}`;
export const LEGACY_PETAL_DIR = `/data/storage/petal/${LEGACY_PLUGIN_ID}`;

export const ASSET_DIR = `${PETAL_DIR}/assets`;
export const LEGACY_ASSET_DIR = `${LEGACY_PETAL_DIR}/assets`;

export const TRANSLATE_DIR = `${PETAL_DIR}/translate`;
export const LEGACY_TRANSLATE_DIR = `${LEGACY_PETAL_DIR}/translate`;

export const SESSION_DIR = `${PETAL_DIR}/sessions`;
export const LEGACY_SESSION_DIR = `${LEGACY_PETAL_DIR}/sessions`;

export const WEBAPP_ICON_DIR = `${PETAL_DIR}/webappIcon`;
export const LEGACY_WEBAPP_ICON_DIR = `${LEGACY_PETAL_DIR}/webappIcon`;

export function getPluginDataPath(fileName: string): string {
    return `${PETAL_DIR}/${fileName}`;
}

export function getLegacyPluginDataPath(fileName: string): string {
    return `${LEGACY_PETAL_DIR}/${fileName}`;
}

export function getSessionPath(sessionId: string): string {
    return `${SESSION_DIR}/${sessionId}.json`;
}

export function getLegacySessionPath(sessionId: string): string {
    return `${LEGACY_SESSION_DIR}/${sessionId}.json`;
}

export function getTranslatePath(id: string): string {
    return `${TRANSLATE_DIR}/${id}.json`;
}

export function getLegacyTranslatePath(id: string): string {
    return `${LEGACY_TRANSLATE_DIR}/${id}.json`;
}

export function getWebAppIconPath(icon: string): string {
    return `${WEBAPP_ICON_DIR}/${icon}`;
}

export function getLegacyWebAppIconPath(icon: string): string {
    return `${LEGACY_WEBAPP_ICON_DIR}/${icon}`;
}

export function isPluginAssetPath(path: string): boolean {
    return path.includes(ASSET_DIR);
}
