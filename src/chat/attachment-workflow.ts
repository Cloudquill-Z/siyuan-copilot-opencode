import { pushErrMsg, pushMsg } from '../api';
import { saveAsset } from '../utils/assets';
import { fetchWithWebView, parseMultipleWebPages } from '../utils/webParser';
import { AttachmentController, validateAttachmentFile } from './attachment-controller';

export class AttachmentWorkflow {
    constructor(private readonly controller: AttachmentController) {}

    async addFile(file: File): Promise<void> {
        const validation = validateAttachmentFile(file);
        if (validation === 'unsupported') throw new Error('unsupported');
        if (validation === 'too_large') throw new Error('too_large');
        if (file.type.startsWith('image/')) {
            await this.controller.addImage(file, URL.createObjectURL(file));
        } else {
            await this.controller.addText(file);
        }
    }

    async addFiles(files: File[], concurrency = 3): Promise<void> {
        for (let index = 0; index < files.length; index += concurrency) {
            await Promise.all(files.slice(index, index + concurrency).map(file => this.addFile(file)));
        }
    }

    async addFromPaste(event: ClipboardEvent): Promise<boolean> {
        for (const item of Array.from(event.clipboardData?.items || [])) {
            if (!item.type.startsWith('image/') && item.kind !== 'file') continue;
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            await this.addFile(file);
            return true;
        }
        return false;
    }

    async addWebPages(urls: string[]): Promise<number> {
        let successCount = 0;
        const results = await parseMultipleWebPages(urls, (current, total, url, success) => {
            if (success) pushMsg(`正在获取 (${current}/${total}): ${url}`);
        });
        for (const result of results) {
            let markdown = result.success ? result.markdown : '';
            let title = result.title;
            if (!markdown) {
                pushMsg(`普通模式失败，尝试 WebView 模式: ${result.url}`);
                try {
                    const fallback = await fetchWithWebView(result.url);
                    markdown = fallback.success ? fallback.markdown || '' : '';
                    title = fallback.title;
                } catch (error) {
                    console.error('WebView fetch error:', error);
                }
            }
            if (!markdown) {
                pushErrMsg(`✗ 获取失败: ${result.url} - ${result.error || 'WebView 模式失败'}`);
                continue;
            }
            const host = new URL(result.url).hostname.replace(/[^a-zA-Z0-9]/g, '_');
            const path = await saveAsset(
                new Blob([markdown], { type: 'text/markdown' }),
                `${host}_${Date.now()}.md`
            );
            this.controller.addWebPage(result.url, markdown, path);
            successCount++;
            pushMsg(`✓ 成功获取: ${title || result.url}`);
        }
        return successCount;
    }
}
