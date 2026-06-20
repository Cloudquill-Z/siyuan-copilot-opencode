import { runChat } from './run-controller';

export async function generateSessionTitleWithModel(options: {
    provider: string;
    providerConfig: any;
    modelConfig: any;
    prompt: string;
}): Promise<string> {
    let streamed = '';
    let completed = '';
    await runChat(
        options.provider,
        {
            apiKey: options.providerConfig.apiKey,
            model: options.modelConfig.id,
            messages: [{ role: 'user', content: options.prompt }],
            temperature: options.modelConfig.temperature,
            maxTokens: 50,
            stream: true,
            onChunk: chunk => { streamed += chunk; },
            onComplete: text => { completed = text || streamed; },
            onError: error => { throw error; },
        },
        options.providerConfig.customApiUrl || options.providerConfig.serverUrl,
        options.providerConfig.advancedConfig,
        options.providerConfig.serverUrl
    );
    return (completed || streamed).trim().replace(/^["']|["']$/g, '').slice(0, 50);
}
