<script lang="ts">
    import { onMount } from 'svelte';
    import { getTodoProgress, type OpenCodeTodo } from '../../chat/todo-state';

    export let openCodeTodos: OpenCodeTodo[] = [];

    const OPEN_DELAY_MS = 150;
    let rootElement: HTMLDivElement | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;
    let isOpen = false;
    let isPinned = false;

    $: progress = getTodoProgress(openCodeTodos);
    $: if (openCodeTodos.length === 0) closePopover();

    function clearOpenTimer() {
        if (openTimer) {
            clearTimeout(openTimer);
            openTimer = null;
        }
    }

    function closePopover() {
        clearOpenTimer();
        isOpen = false;
        isPinned = false;
    }

    function handleMouseEnter() {
        clearOpenTimer();
        if (isOpen) return;
        openTimer = setTimeout(() => {
            isOpen = true;
            openTimer = null;
        }, OPEN_DELAY_MS);
    }

    function handleMouseLeave() {
        clearOpenTimer();
        if (!isPinned) isOpen = false;
    }

    function togglePinned(event: MouseEvent) {
        event.stopPropagation();
        clearOpenTimer();
        if (isPinned) {
            closePopover();
            return;
        }
        isPinned = true;
        isOpen = true;
    }

    function getStatusLabel(status: OpenCodeTodo['status']): string {
        if (status === 'completed') return '已完成';
        if (status === 'in_progress') return '进行中';
        if (status === 'cancelled') return '已取消';
        return '待处理';
    }

    onMount(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            if (rootElement?.contains(event.target as Node)) return;
            closePopover();
        };
        const handleDocumentKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closePopover();
        };

        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('keydown', handleDocumentKeydown);
        return () => {
            clearOpenTimer();
            document.removeEventListener('click', handleDocumentClick);
            document.removeEventListener('keydown', handleDocumentKeydown);
        };
    });
</script>

{#if openCodeTodos.length > 0}
    <div
        class="ai-sidebar__todo-progress"
        bind:this={rootElement}
        on:mouseenter={handleMouseEnter}
        on:mouseleave={handleMouseLeave}
    >
        <button
            type="button"
            class="ai-sidebar__todo-trigger"
            class:ai-sidebar__todo-trigger--open={isOpen}
            aria-label={`查看 Todo 进度，已完成 ${progress.completed} 项，共 ${progress.total} 项`}
            aria-expanded={isOpen}
            aria-haspopup="true"
            on:click={togglePinned}
        >
            <span class="ai-sidebar__todo-trigger-icon" aria-hidden="true">
                <svg><use xlink:href="#iconCheck"></use></svg>
            </span>
            <span>Todo {progress.completed}/{progress.total}</span>
            <svg class="ai-sidebar__todo-trigger-chevron" class:ai-sidebar__todo-trigger-chevron--open={isOpen} aria-hidden="true">
                <use xlink:href="#iconDown"></use>
            </svg>
        </button>

        {#if isOpen}
            <div class="ai-sidebar__todo-popover" role="dialog" aria-label="Todo 任务清单" on:click|stopPropagation>
                <div class="ai-sidebar__todo-popover-header">
                    <span>任务进度</span>
                    <span>{progress.completed}/{progress.total}</span>
                </div>
                <div class="ai-sidebar__todo-list" role="list">
                    {#each openCodeTodos as todo, index (`${index}-${todo.content}`)}
                        <div
                            class="ai-sidebar__todo-item ai-sidebar__todo-item--{todo.status}"
                            role="listitem"
                            title={todo.content}
                        >
                            <span class="ai-sidebar__todo-status" aria-label={getStatusLabel(todo.status)}>
                                {#if todo.status === 'completed'}
                                    <svg><use xlink:href="#iconCheck"></use></svg>
                                {:else if todo.status === 'cancelled'}
                                    <svg><use xlink:href="#iconClose"></use></svg>
                                {:else}
                                    <span class="ai-sidebar__todo-status-dot" aria-hidden="true"></span>
                                {/if}
                            </span>
                            <span class="ai-sidebar__todo-item-text">{todo.content}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
{/if}
