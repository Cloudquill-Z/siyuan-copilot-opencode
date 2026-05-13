<script lang="ts">
    import { onDestroy } from 'svelte';
    import { connectionStatusStore, refreshHealth, type ConnectionStatus } from '../stores/connectionStatus';
    import { t } from '../utils/i18n';

    export let showVersion: boolean = true;
    export let showRetry: boolean = true;
    export let compact: boolean = false;

    let status: ConnectionStatus = { state: 'disconnected', version: '', serverUrl: '', lastChecked: 0, error: '' };
    const unsub = connectionStatusStore.subscribe(v => { status = v; });

    onDestroy(() => { unsub(); });

    function handleRetry() {
        refreshHealth();
    }

    function formatTime(ts: number): string {
        if (!ts) return '--';
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        return `${Math.floor(diff / 60)}m ago`;
    }
</script>

{#if compact}
    <span class="connection-dot" class:connected={status.state === 'connected'} class:disconnected={status.state === 'disconnected'} class:connecting={status.state === 'connecting'}
          title={status.state === 'connected' ? `OpenCode v${status.version}` : status.error || 'Disconnected'}></span>
{:else}
    <div class="connection-bar">
        <div class="connection-indicator">
            <span class="connection-dot" class:connected={status.state === 'connected'} class:disconnected={status.state === 'disconnected'} class:connecting={status.state === 'connecting'}></span>
            <span class="connection-text">
                {#if status.state === 'connected'}
                    OpenCode {showVersion && status.version ? `v${status.version}` : ''}
                {:else if status.state === 'connecting'}
                    连接中…
                {:else}
                    未连接
                {/if}
            </span>
        </div>
        {#if showRetry && status.state === 'disconnected' && status.serverUrl}
            <button class="retry-btn" on:click={handleRetry}>重新连接</button>
        {/if}
        {#if status.lastChecked > 0}
            <span class="last-check">{formatTime(status.lastChecked)}</span>
        {/if}
    </div>
{/if}

<style>
    .connection-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        background: var(--b3-theme-surface);
        border-bottom: 1px solid var(--b3-border-color);
        font-size: 12px;
        flex-shrink: 0;
        min-height: 28px;
    }
    .connection-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .connection-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
    }
    .connection-dot.connected {
        background: #22C55E;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
    }
    .connection-dot.disconnected {
        background: #EF4444;
    }
    .connection-dot.connecting {
        background: #F59E0B;
        animation: pulse 1s ease-in-out infinite;
    }
    .connection-text {
        color: var(--b3-theme-on-surface);
    }
    .retry-btn {
        padding: 2px 8px;
        background: var(--b3-theme-primary);
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
    }
    .retry-btn:hover {
        opacity: 0.85;
    }
    .last-check {
        margin-left: auto;
        color: var(--b3-theme-on-surface-light);
        font-size: 10px;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }
</style>
