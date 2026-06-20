<script lang="ts">
    import { t } from '../../../utils/i18n';

    export let open = false;
    export let documentName = '';
    export let notebookId = '';
    export let pathKeyword = '';
    export let openAfterSave = false;
    export let notebooks: Array<{ id: string; name: string }> = [];
    export let pathResults: Array<{ hPath: string }> = [];
    export let pathSearching = false;
    export let showPathDropdown = false;
    export let hasDefaultPath = false;
    export let currentDocPath = '';
    export let currentDocNotebookId = '';
    export let onClose: () => void;
    export let onUseCurrentDoc: () => void;
    export let onSearchPath: () => void;
    export let onSelectPath: (path: string) => void;
    export let onConfirm: () => void;
</script>

{#if open}
    <div class="save-to-note-dialog__overlay" on:click={onClose}></div>
    <div class="save-to-note-dialog">
        <div class="save-to-note-dialog__header">
            <h3>{t('aiSidebar.session.saveToNote.title')}</h3>
            <button class="b3-button b3-button--text" on:click={onClose} title={t('common.close')}>
                <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
            </button>
        </div>
        {#if hasDefaultPath && currentDocPath && currentDocNotebookId}
            <div class="save-to-note-dialog__switch-bar">
                <button class="b3-button b3-button--outline" on:click={onUseCurrentDoc} title={t('aiSidebar.session.saveToNote.useCurrentDoc')}>
                    <svg class="b3-button__icon"><use xlink:href="#iconFile"></use></svg><span>{t('aiSidebar.session.saveToNote.useCurrentDoc')}</span>
                </button>
            </div>
        {/if}
        <div class="save-to-note-dialog__content">
            <div class="save-to-note-dialog__field">
                <label for="save-note-name">{t('aiSidebar.session.saveToNote.documentName')}</label>
                <input id="save-note-name" type="text" class="b3-text-field" bind:value={documentName} placeholder={t('aiSidebar.session.saveToNote.documentNamePlaceholder')} />
            </div>
            <div class="save-to-note-dialog__field">
                <label for="save-note-notebook">{t('aiSidebar.session.saveToNote.notebook')}</label>
                <select id="save-note-notebook" class="b3-select" bind:value={notebookId} on:change={onSearchPath}>
                    {#if notebooks.length}{#each notebooks as notebook}<option value={notebook.id}>{notebook.name}</option>{/each}{:else}<option value="">{t('common.loading')}</option>{/if}
                </select>
            </div>
            <div class="save-to-note-dialog__field">
                <label for="save-note-path">{t('aiSidebar.session.saveToNote.path')}</label>
                <div class="save-to-note-dialog__path-input-wrapper">
                    <input id="save-note-path" type="text" class="b3-text-field" bind:value={pathKeyword} on:focus={() => (showPathDropdown = true)} on:blur={() => setTimeout(() => (showPathDropdown = false), 200)} placeholder={t('aiSidebar.session.saveToNote.pathPlaceholder')} />
                    {#if showPathDropdown && (pathResults.length || pathSearching)}
                        <div class="save-to-note-dialog__path-dropdown">
                            {#if pathSearching}<div class="save-to-note-dialog__path-loading">{t('aiSidebar.session.saveToNote.searching')}</div>
                            {:else}{#each pathResults as doc}<button class="save-to-note-dialog__path-item" on:click={() => onSelectPath(doc.hPath)} title={doc.hPath}><svg class="b3-button__icon"><use xlink:href="#iconFile"></use></svg><span>{doc.hPath}</span></button>{/each}{/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
        <div class="save-to-note-dialog__footer">
            <label class="save-to-note-dialog__footer-option"><input type="checkbox" class="b3-switch" bind:checked={openAfterSave} /><span>{t('aiSidebar.session.saveToNote.openAfterSave')}</span></label>
            <div class="save-to-note-dialog__footer-buttons">
                <button class="b3-button b3-button--cancel" on:click={onClose}>{t('aiSidebar.session.saveToNote.cancel')}</button>
                <button class="b3-button b3-button--primary" on:click={onConfirm}>{t('aiSidebar.session.saveToNote.confirm')}</button>
            </div>
        </div>
    </div>
{/if}
