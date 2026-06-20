<script lang="ts">
    import { confirm } from 'siyuan';
    import { pushErrMsg } from '../../../api';
    import { t } from '../../../utils/i18n';

    export let plugin: any;
    export let prompts: any[] = [];
    let open = false;
    let editing: any = null;
    let title = '';
    let content = '';

    export function show(prompt: any = null) {
        editing = prompt;
        title = prompt?.title || '';
        content = prompt?.content || '';
        open = true;
    }

    export function remove(promptId: string) {
        confirm(t('aiSidebar.confirm.deletePrompt.title'), t('aiSidebar.confirm.deletePrompt.message'), async () => {
            prompts = prompts.filter(prompt => prompt.id !== promptId);
            await persist();
        });
    }

    function close() {
        open = false;
        editing = null;
        title = '';
        content = '';
    }

    async function persist() {
        try {
            await plugin.saveData('prompts.json', { prompts });
        } catch (error) {
            console.error('Save prompts error:', error);
            pushErrMsg(t('aiSidebar.errors.savePromptFailed'));
        }
    }

    async function save() {
        if (!title.trim() || !content.trim()) return pushErrMsg(t('aiSidebar.errors.emptyPromptContent'));
        if (editing) {
            prompts = prompts.map(prompt => prompt.id === editing.id
                ? { ...prompt, title: title.trim(), content: content.trim() }
                : prompt);
        } else {
            prompts = [{ id: `prompt_${Date.now()}`, title: title.trim(), content: content.trim(), createdAt: Date.now() }, ...prompts];
        }
        await persist();
        close();
    }
</script>

{#if open}
    <div class="ai-sidebar__prompt-dialog">
        <div class="ai-sidebar__prompt-dialog-overlay" on:click={close}></div>
        <div class="ai-sidebar__prompt-dialog-content">
            <div class="ai-sidebar__prompt-dialog-header"><h4>{editing ? t('aiSidebar.prompt.edit') : t('aiSidebar.prompt.create')}</h4><button class="b3-button b3-button--text" on:click={close}><svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg></button></div>
            <div class="ai-sidebar__prompt-dialog-body"><div class="ai-sidebar__prompt-form">
                <div class="ai-sidebar__prompt-form-field"><label class="ai-sidebar__prompt-form-label" for="prompt-title">标题</label><input id="prompt-title" type="text" bind:value={title} placeholder={t('aiSidebar.prompt.titlePlaceholder')} class="b3-text-field" /></div>
                <div class="ai-sidebar__prompt-form-field"><label class="ai-sidebar__prompt-form-label" for="prompt-content">内容</label><textarea id="prompt-content" bind:value={content} placeholder="输入提示词内容" class="b3-text-field ai-sidebar__prompt-textarea" rows="20"></textarea></div>
                <div class="ai-sidebar__prompt-form-actions"><button class="b3-button b3-button--cancel" on:click={close}>取消</button><button class="b3-button b3-button--primary" on:click={save}>{editing ? '更新' : '保存'}</button></div>
            </div></div>
        </div>
    </div>
{/if}
