import type { Message } from '../../ai-chat';
import type { ChatMode } from '../../utils/chatMode';
import { runChat } from './run-controller';
import type { MultiModelChoice, MultiModelResponse } from './multi-model-state';

export interface MultiModelRunTarget {
    choice: MultiModelChoice;
    providerConfig: any;
    modelConfig: any;
}

export interface MultiModelRunnerOptions {
    targets: MultiModelRunTarget[];
    messages: Message[];
    signal: AbortSignal;
    mode: ChatMode;
    temperature?: number;
    isActive: () => boolean;
    processContent: (content: string) => Promise<string>;
    update: (index: number, patch: Partial<MultiModelResponse>) => void;
    settled: (index: number) => Promise<void> | void;
}

function parseCustomBody(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, unknown>;
    return JSON.parse(String(value));
}

function getWebSearchTools(model: any): any[] | undefined {
    if (!model.capabilities?.webSearch || !model.webSearchEnabled) return undefined;
    return String(model.id).toLowerCase().includes('gemini')
        ? [{ type: 'function', function: { name: 'googleSearch' } }]
        : undefined;
}

export async function runMultiModelTargets(options: MultiModelRunnerOptions): Promise<void> {
    await Promise.all(
        options.targets.map(async (target, index) => {
            const { choice, providerConfig, modelConfig } = target;
            let customBody: Record<string, unknown>;
            try {
                customBody = parseCustomBody(modelConfig.customBody);
            } catch {
                options.update(index, {
                    error: '自定义参数 JSON 格式错误',
                    isLoading: false,
                });
                await options.settled(index);
                return;
            }

            let content = '';
            let thinking = '';
            const fail = async (error: Error) => {
                if (error.message === 'Request aborted' || !options.isActive()) return;
                options.update(index, { error: error.message, isLoading: false });
                await options.settled(index);
            };

            try {
                await runChat(
                    choice.provider,
                    {
                        apiKey: providerConfig.apiKey,
                        model: modelConfig.id,
                        messages: options.messages,
                        temperature: options.temperature ?? modelConfig.temperature,
                        maxTokens: modelConfig.maxTokens > 0 ? modelConfig.maxTokens : undefined,
                        stream: true,
                        signal: options.signal,
                        enableThinking:
                            modelConfig.capabilities?.thinking &&
                            (choice.thinkingEnabled ?? modelConfig.thinkingEnabled ?? false),
                        reasoningEffort:
                            choice.thinkingEffort ?? modelConfig.thinkingEffort ?? 'low',
                        mode: options.mode,
                        tools: getWebSearchTools(modelConfig),
                        customBody,
                        onThinkingChunk: chunk => {
                            thinking += chunk;
                            options.update(index, { thinking });
                        },
                        onThinkingComplete: () =>
                            options.update(index, { thinkingCollapsed: Boolean(thinking) }),
                        onChunk: chunk => {
                            content += chunk;
                            options.update(index, { content });
                        },
                        onComplete: async text => {
                            if (!options.isActive()) return;
                            const processed = await options.processContent(text || content);
                            options.update(index, {
                                content: processed,
                                thinking,
                                thinkingCollapsed: Boolean(thinking),
                                isLoading: false,
                                conversationMessages: [...options.messages],
                            });
                            await options.settled(index);
                        },
                        onError: error => void fail(error),
                    },
                    providerConfig.customApiUrl,
                    providerConfig.advancedConfig
                );
            } catch (error) {
                await fail(error as Error);
            }
        })
    );
}
