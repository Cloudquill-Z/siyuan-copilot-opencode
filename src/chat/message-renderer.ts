interface LuteRenderer {
    SetSanitize(value: boolean): void;
    SetInlineMath(value: boolean): void;
    SetInlineMathAllowDigitAfterOpenMarker(value: boolean): void;
    Md2HTML(value: string): string;
}

interface LuteFactory {
    New(): LuteRenderer;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderFallback(textContent: string): string {
    return escapeHtml(textContent)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(
            /```(\w+)?\n([\s\S]*?)```/g,
            '<pre><code class="language-$1">$2</code></pre>'
        )
        .replace(/\n/g, '<br>');
}

export function renderMessageHtml(
    textContent: string,
    luteFactory: LuteFactory | null | undefined =
        typeof window !== 'undefined' ? (window as unknown as { Lute?: LuteFactory }).Lute : null
): string {
    try {
        if (!luteFactory) {
            return renderFallback(textContent);
        }

        const lute = luteFactory.New();
        lute.SetSanitize(true);
        lute.SetInlineMath(true);
        lute.SetInlineMathAllowDigitAfterOpenMarker(true);
        return lute.Md2HTML(textContent);
    } catch (error) {
        console.error('Format message error:', error);
        return escapeHtml(textContent);
    }
}
