<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import {
        createDocWithMd,
        lsNotebooks,
        openBlock,
        pushErrMsg,
        pushMsg,
        renderSprig,
        searchDocs,
        sql,
    } from '../../../api';
    import {
        buildSessionMarkdown,
        refreshSessionExportContext,
        sanitizeDocumentName,
        type SessionExportContext,
        type SessionExportSnapshot,
    } from '../../../utils/sessionExport';
    import { t } from '../../../utils/i18n';

    type Notebook = { id: string; name: string; closed?: boolean };
    type PathResult = { hPath: string; path?: string; box?: string };
    type CurrentDocument = { path: string; notebookId: string };

    export let plugin: any;
    export let settings: any;
    export let exportContext: SessionExportContext;
    export let fallbackTitle = '';
    export let resolveCurrentDocument: () => Promise<CurrentDocument>;

    const dispatch = createEventDispatcher<{ saved: { docId: string } }>();

    let open = false;
    let snapshot: SessionExportSnapshot | null = null;
    let documentName = '';
    let notebookId = '';
    let path = '';
    let pathKeyword = '';
    let pathResults: PathResult[] = [];
    let pathSearching = false;
    let searchTimeout: number | null = null;
    let showPathDropdown = false;
    let currentDocPath = '';
    let currentDocNotebookId = '';
    let hasDefaultPath = false;
    let notebooks: Notebook[] = [];
    let openAfterSave = true;

    export async function show(nextSnapshot: SessionExportSnapshot) {
        snapshot = nextSnapshot;
        documentName = '';
        pathResults = [];
        showPathDropdown = false;

        let defaultPath = settings.exportDefaultPath || '';
        if (defaultPath) {
            try {
                defaultPath = await renderSprig(defaultPath);
            } catch (error) {
                console.error('Parse default path error:', error);
            }
        }
        hasDefaultPath = Boolean(defaultPath);

        const currentDocument = await resolveCurrentDocument();
        currentDocPath = currentDocument.path || '/';
        currentDocNotebookId = currentDocument.notebookId || '';

        try {
            const result = await lsNotebooks();
            notebooks = (result?.notebooks || []).filter((item: Notebook) => !item.closed);
        } catch (error) {
            console.error('Get notebooks error:', error);
            notebooks = [];
        }

        if (!defaultPath) {
            notebookId = currentDocNotebookId;
            if (!notebooks.some(item => String(item.id) === String(notebookId))) {
                notebookId = notebooks[0]?.id || '';
            }
            path = toRelativePath(currentDocPath);
        } else {
            path = defaultPath;
            notebookId =
                settings.exportNotebook || settings.exportLastNotebook || notebooks[0]?.id || '';
        }
        pathKeyword = path;
        open = true;
    }

    function close() {
        open = false;
        snapshot = null;
        if (searchTimeout) window.clearTimeout(searchTimeout);
        searchTimeout = null;
    }

    function toRelativePath(value: string): string {
        const normalized = String(value || '').trim().replace(/^\/+/, '');
        const parts = normalized.split('/');
        const notebookName = notebooks.find(
            item => String(item.id) === String(notebookId)
        )?.name;
        if (notebookName && parts[0] === notebookName) parts.shift();
        return parts.join('/');
    }

    function useCurrentDocPath() {
        if (!currentDocPath || !currentDocNotebookId) return;
        notebookId = currentDocNotebookId;
        path = toRelativePath(currentDocPath);
        pathKeyword = path;
        pathResults = [];
        showPathDropdown = false;
    }

    async function searchPath() {
        const keyword = pathKeyword.trim();
        if (!keyword) {
            pathResults = [];
            return;
        }
        pathSearching = true;
        try {
            const results = await searchDocs(keyword);
            pathResults = (results || [])
                .filter((item: any) => !notebookId || item.box === notebookId)
                .map((item: any) => ({ ...item, hPath: toRelativePath(item.hPath || '') }));

            if (pathResults.length === 0 && /^[0-9\-/]+$/.test(keyword)) {
                const escapedKeyword = keyword.replace(/'/g, "''");
                const escapedNotebook = String(notebookId).replace(/'/g, "''");
                const boxFilter = notebookId ? ` AND box = '${escapedNotebook}'` : '';
                const rows = await sql(
                    `SELECT id, path, hpath, box FROM blocks WHERE type='d' AND hpath LIKE '%${escapedKeyword}%'${boxFilter} ORDER BY updated DESC LIMIT 200`
                );
                const known = new Set(pathResults.map(item => item.hPath));
                for (const row of rows || []) {
                    const hPath = toRelativePath(row.hpath || row.hPath || '');
                    if (!known.has(hPath)) pathResults.push({ ...row, hPath });
                }
                pathResults = [...pathResults];
            }
        } catch (error) {
            console.error('Search save path error:', error);
            pathResults = [];
        } finally {
            pathSearching = false;
        }
    }

    function autoSearchPath() {
        if (searchTimeout) window.clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(searchPath, 300);
    }

    function selectPath(nextPath: string) {
        path = toRelativePath(nextPath);
        pathKeyword = path;
        pathResults = [];
        showPathDropdown = false;
    }

    async function confirmSave() {
        if (!notebookId) return pushErrMsg('请选择笔记本');
        if (!pathKeyword.trim()) return pushErrMsg('请输入保存路径');
        if (!snapshot) return pushErrMsg(t('aiSidebar.errors.emptySession'));

        try {
            const title = sanitizeDocumentName(
                documentName.trim() || snapshot.title || fallbackTitle,
                fallbackTitle
            );
            const latestExportContext = await refreshSessionExportContext(
                () => plugin.loadSettings(),
                exportContext
            );
            const markdown = buildSessionMarkdown(snapshot.messages, latestExportContext);
            if (!markdown.trim()) return pushErrMsg('消息内容为空，无法保存');

            path = toRelativePath(pathKeyword);
            const fullPath = `${path}/${title}`.replace(/\/+/g, '/');
            const docId = await createDocWithMd(notebookId, fullPath, markdown);
            if (!docId) throw new Error('思源未返回新建文档 ID');

            settings.exportLastPath = path;
            settings.exportLastNotebook = notebookId;
            await plugin.saveSettings(settings);
            pushMsg(t('aiSidebar.success.saveToNoteSuccess'));
            close();
            dispatch('saved', { docId });
            if (openAfterSave) await openBlock(docId);
        } catch (error) {
            console.error('Save to note error:', error);
            pushErrMsg(`保存失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
</script>

{#if open}
    <div class="save-to-note-dialog__overlay" on:click={close}></div>
    <div class="save-to-note-dialog">
        <div class="save-to-note-dialog__header">
            <h3>{t('aiSidebar.session.saveToNote.title')}</h3>
            <button class="b3-button b3-button--text" on:click={close} title={t('common.close')}><svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg></button>
        </div>
        {#if hasDefaultPath && currentDocPath && currentDocNotebookId}
            <div class="save-to-note-dialog__switch-bar"><button class="b3-button b3-button--outline" on:click={useCurrentDocPath}><svg class="b3-button__icon"><use xlink:href="#iconFile"></use></svg><span>{t('aiSidebar.session.saveToNote.useCurrentDoc')}</span></button></div>
        {/if}
        <div class="save-to-note-dialog__content">
            <div class="save-to-note-dialog__field"><label for="save-note-name">{t('aiSidebar.session.saveToNote.documentName')}</label><input id="save-note-name" class="b3-text-field" bind:value={documentName} placeholder={t('aiSidebar.session.saveToNote.documentNamePlaceholder')} /></div>
            <div class="save-to-note-dialog__field"><label for="save-note-notebook">{t('aiSidebar.session.saveToNote.notebook')}</label><select id="save-note-notebook" class="b3-select" bind:value={notebookId} on:change={searchPath}>{#if notebooks.length}{#each notebooks as notebook}<option value={notebook.id}>{notebook.name}</option>{/each}{:else}<option value="">{t('common.loading')}</option>{/if}</select></div>
            <div class="save-to-note-dialog__field"><label for="save-note-path">{t('aiSidebar.session.saveToNote.path')}</label><div class="save-to-note-dialog__path-input-wrapper"><input id="save-note-path" class="b3-text-field" bind:value={pathKeyword} on:input={autoSearchPath} on:focus={() => (showPathDropdown = true)} on:blur={() => setTimeout(() => (showPathDropdown = false), 200)} placeholder={t('aiSidebar.session.saveToNote.pathPlaceholder')} />{#if showPathDropdown && (pathResults.length || pathSearching)}<div class="save-to-note-dialog__path-dropdown">{#if pathSearching}<div class="save-to-note-dialog__path-loading">{t('aiSidebar.session.saveToNote.searching')}</div>{:else}{#each pathResults as doc}<button class="save-to-note-dialog__path-item" on:click={() => selectPath(doc.hPath)} title={doc.hPath}><svg class="b3-button__icon"><use xlink:href="#iconFile"></use></svg><span>{doc.hPath}</span></button>{/each}{/if}</div>{/if}</div></div>
        </div>
        <div class="save-to-note-dialog__footer"><label class="save-to-note-dialog__footer-option"><input type="checkbox" class="b3-switch" bind:checked={openAfterSave} /><span>{t('aiSidebar.session.saveToNote.openAfterSave')}</span></label><div class="save-to-note-dialog__footer-buttons"><button class="b3-button b3-button--cancel" on:click={close}>{t('aiSidebar.session.saveToNote.cancel')}</button><button class="b3-button b3-button--primary" on:click={confirmSave}>{t('aiSidebar.session.saveToNote.confirm')}</button></div></div>
    </div>
{/if}
