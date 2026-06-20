import { base64ToBlob, loadAsset, saveAsset } from '../utils/assets';

export async function saveBase64ImagesInContent(content: string): Promise<string> {
    const matches = Array.from(
        content.matchAll(/!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g)
    );
    let result = content;
    for (const [fullMatch, altText, dataUrl] of matches) {
        try {
            const parsed = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!parsed) continue;
            const path = await saveAsset(
                base64ToBlob(parsed[2], parsed[1]),
                `image-${Date.now()}.${parsed[1].split('/')[1] || 'png'}`
            );
            result = result.replace(fullMatch, `![${altText}](${path})`);
        } catch (error) {
            console.error('Failed to save base64 image:', error);
        }
    }
    return result;
}

export async function replaceAssetPathsWithBlob(content: string): Promise<string> {
    const matches = Array.from(
        content.matchAll(/!\[([^\]]*)\]\((\/data\/storage\/petal\/(?:siyuan-copilot-opencode|siyuan-plugin-copilot)\/assets\/[^)]+)\)/g)
    );
    let result = content;
    for (const [fullMatch, altText, path] of matches) {
        try {
            const url = await loadAsset(path);
            if (url) result = result.replace(fullMatch, `![${altText}](${url})`);
        } catch (error) {
            console.error('Failed to load asset for display:', error);
        }
    }
    return result;
}
