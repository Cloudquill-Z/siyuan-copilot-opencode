export type DiffLine = { type: 'removed' | 'added' | 'unchanged'; line: string };

export function normalizeOperationContentForDiff(content: string): string {
    return content.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();
}

export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

export function escapeDiffHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderMarkdownForSplitDiff(markdown: string): string {
    const content = markdown || '';
    try {
        const lute = typeof window !== 'undefined' && (window as any).Lute
            ? (window as any).Lute.New()
            : null;
        if (lute && typeof lute.Md2HTML === 'function') {
            lute.SetSanitize(true);
            return lute.Md2HTML(content);
        }
    } catch (error) {
        console.warn('使用 Lute 渲染差异内容失败:', error);
    }
    return `<pre>${escapeDiffHtml(content)}</pre>`;
}

export function generateSimpleDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: DiffLine[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
        const oldLine = oldLines[oldIndex] || '';
        const newLine = newLines[newIndex] || '';
        if (oldLine === newLine) {
            result.push({ type: 'unchanged', line: oldLine });
            oldIndex++;
            newIndex++;
        } else if (oldIndex < oldLines.length && newIndex < newLines.length) {
            result.push({ type: 'removed', line: oldLine }, { type: 'added', line: newLine });
            oldIndex++;
            newIndex++;
        } else if (oldIndex < oldLines.length) {
            result.push({ type: 'removed', line: oldLine });
            oldIndex++;
        } else {
            result.push({ type: 'added', line: newLine });
            newIndex++;
        }
    }
    return result;
}
