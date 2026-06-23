<script lang="ts">
    import { onMount } from 'svelte';
    import SessionManager from '../SessionManager.svelte';
    import { t } from '../../utils/i18n';

    export let sessions: any[] = [];
    export let currentSessionId = '';
    export let isSessionManagerOpen = false;
    export let isFullscreen = false;
    export let onNew: () => void;
    export let onLoad: (id: string) => void;
    export let onDelete: (id: string) => void;
    export let onBatchDelete: (ids: string[]) => void;
    export let onRefresh: () => void;
    export let onUpdate: (sessions: any[]) => void;
    export let onSaveToNote: (id: string) => void;
    export let onExportFile: (id: string) => void;
    export let onCopyAll: () => void;
    export let onSaveCurrent: () => void;
    export let onClear: () => void;
    export let onOpenTab: () => void;
    export let onOpenWindow: () => void;
    export let onToggleFullscreen: () => void;
    export let onOpenSettings: () => void;
    export let getSessionElapsedText: (session: any) => string;

    let showOpenMenu = false;
    onMount(() => {
        const closeOutside = (event: MouseEvent) => {
            if (!(event.target as HTMLElement).closest('.ai-sidebar__open-window-menu-container')) {
                showOpenMenu = false;
            }
        };
        document.addEventListener('click', closeOutside);
        return () => document.removeEventListener('click', closeOutside);
    });
</script>

<div class="ai-sidebar__toolbar">
    <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.session.new')} on:click={onNew}><svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg></button>
    <SessionManager
        bind:sessions
        bind:currentSessionId
        bind:isOpen={isSessionManagerOpen}
        on:refresh={onRefresh}
        on:load={event => onLoad(event.detail.sessionId)}
        on:delete={event => onDelete(event.detail.sessionId)}
        on:batchDelete={event => onBatchDelete(event.detail.sessionIds)}
        on:new={onNew}
        on:update={event => onUpdate(event.detail.sessions)}
        on:saveToNote={event => onSaveToNote(event.detail.sessionId)}
        on:exportFile={event => onExportFile(event.detail.sessionId)}
        {getSessionElapsedText}
    />
    <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.actions.copyAllChat')} on:click={onCopyAll}><svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg></button>
    <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.actions.saveToNote')} on:click={onSaveCurrent}><svg class="b3-button__icon"><use xlink:href="#iconDownload"></use></svg></button>
    <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.actions.clear')} on:click={onClear}><svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg></button>
    <div class="ai-sidebar__open-window-menu-container">
        <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.actions.openWindow') || '在新窗口打开'} on:click|stopPropagation={() => (showOpenMenu = !showOpenMenu)}><svg class="b3-button__icon"><use xlink:href="#iconOpenWindow"></use></svg></button>
        {#if showOpenMenu}
            <div class="ai-sidebar__open-window-menu">
                <button class="b3-menu__item" on:click={onOpenTab}><svg class="b3-menu__icon"><use xlink:href="#iconOpenWindow"></use></svg><span class="b3-menu__label">在页签打开</span></button>
                <button class="b3-menu__item" on:click={onOpenWindow}><svg class="b3-menu__icon"><use xlink:href="#iconOpenWindow"></use></svg><span class="b3-menu__label">在新窗口打开</span></button>
            </div>
        {/if}
    </div>
    <button class="ai-sidebar__toolbar-btn" title={isFullscreen ? '退出全屏' : '全屏查看'} on:click={onToggleFullscreen}><svg class="b3-button__icon"><use xlink:href={isFullscreen ? '#iconFullscreenExit' : '#iconFullscreen'}></use></svg></button>
    <button class="ai-sidebar__toolbar-btn" title={t('aiSidebar.actions.settings')} on:click={onOpenSettings}><svg class="b3-button__icon"><use xlink:href="#iconSettings"></use></svg></button>
</div>
