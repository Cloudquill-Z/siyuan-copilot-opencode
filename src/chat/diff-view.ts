import type { EditOperation } from '../ai-chat';
import { exportMdContent } from '../api';

export async function prepareDiffOperation(operation: EditOperation): Promise<EditOperation> {
    if ((operation.operationType || 'update') === 'insert') {
        return {
            ...operation,
            oldContent: '',
            newContent:
                operation.newContentForDisplay ||
                operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim(),
        };
    }
    let oldContent = operation.oldContentForDisplay || operation.oldContent || '';
    let newContent =
        operation.newContentForDisplay ||
        operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();
    if (
        operation.oldDocTitle &&
        operation.newDocTitle &&
        operation.oldDocTitle !== operation.newDocTitle
    ) {
        oldContent = `# 文档标题: ${operation.oldDocTitle}\n\n${oldContent}`;
        newContent = `# 文档标题: ${operation.newDocTitle}\n\n${newContent}`;
    }
    if (!operation.oldContentForDisplay) {
        try {
            const current = await exportMdContent(operation.blockId, false, false, 2, 0, false);
            if (current?.content) operation.oldContentForDisplay = current.content;
        } catch (error) {
            console.error('Get block content for diff failed:', error);
        }
    }
    return { ...operation, oldContent, newContent };
}
