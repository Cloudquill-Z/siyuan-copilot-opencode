<script lang="ts">
    export let open = false;
    export let fullscreen = false;
    export let src = '';
    export let name = '';
    export let onCopy: (src: string) => void;
    export let onDownload: (src: string, name: string) => void;
    export let onToggleFullscreen: () => void;
    export let onClose: () => void;
</script>

{#if open}
    <div class="image-viewer" class:image-viewer--fullscreen={fullscreen}>
        <div class="image-viewer__header">
            <h3 class="image-viewer__title">{name || '图片预览'}</h3>
            <div class="image-viewer__actions">
                <button class="b3-button b3-button--text" on:click={() => onCopy(src)} title="复制图片">
                    <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg><span>复制</span>
                </button>
                <button class="b3-button b3-button--text" on:click={() => onDownload(src, name || 'image.png')} title="下载图片">
                    <svg class="b3-button__icon"><use xlink:href="#iconDownload"></use></svg><span>下载</span>
                </button>
                <button class="b3-button b3-button--text" on:click={onToggleFullscreen} title={fullscreen ? '退出全屏' : '全屏查看'}>
                    <svg class="b3-button__icon"><use xlink:href={fullscreen ? '#iconFullscreenExit' : '#iconFullscreen'}></use></svg>
                    <span>{fullscreen ? '退出全屏' : '全屏'}</span>
                </button>
                <button class="b3-button b3-button--text" on:click={onClose} title="关闭">
                    <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                </button>
            </div>
        </div>
        <div class="image-viewer__content">
            <img {src} alt={name} class="image-viewer__image" />
        </div>
    </div>
{/if}
