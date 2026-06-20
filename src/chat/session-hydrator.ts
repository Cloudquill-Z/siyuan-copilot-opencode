import type { Message } from '../ai-chat';
import { cleanModelName } from '../utils/sessionExport';
import { base64ToBlob, loadAsset, readAssetAsText, saveAsset } from '../utils/assets';

type HydratedMessage = Message & { generatedImages?: any[] };

export async function hydrateSessionMessages(
    loadedMessages: HydratedMessage[]
): Promise<{ messages: HydratedMessage[]; modified: boolean }> {
let sessionModified = false; // 标记会话是否被修改（需要重新保存）

// 还原图片数据 (从 path 还原为 blob url) 和文本附件数据
// 同时处理旧的 base64 格式图片，自动保存到 assets
for (const msg of loadedMessages) {
    // 处理 content 中的 Markdown 格式 base64 图片
    if (typeof msg.content === 'string' && msg.content.includes('data:image')) {
        const base64ImageRegex =
            /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
        let match;
        const imagesToProcess: Array<{
            fullMatch: string;
            altText: string;
            dataUrl: string;
        }> = [];

        // 收集所有需要处理的图片
        while ((match = base64ImageRegex.exec(msg.content)) !== null) {
            imagesToProcess.push({
                fullMatch: match[0],
                altText: match[1] || 'image',
                dataUrl: match[2],
            });
        }

        // 处理每个图片
        if (imagesToProcess.length > 0) {
            let newContent = msg.content;

            for (const imageInfo of imagesToProcess) {
                try {
                    // 解析 data URL
                    const matches = imageInfo.dataUrl.match(
                        /^data:([^;]+);base64,(.+)$/
                    );
                    if (!matches) continue;

                    const mimeType = matches[1];
                    const base64Data = matches[2];

                    // 保存到 assets
                    const blob = base64ToBlob(base64Data, mimeType);
                    const ext = mimeType.split('/')[1] || 'png';
                    const assetPath = await saveAsset(
                        blob,
                        `image-${Date.now()}.${ext}`
                    );

                    // 替换为 assets 路径，保持 Markdown 格式
                    newContent = newContent.replace(
                        imageInfo.fullMatch,
                        `![${imageInfo.altText}](${assetPath})`
                    );

                    sessionModified = true;
                    console.debug(
                        `Migrated content base64 image to assets: ${assetPath}`
                    );
                } catch (error) {
                    console.error('Failed to migrate content base64 image:', error);
                }
            }

            // 更新消息内容
            if (sessionModified) {
                msg.content = newContent;
            }
        }
    }

    if (msg.attachments) {
        for (const att of msg.attachments) {
            if (att.type === 'image') {
                if (att.path) {
                    // 从路径加载图片
                    att.data = (await loadAsset(att.path)) || '';
                } else if (
                    att.data &&
                    (att.data.startsWith('data:image') || att.data.length > 1000)
                ) {
                    // 旧格式：有 base64 数据但没有 path，自动迁移到 assets
                    try {
                        let base64Data = att.data;
                        let mimeType = att.mimeType || 'image/png';

                        // 如果是 data URL，提取 mime type 和数据
                        if (base64Data.startsWith('data:')) {
                            const matches = base64Data.match(
                                /^data:([^;]+);base64,(.+)$/
                            );
                            if (matches) {
                                mimeType = matches[1];
                                base64Data = matches[2];
                            }
                        }

                        const blob = base64ToBlob(base64Data, mimeType);
                        const ext = mimeType.split('/')[1] || 'png';
                        const name = att.name || `image-${Date.now()}.${ext}`;
                        const assetPath = await saveAsset(blob, name);

                        // 更新附件信息
                        att.path = assetPath;
                        att.data = URL.createObjectURL(blob); // 设置为 blob URL
                        att.mimeType = mimeType;

                        sessionModified = true;
                        console.debug(
                            `Migrated attachment base64 image to assets: ${assetPath}`
                        );
                    } catch (error) {
                        console.error(
                            'Failed to migrate attachment base64 image:',
                            error
                        );
                    }
                }
            } else if (att.path) {
                // 还原文本附件内容
                att.data = (await readAssetAsText(att.path)) || '';
            }
        }
    }

    if (msg.generatedImages) {
        for (const img of msg.generatedImages) {
            if (img.path) {
                // 从路径加载图片
                img.previewUrl = (await loadAsset(img.path)) || '';
            } else if (img.data && img.data.length > 0) {
                // 旧格式：有 base64 数据但没有 path，自动迁移到 assets
                try {
                    const blob = base64ToBlob(
                        img.data,
                        img.mimeType || 'image/png'
                    );
                    const ext =
                        (img.mimeType || 'image/png').split('/')[1] || 'png';
                    const name = `generated-image-${Date.now()}.${ext}`;
                    const assetPath = await saveAsset(blob, name);

                    // 更新图片信息
                    img.path = assetPath;
                    img.data = ''; // 清空 base64 数据
                    img.previewUrl = URL.createObjectURL(blob);

                    // 同时更新 attachments（如果存在）
                    if (msg.attachments) {
                        const attIndex = msg.attachments.findIndex(
                            a => a.type === 'image' && !a.path
                        );
                        if (attIndex !== -1) {
                            msg.attachments[attIndex].path = assetPath;
                            msg.attachments[attIndex].data =
                                URL.createObjectURL(blob);
                        }
                    }

                    sessionModified = true;
                    console.debug(`Migrated generated image to assets: ${assetPath}`);
                } catch (error) {
                    console.error('Failed to migrate generated image:', error);
                }
            }
        }
    }
}

const messages = [...loadedMessages];

// 【修复】检查多模型响应是否缺少选择，自动设置第一个非错误模型为选中
for (const msg of messages) {
    if (
        msg.role === 'assistant' &&
        msg.multiModelResponses &&
        msg.multiModelResponses.length > 0
    ) {
        for (const response of msg.multiModelResponses) {
            const normalizedName = cleanModelName(response.modelName);
            if (normalizedName !== response.modelName) {
                response.modelName = normalizedName;
                sessionModified = true;
            }
        }
        const hasSelected = msg.multiModelResponses.some(r => r.isSelected);
        if (!hasSelected) {
            // 找到第一个没有错误的响应
            const firstSuccessIndex = msg.multiModelResponses.findIndex(
                r => !r.error && r.content
            );
            if (firstSuccessIndex !== -1) {
                // 设置第一个成功的模型为选中
                msg.multiModelResponses.forEach((response, i) => {
                    response.isSelected = i === firstSuccessIndex;
                    if (i === firstSuccessIndex) {
                        // 更新主 content 为选中的内容
                        msg.content = response.content || '';
                        msg.thinking = response.thinking || '';
                        response.modelName = cleanModelName(response.modelName);
                    }
                });
                sessionModified = true;
                console.debug(
                    `Auto-selected first successful model (index ${firstSuccessIndex}) for message`
                );
            }
        }
    }
}
return { messages, modified: sessionModified };
}

