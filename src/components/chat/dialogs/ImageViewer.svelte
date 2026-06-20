<script lang="ts">
    import { onMount } from 'svelte';
    import { pushErrMsg, pushMsg } from '../../../api';

    let open = false;
    let fullscreen = false;
    let src = '';
    let name = '';

    export function show(nextSrc: string, nextName: string) {
        src = nextSrc;
        name = nextName;
        open = true;
    }

    function close() {
        open = false;
        fullscreen = false;
        src = '';
        name = '';
    }

    async function download() {
        try {
            const link = document.createElement('a');
            link.href = src;
            link.download = name || 'image.png';
            document.body.appendChild(link);
            link.click();
            link.remove();
            pushMsg('图片下载成功');
        } catch (error) {
            console.error('下载图片失败:', error);
            pushErrMsg('下载图片失败');
        }
    }

    async function copyAsPng() {
        try {
            const blob = await (await fetch(src)).blob();
            let pngBlob = blob;
            if (blob.type !== 'image/png') {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.src = URL.createObjectURL(blob);
                await new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = reject;
                });
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d');
                if (!context) throw new Error('无法创建 Canvas 上下文');
                context.drawImage(image, 0, 0);
                pngBlob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                        result => result ? resolve(result) : reject(new Error('转换图片失败')),
                        'image/png'
                    )
                );
                URL.revokeObjectURL(image.src);
            }
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            pushMsg('图片已复制到剪贴板');
        } catch (error) {
            console.error('复制图片失败:', error);
            pushErrMsg('复制图片失败，请尝试下载后复制');
        }
    }

    onMount(() => {
        const handleOutside = (event: MouseEvent) => {
            if (!open) return;
            const target = event.target as HTMLElement;
            if (
                !target.closest('.image-viewer') &&
                !target.closest('.ai-message__content img') &&
                !target.closest('.ai-message__thinking-content img') &&
                !target.closest('.ai-message__attachment-image')
            ) close();
        };
        document.addEventListener('click', handleOutside);
        return () => document.removeEventListener('click', handleOutside);
    });
</script>

{#if open}
    <div class="image-viewer" class:image-viewer--fullscreen={fullscreen}>
        <div class="image-viewer__header">
            <h3 class="image-viewer__title">{name || '图片预览'}</h3>
            <div class="image-viewer__actions">
                <button class="b3-button b3-button--text" on:click={copyAsPng} title="复制图片"><svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg><span>复制</span></button>
                <button class="b3-button b3-button--text" on:click={download} title="下载图片"><svg class="b3-button__icon"><use xlink:href="#iconDownload"></use></svg><span>下载</span></button>
                <button class="b3-button b3-button--text" on:click={() => (fullscreen = !fullscreen)} title={fullscreen ? '退出全屏' : '全屏查看'}><svg class="b3-button__icon"><use xlink:href={fullscreen ? '#iconFullscreenExit' : '#iconFullscreen'}></use></svg><span>{fullscreen ? '退出全屏' : '全屏'}</span></button>
                <button class="b3-button b3-button--text" on:click={close} title="关闭"><svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg></button>
            </div>
        </div>
        <div class="image-viewer__content"><img {src} alt={name} class="image-viewer__image" /></div>
    </div>
{/if}
