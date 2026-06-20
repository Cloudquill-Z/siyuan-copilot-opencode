import type { ToolCall } from '../ai-chat';
import { getBlockByID, getHPathByID, sql } from '../api';
import { escapeSqlString } from './diff-utils';

export interface ToolChangeContext {
    operationType: 'update' | 'insert' | 'delete' | 'rename';
    docId: string;
    docTitle: string;
    oldDocTitle: string;
    affectedBlockId: string;
    renameTitleTo?: string;
}

async function getDocName(docId: string): Promise<string> {
    try {
        const block = await getBlockByID(docId);
        if (block?.content?.trim()) return block.content.trim();
    } catch (error) {
        console.warn('Get document title by block failed:', error);
    }
    try {
        const rows = await sql(
            `SELECT content FROM blocks WHERE id = '${escapeSqlString(docId)}' LIMIT 1`
        );
        if (rows?.[0]?.content?.trim()) return rows[0].content.trim();
    } catch (error) {
        console.warn('Get document title by SQL failed:', error);
    }
    return '';
}

async function getDocDisplayTitle(docId: string): Promise<string> {
    try {
        const path = await getHPathByID(docId);
        if (path?.trim() && path !== docId) return path;
    } catch (error) {
        console.warn('Get document path failed:', error);
    }
    return (await getDocName(docId)) || `文档 ${docId}`;
}

export async function resolveToolChangeContext(
    toolCall: ToolCall
): Promise<ToolChangeContext | null> {
    const toolName = toolCall.function.name;
    const supported = new Set([
        'siyuan_update_block',
        'siyuan_insert_block',
        'siyuan_delete_block',
        'siyuan_rename_document',
    ]);
    if (!supported.has(toolName)) return null;
    try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const operationType = toolName.includes('insert')
            ? 'insert'
            : toolName.includes('delete')
              ? 'delete'
              : toolName.includes('rename')
                ? 'rename'
                : 'update';
        const targetBlockId = operationType === 'insert'
            ? args.nextID || args.previousID || args.parentID || args.appendParentID || ''
            : args.id || '';
        if (!targetBlockId) return null;
        let block = await getBlockByID(targetBlockId);
        if (!block) {
            const rows = await sql(
                `SELECT id, root_id, type FROM blocks WHERE id = '${escapeSqlString(targetBlockId)}' LIMIT 1`
            );
            block = rows?.[0] || null;
        }
        const docId = block?.type === 'd' ? block.id : block?.root_id || targetBlockId;
        const docTitle = await getDocDisplayTitle(docId);
        return {
            operationType,
            docId,
            docTitle,
            oldDocTitle: (await getDocName(docId)) || docTitle,
            affectedBlockId: targetBlockId,
            renameTitleTo: operationType === 'rename' ? String(args.title || '').trim() : undefined,
        };
    } catch (error) {
        console.warn('Resolve tool change context failed:', error);
        return null;
    }
}

export { getDocName };
