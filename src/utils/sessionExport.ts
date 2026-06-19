export interface SessionExportContext {
    userName?: string;
    providers?: Record<string, any>;
    currentProvider?: string;
    currentModelId?: string;
    userFallback?: string;
    assistantFallback?: string;
}

export interface SessionExportSnapshot {
    sessionId: string;
    title: string;
    messages: any[];
}

export function cleanModelName(value?: string): string {
    return String(value || '').replace(/^(?:\s*✅)+\s*/, '').trim();
}

function getProviderConfig(providers: Record<string, any> | undefined, provider: string): any {
    if (!providers) return undefined;
    const direct = providers[provider];
    if (direct && !Array.isArray(direct)) return direct;
    return Array.isArray(providers.customProviders)
        ? providers.customProviders.find((item: any) => item?.id === provider)
        : undefined;
}

function findConfiguredModel(
    providers: Record<string, any> | undefined,
    provider: string,
    modelId: string
): any {
    const models = getProviderConfig(providers, provider)?.models;
    if (!Array.isArray(models)) return undefined;
    return models.find(
        (model: any) =>
            String(model?.id || '') === modelId ||
            (model?.providerID && `${model.providerID}/${model.id}` === modelId)
    );
}

function platformAndModel(provider: string, modelId: string, modelName: string, fallback: string): string {
    const parts = modelId.split('/').filter(Boolean);
    const platform =
        parts.length > 1
            ? parts.slice(0, -1).join('/')
            : provider === 'opencode'
              ? 'OpenCode'
              : provider || 'OpenCode';
    const model = cleanModelName(modelName) || parts[parts.length - 1] || modelId || fallback;
    return `${platform} / ${model}`;
}

export function resolveAssistantDisplayName(message: any, context: SessionExportContext): string {
    const selected = Array.isArray(message?.multiModelResponses)
        ? message.multiModelResponses.find((item: any) => item?.isSelected) ||
          message.multiModelResponses.find((item: any) => item?.content) ||
          message.multiModelResponses[0]
        : undefined;
    const provider = String(
        selected?.provider || message?.provider || context.currentProvider || 'opencode'
    );
    const modelId = String(
        selected?.modelId || message?.modelId || context.currentModelId || ''
    );
    const configured = findConfiguredModel(context.providers, provider, modelId);
    const modelName = cleanModelName(
        configured?.name || selected?.modelName || message?.modelName || configured?.id || modelId
    );
    return platformAndModel(
        provider,
        configured?.id || modelId,
        modelName,
        context.assistantFallback || 'AI'
    );
}

function getMessageText(content: any): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter(part => part?.type === 'text' && part.text)
        .map(part => part.text)
        .join('\n');
}

function resolveResponseDisplayName(response: any, context: SessionExportContext): string {
    return resolveAssistantDisplayName(
        {
            role: 'assistant',
            provider: response?.provider,
            modelId: response?.modelId,
            modelName: response?.modelName,
        },
        context
    );
}

export function buildSessionMarkdown(messages: any[], context: SessionExportContext): string {
    const sections: string[] = [];
    for (const message of messages || []) {
        if (message?.role !== 'user' && message?.role !== 'assistant') continue;

        if (message.role === 'user') {
            const userName = String(context.userName || '').trim() || context.userFallback || 'User';
            sections.push(`## ${userName}\n\n${getMessageText(message.content)}`);
        } else {
            const assistantName = resolveAssistantDisplayName(message, context);
            const responses = Array.isArray(message.multiModelResponses)
                ? message.multiModelResponses
                : [];
            if (responses.length > 0) {
                const responseSections = responses.map((response: any) => {
                    const selectedMark = response.isSelected ? ' ✅' : '';
                    const parts = [
                        `#### ${resolveResponseDisplayName(response, context)}${selectedMark}`,
                    ];
                    if (response.thinking) {
                        parts.push(`**思考过程：**\n\n${response.thinking}`);
                    }
                    if (response.content) parts.push(getMessageText(response.content));
                    if (response.error) parts.push(`**错误：** ${response.error}`);
                    return parts.join('\n\n');
                });
                sections.push(
                    `## ${assistantName}\n\n### 多模型对比\n\n${responseSections.join('\n\n')}`
                );
            } else {
                sections.push(`## ${assistantName}\n\n${getMessageText(message.finalReply || message.content)}`);
            }
        }

        if (Array.isArray(message.attachments) && message.attachments.length > 0) {
            const attachments = message.attachments.map((attachment: any) =>
                attachment.type === 'image'
                    ? `![${attachment.name}](${attachment.url || attachment.data || attachment.path || ''})`
                    : `- ${attachment.name}`
            );
            sections[sections.length - 1] += `\n\n### 附件\n\n${attachments.join('\n\n')}`;
        }
        if (Array.isArray(message.contextDocuments) && message.contextDocuments.length > 0) {
            const documents = message.contextDocuments.map(
                (doc: any) => `- [${doc.title}](siyuan://blocks/${doc.id})`
            );
            sections[sections.length - 1] += `\n\n### 相关上下文\n\n${documents.join('\n')}`;
        }
    }
    return sections.length > 0 ? `${sections.join('\n\n')}\n` : '';
}

export function createSessionExportSnapshot(
    sessionId: string,
    title: string,
    messages: any[]
): SessionExportSnapshot {
    const clone =
        typeof structuredClone === 'function'
            ? structuredClone(messages || [])
            : JSON.parse(JSON.stringify(messages || []));
    return { sessionId, title, messages: clone };
}

export function sanitizeDocumentName(name: string, fallback = 'AI 对话'): string {
    const sanitized = String(name || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\.{2,}/g, '.')
        .trim();
    return sanitized || fallback;
}
