import type { ContextDocument, Message } from '../../ai-chat';
import { buildMemoryPrompt } from '../../memory';
import { isPluginAssetPath } from '../../pluginPaths';
import { loadAsset } from '../../utils/assets';
import { getMessageText } from '../message-content';

type PreparedMessage = Message & { generatedImages?: any[] };
type PreparedContextDocument = Omit<ContextDocument, 'type'> & {
    type?: 'doc' | 'block' | 'webpage';
    url?: string;
};

export interface PrepareMessagesOptions {
    messages: PreparedMessage[];
    contextDocumentsWithLatestContent: PreparedContextDocument[];
    userContent: string;
    lastUserMessage: PreparedMessage;
    thinkingEnabled?: boolean;
    modelId: string;
    settings: any;
    contextCount: number;
    buildSystemPromptForCurrentRequest: () => Promise<{ baseSystemPrompt: string; hasToolInstruction: boolean }>;
}

export async function prepareMessagesForAI(options: PrepareMessagesOptions): Promise<Message[]> {
    const {
        messages,
        contextDocumentsWithLatestContent,
        userContent,
        lastUserMessage,
        thinkingEnabled = false,
        modelId,
        settings,
        contextCount,
        buildSystemPromptForCurrentRequest,
    } = options;
    // 过滤掉空的 assistant 消息，防止某些 Provider（例如 Kimi）报错
    // 但保留有生图的 assistant 消息
    // 用户拖入的文档/网页/文件只保存在消息元数据里，发送给模型前需要重新注入；
    // 否则后续轮次只会看到用户原始文字，看不到首轮附带的文章上下文。
    const includeHistoricalContext = true;
    let messagesToSend = messages
        .filter(msg => {
            if (msg.role === 'system') return false;
            if (msg.role === 'assistant') {
                const text =
                    typeof msg.content === 'string'
                        ? msg.content
                        : getMessageText(msg.content || []);
                const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
                const hasReasoning = !!msg.reasoning_content;
                const hasGeneratedImages =
                    msg.generatedImages && msg.generatedImages.length > 0;
                // 保留有 tool_calls、reasoning_content 或 generatedImages 的 assistant 消息，即便正文为空
                return (
                    (text && text.toString().trim() !== '') ||
                    hasToolCalls ||
                    hasReasoning ||
                    hasGeneratedImages
                );
            }
            return true;
        })
        .map((msg, index, array) => {
            const baseMsg: any = {
                role: msg.role,
                content: msg.content,
            };

            // 只有在启用 thinking 模式时才保留相关内容
            // 特别是 Kimi 等模型，如果启用了 thinking，历史 assistant 消息必须包含 reasoning_content
            const isDeepSeekReasonerModel = /deepseek-(reasoner|r1)/i.test(modelId || '');
            const shouldKeepReasoning = thinkingEnabled || isDeepSeekReasonerModel;

            if (msg.tool_calls) {
                baseMsg.tool_calls = msg.tool_calls;
            }
            if (msg.tool_call_id) {
                baseMsg.tool_call_id = msg.tool_call_id;
            }
            if (msg.name) {
                baseMsg.name = msg.name;
            }

            if (shouldKeepReasoning) {
                if (msg.reasoning_content !== undefined) {
                    baseMsg.reasoning_content = msg.reasoning_content;
                } else if (msg.role === 'assistant' && msg.tool_calls) {
                    // 如果启用了思考模式且有工具调用，确保 reasoning_content 字段存在（即使为空）
                    baseMsg.reasoning_content = '';
                }
            }

            const isLastMessage = index === array.length - 1;
            if (
                includeHistoricalContext &&
                !isLastMessage &&
                msg.role === 'user' &&
                msg.contextDocuments &&
                msg.contextDocuments.length > 0
            ) {
                const hasImages = msg.attachments?.some(att => att.type === 'image');
                const originalContent =
                    typeof msg.content === 'string' ? msg.content : getMessageText(msg.content);

                const contextText = (msg.contextDocuments as PreparedContextDocument[])
                    .map(doc => {
                        const label =
                            doc.type === 'doc'
                                ? '文档'
                                : doc.type === 'webpage'
                                  ? '网页'
                                  : '块';

                        // 其他情况：传递完整内容
                        if (doc.content) {
                            return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                        } else {
                            // 如果没有内容（agent模式下的文档），只传递ID
                            return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\``;
                        }
                    })
                    .join('\n\n---\n\n');

                if (hasImages) {
                    const contentParts: any[] = [];
                    let textContent = originalContent;
                    textContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    contentParts.push({ type: 'text', text: textContent });

                    msg.attachments?.forEach(att => {
                        if (att.type === 'image') {
                            contentParts.push({
                                type: 'image_url',
                                image_url: { url: att.data },
                            });
                        }
                    });

                    const fileTexts = msg.attachments
                        ?.filter(att => att.type === 'file')
                        .map(att => `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`)
                        .join('\n\n---\n\n');

                    if (fileTexts) {
                        contentParts.push({
                            type: 'text',
                            text: `\n\n以下是附件文件内容：\n\n${fileTexts}`,
                        });
                    }

                    baseMsg.content = contentParts;
                } else {
                    let enhancedContent = originalContent;

                    if (msg.attachments && msg.attachments.length > 0) {
                        const attachmentTexts = msg.attachments
                            .map(att => {
                                if (att.type === 'file') {
                                    return `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`;
                                }
                                return '';
                            })
                            .filter(Boolean)
                            .join('\n\n---\n\n');

                        if (attachmentTexts) {
                            enhancedContent += `\n\n---\n\n以下是附件内容：\n\n${attachmentTexts}`;
                        }
                    }

                    enhancedContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    baseMsg.content = enhancedContent;
                }
            }

            return baseMsg;
        });

    // 处理最后一条用户消息
    if (messagesToSend.length > 0) {
        let lastUserMessageIndex = -1;
        for (let i = messagesToSend.length - 1; i >= 0; i--) {
            if (messagesToSend[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }
        if (lastUserMessageIndex >= 0) {
            const lastMessage = messagesToSend[lastUserMessageIndex];
            const hasImages = lastUserMessage.attachments?.some(att => att.type === 'image');

            // 查找上一条assistant消息是否有生成的图片（用于图片编辑）
            let previousGeneratedImages: any[] = [];
            const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
            if (lastAssistantMsg) {
                // 检查generatedImages或attachments中的图片
                if (
                    lastAssistantMsg.generatedImages &&
                    lastAssistantMsg.generatedImages.length > 0
                ) {
                    // 从路径加载图片并转换为 blob URL
                    previousGeneratedImages = await Promise.all(
                        lastAssistantMsg.generatedImages.map(async img => {
                            let imageUrl = '';
                            if (img.path) {
                                // 从路径加载图片
                                imageUrl = (await loadAsset(img.path)) || '';
                            } else if (img.data) {
                                // 兼容旧数据（base64格式）
                                imageUrl = `data:${img.mimeType || 'image/png'};base64,${img.data}`;
                            }
                            return {
                                type: 'image_url',
                                image_url: { url: imageUrl },
                            };
                        })
                    );
                } else if (
                    lastAssistantMsg.attachments &&
                    lastAssistantMsg.attachments.length > 0
                ) {
                    // 从附件中获取图片
                    const imageAttachments = lastAssistantMsg.attachments.filter(
                        att => att.type === 'image'
                    );
                    previousGeneratedImages = await Promise.all(
                        imageAttachments.map(async att => {
                            let imageUrl = att.data;
                            // 如果附件有路径且当前data不可用，从路径重新加载
                            if (att.path && (!imageUrl || !imageUrl.startsWith('blob:'))) {
                                imageUrl = (await loadAsset(att.path)) || att.data;
                            }
                            return {
                                type: 'image_url',
                                image_url: { url: imageUrl },
                            };
                        })
                    );
                } else if (typeof lastAssistantMsg.content === 'string') {
                    // 从Markdown内容中提取图片 ![alt](url)
                    const imageRegex = /!\[.*?\]\(([^)]+)\)/g;
                    const content = lastAssistantMsg.content;
                    let match;
                    while ((match = imageRegex.exec(content)) !== null) {
                        const url = match[1];
                        // 处理 assets 路径的图片
                        if (
                            isPluginAssetPath(url)
                        ) {
                            try {
                                const blobUrl = await loadAsset(url);
                                if (blobUrl) {
                                    previousGeneratedImages.push({
                                        type: 'image_url',
                                        image_url: { url: blobUrl },
                                    });
                                }
                            } catch (error) {
                                console.error('Failed to load asset image:', error);
                            }
                        } else if (url.startsWith('http://') || url.startsWith('https://')) {
                            // HTTP/HTTPS URL 直接使用
                            previousGeneratedImages.push({
                                type: 'image_url',
                                image_url: { url: url },
                            });
                        }
                    }
                }
            }

            if (hasImages || previousGeneratedImages.length > 0) {
                const contentParts: any[] = [];
                let textContent = userContent;

                if (contextDocumentsWithLatestContent.length > 0) {
                    const contextText = contextDocumentsWithLatestContent
                        .map(doc => {
                            const label =
                                doc.type === 'doc'
                                    ? '文档'
                                    : doc.type === 'webpage'
                                      ? '网页'
                                      : '块';

                            if (doc.content) {
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            } else {
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\``;
                            }
                        })
                        .join('\n\n---\n\n');
                    textContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                }

                contentParts.push({ type: 'text', text: textContent });

                // 添加用户上传的图片附件
                lastUserMessage.attachments?.forEach(att => {
                    if (att.type === 'image') {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url: att.data },
                        });
                    }
                });

                // 添加上一次生成的图片（用于图片编辑）
                previousGeneratedImages.forEach(img => {
                    contentParts.push(img);
                });

                const fileTexts = lastUserMessage.attachments
                    ?.filter(att => att.type === 'file')
                    .map(att => `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`)
                    .join('\n\n---\n\n');

                if (fileTexts) {
                    contentParts.push({
                        type: 'text',
                        text: `\n\n以下是附件文件内容：\n\n${fileTexts}`,
                    });
                }

                lastMessage.content = contentParts;
            } else {
                let enhancedContent = userContent;

                if (lastUserMessage.attachments && lastUserMessage.attachments.length > 0) {
                    const attachmentTexts = lastUserMessage.attachments
                        .map(att => {
                            if (att.type === 'file') {
                                return `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`;
                            }
                            return '';
                        })
                        .filter(Boolean)
                        .join('\n\n---\n\n');

                    if (attachmentTexts) {
                        enhancedContent += `\n\n---\n\n以下是附件内容：\n\n${attachmentTexts}`;
                    }
                }

                if (contextDocumentsWithLatestContent.length > 0) {
                    const contextText = contextDocumentsWithLatestContent
                        .map(doc => {
                            const label =
                                doc.type === 'doc'
                                    ? '文档'
                                    : doc.type === 'webpage'
                                      ? '网页'
                                      : '块';

                            // 其他情况：传递完整内容
                            if (doc.content) {
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            } else {
                                // 如果没有内容（agent模式下的文档），只传递ID
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\``;
                            }
                        })
                        .join('\n\n---\n\n');
                    enhancedContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                }

                lastMessage.content = enhancedContent;
            }
        }
    }

    let { baseSystemPrompt, hasToolInstruction } =
        await buildSystemPromptForCurrentRequest();
    try {
        const memoryPrompt = await buildMemoryPrompt({
            settings,
            query: userContent,
            skipCoreDocId: settings.soulDocId?.trim(),
        });
        if (memoryPrompt.trim()) {
            baseSystemPrompt = `${baseSystemPrompt.trim()}\n\n${memoryPrompt}`.trim();
        }
    } catch (error) {
        console.warn('[memory] build memory prompt failed:', error);
    }

    // 添加最终的系统提示词（只要基础提示词或工具说明不为空就添加）
    if (baseSystemPrompt.trim() || hasToolInstruction) {
        messagesToSend.unshift({ role: 'system', content: baseSystemPrompt });
    }

    // 限制上下文消息数量
    const systemMessages = messagesToSend.filter(msg => msg.role === 'system');
    const otherMessages = messagesToSend.filter(msg => msg.role !== 'system');
    const limitedMessages =
        contextCount < 0
            ? otherMessages
            : otherMessages.slice(-contextCount);

    // 建立 tool_call_id => tool 消息的索引，便于补全被截断的链条
    const toolResultById = new Map<string, Message>();
    for (const msg of otherMessages) {
        if (msg.role === 'tool' && msg.tool_call_id) {
            toolResultById.set(msg.tool_call_id, msg);
        }
    }

    const limitedMessagesWithToolFix: Message[] = [];
    const includedToolCallIds = new Set<string>();

    for (const msg of limitedMessages) {
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            // 先推入 assistant
            limitedMessagesWithToolFix.push(msg);

            // 紧跟补全每一个 tool_call 的结果，保持顺序
            for (const tc of msg.tool_calls) {
                const toolMsg = toolResultById.get(tc.id);
                if (toolMsg && !includedToolCallIds.has(tc.id)) {
                    limitedMessagesWithToolFix.push(toolMsg);
                    includedToolCallIds.add(tc.id);
                }
            }
            continue;
        }

        if (msg.role === 'tool') {
            // 仅在前一条是对应的 assistant 且未加入过时保留，避免孤立 tool
            const prev = limitedMessagesWithToolFix[limitedMessagesWithToolFix.length - 1];
            if (
                prev &&
                prev.role === 'assistant' &&
                prev.tool_calls?.some(tc => tc.id === msg.tool_call_id) &&
                msg.tool_call_id &&
                !includedToolCallIds.has(msg.tool_call_id)
            ) {
                limitedMessagesWithToolFix.push(msg);
                includedToolCallIds.add(msg.tool_call_id);
            }
            continue;
        }

        // 其他消息正常保留
        limitedMessagesWithToolFix.push(msg);
    }

    messagesToSend = [...systemMessages, ...limitedMessagesWithToolFix];

    return messagesToSend;
}
