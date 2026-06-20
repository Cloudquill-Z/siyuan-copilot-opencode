import { putFile, removeFile } from '../api';
import type { Message } from '../ai-chat';
import {
    CHAT_SESSIONS_PATH,
    getLegacySessionPath,
    getPluginFileBlob,
    getSessionPath,
    loadJsonFile,
    saveJsonFile,
} from '../pluginPaths';
import { mutateSessionMetadata } from '../session-metadata';
import type { TaskSession } from '../task-types';

export function prepareMessagesForStorage(messages: Message[]): Message[] {
    return messages.map(message => {
        const source = message as Message & { generatedImages?: Array<Record<string, unknown>> };
        return {
            ...source,
            attachments: source.attachments?.map(attachment => ({
                ...attachment,
                data: attachment.path ? '' : attachment.data,
            })),
            generatedImages: source.generatedImages?.map(image => ({
                ...image,
                data: '',
            })),
        } as Message;
    });
}

export function toSessionMetadata<T extends TaskSession>(
    sessions: T[],
    activeSessionIds: Set<string>
): T[] {
    return sessions.map(session => {
        const { messages, ...metadata } = session;
        return {
            ...metadata,
            status: activeSessionIds.has(session.id) ? 'running' : session.status || 'completed',
            messageCount:
                session.messageCount ||
                (messages ? messages.filter(message => message.role !== 'system').length : 0),
        } as T;
    });
}

export class SessionRepository<T extends TaskSession = TaskSession> {
    async loadMetadataWithLegacy(
        loadLegacy?: () => Promise<{ sessions?: T[] } | null>
    ): Promise<T[]> {
        const current = await loadJsonFile<{ sessions?: T[] } | null>(CHAT_SESSIONS_PATH, null);
        if (current) return current.sessions || [];
        const legacy = loadLegacy ? await loadLegacy() : null;
        if (legacy?.sessions) {
            await saveJsonFile(CHAT_SESSIONS_PATH, legacy);
        }
        return legacy?.sessions || [];
    }

    async loadMetadata(): Promise<T[]> {
        const data = await loadJsonFile<{ sessions?: T[] }>(CHAT_SESSIONS_PATH, { sessions: [] });
        return data.sessions || [];
    }

    async saveMetadata(
        sessions: T[],
        activeSessionIds: Set<string>,
        removedIds: string[] = []
    ): Promise<void> {
        const metadata = toSessionMetadata(sessions, activeSessionIds);
        await mutateSessionMetadata<T>(
            () => this.loadMetadata(),
            next => saveJsonFile(CHAT_SESSIONS_PATH, { sessions: next }),
            latest => {
                const removed = new Set(removedIds);
                const localIds = new Set(metadata.map(item => item.id));
                return [
                    ...metadata.filter(item => !removed.has(item.id)),
                    ...latest.filter(item => !removed.has(item.id) && !localIds.has(item.id)),
                ];
            }
        );
    }

    async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
        const content = JSON.stringify({ messages: prepareMessagesForStorage(messages) }, null, 2);
        await putFile(
            getSessionPath(sessionId),
            false,
            new Blob([content], { type: 'application/json' })
        );
    }

    async loadMessages(sessionId: string): Promise<Message[]> {
        const blob =
            await getPluginFileBlob(getSessionPath(sessionId)) ||
            await getPluginFileBlob(getLegacySessionPath(sessionId));
        if (!blob) throw new Error(`Session file not found: ${sessionId}`);
        const data = JSON.parse(await blob.text());
        return data?.messages || [];
    }

    async delete(sessionId: string): Promise<void> {
        await removeFile(getSessionPath(sessionId));
    }
}
