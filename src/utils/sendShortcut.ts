export type SendMessageShortcut = 'ctrl+enter' | 'enter';

interface ShortcutKeyEvent {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
}

function getCurrentPlatform(): string {
    if (typeof navigator === 'undefined') return '';
    return navigator.platform || '';
}

export function isApplePlatform(platform = getCurrentPlatform()): boolean {
    return /Mac|iPhone|iPad|iPod/i.test(platform);
}

function isImeConfirming(event: ShortcutKeyEvent, isComposing = false): boolean {
    return isComposing || event.isComposing === true || event.keyCode === 229 || event.which === 229;
}

export function shouldSendMessageFromKeydown(
    event: ShortcutKeyEvent,
    sendMode: SendMessageShortcut = 'ctrl+enter',
    platform = getCurrentPlatform(),
    isComposing = false,
): boolean {
    if (event.key !== 'Enter' || isImeConfirming(event, isComposing)) {
        return false;
    }

    if (sendMode === 'enter') {
        return !event.shiftKey;
    }

    if (event.shiftKey || event.altKey) {
        return false;
    }

    if (isApplePlatform(platform)) {
        return event.metaKey === true && event.ctrlKey !== true;
    }

    return event.ctrlKey === true && event.metaKey !== true;
}
