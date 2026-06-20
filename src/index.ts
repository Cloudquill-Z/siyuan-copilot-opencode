import {
    Plugin,
    Dialog,
    openTab,
    getBackend,
    openWindow,
} from "siyuan";

import { pushMsg, pushErrMsg, putFile, getFileBlob, readDir } from "./api";
import { saveAsset, base64ToBlob } from "./utils/assets";
import { ensureServerRunning, restartServe, stopServe, detectOpenCodeCLI } from "./opencode-runner";
import { startHealthPoll, stopHealthPoll } from "./stores/connectionStatus";
import "@/index.scss";

import SettingPanel from "./SettingsPanel.svelte";
import { getDefaultSettings } from "./defaultSettings";
import { normalizeSettings } from "./settingsSchema";
import { ensureManagedOpenCodeWorkspace } from "./opencode-workspace";
import { ensureMemoryBase } from "./memory";
import { createAcceptLanguageHeader, setPluginInstance, t, getCurrentLanguage } from "./utils/i18n";
import AISidebar from "./ai-sidebar.svelte";
import ChatDialog from "./components/ChatDialog.svelte";
import { updateSettings, getSettings } from "./stores/settings";
import { getModelCapabilities } from "./utils/modelCapabilities";
import { ComponentMountRegistry } from "./utils/componentMountRegistry";
import {
    CHAT_SESSIONS_PATH,
    OPENCODE_WORKSPACE_DIR,
    WEBVIEW_HISTORY_PATH,
    WEBAPP_ICON_DIR,
    getSessionPath,
    getWebAppIconPath,
    loadJsonFile,
    saveJsonFile
} from "./pluginPaths";
import {
    AI_SIDEBAR_TYPE,
    AI_TAB_TYPE,
    MAIN_ICON_ID,
    PLUGIN_BRAND_NAME,
    PLUGIN_DISPLAY_NAME,
    SUMMARY_EVENT,
    WEBAPP_ICON_ID,
    WEBAPP_TAB_TYPE,
    WEBVIEW_HOTKEY_PREFIX,
    WEBVIEW_INJECTED_FLAG,
    WEBVIEW_LINK_PREFIX,
    WEBVIEW_PARTITION,
    getWebAppIconSymbolId,
} from "./pluginNamespace";

export const SETTINGS_FILE = "settings.json";
const WEBVIEW_HISTORY_FILE = "webview-history.json";
const MAX_HISTORY_COUNT = 200;
const OPENCODE_STOP_DELAY_MS = 15_000;
const OPENCODE_STOP_TIMER_KEY = "__siyuanCopilotOpenCodeStopTimer";

function clearPendingOpenCodeStop() {
    const win = window as any;
    if (win[OPENCODE_STOP_TIMER_KEY]) {
        window.clearTimeout(win[OPENCODE_STOP_TIMER_KEY]);
        win[OPENCODE_STOP_TIMER_KEY] = null;
    }
}

function scheduleOpenCodeStop() {
    const win = window as any;
    clearPendingOpenCodeStop();
    win[OPENCODE_STOP_TIMER_KEY] = window.setTimeout(() => {
        win[OPENCODE_STOP_TIMER_KEY] = null;
        stopServe();
    }, OPENCODE_STOP_DELAY_MS);
}

interface WebViewHistory {
    url: string;
    title: string;
    timestamp: number;
    visitCount: number;
}



export default class PluginSample extends Plugin {
    private aiSidebarApps = new ComponentMountRegistry<AISidebar>();
    private aiTabApps: Map<HTMLElement, AISidebar> = new Map();
    private chatDialogs: Map<string, { dialog: Dialog; app: ChatDialog }> = new Map();
    private settingDialog: Dialog | null = null;
    private webViewHistory: WebViewHistory[] = []; // WebView 历史记录
    private openMenuDoctreeBindThis = this.openMenuDoctree.bind(this);
    private clickEditorTitleIconBindThis = this.clickEditorTitleIcon.bind(this);
    private openMenuLinkBindThis = this.openMenuLink.bind(this);
    private linkClickHandler: ((e: MouseEvent) => void) | null = null;
    private domainIconMap: Map<string, string> = new Map(); // 缓存域名与图标文件名的映射
    private openCodeInitRunId = 0;
    private isUnloaded = true;

    /**
     * 加载 WebView 历史记录
     */
    private async loadWebViewHistory(): Promise<WebViewHistory[]> {
        try {
            const history = await loadJsonFile<WebViewHistory[] | null>(WEBVIEW_HISTORY_PATH, null);
            if (Array.isArray(history)) return history;

            const legacyHistory = await this.loadData(WEBVIEW_HISTORY_FILE);
            if (Array.isArray(legacyHistory)) return legacyHistory;
            return Array.isArray(history) ? history : [];
        } catch (e) {
            console.error('Failed to load webview history:', e);
            return [];
        }
    }

    /**
     * 保存 WebView 历史记录
     */
    private async saveWebViewHistory() {
        try {
            // 限制历史记录数量
            if (this.webViewHistory.length > MAX_HISTORY_COUNT) {
                this.webViewHistory = this.webViewHistory
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, MAX_HISTORY_COUNT);
            }
            await saveJsonFile(WEBVIEW_HISTORY_PATH, this.webViewHistory);
        } catch (e) {
            console.error('Failed to save webview history:', e);
        }
    }

    /**
     * 添加到历史记录
     */
    private async addToWebViewHistory(url: string, title: string) {
        if (!url) return;

        // 查找是否已存在
        const existingIndex = this.webViewHistory.findIndex(h => h.url === url);

        if (existingIndex >= 0) {
            // 更新现有记录
            this.webViewHistory[existingIndex].title = title || url;
            this.webViewHistory[existingIndex].timestamp = Date.now();
            this.webViewHistory[existingIndex].visitCount++;
        } else {
            // 添加新记录
            this.webViewHistory.unshift({
                url,
                title: title || url,
                timestamp: Date.now(),
                visitCount: 1
            });
        }

        await this.saveWebViewHistory();
    }

    /**
     * 搜索历史记录
     * 支持空格分隔的多个关键词（AND 搜索）
     */
    private searchWebViewHistory(query: string): WebViewHistory[] {
        if (!query.trim()) {
            // 返回最近访问的记录
            return [...this.webViewHistory]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);
        }

        // 分割搜索关键词
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

        // 过滤匹配所有关键词的记录
        const filtered = this.webViewHistory.filter(item => {
            const searchText = `${item.title} ${item.url}`.toLowerCase();
            return keywords.every(keyword => searchText.includes(keyword));
        });

        // 按访问次数和时间排序
        return filtered
            .sort((a, b) => {
                // 优先按访问次数排序
                const countDiff = b.visitCount - a.visitCount;
                if (countDiff !== 0) return countDiff;
                // 其次按时间排序
                return b.timestamp - a.timestamp;
            })
            .slice(0, 10);
    }



    /**
     * 注册小程序图标
     */
    registerWebAppIcon(appId: string, iconBase64: string) {
        try {
            if (!iconBase64 || !iconBase64.startsWith('data:image')) {
                return;
            }

            const iconId = getWebAppIconSymbolId(appId);

            // 从base64中提取图片数据
            const base64Data = iconBase64;

            // 创建SVG中的image元素
            const svgContent = `<image href="${base64Data}" width="32" height="32"/>`;

            this.addIcons(`
                <symbol id="${iconId}" viewBox="0 0 32 32">
                    ${svgContent}
                </symbol>
            `);
        } catch (e) {
            console.error(`Failed to register icon for webapp ${appId}:`, e);
        }
    }

    /**
     * 获取小程序的图标ID
     */
    getWebAppIconId(appId: string): string {
        return getWebAppIconSymbolId(appId);
    }

    // 将 Blob 转为 data URL
    private blobToDataURL(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result as string);
                };
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(blob);
            } catch (e) {
                reject(e);
            }
        });
    }

    // 从 URL 中提取域名
    private getDomainFromUrl(url: string): string {
        try {
            const u = new URL(url);
            return u.hostname;
        } catch (e) {
            return '';
        }
    }

    // 判断输入是否很可能是一个 URL（支持不带协议的域名如 example.com）
    private isLikelyUrl(input: string): boolean {
        if (!input) return false;
        const s = input.trim();
        if (s.indexOf(' ') >= 0) return false;
        if (/^https?:\/\//i.test(s)) return true;
        if (/^[a-zA-Z][a-zA-Z0-9+-.]*:\/\//.test(s)) return false;
        if (/^@/.test(s) || s.includes('@')) return false;

        const domainPattern =
            /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|ai|app|dev|cn|top|xyz|me|co|edu|gov|info|wiki|site|tech|cloud|page|blog)(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;
        return domainPattern.test(s);
    }

    // 依次尝试多个 favicon 源，遇到第一个成功的就返回 data:image...
    private async tryFetchFavicon(domain: string): Promise<string | null> {
        if (!domain) return null;

        const sources = [
            // FaviconIm (尝试常见的路径)
            `https://favicon.im/${domain}`,
            `https://favicon.im/favicon/${domain}`,
            // Google Favicons
            `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
            // Unavatar
            `https://unavatar.io/${domain}`,
            // DuckDuckGo
            `https://icons.duckduckgo.com/ip3/${domain}.ico`
        ];

        for (const src of sources) {
            try {
                const resp = await fetch(src, { mode: 'cors' });
                if (!resp.ok) continue;
                const ct = (resp.headers.get('content-type') || '').toLowerCase();
                if (ct.startsWith('image') || src.endsWith('.ico')) {
                    const blob = await resp.blob();
                    if (!blob || blob.size === 0) continue;
                    try {
                        const dataUrl = await this.blobToDataURL(blob);
                        if (dataUrl && dataUrl.startsWith('data:image')) {
                            return dataUrl;
                        }
                    } catch (e) {
                        // 转换失败，继续下一源
                        console.warn('favicon 转换失败', e);
                        continue;
                    }
                }
            } catch (e) {
                // 网络或 CORS 错误，尝试下一个
                console.warn('尝试 favicon 源失败:', src, e);
                continue;
            }
        }

        return null;
    }

    private getExtensionFromMime(mime: string): string {
        if (!mime) return 'png';
        mime = mime.toLowerCase();
        if (mime.includes('png')) return 'png';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('svg')) return 'svg';
        if (mime.includes('icon') || mime.includes('ico')) return 'ico';
        if (mime.includes('webp')) return 'webp';
        return 'png';
    }

    private dataURItoBlob(dataURI: string): Blob | null {
        try {
            // convert base64/URLEncoded data component to raw binary data held in a string
            let byteString;
            if (dataURI.split(',')[0].indexOf('base64') >= 0)
                byteString = atob(dataURI.split(',')[1]);
            else
                byteString = decodeURI(dataURI.split(',')[1]);

            // separate out the mime component
            let mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

            // write the bytes of the string to a typed array
            let ia = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }

            return new Blob([ia], { type: mimeString });
        } catch (e) {
            console.error('dataURItoBlob failed', e);
            return null;
        }
    }

    // 为域名获取或创建图标并返回可用于 openTab 的 icon id
    private async getOrCreateIconForDomain(url: string): Promise<string> {
        try {
            const domain = this.getDomainFromUrl(url);
            if (!domain) return WEBAPP_ICON_ID;

            // 优先检查是否有已配置的 WebApp 使用此域名
            // 这样用户自定义的图标优先级最高
            if (this.data && this.data.webApps && Array.isArray(this.data.webApps)) {
                const matchedApp = this.data.webApps.find((app: any) => {
                    try {
                        return this.getDomainFromUrl(app.url) === domain;
                    } catch (e) { return false; }
                });

                if (matchedApp && matchedApp.icon && !matchedApp.icon.startsWith('data:')) {
                    const iconFilename = matchedApp.icon;
                    // 如果内存映射中没有，或者映射的文件名不同（虽然按我们的逻辑应该是一样的，但为了安全），尝试加载
                    // 注意：如果文件名相同但文件内容变了，这里无法检测，需要由 Save 动作触发重载，或者这里不缓存 DataUrl
                    // 但为了性能，我们假设 index.ts 加载后文件内容不变。

                    if (!this.domainIconMap.has(domain) || this.domainIconMap.get(domain) !== iconFilename) {
                        const iconPath = getWebAppIconPath(iconFilename);
                        try {
                            const blob = await getFileBlob(iconPath);
                            if (blob) {
                                // 检查是否是旧格式 (.icon 文本文件)
                                if (iconFilename.endsWith('.icon')) {
                                    const iconData = await blob.text();
                                    if (iconData && iconData.startsWith('data:image')) {
                                        this.registerWebAppIcon(domain, iconData);
                                        this.domainIconMap.set(domain, iconFilename);
                                        return this.getWebAppIconId(domain);
                                    }
                                } else {
                                    // 图片文件
                                    const iconData = await this.blobToDataURL(blob);
                                    if (iconData) {
                                        this.registerWebAppIcon(domain, iconData);
                                        this.domainIconMap.set(domain, iconFilename);
                                        return this.getWebAppIconId(domain);
                                    }
                                }
                            }
                        } catch (e) {
                            // quiet fail, fall through to fetch
                        }
                    } else {
                        // 映射已存在且一致，确实已注册
                        return this.getWebAppIconId(domain);
                    }
                }
            }

            // 检查缓存 Map
            if (this.domainIconMap.has(domain)) {
                // 如果已有缓存文件，尝试注册（如果尚未注册，这里假设已经注册或注册失败不影响获取 ID）
                // 实际上我们应该确保它被注册。
                // 如果 onload 成功，它应该被注册了。
                // 如果是本次 session 新添加的，它也被注册了。
                return this.getWebAppIconId(domain);
            }

            // 否则尝试抓取
            const fetchedDataUri = await this.tryFetchFavicon(domain);
            if (fetchedDataUri) {
                // 解析 mime
                let mime = 'image/png';
                try {
                    const match = fetchedDataUri.match(/data:([^;]+);/);
                    if (match) mime = match[1];
                } catch (e) { }

                const ext = this.getExtensionFromMime(mime);
                const filename = `${domain}.${ext}`;
                const savePath = `${WEBAPP_ICON_DIR}/${filename}`;

                // 转换为 Blob
                const blob = this.dataURItoBlob(fetchedDataUri);

                if (blob) {
                    // 保存到独立文件（图片格式）
                    try {
                        await putFile(savePath, false, blob);
                        this.domainIconMap.set(domain, filename);
                    } catch (e) {
                        console.warn('保存 favicon 到文件失败:', e);
                    }
                }

                try {
                    this.registerWebAppIcon(domain, fetchedDataUri);
                    return this.getWebAppIconId(domain);
                } catch (e) {
                    console.warn('注册抓取到的 favicon 失败:', e);
                }
            }
        } catch (e) {
            console.warn('getOrCreateIconForDomain 出错:', e);
        }

        return WEBAPP_ICON_ID;
    }

    async onload() {
        // 插件被启用时会自动调用这个函数
        // 设置i18n插件实例
        clearPendingOpenCodeStop();
        this.isUnloaded = false;
        const openCodeInitRunId = ++this.openCodeInitRunId;
        setPluginInstance(this);

        // Load settings before auto-starting OpenCode so custom serverUrl/port is honored.
        const settings = await this.loadSettings();
        try {
            const before = JSON.stringify(settings.memory || {});
            await ensureMemoryBase(settings);
            if (before !== JSON.stringify(settings.memory || {})) {
                await this.saveSettings(settings);
            }
        } catch (error) {
            console.warn('[memory] initialize memory base failed:', error);
        }
        if (!this.isOpenCodeInitCurrent(openCodeInitRunId)) return;

        // Auto-start OpenCode serve if not running
        this.initOpenCodeServer(settings, openCodeInitRunId);

        // 注册文档树右键菜单
        this.eventBus.on("open-menu-doctree", this.openMenuDoctreeBindThis);
        // 注册文档块块标右键菜单
        this.eventBus.on("click-editortitleicon", this.clickEditorTitleIconBindThis);
        // 注册链接右键菜单
        this.eventBus.on("open-menu-link", this.openMenuLinkBindThis);


        // 加载历史记录
        this.webViewHistory = await this.loadWebViewHistory();
        if (!this.isOpenCodeInitCurrent(openCodeInitRunId)) return;

        // 加载设置
        this.addIcons(`
    <symbol id="${MAIN_ICON_ID}" viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4 9h-2v2h2v-2zm-4 0H8v2h2v-2z" fill="currentColor"/>
    </symbol>
    `);
        this.addIcons(`
    <symbol id="iconModelSetting" viewBox="0 0 24 24">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81a.49.49 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41L9.25 5.35c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/>
    </symbol>
    `);
        this.addIcons(`
    <symbol id="${WEBAPP_ICON_ID}" viewBox="0 0 1024 1024">
<path d="M878.159424 565.40635l-327.396585 0c-11.307533 0-20.466124 9.168824-20.466124 20.466124l0 327.396585c0 11.307533 9.15859 20.466124 20.466124 20.466124l327.396585 0c11.2973 0 20.466124-9.15859 20.466124-20.466124l0-327.396585C898.625548 574.575174 889.456724 565.40635 878.159424 565.40635zM857.6933 892.802936l-286.464337 0 0-286.464337 286.464337 0L857.6933 892.802936z" p-id="7151"></path><path d="M430.606225 565.40635l-327.396585 0c-11.2973 0-20.466124 9.168824-20.466124 20.466124l0 327.396585c0 11.307533 9.168824 20.466124 20.466124 20.466124l327.396585 0c11.307533 0 20.466124-9.15859 20.466124-20.466124l0-327.396585C451.072349 574.575174 441.913758 565.40635 430.606225 565.40635zM410.140101 892.802936l-286.464337 0 0-286.464337 286.464337 0L410.140101 892.802936z" p-id="7152"></path><path d="M430.606225 115.601878l-327.396585 0c-11.2973 0-20.466124 9.15859-20.466124 20.466124l0 327.386352c0 11.307533 9.168824 20.466124 20.466124 20.466124l327.396585 0c11.307533 0 20.466124-9.15859 20.466124-20.466124l0-327.386352C451.072349 124.760468 441.913758 115.601878 430.606225 115.601878zM410.140101 442.98823l-286.464337 0 0-286.454104 286.464337 0L410.140101 442.98823z" p-id="7153"></path><path d="M965.529307 277.744745l-214.433814-214.433814c-3.837398-3.837398-9.046027-5.996574-14.46955-5.996574-5.433756 0-10.632151 2.159176-14.479783 5.996574l-214.433814 214.433814c-7.992021 7.992021-7.992021 20.957311 0 28.949332l214.433814 214.433814c4.001127 3.990894 9.240455 5.996574 14.479783 5.996574 5.229095 0 10.468422-2.00568 14.46955-5.996574l214.433814-214.433814c3.837398-3.837398 5.996574-9.046027 5.996574-14.46955C971.525881 286.790772 969.366705 281.582143 965.529307 277.744745zM736.625944 477.709009l-185.494715-185.484482 185.494715-185.494715 185.484482 185.494715L736.625944 477.709009z" p-id="7154"></path>
    </symbol>
    `);
        // 注册AI标签页类型
        const pluginInstance = this;
        this.addTab({
            type: AI_TAB_TYPE,
            init() {
                const element = this.element as HTMLElement;
                element.style.display = 'flex';
                element.style.flexDirection = 'column';
                element.style.height = '100%';
                // 创建AI聊天界面
                const app = new AISidebar({
                    target: element,
                    props: {
                        plugin: pluginInstance
                    }
                });
                pluginInstance.aiTabApps.set(element, app);
            },
            destroy() {
                const element = this.element as HTMLElement;
                const app = pluginInstance.aiTabApps.get(element);
                if (app) {
                    app.$destroy();
                    pluginInstance.aiTabApps.delete(element);
                }
            }
        });
        // 注册小程序标签页类型
        this.addTab({
            type: WEBAPP_TAB_TYPE,
            init() {
                const element = this.element as HTMLElement;
                element.style.display = 'flex';
                element.style.flexDirection = 'column';
                element.style.height = '100%';
                element.tabIndex = 0; // 允许元素获取焦点以接收键盘事件

                // 从 this.data 中获取 app 信息
                const app = this.data?.app;
                if (app) {
                    const initialTitle = app.name || 'Web Link';
                    // 创建 webview 容器
                    const container = document.createElement('div');
                    container.className = 'fn__flex-1 fn__flex-column';
                    container.style.height = '100%';
                    container.style.width = '100%';
                    container.style.display = 'flex';
                    container.style.flexDirection = 'column';
                    container.style.transition = 'all 0.3s ease';
                    container.tabIndex = 0; // 允许容器获取焦点

                    // 创建顶部导航栏（类似浏览器）
                    const navbar = document.createElement('div');
                    navbar.style.display = 'flex';
                    navbar.style.alignItems = 'center';
                    navbar.style.padding = '4px 8px';
                    navbar.style.gap = '4px';
                    navbar.style.background = 'var(--b3-theme-surface)';
                    navbar.style.borderBottom = '1px solid var(--b3-border-color)';
                    navbar.style.flexShrink = '0';

                    // 后退按钮
                    const backBtn = document.createElement('button');
                    backBtn.className = 'b3-button b3-button--text';
                    backBtn.title = '后退';
                    backBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconLeft"></use></svg>';
                    backBtn.disabled = true;
                    navbar.appendChild(backBtn);

                    // 前进按钮
                    const forwardBtn = document.createElement('button');
                    forwardBtn.className = 'b3-button b3-button--text';
                    forwardBtn.title = '前进';
                    forwardBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconRight"></use></svg>';
                    forwardBtn.disabled = true;
                    navbar.appendChild(forwardBtn);

                    // 刷新按钮
                    const refreshBtn = document.createElement('button');
                    refreshBtn.className = 'b3-button b3-button--text';
                    refreshBtn.title = '刷新';
                    refreshBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>';
                    navbar.appendChild(refreshBtn);

                    // URL 输入框容器（包含输入框和建议列表）
                    const urlInputWrapper = document.createElement('div');
                    urlInputWrapper.style.flex = '1';
                    urlInputWrapper.style.position = 'relative';

                    // URL 显示框
                    const urlInput = document.createElement('input');
                    urlInput.type = 'text';
                    urlInput.value = app.url;
                    urlInput.className = 'b3-text-field';
                    urlInput.style.width = '100%';
                    urlInput.style.fontSize = '13px';
                    urlInput.spellcheck = false;
                    urlInput.autocomplete = 'off';
                    urlInput.placeholder = '输入 URL 或搜索历史记录...';

                    // 建议列表容器
                    const suggestionList = document.createElement('div');
                    suggestionList.style.position = 'absolute';
                    suggestionList.style.top = '100%';
                    suggestionList.style.left = '0';
                    suggestionList.style.right = '0';
                    suggestionList.style.maxHeight = '400px';
                    suggestionList.style.overflowY = 'auto';
                    suggestionList.style.background = 'var(--b3-theme-surface)';
                    suggestionList.style.border = '1px solid var(--b3-border-color)';
                    suggestionList.style.borderTop = 'none';
                    suggestionList.style.borderRadius = '0 0 4px 4px';
                    suggestionList.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    suggestionList.style.display = 'none';
                    suggestionList.style.zIndex = '1000';

                    // 选中的建议索引
                    let selectedSuggestionIndex = -1;
                    let currentSuggestions: WebViewHistory[] = [];

                    // 渲染建议列表
                    const renderSuggestions = (suggestions: WebViewHistory[]) => {
                        currentSuggestions = suggestions;
                        selectedSuggestionIndex = -1;
                        suggestionList.innerHTML = '';

                        if (suggestions.length === 0) {
                            suggestionList.style.display = 'none';
                            return;
                        }

                        suggestions.forEach((item, index) => {
                            const suggestionItem = document.createElement('div');
                            suggestionItem.style.padding = '8px 12px';
                            suggestionItem.style.cursor = 'pointer';
                            suggestionItem.style.display = 'flex';
                            suggestionItem.style.flexDirection = 'column';
                            suggestionItem.style.gap = '4px';
                            suggestionItem.style.borderBottom = '1px solid var(--b3-border-color)';
                            suggestionItem.dataset.index = String(index);

                            // 标题
                            const titleDiv = document.createElement('div');
                            titleDiv.style.fontSize = '13px';
                            titleDiv.style.color = 'var(--b3-theme-on-surface)';
                            titleDiv.style.fontWeight = '500';
                            titleDiv.textContent = item.title;
                            suggestionItem.appendChild(titleDiv);

                            // URL
                            const urlDiv = document.createElement('div');
                            urlDiv.style.fontSize = '12px';
                            urlDiv.style.color = 'var(--b3-theme-on-surface-light)';
                            urlDiv.style.overflow = 'hidden';
                            urlDiv.style.textOverflow = 'ellipsis';
                            urlDiv.style.whiteSpace = 'nowrap';
                            urlDiv.textContent = item.url;
                            suggestionItem.appendChild(urlDiv);

                            // 鼠标悬停效果
                            suggestionItem.addEventListener('mouseenter', () => {
                                // 清除其他选中状态
                                suggestionList.querySelectorAll('div[data-index]').forEach(el => {
                                    (el as HTMLElement).style.background = '';
                                    (el as HTMLElement).style.boxShadow = '';
                                });
                                suggestionItem.style.background = 'var(--b3-list-hover)';
                                suggestionItem.style.boxShadow = 'inset 0 0 0 1px var(--b3-theme-primary)';
                                selectedSuggestionIndex = index;
                            });

                            suggestionItem.addEventListener('mouseleave', () => {
                                suggestionItem.style.background = '';
                                suggestionItem.style.boxShadow = '';
                            });

                            // 点击选择
                            suggestionItem.addEventListener('mousedown', (e) => {
                                e.preventDefault(); // 防止失去焦点
                                urlInput.value = item.url;
                                suggestionList.style.display = 'none';
                                // 导航到选中的 URL
                                redirectCount = 0;
                                lastUrl = item.url;
                                webview.src = item.url;
                                urlInput.blur();
                            });

                            suggestionList.appendChild(suggestionItem);
                        });

                        suggestionList.style.display = 'block';
                    };

                    // 更新选中项的视觉效果
                    const updateSelectedSuggestion = () => {
                        suggestionList.querySelectorAll('div[data-index]').forEach((el, index) => {
                            if (index === selectedSuggestionIndex) {
                                (el as HTMLElement).style.background = 'var(--b3-list-hover)';
                                (el as HTMLElement).style.boxShadow = 'inset 0 0 0 1px var(--b3-theme-primary)';
                                // 滚动到可见位置
                                el.scrollIntoView({ block: 'nearest' });
                            } else {
                                (el as HTMLElement).style.background = '';
                                (el as HTMLElement).style.boxShadow = '';
                            }
                        });
                    };

                    // 输入事件 - 搜索历史
                    let searchTimeout: NodeJS.Timeout;
                    urlInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            const query = urlInput.value.trim();
                            const results = pluginInstance.searchWebViewHistory(query);
                            renderSuggestions(results);
                        }, 150); // 防抖
                    });

                    // 获得焦点 - 显示建议
                    urlInput.addEventListener('focus', () => {
                        const query = urlInput.value.trim();
                        const results = pluginInstance.searchWebViewHistory(query);
                        renderSuggestions(results);
                    });

                    // 失去焦点 - 隐藏建议
                    urlInput.addEventListener('blur', () => {
                        // 延迟隐藏，以便点击事件能够触发
                        setTimeout(() => {
                            suggestionList.style.display = 'none';
                        }, 200);
                    });

                    // 键盘导航
                    urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
                        // 阻止冒泡，防止触发全局快捷键
                        e.stopPropagation();

                        if (e.key === 'ArrowDown') {
                            // 向下选择
                            e.preventDefault();
                            if (currentSuggestions.length > 0) {
                                selectedSuggestionIndex = Math.min(
                                    selectedSuggestionIndex + 1,
                                    currentSuggestions.length - 1
                                );
                                updateSelectedSuggestion();
                            }
                        } else if (e.key === 'ArrowUp') {
                            // 向上选择
                            e.preventDefault();
                            if (currentSuggestions.length > 0) {
                                selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
                                if (selectedSuggestionIndex === -1) {
                                    // 返回输入框
                                    suggestionList.querySelectorAll('div[data-index]').forEach(el => {
                                        (el as HTMLElement).style.background = '';
                                        (el as HTMLElement).style.boxShadow = '';
                                    });
                                } else {
                                    updateSelectedSuggestion();
                                }
                            }
                        } else if (e.key === 'Enter') {
                            e.preventDefault();

                            // 如果有选中的建议，使用建议
                            if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < currentSuggestions.length) {
                                const selected = currentSuggestions[selectedSuggestionIndex];
                                urlInput.value = selected.url;
                                suggestionList.style.display = 'none';
                                redirectCount = 0;
                                lastUrl = selected.url;
                                webview.src = selected.url;
                                // 尝试更新标签图标
                                (async () => {
                                    try {
                                        const iconId = await pluginInstance.getOrCreateIconForDomain(selected.url);
                                        try { if (this.tab) (this.tab as any).icon = iconId; } catch (e) { }
                                        // DOM 回退：根据标签标题查找并替换 svg use
                                        try {
                                            const headers = document.querySelectorAll('li[data-type="tab-header"]');
                                            for (const h of Array.from(headers)) {
                                                const textEl = h.querySelector('.item__text');
                                                if (textEl && textEl.textContent && textEl.textContent.indexOf(initialTitle) !== -1) {
                                                    const useEl = h.querySelector('svg use');
                                                    if (useEl) useEl.setAttribute('xlink:href', `#${iconId}`);
                                                    break;
                                                }
                                            }
                                        } catch (e) { }
                                    } catch (e) { }
                                })();
                                urlInput.blur();
                            } else {
                                // 否则使用输入的内容：如果看起来不是网址，则使用 Google 搜索
                                const raw = urlInput.value.trim();
                                if (raw) {
                                    let targetUrl = '';

                                    if (pluginInstance.isLikelyUrl(raw)) {
                                        // 把可能的域名或网址补全协议
                                        targetUrl = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;

                                        suggestionList.style.display = 'none';
                                        redirectCount = 0;
                                        lastUrl = targetUrl;
                                        webview.src = targetUrl;

                                        // 尝试更新标签图标
                                        (async () => {
                                            try {
                                                const iconId = await pluginInstance.getOrCreateIconForDomain(targetUrl);
                                                try { if (this.tab) (this.tab as any).icon = iconId; } catch (e) { }
                                                try {
                                                    const headers = document.querySelectorAll('li[data-type="tab-header"]');
                                                    for (const h of Array.from(headers)) {
                                                        const textEl = h.querySelector('.item__text');
                                                        if (textEl && textEl.textContent && textEl.textContent.indexOf(initialTitle) !== -1) {
                                                            const useEl = h.querySelector('svg use');
                                                            if (useEl) useEl.setAttribute('xlink:href', `#${iconId}`);
                                                            break;
                                                        }
                                                    }
                                                } catch (e) { }
                                            } catch (e) { }
                                        })();
                                        urlInput.blur();
                                    } else {
                                        // 作为搜索关键词，使用用户设置的搜索引擎
                                        getSettings().then((s: any) => {
                                            const engine = (s && s.searchEngine) ? s.searchEngine : 'google';
                                            if (engine === 'bing') {
                                                targetUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(raw);
                                            } else {
                                                targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(raw);
                                            }

                                            suggestionList.style.display = 'none';
                                            redirectCount = 0;
                                            lastUrl = targetUrl;
                                            webview.src = targetUrl;

                                            // 更新标签图标（对搜索结果使用默认或尝试抓取）
                                            (async () => {
                                                try {
                                                    const iconId = await pluginInstance.getOrCreateIconForDomain(targetUrl);
                                                    try { if (this.tab) (this.tab as any).icon = iconId; } catch (e) { }
                                                    try {
                                                        const headers = document.querySelectorAll('li[data-type="tab-header"]');
                                                        for (const h of Array.from(headers)) {
                                                            const textEl = h.querySelector('.item__text');
                                                            if (textEl && textEl.textContent && textEl.textContent.indexOf(initialTitle) !== -1) {
                                                                const useEl = h.querySelector('svg use');
                                                                if (useEl) useEl.setAttribute('xlink:href', `#${iconId}`);
                                                                break;
                                                            }
                                                        }
                                                    } catch (e) { }
                                                } catch (e) { }
                                            })();
                                            urlInput.blur();
                                        }).catch(() => {
                                            // 回退到 Google
                                            targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(raw);
                                            suggestionList.style.display = 'none';
                                            redirectCount = 0;
                                            lastUrl = targetUrl;
                                            webview.src = targetUrl;
                                            urlInput.blur();
                                        });
                                    }
                                }
                            }
                        } else if (e.key === 'Escape') {
                            // ESC 关闭建议列表
                            e.preventDefault();
                            suggestionList.style.display = 'none';
                            selectedSuggestionIndex = -1;
                        }
                    });

                    urlInputWrapper.appendChild(urlInput);
                    urlInputWrapper.appendChild(suggestionList);
                    navbar.appendChild(urlInputWrapper);

                    // 在默认浏览器打开按钮
                    const openInBrowserBtn = document.createElement('button');
                    openInBrowserBtn.className = 'b3-button b3-button--text';
                    openInBrowserBtn.title = '在默认浏览器打开';
                    openInBrowserBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconOpenWindow"></use></svg>';
                    navbar.appendChild(openInBrowserBtn);

                    // 复制标签页按钮
                    const duplicateTabBtn = document.createElement('button');
                    duplicateTabBtn.className = 'b3-button b3-button--text';
                    duplicateTabBtn.title = '在新标签页打开';
                    duplicateTabBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>';
                    navbar.appendChild(duplicateTabBtn);

                    // 全屏按钮
                    const fullscreenBtn = document.createElement('button');
                    fullscreenBtn.className = 'b3-button b3-button--text';
                    fullscreenBtn.title = '全屏 (Alt+Y)';
                    fullscreenBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconFullscreen"></use></svg>';
                    navbar.appendChild(fullscreenBtn);

                    // 打开开发者工具按钮
                    const devtoolsBtn = document.createElement('button');
                    devtoolsBtn.className = 'b3-button b3-button--text';
                    devtoolsBtn.title = '打开开发者工具';
                    devtoolsBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconCode"></use></svg>';

                    devtoolsBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            if (webview && typeof webview.openDevTools === 'function') {
                                webview.openDevTools();
                            } else if (webview && typeof (webview.getWebContents) === 'function') {
                                const wc = webview.getWebContents();
                                if (wc && typeof wc.openDevTools === 'function') wc.openDevTools();
                            } else {
                                console.warn('webview.openDevTools not available in this environment.');
                            }
                        } catch (err) {
                            console.warn('打开开发者工具失败:', err);
                        }
                    });
                    navbar.appendChild(devtoolsBtn);

                    container.appendChild(navbar);

                    // 创建 webview 容器包装
                    const webviewWrapper = document.createElement('div');
                    webviewWrapper.style.flex = '1';
                    webviewWrapper.style.position = 'relative';
                    webviewWrapper.style.overflow = 'hidden';

                    // ----------------- 搜索栏开始 -----------------
                    const searchBar = document.createElement('div');
                    searchBar.style.position = 'absolute';
                    searchBar.style.top = '0';
                    searchBar.style.right = '20px';
                    searchBar.style.background = 'var(--b3-theme-surface)';
                    searchBar.style.border = '1px solid var(--b3-border-color)';
                    searchBar.style.borderTop = 'none';
                    searchBar.style.borderRadius = '0 0 4px 4px';
                    searchBar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    searchBar.style.zIndex = '100';
                    searchBar.style.display = 'none';
                    searchBar.style.alignItems = 'center';
                    searchBar.style.padding = '4px 8px';
                    searchBar.style.gap = '4px';

                    const searchInput = document.createElement('input');
                    searchInput.className = 'b3-text-field';
                    searchInput.placeholder = '查找...';
                    searchInput.style.fontSize = '12px';
                    searchInput.style.padding = '2px 4px';
                    searchInput.style.width = '160px';
                    searchInput.style.height = '24px';

                    const searchCount = document.createElement('span');
                    searchCount.style.fontSize = '12px';
                    searchCount.style.color = 'var(--b3-theme-on-surface-light)';
                    searchCount.style.minWidth = '40px';
                    searchCount.style.textAlign = 'center';
                    searchCount.innerText = '0/0';

                    const createSearchBtn = (iconId: string, title: string) => {
                        const btn = document.createElement('button');
                        btn.className = 'b3-button b3-button--text';
                        btn.style.width = '24px';
                        btn.style.height = '24px';
                        btn.style.padding = '4px';
                        btn.title = title;
                        btn.innerHTML = `<svg class="b3-button__icon" style="width:14px;height:14px;"><use xlink:href="#${iconId}"></use></svg>`;
                        return btn;
                    };

                    const prevBtn = createSearchBtn('iconUp', '上一个');
                    const nextBtn = createSearchBtn('iconDown', '下一个');
                    const closeSearchBtn = createSearchBtn('iconClose', '关闭');

                    searchBar.appendChild(searchInput);
                    searchBar.appendChild(searchCount);
                    searchBar.appendChild(prevBtn);
                    searchBar.appendChild(nextBtn);
                    searchBar.appendChild(closeSearchBtn);

                    webviewWrapper.appendChild(searchBar);
                    // ----------------- 搜索栏结束 -----------------

                    // 创建 webview/iframe 元素：Electron 环境使用 webview，其他环境降级为 iframe
                    const isElec = navigator.userAgent.toLowerCase().includes('electron');
                    const webview = document.createElement(isElec ? 'webview' : 'iframe') as any;
                    if (!isElec) {
                        webview.reload = function () {
                            const t = webview.src;
                            webview.src = '';
                            setTimeout(() => {
                                webview.src = t;
                            }, 100);
                        };
                        webview.canGoBack = function () {
                            return false;
                        };
                        webview.canGoForward = function () {
                            return false;
                        };
                        webview.goBack = function () { };
                        webview.goForward = function () { };
                        webview.stopFindInPage = function () { };
                        webview.findInPage = function () { };
                        webview.stop = function () { };
                        webview.getURL = function () {
                            return webview.src;
                        };
                        webview.executeJavaScript = function () {
                            return Promise.resolve();
                        };
                        const origAdd = webview.addEventListener;
                        webview.addEventListener = function (e: string, t: EventListenerOrEventListenerObject) {
                            if (e === 'dom-ready' || e === 'did-stop-loading') {
                                origAdd.call(webview, 'load', t);
                            } else {
                                origAdd.call(webview, e, t);
                            }
                        };
                    }
                    webview.style.width = '100%';
                    webview.style.height = '100%';
                    webview.style.border = 'none';

                    // 生成干净的 User-Agent（移除 Electron、SiYuan 及其相关 URL 标记）
                    const generateCleanUserAgent = (url: string) => {
                        const originUA = navigator.userAgent || '';

                        // 对于 Google 域名，直接返回原始 UA，不进行清理
                        // Google 的服务可能对 User-Agent 有特殊检测机制，保留原始 UA 可以避免兼容性问题
                        try {
                            const urlObj = new URL(url);
                            if (urlObj.hostname.includes('google.com') || urlObj.hostname.includes('google.')) {
                                return originUA;
                            }
                        } catch (e) {
                            // URL 解析失败，继续清理流程
                        }

                        // 目标：清理任何形式的 SiYuan 标识（例如 "SiYuan/3.5.4"、"SiYuan 3.5.4"、以及伴随的 URL 如 https://b3log.org/siyuan）
                        // 同时移除 Electron 标识，但保留 Mozilla/5.0
                        let cleanUA = originUA
                            // 移除 SiYuan/xxx
                            .replace(/SiYuan\/[0-9A-Za-z.\-]+\s*/gi, '')
                            // 移除独立的 SiYuan 词（带或不带版本号）
                            .replace(/\bSiYuan\b\s*[0-9A-Za-z.\-]*\s*/gi, '')
                            // 移除 SiYuan 相关的 URL（如 b3log.org/siyuan）
                            .replace(/https?:\/\/[^\s]*b3log\.org[^\s]*/gi, '')
                            .replace(/https?:\/\/[^\s]*siyuan[^\s]*/gi, '')
                            // 移除 Electron/xxx
                            .replace(/Electron\/\S+\s*/gi, '')
                            // 移除独立的 Electron 词（但保留 Mozilla/5.0 和其他正常内容）
                            .replace(/\bElectron\b\s*/gi, '')
                            // 合并多余空白并修剪
                            .replace(/\s+/g, ' ')
                            .trim();

                        // 确保 UA 以 Mozilla/5.0 开头（标准浏览器 UA 格式）
                        if (!cleanUA.startsWith('Mozilla/5.0')) {
                            cleanUA = 'Mozilla/5.0 ' + cleanUA;
                        }

                        // 如果清理后的 UA 仍然异常（太短或缺少关键标识），回退为标准 Chrome UA
                        if (cleanUA.length < 50 || !/Chrome\//i.test(cleanUA)) {
                            cleanUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';
                        }


                        return cleanUA;
                    };

                    // 配置 webview 属性（必须在设置 src 之前设置 partition）
                    webview.setAttribute('allowpopups', 'true');


                    // 所有 webapp 使用同一个 partition，这样可以在不同标签页和跨域导航时共享登录状态
                    // 这解决了在一个标签页登录后，新标签页或跨域跳转时需要重新登录的问题
                    const partitionName = WEBVIEW_PARTITION;
                    webview.setAttribute('partition', partitionName);

                    // 设置清理后的 User-Agent，移除 Electron 标识以避免被网站检测和限制
                    // 对于 Google 域名保留原始 UA，避免兼容性问题
                    const userAgent = generateCleanUserAgent(app.url);
                    webview.setAttribute('useragent', userAgent);

                    // 设置 Accept-Language，使 webview 请求携带插件当前语言优先级
                    webview.setAttribute('accept-language', createAcceptLanguageHeader(getCurrentLanguage()));


                    // 最后设置 src，因为 partition 等属性必须在加载 URL 之前设置
                    webview.src = app.url;

                    webviewWrapper.appendChild(webview);
                    container.appendChild(webviewWrapper);
                    element.appendChild(container);

                    // webview 是否已准备好
                    let webviewReady = false;
                    // 重定向计数器，防止无限重定向
                    let redirectCount = 0;
                    let lastUrl = app.url;
                    const MAX_REDIRECTS = 20; // 最大重定向次数
                    let recentRedirectUrls: string[] = app.url ? [app.url] : [];
                    const rememberRedirectUrl = (url: string) => {
                        if (!url) return;
                        recentRedirectUrls = [
                            url,
                            ...recentRedirectUrls.filter(item => item !== url)
                        ].slice(0, MAX_REDIRECTS);
                    };

                    // 更新导航按钮状态
                    const updateNavigationButtons = () => {
                        if (!webviewReady) {
                            return; // webview 未准备好，跳过更新
                        }
                        try {
                            backBtn.disabled = !webview.canGoBack();
                            forwardBtn.disabled = !webview.canGoForward();
                        } catch (err) {
                            console.warn('更新导航按钮状态失败:', err);
                        }
                    };

                    // 后退按钮点击事件
                    backBtn.addEventListener('click', () => {
                        try {
                            if (webview.canGoBack()) {
                                // 后退时重置重定向计数器
                                redirectCount = 0;
                                webview.goBack();
                            }
                        } catch (err) {
                            console.warn('后退失败:', err);
                        }
                    });

                    // 前进按钮点击事件
                    forwardBtn.addEventListener('click', () => {
                        try {
                            if (webview.canGoForward()) {
                                // 前进时重置重定向计数器
                                redirectCount = 0;
                                webview.goForward();
                            }
                        } catch (err) {
                            console.warn('前进失败:', err);
                        }
                    });

                    // 刷新按钮点击事件
                    refreshBtn.addEventListener('click', () => {
                        try {
                            // 刷新时重置重定向计数器
                            redirectCount = 0;
                            webview.reload();
                        } catch (err) {
                            console.warn('刷新失败:', err);
                        }
                    });

                    const openUrlInNewTab = (url: string) => {
                        if (!url) return;
                        // 从URL中提取域名作为初始标题
                        let initialTitle = 'Web Link';
                        try {
                            const urlObj = new URL(url);
                            initialTitle = urlObj.hostname || initialTitle;
                        } catch (e) {
                            console.warn('Failed to parse URL:', e);
                        }

                        // 异步获取域名图标（会缓存），获取失败则回退默认图标
                        try {
                            // 立即打开标签页，避免等待网络请求。后台异步检查本地缓存并更新图标（如果存在）
                            const tabPromise = openTab({
                                app: pluginInstance.app,
                                custom: {
                                    icon: WEBAPP_ICON_ID,
                                    title: initialTitle,
                                    data: {
                                        app: {
                                            url: url,
                                            name: initialTitle,
                                            id: "weblink_" + Date.now()
                                        }
                                    },
                                    id: pluginInstance.name + WEBAPP_TAB_TYPE
                                }
                            });

                            (async () => {
                                try {
                                    const domain = pluginInstance.getDomainFromUrl(url);
                                    if (!domain) return;

                                    if (pluginInstance.domainIconMap.has(domain)) {
                                        try {
                                            tabPromise.then((tp: any) => { try { tp.icon = pluginInstance.getWebAppIconId(domain); } catch (e) { } });
                                        } catch (e) { }
                                    }
                                } catch (e) {
                                    // 忽略错误
                                }
                            })();
                        } catch (e) {
                            console.warn('打开外部链接时图标获取异常，使用默认图标:', e);
                            openTab({
                                app: pluginInstance.app,
                                custom: {
                                    icon: WEBAPP_ICON_ID,
                                    title: initialTitle,
                                    data: {
                                        app: {
                                            url: url,
                                            name: initialTitle,
                                            id: "weblink_" + Date.now()
                                        }
                                    },
                                    id: pluginInstance.name + WEBAPP_TAB_TYPE
                                }
                            });
                        }
                    };

                    // ----------------- 搜索功能逻辑 -----------------
                    const performSearch = (forward = true, findNext = false) => {
                        const query = searchInput.value;
                        if (!query) {
                            webview.stopFindInPage('clearSelection');
                            searchCount.innerText = '0/0';
                            return;
                        }
                        webview.findInPage(query, { forward, findNext });
                    };

                    const showSearchBar = () => {
                        searchBar.style.display = 'flex';
                        searchInput.focus();
                        searchInput.select();
                        // 延迟一下再搜索，确保 UI 渲染完成
                        setTimeout(() => {
                            if (searchInput.value) {
                                performSearch(true, false);
                            }
                        }, 50);
                    };

                    const hideSearchBar = () => {
                        searchBar.style.display = 'none';
                        webview.stopFindInPage('clearSelection');
                        webview.focus();
                    };

                    searchInput.addEventListener('input', () => {
                        performSearch(true, false);
                    });

                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            performSearch(!e.shiftKey, true);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideSearchBar();
                        }
                    });

                    prevBtn.addEventListener('click', () => performSearch(false, true));
                    nextBtn.addEventListener('click', () => performSearch(true, true));
                    closeSearchBtn.addEventListener('click', hideSearchBar);

                    webview.addEventListener('found-in-page', (e: any) => {
                        if (e.result) {
                            searchCount.innerText = `${e.result.activeMatchOrdinal}/${e.result.matches}`;
                        }
                    });

                    // 绑定容器的 Ctrl+F (当焦点在 webview 外部时)
                    container.addEventListener('keydown', (e: KeyboardEvent) => {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                            e.preventDefault();
                            e.stopPropagation();
                            showSearchBar();
                        }
                    });
                    // ----------------- 搜索功能逻辑结束 -----------------

                    // 监听 webview 导航事件
                    webview.addEventListener('did-navigate', (event: any) => {
                        const newUrl = event.url || webview.getURL();
                        const seenRecently = recentRedirectUrls.includes(newUrl);

                        // 检测重定向循环
                        if (newUrl === lastUrl || seenRecently) {
                            redirectCount++;
                            if (redirectCount > MAX_REDIRECTS) {
                                console.error('检测到重定向循环，停止加载:', newUrl);
                                webview.stop();
                                pushErrMsg(`页面重定向次数过多，可能存在循环重定向问题`);
                                return;
                            }
                        } else {
                            redirectCount = 0;
                        }
                        lastUrl = newUrl;
                        rememberRedirectUrl(newUrl);

                        urlInput.value = newUrl;
                        updateNavigationButtons();

                        // 添加到历史记录（先使用 URL 作为标题，等标题更新时再更新）
                        pluginInstance.addToWebViewHistory(newUrl, newUrl);

                        // 导航后尝试更新标签图标（域名发生变化时）
                        (async () => {
                            try {
                                const iconId = await pluginInstance.getOrCreateIconForDomain(newUrl);
                                try { if (this.tab) (this.tab as any).icon = iconId; } catch (e) { }
                                try {
                                    // 根据当前标签页标题尝试更新 tab header 的 svg
                                    const titleText = (this.tab && this.tab.title) ? this.tab.title : '';
                                    const headers = document.querySelectorAll('li[data-type="tab-header"]');
                                    for (const h of Array.from(headers)) {
                                        const textEl = h.querySelector('.item__text');
                                        if (textEl && textEl.textContent && titleText && textEl.textContent.indexOf(titleText) !== -1) {
                                            const useEl = h.querySelector('svg use');
                                            if (useEl) useEl.setAttribute('xlink:href', `#${iconId}`);
                                            break;
                                        }
                                    }
                                } catch (e) { }
                            } catch (e) { }
                        })();
                    });

                    webview.addEventListener('did-navigate-in-page', (event: any) => {
                        const newUrl = event.url || webview.getURL();
                        urlInput.value = newUrl;
                        updateNavigationButtons();
                    });

                    webview.addEventListener('did-start-loading', () => {
                        updateNavigationButtons();
                    });

                    webview.addEventListener('did-stop-loading', () => {
                        // 加载完成后重置重定向计数器
                        redirectCount = 0;
                        try {
                            const currentUrl = webview.getURL();
                            recentRedirectUrls = currentUrl ? [currentUrl] : [];
                        } catch {
                            recentRedirectUrls = lastUrl ? [lastUrl] : [];
                        }
                        updateNavigationButtons();
                    });

                    // 监听新窗口打开事件 (拦截 target="_blank" 或 window.open)
                    webview.addEventListener('new-window', (e: any) => {
                        e.preventDefault();
                        const url = e.url;
                        if (url) {
                            openUrlInNewTab(url);
                        }
                    });

                    // 监听加载失败事件
                    webview.addEventListener('did-fail-load', (event: any) => {
                        // errorCode -3 是 ERR_ABORTED，通常是正常的页面跳转，不需要报错
                        if (event.errorCode !== -3 && event.errorCode !== 0) {
                            console.error('Webview 加载失败:', event);
                            pushErrMsg(`页面加载失败 (错误代码: ${event.errorCode}): ${event.errorDescription || '未知错误'}`);
                        }
                    });

                    // 监听页面标题更新事件，动态更新标签页标题
                    webview.addEventListener('page-title-updated', (event: any) => {
                        const newTitle = event.title;
                        if (newTitle && this.tab && typeof this.tab.updateTitle === 'function') {
                            this.tab.updateTitle(newTitle);
                        }

                        // 更新历史记录的标题
                        const currentUrl = webview.getURL();
                        if (currentUrl && newTitle) {
                            pluginInstance.addToWebViewHistory(currentUrl, newTitle);
                        }
                    });

                    // 全屏状态标志
                    let isFullscreen = false;

                    // 切换全屏函数
                    const toggleFullscreen = () => {
                        isFullscreen = !isFullscreen;

                        if (isFullscreen) {
                            // 进入全屏
                            container.style.position = 'fixed';
                            container.style.top = '0';
                            container.style.left = '0';
                            container.style.right = '0';
                            container.style.bottom = '0';
                            container.style.width = '100vw';
                            container.style.height = '100vh';
                            container.style.zIndex = '9999';
                            container.style.background = 'var(--b3-theme-background)';
                            fullscreenBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconContract"></use></svg>';
                            fullscreenBtn.title = '退出全屏 (Esc 或 Alt+Y)';
                        } else {
                            // 退出全屏
                            container.style.position = '';
                            container.style.top = '';
                            container.style.left = '';
                            container.style.right = '';
                            container.style.bottom = '';
                            container.style.width = '';
                            container.style.height = '';
                            container.style.zIndex = '';
                            container.style.background = '';
                            fullscreenBtn.innerHTML = '<svg class="b3-button__icon"><use xlink:href="#iconFullscreen"></use></svg>';
                            fullscreenBtn.title = '全屏 (Alt+Y)';
                        }
                    };

                    // 全屏按钮点击事件
                    fullscreenBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFullscreen();
                    });

                    // 在默认浏览器中打开按钮点击事件
                    const openInDefaultBrowser = () => {
                        try {
                            const currentUrl = urlInput.value || app.url;
                            // 尝试通过后端接口打开（如果可用）
                            const backend = typeof getBackend === 'function' ? (getBackend() as any) : null;
                            if (backend && typeof backend.openExternal === 'function') {
                                backend.openExternal(currentUrl);
                                return;
                            }

                            // 尝试使用 window.siyuan 提供的方法（不同环境可能暴露不同接口）
                            if ((window as any).siyuan && typeof (window as any).siyuan.openExternal === 'function') {
                                (window as any).siyuan.openExternal(currentUrl);
                                return;
                            }

                            // 回退到 window.open
                            window.open(currentUrl, '_blank', 'noopener');
                        } catch (err) {
                            console.warn('打开外部链接失败，使用 window.open 回退：', err);
                            const currentUrl = urlInput.value || app.url;
                            window.open(currentUrl, '_blank', 'noopener');
                        }
                    };

                    openInBrowserBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openInDefaultBrowser();
                    });

                    // 复制标签页按钮点击事件
                    duplicateTabBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentUrl = urlInput.value || app.url;

                        // 从URL中提取域名作为初始标题
                        let initialTitle = 'Web Link';
                        try {
                            const urlObj = new URL(currentUrl);
                            initialTitle = urlObj.hostname || initialTitle;
                        } catch (err) {
                            console.warn('Failed to parse URL:', err);
                        }

                        // 使用当前 Tab 的 icon，如果没有则使用默认 icon
                        const currentIcon = this.tab?.icon || WEBAPP_ICON_ID;

                        openTab({
                            app: pluginInstance.app,
                            custom: {
                                icon: currentIcon,
                                title: initialTitle,
                                data: {
                                    app: {
                                        url: currentUrl,
                                        name: initialTitle,
                                        id: "weblink_" + Date.now()
                                    }
                                },
                                id: pluginInstance.name + WEBAPP_TAB_TYPE
                            }
                        });
                    });

                    // 监听 console 消息处理 webview 内部的快捷键和链接点击
                    webview.addEventListener('console-message', (e: any) => {
                        const msg = e.message || '';

                        // 处理快捷键消息
                        if (msg.startsWith(WEBVIEW_HOTKEY_PREFIX)) {
                            const key = msg.substring(WEBVIEW_HOTKEY_PREFIX.length);

                            if (key === 'alt-left') {
                                // Alt+← 后退
                                try {
                                    if (webview.canGoBack()) {
                                        redirectCount = 0;
                                        webview.goBack();
                                    }
                                } catch (err) {
                                    console.warn('后退失败:', err);
                                }
                            } else if (key === 'alt-right') {
                                // Alt+→ 前进
                                try {
                                    if (webview.canGoForward()) {
                                        redirectCount = 0;
                                        webview.goForward();
                                    }
                                } catch (err) {
                                    console.warn('前进失败:', err);
                                }
                            } else if (key === 'alt-y') {
                                // Alt+Y 切换全屏
                                toggleFullscreen();
                            } else if (key === 'ctrl-f') {
                                // Ctrl+F 搜索
                                showSearchBar();
                            } else if (key === 'escape') {
                                // Esc 退出全屏 或 关闭搜索
                                if (searchBar.style.display !== 'none') {
                                    hideSearchBar();
                                } else if (isFullscreen) {
                                    toggleFullscreen();
                                }
                            }
                            return;
                        }

                        // 处理链接打开消息
                        if (msg.startsWith(WEBVIEW_LINK_PREFIX)) {
                            const url = msg.substring(WEBVIEW_LINK_PREFIX.length);
                            if (url) {
                                openUrlInNewTab(url);
                            }
                        }
                    });

                    // 注入脚本函数：监听键盘事件和点击事件
                    const injectScript = () => {
                        try {
                            const script = `
                                (function() {
                                    // 注入一次即可，防止重复 (使用新标记 v3 避免缓存问题)
                                    if (!window.${WEBVIEW_INJECTED_FLAG}) {
                                        window.${WEBVIEW_INJECTED_FLAG} = true;

                                    // 键盘事件监听
                                    document.addEventListener('keydown', function(e) {
                                        // Alt+← 后退
                                        if (e.altKey && e.key === 'ArrowLeft') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('${WEBVIEW_HOTKEY_PREFIX}alt-left');
                                            return false;
                                        }
                                        // Alt+→ 前进
                                        if (e.altKey && e.key === 'ArrowRight') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('${WEBVIEW_HOTKEY_PREFIX}alt-right');
                                            return false;
                                        }
                                        // Alt+Y 全屏
                                        if (e.altKey && (e.key === 'y' || e.key === 'Y')) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('${WEBVIEW_HOTKEY_PREFIX}alt-y');
                                            return false;
                                        }
                                        // Esc 退出全屏 或 关闭搜索
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('${WEBVIEW_HOTKEY_PREFIX}escape');
                                            return false;
                                        }
                                        // Ctrl+F OR Cmd+F 搜索
                                        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('${WEBVIEW_HOTKEY_PREFIX}ctrl-f');
                                            return false;
                                        }
                                    }, true);

                                    // 链接点击处理函数
                                    const handleLinkClick = function(e) {
                                        var target = e.target;
                                        // 查找最近的 a 标签
                                        while (target && target.tagName !== 'A' && target !== document) {
                                            target = target.parentNode;
                                        }
                                        
                                        if (target && target.tagName === 'A') {
                                            // 检查是否为中键点击 (button === 1)
                                            var isMiddleClick = e.button === 1;

                                            // 处理 target="_blank" 或 Ctrl+Click (Windows/Linux) 或 Cmd+Click (Mac) 或中键点击
                                            // 显式检查 'target' 属性是否为 '_blank'
                                            var hasBlankTarget = target.getAttribute('target') === '_blank';
                                            
                                            var shouldOpenInNewTab = hasBlankTarget || 
                                                                      e.ctrlKey || 
                                                                      e.metaKey || 
                                                                      isMiddleClick;
                                            
                                            if (shouldOpenInNewTab && target.href) {
                                                // 极力阻止默认行为
                                                e.preventDefault();
                                                e.stopPropagation();
                                                e.stopImmediatePropagation();
                                                
                                                // 使用 console.log 传递消息
                                                console.log('${WEBVIEW_LINK_PREFIX}' + target.href);
                                                return false;
                                            }
                                        }
                                    };

                                    // 监听点击事件 (捕获阶段)
                                    document.addEventListener('click', handleLinkClick, true);
                                    // 监听辅助点击事件 (如中键)
                                    document.addEventListener('auxclick', handleLinkClick, true);
                                    }
                                })();
                            `;
                            webview.executeJavaScript(script);
                        } catch (err) {
                            console.warn('无法注入监听脚本:', err);
                        }
                    };

                    // 尝试在 webview 加载完成后注入键盘监听和点击拦截
                    webview.addEventListener('dom-ready', () => {
                        webviewReady = true; // 标记 webview 已准备好

                        // 尝试移除可能的 CSP 限制 (仅作为防御性编程，可能在某些 Electron 环境不起作用)
                        // webview.executeJavaScript... 

                        injectScript();
                        updateNavigationButtons(); // 初始化导航按钮状态
                    });

                    // 在页面开始加载时也尝试注入 (针对部分已存在内容的页面或 SPA 切换)
                    webview.addEventListener('did-start-loading', () => {
                        // 此时注入可能因为页面刷新而被冲掉，但对于 SPA 路由跳转有效
                        updateNavigationButtons();
                    });

                    // 在导航完成后再次注入，确保万无一失
                    webview.addEventListener('did-navigate', () => {
                        injectScript();
                    });

                }
            },
            beforeDestroy() {
            },
            destroy() {
                // 清理工作（如果需要）
            }
        });

    }

    async onLayoutReady() {
        const layoutRunId = this.openCodeInitRunId;
        if (!this.isOpenCodeInitCurrent(layoutRunId)) return;

        // 注册主要图标（在 addDock 之前确保图标已就绪）
        this.addIcons(`
    <symbol id="${MAIN_ICON_ID}" viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4 9h-2v2h2v-2zm-4 0H8v2h2v-2z" fill="currentColor"/>
    </symbol>
    `);
        //布局加载完成的时候,会自动调用这个函数
        // 注册AI侧栏
        const pluginInstance = this;
        this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 400, height: 0 },
                icon: MAIN_ICON_ID,
                title: PLUGIN_DISPLAY_NAME,
            },
            data: {
                text: PLUGIN_BRAND_NAME
            },
            type: AI_SIDEBAR_TYPE,
            init(dock) {
                const element = dock.element as HTMLElement;
                pluginInstance.aiSidebarApps.set(element, new AISidebar({
                    target: dock.element,
                    props: {
                        plugin: pluginInstance
                    }
                }));
            },
            destroy() {
                pluginInstance.aiSidebarApps.destroy(this.element as HTMLElement);
            }
        });
        // 注册已保存的小程序图标
        // 由于 onload() 中已经调用了 loadSettings()，
        // 这里直接再次调用 loadSettings() 以获取合并后的设置（包含默认的内置 webApps）
        try {
            const settings = await this.loadSettings();
            if (!this.isOpenCodeInitCurrent(layoutRunId)) return;

            if (settings?.webApps && Array.isArray(settings.webApps)) {
                for (const app of settings.webApps) {
                    if (app.icon && app.icon.startsWith('data:image')) {
                        this.registerWebAppIcon(app.id, app.icon);
                    }
                }
            }

            // 注册已缓存的域名 favicon（如果有），从独立的缓存文件加载
            this.domainIconMap.clear();
            try {
                // 读取 webappIcon 目录下的所有图标
                const files = await readDir(WEBAPP_ICON_DIR);
                if (!this.isOpenCodeInitCurrent(layoutRunId)) return;

                if (files && Array.isArray(files)) {
                    for (const file of files) {
                        if (file.isDir) continue;

                        // 支持的后缀
                        const supportedExts = ['.icon', '.png', '.ico', '.svg', '.jpg', '.jpeg', '.gif', '.webp'];
                        const ext = supportedExts.find(e => file.name.toLowerCase().endsWith(e));

                        if (ext) {
                            // 移除后缀得到域名
                            const domain = file.name.substring(0, file.name.length - ext.length);
                            this.domainIconMap.set(domain, file.name);

                            // 异步加载并注册，不阻塞主流程
                            getFileBlob(getWebAppIconPath(file.name)).then(async (blob) => {
                                if (!this.isOpenCodeInitCurrent(layoutRunId)) return;
                                if (blob) {
                                    // 对于图片文件，转换为 dataURL
                                    try {
                                        const iconData = await this.blobToDataURL(blob);
                                        if (iconData) {
                                            this.registerWebAppIcon(domain, iconData);
                                        }
                                    } catch (e) {
                                        // ignore
                                    }
                                }
                            }).catch(() => { });
                        }
                    }
                }
            } catch (e) {
                // 目录可能不存在，尝试创建
                try {
                    await putFile(WEBAPP_ICON_DIR, true, new Blob([]));
                } catch (err) {
                    // ignore
                }
            }
            if (!this.isOpenCodeInitCurrent(layoutRunId)) return;

            // 监听链接点击事件（仅在启用时）
            this.syncLinkClickListener(!!settings?.openLinksInWebView);
        } catch (e) {
            console.error('Failed to register webapp icons:', e);
        }
    }

    /**
     * 设置链接点击监听器
     * 根据设置决定是否在 webview 中打开外部链接
     * 直接监听 div.protyle-wysiwyg 下的 span[data-type="a"] 链接点击
     */
    private setupLinkClickListener() {
        if (this.linkClickHandler) {
            return;
        }

        // 使用事件委托，监听所有 protyle 编辑器容器
        this.linkClickHandler = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // 检查点击的是否为思源链接: span[data-type="a"]
            if (target.tagName === 'SPAN' && target.getAttribute('data-type') === 'a') {
                const href = target.getAttribute('data-href');

                // 只处理 https 开头的链接
                if (href && href.startsWith('https://')) {
                    // 检查是否在 protyle-wysiwyg 容器内
                    if (target.closest('.protyle-wysiwyg')) {
                        // 立即阻止默认行为（必须在异步操作之前）
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();

                        const settings = await this.loadSettings();

                        // 如果未启用 webview 打开链接功能，在外部浏览器打开
                        if (!settings.openLinksInWebView) {
                            window.open(href, '_blank', 'noopener,noreferrer');
                            return false;
                        }

                        console.log('[Link Click] 在 webview 中打开:', href);

                        // 提取链接标题
                        const linkTitle = target.textContent?.trim() || href;

                        // 在新的 webview 标签页中打开
                        const appData = {
                            id: `link-${Date.now()}`,
                            name: linkTitle.length > 50 ? linkTitle.substring(0, 50) + '...' : linkTitle,
                            url: href,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        };

                        // 立即打开标签页，避免等待网络请求。后台异步检查本地缓存并更新图标（如果存在）
                        const tabPromise = openTab({
                            app: this.app,
                            custom: {
                                icon: WEBAPP_ICON_ID,
                                title: appData.name,
                                data: {
                                    app: appData
                                },
                                id: this.name + WEBAPP_TAB_TYPE
                            }
                        });

                        // 后台检查本地 favicon 缓存（不触发网络请求）；若存在则注册并更新标签图标
                        (async () => {
                            try {
                                const domain = this.getDomainFromUrl(href);
                                if (!domain) return;

                                if (this.domainIconMap.has(domain)) {
                                    try {
                                        tabPromise.then((tp: any) => { try { tp.icon = this.getWebAppIconId(domain); } catch (e) { } });
                                    } catch (e) { }
                                }
                            } catch (e) {
                                // 忽略错误，不影响打开体验
                            }
                        })();

                        return false;
                    }
                }
            }
        };

        document.addEventListener('click', this.linkClickHandler, true); // 使用捕获阶段，确保能先于其他处理器执行
    }

    private removeLinkClickListener() {
        if (!this.linkClickHandler) {
            return;
        }
        document.removeEventListener('click', this.linkClickHandler, true);
        this.linkClickHandler = null;
    }

    private syncLinkClickListener(enabled: boolean) {
        if (enabled) {
            this.setupLinkClickListener();
        } else {
            this.removeLinkClickListener();
        }
    }

    /**
     * 自定义编辑器工具栏
     */
    updateProtyleToolbar(toolbar: Array<string | any>) {
        toolbar.push("|");
        toolbar.push({
            name: "ai-chat-with-selection",
            icon: MAIN_ICON_ID,
            hotkey: "⌥⌘C",
            tipPosition: "n",
            tip: "AI 问答",
            click: (protyle: any) => {
                this.openChatDialog(protyle);
            }
        });
        return toolbar;
    }

    /**
     * 打开AI聊天对话框
     */
    private async openChatDialog(protyle: any) {
        // 获取选中的内容（优先获取HTML，然后转换为Markdown）
        let selectedMarkdown = '';

        try {
            // 尝试获取选中的内容
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (!range.collapsed) {
                    // 如果有选区，获取选中的HTML内容
                    const div = document.createElement('div');
                    div.appendChild(range.cloneContents());
                    const selectedHtml = div.innerHTML;

                    // 使用Lute将HTML转换为Markdown
                    if (typeof window !== 'undefined' && (window as any).Lute) {
                        const lute = (window as any).Lute.New();
                        selectedMarkdown = lute.HTML2Md(selectedHtml);
                    } else {
                        // 如果Lute不可用，使用纯文本作为降级方案
                        selectedMarkdown = selection.toString().trim();
                    }
                }
            }

            // 如果没有选中内容或转换失败，尝试获取光标所在块的内容
            if (!selectedMarkdown && protyle?.wysiwyg?.element) {
                const focusElement = protyle.wysiwyg.element.querySelector('.protyle-wysiwyg--hl');
                if (focusElement) {
                    // 获取整个块的HTML并转换为Markdown
                    const blockHtml = focusElement.innerHTML;
                    if (typeof window !== 'undefined' && (window as any).Lute) {
                        const lute = (window as any).Lute.New();
                        selectedMarkdown = lute.HTML2Md(blockHtml);
                    } else {
                        selectedMarkdown = focusElement.textContent || '';
                    }
                }
            }
        } catch (error) {
            console.error('Failed to get selected content:', error);
        }

        // 生成唯一的对话框ID
        const dialogId = `chat-dialog-${Date.now()}`;

        // 创建对话框
        const dialog = new Dialog({
            title: t("toolbar.aiChatDialog"),
            content: `<div id="${dialogId}" style="height: 100%;"></div>`,
            width: "800px",
            height: "700px",
            destroyCallback: () => {
                // 清理对话框实例
                const dialogData = this.chatDialogs.get(dialogId);
                if (dialogData?.app) {
                    dialogData.app.$destroy();
                }
                this.chatDialogs.delete(dialogId);
            }
        });

        // 创建聊天组件
        const chatApp = new ChatDialog({
            target: dialog.element.querySelector(`#${dialogId}`),
            props: {
                plugin: this,
                initialMessage: selectedMarkdown ? `> ${selectedMarkdown}\n\n` : ''
            }
        });

        // 保存对话框实例
        this.chatDialogs.set(dialogId, { dialog, app: chatApp });
    }

    private getOpenCodeWorkingDir(): string {
        try {
            const workspaceDir = (window as any)?.siyuan?.config?.system?.workspaceDir || '';
            if (workspaceDir) {
                return `${workspaceDir.replace(/[\\/]+$/, '')}${OPENCODE_WORKSPACE_DIR}`;
            }
        } catch {
            // Fall through to the process-local fallback below.
        }

        const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function'
            ? process.cwd()
            : '.';
        return `${cwd.replace(/[\\/]+$/, '')}/opencode-workspace`;
    }

    private isOpenCodeInitCurrent(runId: number): boolean {
        return !this.isUnloaded && this.openCodeInitRunId === runId;
    }

    private async initOpenCodeServer(settingsOverride?: any, runId = this.openCodeInitRunId): Promise<{ success: boolean; error?: string }> {
        try {
            const settings = settingsOverride || await getSettings();
            if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
            const url = new URL(serverUrl);
            const port = parseInt(url.port) || 4096;
            const hostname = url.hostname || '127.0.0.1';
            const skipTlsVerify = settings?.aiProviders?.opencode?.skipTlsVerify !== false;

            try {
                await ensureManagedOpenCodeWorkspace();
            } catch (err) {
                console.warn('[OpenCode] Failed to prepare managed workspace:', err);
            }
            if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

            const available = await ensureServerRunning({
                port,
                hostname,
                workingDir: this.getOpenCodeWorkingDir(),
                skipTlsVerify,
            });
            if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

            if (!available.success) {
                const cliCheck = await detectOpenCodeCLI();
                if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

                if (!cliCheck.found) {
                    pushErrMsg(t('aiSidebar.errors.opencodeNotFound') || 'OpenCode CLI not found. Please install it from https://opencode.ai');
                } else {
                    pushErrMsg(t('aiSidebar.errors.opencodeStartFailed') || `Failed to start OpenCode server: ${available.error}`);
                }
                console.warn(`[OpenCode] ${available.error}`);
                return { success: false, error: available.error };
            } else {
                console.log(`[OpenCode] Server ready at ${hostname}:${port}`);
                startHealthPoll(serverUrl);
                return { success: true };
            }
        } catch (err) {
            console.warn('[OpenCode] Failed to auto-start server:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    async restartOpenCodeServer(settingsOverride?: any): Promise<{ success: boolean; error?: string }> {
        try {
            clearPendingOpenCodeStop();
            const runId = ++this.openCodeInitRunId;
            stopHealthPoll(false);

            const settings = settingsOverride || await getSettings();
            if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

            const serverUrl = settings?.aiProviders?.opencode?.serverUrl || 'http://localhost:4096';
            const url = new URL(serverUrl);
            const port = parseInt(url.port) || 4096;
            const hostname = url.hostname || '127.0.0.1';
            const skipTlsVerify = settings?.aiProviders?.opencode?.skipTlsVerify !== false;

            const restarted = await restartServe({
                port,
                hostname,
                workingDir: this.getOpenCodeWorkingDir(),
                skipTlsVerify,
            });
            if (!this.isOpenCodeInitCurrent(runId)) return { success: false, error: 'OpenCode initialization was superseded.' };

            if (!restarted.success) {
                pushErrMsg(t('aiSidebar.errors.opencodeStartFailed') || `Failed to restart OpenCode server: ${restarted.error}`);
                return { success: false, error: restarted.error };
            }

            startHealthPoll(serverUrl);
            return { success: true };
        } catch (err) {
            console.warn('[OpenCode] Failed to restart server:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    onunload() {
        //当插件被禁用的时候，会自动调用这个函数
        this.isUnloaded = true;
        this.openCodeInitRunId++;
        this.eventBus.off("open-menu-doctree", this.openMenuDoctreeBindThis);
        this.eventBus.off("click-editortitleicon", this.clickEditorTitleIconBindThis);
        this.eventBus.off("open-menu-link", this.openMenuLinkBindThis);
        this.removeLinkClickListener();
        for (const { dialog } of Array.from(this.chatDialogs.values())) {
            dialog.destroy();
        }
        this.chatDialogs.clear();
        this.settingDialog?.destroy();
        this.settingDialog = null;
        for (const app of Array.from(this.aiTabApps.values())) {
            app.$destroy();
        }
        this.aiTabApps.clear();
        this.aiSidebarApps.destroyAll();

        // SiYuan sync can transiently unload/reload plugins. Delay stopping the
        // spawned OpenCode server so in-flight async sessions are not interrupted.
        scheduleOpenCodeStop();
        stopHealthPoll();

        console.log(`${PLUGIN_BRAND_NAME} onunload`);
    }

    private openMenuDoctree({ detail }: any) {
        const menu = detail.menu;
        const elements: NodeListOf<HTMLElement> = detail.elements;
        const type: string = detail.type;
        // 仅对文档类型显示
        if (type !== 'doc' || !elements || elements.length === 0) return;
        const docId = elements[0]?.getAttribute("data-node-id");
        if (!docId) return;

        menu.addItem({
            icon: MAIN_ICON_ID,
            label: t('menu.summarizeDoc'),
            click: () => {
                this.summarizeDocInSidebar(docId);
            }
        });
    }

    private clickEditorTitleIcon({ detail }: any) {
        const menu = detail.menu;
        const data = detail.data;
        const docId = data?.rootID || data?.id;
        if (!docId) return;

        menu.addItem({
            icon: MAIN_ICON_ID,
            label: t('menu.summarizeDoc'),
            click: () => {
                this.summarizeDocInSidebar(docId);
            }
        });
    }

    private openMenuLink({ detail }: any) {
        const menu = detail.menu;
        const element: HTMLElement = detail.element;
        if (!element) return;

        const href = element.getAttribute('data-href');
        if (!href || !href.startsWith('https://')) return;

        menu.addItem({
            icon: WEBAPP_ICON_ID,
            label: t('menu.openLinkInTab'),
            click: () => {
                const linkTitle = element.textContent?.trim() || href;
                const appData = {
                    id: `link-${Date.now()}`,
                    name: linkTitle.length > 50 ? linkTitle.substring(0, 50) + '...' : linkTitle,
                    url: href,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                openTab({
                    app: this.app,
                    custom: {
                        icon: WEBAPP_ICON_ID,
                        title: appData.name,
                        data: { app: appData },
                        id: this.name + WEBAPP_TAB_TYPE
                    }
                });

            }
        });
    }

    private summarizeDocInSidebar(docId: string) {
        // 显示侧栏 dock
        const dockType = this.name + AI_SIDEBAR_TYPE;
        const dockBtn = document.querySelector(`span.dock__item[data-type="${dockType}"]`) as HTMLElement;
        if (dockBtn && !dockBtn.classList.contains("dock__item--active")) {
            dockBtn.click();
        }
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent(SUMMARY_EVENT, {
                detail: { docId }
            }));
        }, 300);
    }

    async uninstall() {
        //当插件被卸载的时候，会自动调用这个函数
        console.log(`${PLUGIN_BRAND_NAME} uninstall`);
        // 删除配置文件
        await this.removeData(SETTINGS_FILE);
        await this.removeData(WEBVIEW_HISTORY_FILE);
    }

    /**
     * 打开设置对话框
     */
    // 重写 openSetting 方法
    async openSetting() {
        this.settingDialog?.destroy();

        let pannel: SettingPanel | null = null;
        const dialog = new Dialog({
            title: t("settings.settingsPanel"),
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "800px",
            height: "700px",
            destroyCallback: () => {
                pannel?.$destroy();
                if (this.settingDialog === dialog) {
                    this.settingDialog = null;
                }
            }
        });

        pannel = new SettingPanel({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
        this.settingDialog = dialog;
    }
    /**
     * 加载设置
     */
    async loadSettings() {
        const rawSettings = (await this.loadData(SETTINGS_FILE)) || {};
        const settings = normalizeSettings(rawSettings);
        let shouldPersist = JSON.stringify(settings) !== JSON.stringify(rawSettings);

        // 迁移：如果存在旧的 aiProviders.v3 配置，迁移为自定义平台（customProviders）
        try {
            if (settings.aiProviders && settings.aiProviders.v3) {
                if (!settings.aiProviders.customProviders || !Array.isArray(settings.aiProviders.customProviders)) {
                    settings.aiProviders.customProviders = [];
                }

                const legacy = settings.aiProviders.v3;
                const newId = `v3`;
                const newPlatform = {
                    id: newId,
                    name: legacy.name || 'V3 API',
                    apiKey: legacy.apiKey || (settings as any).aiApiKey || '',
                    customApiUrl: legacy.customApiUrl || 'https://api.gpt.ge',
                    models: legacy.models || []
                };

                const existingIndex = settings.aiProviders.customProviders.findIndex((provider: any) => provider?.id === newId);
                if (existingIndex >= 0) {
                    settings.aiProviders.customProviders[existingIndex] = {
                        ...settings.aiProviders.customProviders[existingIndex],
                        ...newPlatform,
                    };
                } else {
                    settings.aiProviders.customProviders.push(newPlatform);
                }

                const seenCustomProviderIds = new Set<string>();
                const dedupedCustomProviders = settings.aiProviders.customProviders.filter((provider: any) => {
                    if (!provider?.id) return true;
                    if (seenCustomProviderIds.has(provider.id)) return false;
                    seenCustomProviderIds.add(provider.id);
                    return true;
                });
                if (dedupedCustomProviders.length !== settings.aiProviders.customProviders.length) {
                    settings.aiProviders.customProviders = dedupedCustomProviders;
                }

                // 如果用户选中了旧的 v3 平台，切换到新创建的自定义平台
                if (settings.selectedProviderId === 'v3') {
                    settings.selectedProviderId = newId;
                }
                if (settings.currentProvider === 'v3') {
                    settings.currentProvider = newId;
                }

                // 删除旧配置以避免重复使用
                delete settings.aiProviders.v3;

                // 如果存在老的单个平台字段，也一并清理（兼容旧版本）
                if ((settings as any).aiProvider === 'v3') delete (settings as any).aiProvider;

                shouldPersist = true;
                pushMsg('检测到旧的 V3 配置，已迁移为自定义平台');
            }
        } catch (e) {
            console.error('Settings migration failed:', e);
        }

        // 迁移：自动为已有模型设置能力
        try {
            if (settings.pluginData.modelCapabilitiesInitialized) {
                // 已执行过，跳过
            } else if (settings.aiProviders) {
                // 检查是否真正有配置了模型的用户（排除首次安装的默认空配置）
                let hasActualModels = false;
                const builtInProviders = ['Achuan', 'gemini', 'deepseek', 'openai', 'moonshot', 'volcano'];

                // 检查内置平台是否有实际配置的模型
                for (const providerId of builtInProviders) {
                    const providerConfig = settings.aiProviders[providerId];
                    if (providerConfig && Array.isArray(providerConfig.models) && providerConfig.models.length > 0) {
                        // 检查是否有非空模型（有 id 和 name 的）
                        if (providerConfig.models.some((m: any) => m.id && m.name)) {
                            hasActualModels = true;
                            break;
                        }
                    }
                }

                // 检查自定义平台是否有实际配置的模型
                if (!hasActualModels && Array.isArray(settings.aiProviders.customProviders)) {
                    for (const customProvider of settings.aiProviders.customProviders) {
                        if (Array.isArray(customProvider.models) && customProvider.models.length > 0) {
                            if (customProvider.models.some((m: any) => m.id && m.name)) {
                                hasActualModels = true;
                                break;
                            }
                        }
                    }
                }

                // 只有真正有配置模型的用户才执行能力设置
                if (hasActualModels) {
                    // 处理内置平台
                    for (const providerId of builtInProviders) {
                        const providerConfig = settings.aiProviders[providerId];
                        if (providerConfig && Array.isArray(providerConfig.models)) {
                            for (const model of providerConfig.models) {
                                if (model.id) {
                                    model.capabilities = getModelCapabilities(model.id);
                                }
                            }
                        }
                    }

                    // 处理自定义平台
                    if (Array.isArray(settings.aiProviders.customProviders)) {
                        for (const customProvider of settings.aiProviders.customProviders) {
                            if (Array.isArray(customProvider.models)) {
                                for (const model of customProvider.models) {
                                    if (model.id) {
                                        model.capabilities = getModelCapabilities(model.id);
                                    }
                                }
                            }
                        }
                    }

                    settings.pluginData.modelCapabilitiesInitialized = true;
                    shouldPersist = true;
                    pushMsg('已自动为现有模型设置能力');
                } else {
                    // 首次安装或没有实际模型的用户，直接标记为已完成，不显示消息
                    settings.pluginData.modelCapabilitiesInitialized = true;
                    shouldPersist = true;
                }
            }
        } catch (e) {
            console.error('Auto set model capabilities failed:', e);
        }

        const defaultSettings = getDefaultSettings();
        const mergedSettings = normalizeSettings(settings);

        // 检测是否需要保存设置
        let needsSave = shouldPersist;

        const settingsKeys = Object.keys(rawSettings || {});
        const isFirstInstall = !rawSettings || settingsKeys.length === 0;

        // 只有非首次安装且 webApps 为空时，才需要补充内置 webApps
        if (!isFirstInstall && settings && (!settings.webApps || !Array.isArray(settings.webApps) || settings.webApps.length === 0)) {
            // 从默认设置中获取内置 webApps
            if (defaultSettings.webApps && Array.isArray(defaultSettings.webApps) && defaultSettings.webApps.length > 0) {
                mergedSettings.webApps = defaultSettings.webApps;
                needsSave = true;
            }
        }

        await this.migrateSessions(mergedSettings);

        if (needsSave) {
            await this.saveData(SETTINGS_FILE, mergedSettings);
        }

        // 更新 store
        updateSettings(mergedSettings);
        return mergedSettings;
    }

    /**
     * 保存设置
     */
    async saveSettings(settings: any) {
        const normalizedSettings = normalizeSettings(settings);
        await this.saveData(SETTINGS_FILE, normalizedSettings);
        // 更新 store，通知所有订阅者
        updateSettings(normalizedSettings);
        this.syncLinkClickListener(!!normalizedSettings.openLinksInWebView);
    }

    /**
     * 迁移旧会话存储到独立文件
     */
    async migrateSessions(settings: any) {

        // 加载会话数据
        let data = await loadJsonFile<{ sessions?: any[] } | null>(CHAT_SESSIONS_PATH, null);
        if (!data) {
            data = await this.loadData('chat-sessions.json');
            if (data?.sessions) {
                await saveJsonFile(CHAT_SESSIONS_PATH, data);
            }
        }
        const sessions = data?.sessions || [];

        // 如果没有会话数据或已迁移过，直接返回
        if (sessions.length === 0 || settings.pluginData?.sessionStorageMigrated) {
            return;
        }

        let migratedCount = 0;

        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            // 如果 messages 存在且不为空，说明是旧版全量存储，需要迁移
            if (session.messages && session.messages.length > 0) {
                try {
                    // 先处理消息中的资源（提取 base64 到 SiYuan 存储）
                    const processedMessages = await Promise.all(
                        session.messages.map(async (msg: any) => {
                            const newAttachments = msg.attachments
                                ? await Promise.all(
                                      msg.attachments.map(async (att: any) => {
                                          // 如果有 data 且没有 path，尝试保存为资源
                                          if (
                                              att.data &&
                                              att.data.startsWith('data:') &&
                                              !att.path
                                          ) {
                                              try {
                                                  const blob = base64ToBlob(
                                                      att.data,
                                                      att.mimeType || 'image/png'
                                                  );
                                                  const assetPath = await saveAsset(blob, att.name);
                                                  return { ...att, data: '', path: assetPath };
                                              } catch (e) {
                                                  console.error('Failed to migrate attachment:', e);
                                                  return att;
                                              }
                                          }
                                          return att;
                                      })
                                  )
                                : undefined;

                            const newGeneratedImages = msg.generatedImages
                                ? await Promise.all(
                                      msg.generatedImages.map(async (img: any) => {
                                          if (img.data && img.data.length > 50 && !img.path) {
                                              try {
                                                  const blob = base64ToBlob(
                                                      img.data,
                                                      img.mimeType || 'image/png'
                                                  );
                                                  const assetPath = await saveAsset(
                                                      blob,
                                                      'generated-image.png'
                                                  );
                                                  return { ...img, data: '', path: assetPath };
                                              } catch (e) {
                                                  console.error(
                                                      'Failed to migrate generated image:',
                                                      e
                                                  );
                                                  return img;
                                              }
                                          }
                                          return img;
                                      })
                                  )
                                : undefined;

                            return {
                                ...msg,
                                attachments: newAttachments,
                                generatedImages: newGeneratedImages,
                            };
                        })
                    );

                    // 保存完整内容到 individual 文件
                    const path = getSessionPath(session.id);
                    const content = JSON.stringify({ messages: processedMessages }, null, 2);
                    const blob = new Blob([content], { type: 'application/json' });
                    await putFile(path, false, blob);

                    // 更新 metadata
                    session.messageCount = session.messages.filter((m: any) => m.role !== 'system').length;
                    delete session.messages;
                    migratedCount++;
                } catch (e) {
                    console.error(`Failed to migrate session ${session.id}:`, e);
                }
            }
        }

        // 只有在实际迁移了会话数据时才保存设置和更新迁移标志
        if (migratedCount > 0) {
            // 保存 metadata 到 chat-sessions.json
            const metadata = sessions.map((s: any) => {
                const { messages: _, ...rest } = s;
                return {
                    ...rest,
                    messageCount:
                        s.messageCount ||
                        (s.messages ? s.messages.filter((m: any) => m.role !== 'system').length : 0),
                };
            });
            await saveJsonFile(CHAT_SESSIONS_PATH, { sessions: metadata });
            console.log(`Successfully migrated ${migratedCount} sessions.`);

            // 更新配置中的迁移标志
            if (!settings.pluginData) {
                settings.pluginData = { sessionStorageMigrated: true };
            } else {
                settings.pluginData.sessionStorageMigrated = true;
            }
            await this.saveSettings(settings);
        }
    }

    /**
     * 打开AI标签页
     */
    openAITab() {
        const tabId = this.name + AI_TAB_TYPE;
        openTab({
            app: this.app,
            custom: {
                title: PLUGIN_DISPLAY_NAME,
                icon: MAIN_ICON_ID,
                id: tabId,
                data: {
                    time: Date.now()
                }
            }
        });
    }

    /**
     * 在新窗口打开AI
     */
    async openAIWindow() {
        const tabId = this.name + AI_TAB_TYPE;
        const tab = openTab({
            app: this.app,
            custom: {
                title: PLUGIN_DISPLAY_NAME,
                icon: MAIN_ICON_ID,
                id: tabId,
            }
        });

        openWindow({
            height: 600,
            width: 800,
            tab: await tab,
        });
    }

}
