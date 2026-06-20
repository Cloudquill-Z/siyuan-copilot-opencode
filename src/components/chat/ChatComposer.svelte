<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { t } from '../../utils/i18n';
    import MultiModelSelector from '../MultiModelSelector.svelte';
    export let THINKING_EFFORT_OPTIONS: any;
    export let abortMessage: any;
    export let activePermissionRequest: any;
    export let activeQuestionRequest: any;
    export let activeSessions: any;
    export let activeTaskIds: any;
    export let addClipboardText: any;
    export let addCurrentDocToContext: any;
    export let applyCommand: any;
    export let chatMode: any;
    export let closeActiveTaskTab: any;
    export let commandPaletteIndex: any;
    export let contextDocuments: any;
    export let copyMessage: any;
    export let currentAttachments: any;
    export let currentInput: any;
    export let currentModelId: any;
    export let currentActiveTaskId: any;
    export let composerStatusSummary: any;
    export let showThinkingToggle: any;
    export let currentThinkingSelectValue: any;
    export let displayedContextPercent: any;
    export let displayedContextTokens: any;
    export let currentContextLimit: any;
    export let isContextCompactionLikely: any;
    export let currentProvider: any;
    export let deletePrompt: any;
    export let editPrompt: any;
    export let enableMultiModel: any;
    export let fileInputElement: any;
    export let formatTokenCount: any;
    export let getFilteredCommands: any;
    export let getTaskTabTitle: any;
    export let handleDragLeave: any;
    export let handleDragOver: any;
    export let handleDrop: any;
    export let handleFileSelect: any;
    export let handleInput: any;
    export let handleKeydown: any;
    export let handleModelSelect: any;
    export let handleMultiModelChange: any;
    export let handlePaste: any;
    export let handlePermissionResponse: any;
    export let handleToggleMultiModel: any;
    export let imageInputElement: any;
    export let inputContainer: any;
    export let isAddMenuOpen: any;
    export let isDragOver: any;
    export let isFetchingWebContent: any;
    export let isInputComposing: any;
    export let isLoading: any;
    export let isModelSelectorOpen: any;
    export let isPromptSelectorOpen: any;
    export let isSearchDialogOpen: any;
    export let isStatusMenuOpen: any;
    export let isUploadingFile: any;
    export let mode: any;
    export let newSession: any;
    export let openDocument: any;
    export let openPromptManager: any;
    export let openWebLinkDialog: any;
    export let platformUtils: any;
    export let prompts: any;
    export let providers: any;
    export let pushMsg: any;
    export let questionDrafts: any;
    export let rejectQuestionAnswer: any;
    export let removeAttachment: any;
    export let removeContextDocument: any;
    export let searchDocuments: any;
    export let searchKeyword: any;
    export let selectActiveTaskTab: any;
    export let selectComposerMode: any;
    export let selectThinkingValue: any;
    export let selectedMultiModels: any;
    export let sendMessage: any;
    export let sendMessageDuringExecution: any;
    export let showCommandPalette: any;
    export let submitQuestionAnswer: any;
    export let textareaElement: any;
    export let toggleAddMenu: any;
    export let togglePromptList: any;
    export let toggleQuestionOption: any;
    export let toggleStatusMenu: any;
    let isTokenDetailsOpen = false;
    let tokenButtonElement: HTMLButtonElement | null = null;
    let tokenPopoverStyle = '';

    function updateTokenPopoverPosition() {
        if (!tokenButtonElement) return;
        const rect = tokenButtonElement.getBoundingClientRect();
        const margin = 12;
        const width = Math.min(280, Math.max(220, window.innerWidth - margin * 2));
        const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
        const bottom = Math.max(margin, window.innerHeight - rect.top + 10);
        tokenPopoverStyle = `--token-popover-left: ${left}px; --token-popover-bottom: ${bottom}px; --token-popover-width: ${width}px;`;
    }

    async function toggleTokenDetails(event: MouseEvent) {
        event.stopPropagation();
        isTokenDetailsOpen = !isTokenDetailsOpen;
        if (isTokenDetailsOpen) {
            await tick();
            updateTokenPopoverPosition();
        }
    }

    onMount(() => {
        const closeOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.ai-sidebar__token-widget') && !target.closest('.ai-sidebar__token-popover')) {
                isTokenDetailsOpen = false;
            }
        };
        window.addEventListener('resize', updateTokenPopoverPosition);
        document.addEventListener('click', closeOutside);
        return () => {
            window.removeEventListener('resize', updateTokenPopoverPosition);
            document.removeEventListener('click', closeOutside);
        };
    });
    export let triggerFileUpload: any;
    export let triggerImageUpload: any;
    export let unreadTaskIds: any;
    export let updateQuestionCustom: any;
    export let usePrompt: any;
</script>

<!-- 上下文文档和附件列表 -->
    {#if contextDocuments.length > 0 || currentAttachments.length > 0}
        <div
            class="ai-sidebar__context-docs"
            class:ai-sidebar__context-docs--drag-over={isDragOver && contextDocuments.length > 0}
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
        >
            <div class="ai-sidebar__context-docs-title">📎 {t('aiSidebar.context.content')}</div>
            <div class="ai-sidebar__context-docs-list">
                <!-- 显示上下文文档 -->
                {#each contextDocuments as doc (doc.id)}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeContextDocument(doc.id)}
                            title="移除文档"
                        >
                            ×
                        </button>
                        <button
                            class="ai-sidebar__context-doc-link"
                            on:click={() => openDocument(doc.id)}
                            title="点击查看文档"
                        >
                            📄 {doc.title}
                        </button>
                        <button
                            class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                            on:click|stopPropagation={() => copyMessage(doc.content || '')}
                            title={t('aiSidebar.actions.copyMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        </button>
                    </div>
                {/each}

                <!-- 显示当前附件 -->
                {#each currentAttachments as attachment, index}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeAttachment(index)}
                            title="移除附件"
                        >
                            ×
                        </button>
                        {#if attachment.type === 'image'}
                            <img
                                src={attachment.data}
                                alt={attachment.name}
                                class="ai-sidebar__context-attachment-preview"
                                title={attachment.name}
                            />
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                🖼️ {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制图片URL');
                                }}
                                title="复制图片URL"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {:else if attachment.isWebPage}
                            <span class="ai-sidebar__context-attachment-icon-emoji">🔗</span>
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制网页Markdown内容');
                                }}
                                title="复制网页Markdown"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {:else}
                            <svg class="ai-sidebar__context-attachment-icon">
                                <use xlink:href="#iconFile"></use>
                            </svg>
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                📄 {attachment.name}
                            </span>
                            <button
                                class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                on:click|stopPropagation={() => {
                                    platformUtils.writeText(attachment.data);
                                    pushMsg('已复制文件内容');
                                }}
                                title="复制文件内容"
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    {#if activePermissionRequest}
        <div class="permission-dialog">
            <div class="permission-dialog__header">
                <svg class="permission-dialog__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span class="permission-dialog__title">OpenCode 请求权限</span>
            </div>
            <div class="permission-dialog__body">
                <div class="permission-dialog__tool">
                    <code>{activePermissionRequest.tool}</code>
                </div>
                {#if activePermissionRequest.input}
                    <pre class="permission-dialog__input">{activePermissionRequest.input}</pre>
                {/if}
                {#if activePermissionRequest.description && activePermissionRequest.description !== activePermissionRequest.input}
                    <p class="permission-dialog__desc">{activePermissionRequest.description}</p>
                {/if}
            </div>
            <div class="permission-dialog__actions">
                <button class="permission-dialog__btn permission-dialog__btn--once" on:click={() => handlePermissionResponse('once')}>
                    允许一次
                </button>
                <button class="permission-dialog__btn permission-dialog__btn--always" on:click={() => handlePermissionResponse('always')}>
                    始终允许
                </button>
                <button class="permission-dialog__btn permission-dialog__btn--reject" on:click={() => handlePermissionResponse('reject')}>
                    拒绝
                </button>
            </div>
        </div>
    {/if}
    {#if activeQuestionRequest}
        <div class="question-dialog" role="dialog" aria-modal={mode === 'dialog'} aria-label="OpenCode 需要确认">
            <div class="question-dialog__scrim"></div>
            <div class="question-dialog__panel">
                <div class="question-dialog__header">
                    <div class="question-dialog__mark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                            <path d="M9 9h6M9 13h4"></path>
                        </svg>
                    </div>
                    <div class="question-dialog__heading">
                        <div class="question-dialog__title">OpenCode 需要你的确认</div>
                        <div class="question-dialog__subtitle">选择一个选项，或在底部输入自己的回答。</div>
                    </div>
                </div>

                <div class="question-dialog__body">
                    {#each activeQuestionRequest.questions as question, questionIndex}
                        <section class="question-dialog__item">
                            {#if question.header}
                                <div class="question-dialog__item-header">{question.header}</div>
                            {/if}
                            <div class="question-dialog__question">{question.question}</div>
                            {#if question.options.length > 0}
                                <div class="question-dialog__options">
                                    {#each question.options as option}
                                        <button
                                            type="button"
                                            class="question-dialog__option"
                                            class:question-dialog__option--active={(questionDrafts[questionIndex]?.selected || []).includes(option.label)}
                                            on:click={() => toggleQuestionOption(questionIndex, option.label, question.multiple)}
                                        >
                                            <span class="question-dialog__option-check"></span>
                                            <span class="question-dialog__option-text">
                                                <span class="question-dialog__option-label">{option.label}</span>
                                                {#if option.description}
                                                    <span class="question-dialog__option-desc">{option.description}</span>
                                                {/if}
                                            </span>
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                            <label class="question-dialog__custom">
                                <span>其他</span>
                                <textarea
                                    rows="3"
                                    value={questionDrafts[questionIndex]?.custom || ''}
                                    on:input={(event) => updateQuestionCustom(questionIndex, event.currentTarget.value)}
                                    placeholder="输入自定义回答..."
                                ></textarea>
                            </label>
                        </section>
                    {/each}
                </div>

                <div class="question-dialog__actions">
                    <button class="question-dialog__button question-dialog__button--ghost" type="button" on:click={rejectQuestionAnswer}>
                        取消
                    </button>
                    <button class="question-dialog__button question-dialog__button--primary" type="button" on:click={submitQuestionAnswer}>
                        发送回答
                    </button>
                </div>
            </div>
        </div>
    {/if}
    <div
        class="ai-sidebar__input-container"
        class:ai-sidebar__input-container--drag-over={isDragOver && contextDocuments.length === 0}
        bind:this={inputContainer}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
    >
        <div class="ai-sidebar__task-tabs" aria-label="任务切换">
            <div class="ai-sidebar__task-tab-list">
                {#each activeTaskIds as taskId, index (taskId)}
                    {@const active = taskId === currentActiveTaskId}
                    {@const running = activeSessions.has(taskId)}
                    {@const unread = unreadTaskIds.has(taskId)}
                    <button
                        type="button"
                        class="ai-sidebar__task-tab"
                        class:ai-sidebar__task-tab--active={active}
                        class:ai-sidebar__task-tab--running={running}
                        class:ai-sidebar__task-tab--unread={unread}
                        title={`${index + 1}. ${getTaskTabTitle(taskId)} / Cmd/Ctrl + ${index + 1}`}
                        on:click={() => selectActiveTaskTab(taskId)}
                        on:contextmenu|preventDefault|stopPropagation={e => closeActiveTaskTab(taskId, e)}
                    >
                        <span class="ai-sidebar__task-tab-index">{index + 1}</span>
                        {#if unread}
                            <span class="ai-sidebar__task-tab-dot" aria-hidden="true"></span>
                        {/if}
                    </button>
                {/each}
                <button
                    type="button"
                    class="ai-sidebar__task-tab ai-sidebar__task-tab--add"
                    title={t('aiSidebar.session.new')}
                    on:click={newSession}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                </button>
            </div>
        </div>

        <!-- 大输入框 -->
        <div
            class="ai-sidebar__chat-input-box"
            class:ai-sidebar__chat-input-box--answer={chatMode === 'plan'}
            class:ai-sidebar__chat-input-box--revision={chatMode === 'build'}
        >
            {#if showCommandPalette}
                <div class="command-palette">
                    {#each getFilteredCommands() as cmd, i}
                        <button
                            class="command-palette__item"
                            class:command-palette__item--active={i === commandPaletteIndex}
                            on:click={() => applyCommand(cmd.name)}
                            on:mouseenter={() => { commandPaletteIndex = i; }}
                        >
                            <span class="command-palette__name">/{cmd.name}</span>
                            {#if cmd.args}
                                <span class="command-palette__args">{cmd.args}</span>
                            {/if}
                            <span class="command-palette__desc">{cmd.desc}</span>
                        </button>
                    {/each}
                </div>
            {/if}
            <textarea
                bind:this={textareaElement}
                bind:value={currentInput}
                on:keydown={handleKeydown}
                on:compositionstart={() => (isInputComposing = true)}
                on:compositionend={() => (isInputComposing = false)}
                on:input={handleInput}
                on:paste={handlePaste}
                placeholder={t('aiSidebar.input.placeholder')}
                class="ai-sidebar__chat-textarea"
                rows="1"
                spellcheck="false"
            ></textarea>

            <!-- 输入框底部工具栏 -->
            <div class="ai-sidebar__chat-input-toolbar">
                <div class="ai-sidebar__composer-action">
                    <button
                        type="button"
                        class="ai-sidebar__composer-icon-button ai-sidebar__add-trigger"
                        class:ai-sidebar__composer-icon-button--active={isAddMenuOpen}
                        aria-label="添加内容"
                        aria-expanded={isAddMenuOpen}
                        on:click|stopPropagation={toggleAddMenu}
                    >
                        {#if isUploadingFile}
                            <svg class="b3-button__icon ai-sidebar__loading-icon"><use xlink:href="#iconRefresh"></use></svg>
                        {:else}
                            <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                        {/if}
                    </button>

                    {#if isAddMenuOpen}
                        <div class="ai-sidebar__composer-menu ai-sidebar__add-menu" on:click|stopPropagation>
                            <div class="ai-sidebar__composer-menu-label">添加内容</div>
                            <button class="ai-sidebar__composer-menu-item" on:click={triggerFileUpload} disabled={isUploadingFile || isLoading}>
                                <svg><use xlink:href="#iconFile"></use></svg><span>上传文件</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={triggerImageUpload} disabled={isUploadingFile || isLoading}>
                                <svg><use xlink:href="#iconImage"></use></svg><span>上传图片</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; openWebLinkDialog(); }} disabled={isFetchingWebContent || isLoading}>
                                <svg><use xlink:href="#iconLink"></use></svg><span>添加链接</span>
                            </button>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; addCurrentDocToContext(); }}>
                                <svg><use xlink:href="#iconFile"></use></svg><span>添加当前文档到上下文</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={() => { isAddMenuOpen = false; isSearchDialogOpen = true; if (!searchKeyword.trim()) searchDocuments(); }}>
                                <svg><use xlink:href="#iconSearch"></use></svg><span>搜索文档或块</span>
                            </button>
                            <button class="ai-sidebar__composer-menu-item" on:click={addClipboardText}>
                                <svg><use xlink:href="#iconCopy"></use></svg><span>从剪贴板粘贴</span>
                            </button>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <button
                                class="ai-sidebar__composer-menu-item"
                                class:ai-sidebar__composer-menu-item--selected={isPromptSelectorOpen}
                                aria-expanded={isPromptSelectorOpen}
                                on:click={togglePromptList}
                            >
                                <svg><use xlink:href="#iconEdit"></use></svg><span>常用提示词</span>
                                <svg class="ai-sidebar__composer-menu-chevron" class:ai-sidebar__composer-menu-chevron--expanded={isPromptSelectorOpen}>
                                    <use xlink:href="#iconRight"></use>
                                </svg>
                            </button>
                            {#if isPromptSelectorOpen}
                                <div class="ai-sidebar__composer-prompt-list">
                                    <button class="ai-sidebar__prompt-item ai-sidebar__prompt-item--new" on:click={openPromptManager}>
                                        <svg class="ai-sidebar__prompt-item-icon"><use xlink:href="#iconAdd"></use></svg>
                                        <span class="ai-sidebar__prompt-item-title">{t('aiSidebar.prompt.new')}</span>
                                    </button>
                                    {#if prompts.length > 0}
                                        {#each prompts as prompt (prompt.id)}
                                            <button class="ai-sidebar__prompt-item" on:click={() => usePrompt(prompt)} title={prompt.content}>
                                                <span class="ai-sidebar__prompt-item-title">{prompt.title}</span>
                                                <div class="ai-sidebar__prompt-item-actions">
                                                    <button class="ai-sidebar__prompt-item-edit" on:click|stopPropagation={() => editPrompt(prompt)} title={t('aiSidebar.prompt.edit')}>
                                                        <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                                                    </button>
                                                    <button class="ai-sidebar__prompt-item-delete" on:click|stopPropagation={() => deletePrompt(prompt.id)} title={t('aiSidebar.prompt.delete')}>
                                                        <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                                                    </button>
                                                </div>
                                            </button>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div class="ai-sidebar__composer-spacer"></div>

                <div class="ai-sidebar__composer-action ai-sidebar__composer-action--status">
                    <button
                        type="button"
                        class="ai-sidebar__status-trigger"
                        aria-label={`配置${composerStatusSummary}`}
                        aria-expanded={isStatusMenuOpen}
                        on:click|stopPropagation={toggleStatusMenu}
                    >
                        <span class="ai-sidebar__status-dot" aria-hidden="true"></span>
                        <span class="ai-sidebar__status-summary">{composerStatusSummary}</span>
                        <svg class="ai-sidebar__composer-chevron"><use xlink:href="#iconDown"></use></svg>
                    </button>

                    {#if isStatusMenuOpen}
                        <div class="ai-sidebar__composer-menu ai-sidebar__status-menu" on:click|stopPropagation>
                            <section class="ai-sidebar__status-section">
                                <div class="ai-sidebar__composer-menu-label">模式</div>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={chatMode === 'plan'} on:click={() => selectComposerMode('plan')}>
                                    <span>问答</span>{#if chatMode === 'plan'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={chatMode === 'build'} on:click={() => selectComposerMode('build')}>
                                    <span>修订</span>{#if chatMode === 'build'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <section class="ai-sidebar__status-section">
                                <div class="ai-sidebar__composer-menu-label">模型</div>
                                <div class="ai-sidebar__status-model-picker">
                                    <MultiModelSelector
                                        {providers}
                                        bind:isOpen={isModelSelectorOpen}
                                        selectedModels={chatMode === 'plan' ? selectedMultiModels : []}
                                        enableMultiModel={chatMode === 'plan' ? enableMultiModel : false}
                                        currentProvider={currentProvider}
                                        currentModelId={currentModelId}
                                        {chatMode}
                                        on:select={handleModelSelect}
                                        on:change={handleMultiModelChange}
                                        on:toggleEnable={handleToggleMultiModel}
                                    />
                                </div>
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <section class="ai-sidebar__status-section" class:ai-sidebar__status-section--disabled={!showThinkingToggle}>
                                <div class="ai-sidebar__composer-menu-label">思考深度</div>
                                <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={currentThinkingSelectValue === 'off'} on:click={() => selectThinkingValue('off')} disabled={!showThinkingToggle}>
                                    <span>关闭</span>{#if currentThinkingSelectValue === 'off'}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                </button>
                                {#each THINKING_EFFORT_OPTIONS as option}
                                    <button class="ai-sidebar__composer-menu-item" class:ai-sidebar__composer-menu-item--selected={currentThinkingSelectValue === option.value} on:click={() => selectThinkingValue(option.value)} disabled={!showThinkingToggle}>
                                        <span>{option.label}</span>{#if currentThinkingSelectValue === option.value}<svg class="ai-sidebar__menu-check"><use xlink:href="#iconCheck"></use></svg>{/if}
                                    </button>
                                {/each}
                            </section>
                            <div class="ai-sidebar__composer-menu-divider"></div>
                            <div class="ai-sidebar__token-widget">
                                <button
                                    bind:this={tokenButtonElement}
                                    type="button"
                                    class="ai-sidebar__token-pill"
                                    class:ai-sidebar__token-pill--warn={displayedContextPercent >= 80}
                                    style={`--token-percent: ${displayedContextPercent};`}
                                    on:click={toggleTokenDetails}
                                    title="Token 使用详情"
                                >
                                    <span class="ai-sidebar__token-ring" aria-hidden="true"></span>
                                    <span>上下文 {currentContextLimit ? `${displayedContextPercent}%` : formatTokenCount(displayedContextTokens)}</span>
                                </button>
                                {#if isTokenDetailsOpen}
                                    <div class="ai-sidebar__token-popover" style={tokenPopoverStyle} on:click|stopPropagation>
                                        <div class="ai-sidebar__token-popover-header">
                                            <span>上下文长度</span>
                                            <button type="button" class="ai-sidebar__token-close" on:click={() => (isTokenDetailsOpen = false)} title="关闭">×</button>
                                        </div>
                                        <div class="ai-sidebar__token-meter">
                                            <div class="ai-sidebar__token-meter-fill" style={`width: ${currentContextLimit ? displayedContextPercent : 0}%`}></div>
                                        </div>
                                        {#if isContextCompactionLikely}
                                            <div class="ai-sidebar__token-status">正在接近上下文上限，OpenCode 可能会自动压缩上下文。</div>
                                        {/if}
                                        <div class="ai-sidebar__token-row"><span>上下文上限</span><strong>{currentContextLimit ? formatTokenCount(currentContextLimit) : '未设置'}</strong></div>
                                        <div class="ai-sidebar__token-row"><span>当前使用百分比</span><strong>{currentContextLimit ? `${displayedContextPercent}%` : '无法计算'}</strong></div>
                                        <div class="ai-sidebar__token-row"><span>当前使用的上下文</span><strong>{formatTokenCount(displayedContextTokens)}</strong></div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>

                <button
                    class="ai-sidebar__chat-send-btn"
                    class:ai-sidebar__chat-send-btn--abort={isLoading && !currentInput.trim()}
                    class:ai-sidebar__chat-send-btn--followup={isLoading && !!currentInput.trim()}
                    on:click={isLoading ? (currentInput.trim() ? sendMessageDuringExecution : abortMessage) : sendMessage}
                    disabled={!isLoading && !currentInput.trim() && currentAttachments.length === 0}
                    title={isLoading ? (currentInput.trim() ? '执行中发送消息' : '中断生成') : '发送消息'}
                >
                    {#if isLoading && !currentInput.trim()}
                        <svg class="b3-button__icon"><use xlink:href="#iconPause"></use></svg>
                    {:else}
                        <svg class="b3-button__icon" style="width:18px;height:18px"><use xlink:href="#iconUp"></use></svg>
                    {/if}
                </button>
            </div>
        </div>

        <!-- 隐藏的文件上传 input -->
        <input
            type="file"
            bind:this={fileInputElement}
            on:change={handleFileSelect}
            accept="image/*,.txt,.md,.json,.xml,.csv,text/*"
            multiple
            style="display: none;"
        />
        <input
            type="file"
            bind:this={imageInputElement}
            on:change={handleFileSelect}
            accept="image/*"
            multiple
            style="display: none;"
        />

    </div>
