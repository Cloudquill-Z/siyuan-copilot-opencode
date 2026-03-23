export const PLUGIN_DISPLAY_NAME = "SiYuan OpenCode";
export const PLUGIN_BRAND_NAME = "OpenCode";

export const AI_SIDEBAR_TYPE = "opencode-ai-sidebar";
export const AI_TAB_TYPE = "opencode-ai-tab";
export const WEBAPP_TAB_TYPE = "opencode-webapp";

export const MAIN_ICON_ID = "iconOpenCodePlugin";
export const WEBAPP_ICON_ID = "iconOpenCodePluginWebApp";

export const SUMMARY_EVENT = "opencode-plugin-summarize-doc";

export const WEBVIEW_PARTITION = "persist:siyuan-opencode-webapp-user";
export const WEBVIEW_FETCH_PARTITION = "persist:siyuan-opencode-webapp-fetch";
export const WEBVIEW_HOTKEY_PREFIX = "__SIYUAN_OPENCODE_HOTKEY__:";
export const WEBVIEW_LINK_PREFIX = "__SIYUAN_OPENCODE_LINK__:";
export const WEBVIEW_INJECTED_FLAG = "__siyuan_opencode_injected_v1";

export const OPENCODE_SESSION_TITLE = "opencode-plugin-session";
export const TEMP_DIR_NAME = "siyuan_opencode_plugin";

export function getWebAppIconSymbolId(appId: string): string {
    return `iconOpenCodePluginWebApp_${appId}`;
}
