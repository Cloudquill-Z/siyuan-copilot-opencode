<script lang="ts">
    import { t } from '../../utils/i18n';
    import type { Message } from '../../ai-chat';
    import type { ChatMode } from '../../utils/chatMode';
    import type { MessageGroup } from '../../chat/message-groups';
    import type { MultiModelChoice, MultiModelResponse } from '../../chat/execution/multi-model-state';
    import type { OpenCodeTimelineItem } from '../../task-types';
    export let chatMode: ChatMode;
    export let copyMessage: any;
    export let deleteMessage: any;
    export let enableMultiModel: boolean;
    export let formatOpenCodeToolValue: any;
    export let getActiveOpenCodeTimelineItemId: any;
    export let getActualMessageContent: any;
    export let getCurrentAssistantDisplayName: any;
    export let getDisplayContent: any;
    export let getGroupDisplayName: any;
    export let getOpenCodeFinalAnswer: any;
    export let getOpenCodeProcessKey: any;
    export let getOpenCodeProcessTimeline: any;
    export let getOpenCodeToolPartKey: any;
    export let getOpenCodeToolStatusIcon: any;
    export let getOpenCodeToolStatusText: any;
    export let getToolDisplayName: any;
    export let groupOpenCodeTimeline: any;
    export let handleContextMenu: any;
    export let handleScroll: any;
    export let isLoading: boolean;
    export let isContextCompactionLikely: boolean;
    export let isThinkingCollapsed: any;
    export let isThinkingPhase: boolean;
    export let isToolCallGroupCollapsed: any;
    export let isWaitingForAnswerSelection: boolean;
    export let messageFontSize: number;
    export let messages: Message[];
    export let messageGroups: MessageGroup[];
    export let messagesContainer: HTMLElement;
    export let multiModelLayout: 'card' | 'tab';
    export let multiModelResponses: MultiModelResponse[];
    export let multiModelViewMode: 'tab' | 'card';
    export let openCodeIconUrl: string;
    export let openCodeProcessCollapsed: Record<string, boolean>;
    export let openCodeTimeline: OpenCodeTimelineItem[];
    export let openCodeToolParts: any[];
    export let openDocument: any;
    export let openImageViewer: any;
    export let openSaveToNoteDialog: any;
    export let platformUtils: any;
    export let pushMsg: any;
    export let regenerateHistoryModelResponse: any;
    export let regenerateMessage: any;
    export let regenerateModelResponse: any;
    export let selectHistoryMultiModelAnswer: any;
    export let selectMultiModelAnswer: any;
    export let selectedAnswerIndex: number | null;
    export let selectedMultiModels: MultiModelChoice[];
    export let selectedTabIndex: number;
    export let startEditMessage: any;
    export let streamingMessage: string;
    export let streamingThinking: string;
    export let streamingThinkingCollapsed: boolean;
    export let streamingToolCallsCollapsed: boolean;
    export let thinkingCollapsed: Record<string, boolean>;
    export let timelineCollapsed: Record<string, boolean>;
    export let toggleOpenCodeProcessCollapsed: any;
    export let toggleThinkingCollapsed: any;
    export let toggleTimelineCollapsed: any;
    export let toggleToolCallGroup: any;
    export let toolCallGroupsCollapsed: Record<string, boolean>;
    export let toolCallResultsExpanded: Record<string, boolean>;
    export let toolCallsExpanded: Record<string, boolean>;
    export let viewDiff: any;
</script>

<div class="ai-sidebar__messages" bind:this={messagesContainer} on:scroll={handleScroll}>
        {#each messageGroups as group, groupIndex (groupIndex)}
            {@const firstMessage = group.messages[0]}
            {@const messageIndex = group.startIndex}
            <div
                class="ai-message ai-message--{group.type}"
                on:contextmenu={e => handleContextMenu(e, messageIndex, group.type)}
            >
                <div class="ai-message__header">
                    <span class="ai-message__role">
                        {group.type === 'user' ? '👤' : '🤖'} {getGroupDisplayName(group)}
                    </span>
                </div>

                <!-- 遍历组内的所有消息 -->
                {#each group.messages as message, msgIndex}
                    <!-- 跳过 tool 角色的消息，因为它们已经在工具调用区域显示 -->
                    {#if message.role === 'tool'}
                        <!-- 不渲染 tool 消息 -->
                    {:else}
                        <!-- 多轮工具调用思考内容渲染 -->
                        {#if message.role === 'assistant' && message.toolCallThinkings && message.toolCallThinkings.length > 0 && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                            <!-- 按轮次显示思考和工具调用 -->
                            {#each message.toolCallThinkings as round, roundIndex}
                                {@const baseIndex = (messageIndex + msgIndex) * 100 + roundIndex}

                                <!-- 该轮工具调用前的思考 -->
                                {#if round.thinkingBefore}
                                    <div class="ai-message__thinking">
                                        <div
                                            class="ai-message__thinking-header"
                                            on:click={() => toggleThinkingCollapsed(baseIndex)}
                                        >
                                            <svg
                                                class="ai-message__thinking-icon"
                                                class:collapsed={isThinkingCollapsed(thinkingCollapsed, baseIndex)}
                                            >
                                                <use xlink:href="#iconRight"></use>
                                            </svg>
                                            <span class="ai-message__thinking-title">
                                                💭 思考过程
                                            </span>
                                        </div>
                                        {#if !isThinkingCollapsed(thinkingCollapsed, baseIndex)}
                                            {@const thinkDisplay = getDisplayContent(
                                                round.thinkingBefore
                                            )}
                                            <div class="ai-message__thinking-content b3-typography">
                                                {@html thinkDisplay}
                                            </div>
                                        {/if}
                                    </div>
                                {/if}

                                <!-- 该轮对应的工具调用 -->
                                {#if message.tool_calls && message.tool_calls.length > 0}
                                    {@const nextRound = message.toolCallThinkings[roundIndex + 1]}
                                    {@const endIndex = nextRound
                                        ? nextRound.toolCallIndex
                                        : message.tool_calls.length}
                                    {@const roundToolCalls = message.tool_calls.slice(
                                        round.toolCallIndex,
                                        endIndex
                                    )}

                                    {#if roundToolCalls.length > 0}
                                        {@const toolGroupKey = `tool-round-${messageIndex}-${msgIndex}-${roundIndex}`}
                                        {@const toolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, toolGroupKey)}
                                        <div class="ai-message__tool-calls">
                                            <div
                                                class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                                on:click={() => toggleToolCallGroup(toolGroupKey)}
                                                title={toolGroupCollapsed ? '展开工具执行' : '折叠工具执行'}
                                            >
                                                <svg
                                                    class="ai-message__tool-call-icon"
                                                    class:collapsed={toolGroupCollapsed}
                                                >
                                                    <use xlink:href="#iconRight"></use>
                                                </svg>
                                                🔧 {t('tools.calling')} ({roundToolCalls.length})
                                            </div>
                                            {#if !toolGroupCollapsed}
                                            {#each roundToolCalls as toolCall}
                                                {@const toolResult = group.messages
                                                    .slice(msgIndex + 1)
                                                    .find(
                                                        m =>
                                                            m.role === 'tool' &&
                                                            m.tool_call_id === toolCall.id
                                                    )}
                                                {@const toolName = toolCall.function.name}
                                                {@const toolDisplayName =
                                                    getToolDisplayName(toolName)}
                                                {@const isCompleted = !!toolResult}
                                                {@const toolCallCollapsed =
                                                    !toolCallsExpanded[toolCall.id]}

                                                <div class="ai-message__tool-call">
                                                    <div
                                                        class="ai-message__tool-call-header"
                                                        on:click={() => {
                                                            toolCallsExpanded[toolCall.id] =
                                                                !toolCallsExpanded[toolCall.id];
                                                            toolCallsExpanded = {
                                                                ...toolCallsExpanded,
                                                            };
                                                        }}
                                                    >
                                                        <div class="ai-message__tool-call-name">
                                                            <svg
                                                                class="ai-message__tool-call-icon"
                                                                class:collapsed={toolCallCollapsed}
                                                            >
                                                                <use xlink:href="#iconRight"></use>
                                                            </svg>
                                                            <span>{toolDisplayName}</span>
                                                            {#if isCompleted}
                                                                <span
                                                                    class="ai-message__tool-call-status"
                                                                >
                                                                    ✅
                                                                </span>
                                                            {:else}
                                                                <span
                                                                    class="ai-message__tool-call-status"
                                                                >
                                                                    ⏳
                                                                </span>
                                                            {/if}
                                                        </div>
                                                    </div>

                                                    {#if !toolCallCollapsed}
                                                        {@const paramsKey = `${toolCall.id}_params`}
                                                        {@const paramsExpanded =
                                                            toolCallResultsExpanded[paramsKey] !==
                                                            false}
                                                        {@const resultKey = `${toolCall.id}_result`}
                                                        {@const resultExpanded =
                                                            toolCallResultsExpanded[resultKey] !==
                                                            false}
                                                        <div class="ai-message__tool-call-details">
                                                            <!-- 工具参数 -->
                                                            <div
                                                                class="ai-message__tool-call-params"
                                                            >
                                                                <div
                                                                    class="ai-message__tool-call-section-header"
                                                                    on:click={() => {
                                                                        toolCallResultsExpanded[
                                                                            paramsKey
                                                                        ] = !paramsExpanded;
                                                                        toolCallResultsExpanded = {
                                                                            ...toolCallResultsExpanded,
                                                                        };
                                                                    }}
                                                                >
                                                                    <svg
                                                                        class="ai-message__tool-call-icon"
                                                                        class:collapsed={!paramsExpanded}
                                                                    >
                                                                        <use
                                                                            xlink:href="#iconRight"
                                                                        ></use>
                                                                    </svg>
                                                                    <strong>
                                                                        {t(
                                                                            'tools.selector.parameters'
                                                                        )}
                                                                    </strong>
                                                                </div>
                                                                {#if paramsExpanded}
                                                                    <pre
                                                                        class="ai-message__tool-call-code">{toolCall
                                                                            .function
                                                                            .arguments}</pre>
                                                                {/if}
                                                            </div>

                                                            <!-- 工具结果 -->
                                                            {#if toolResult}
                                                                <div
                                                                    class="ai-message__tool-call-result"
                                                                >
                                                                    <div
                                                                        class="ai-message__tool-call-section-header"
                                                                        on:click={() => {
                                                                            toolCallResultsExpanded[
                                                                                resultKey
                                                                            ] = !resultExpanded;
                                                                            toolCallResultsExpanded =
                                                                                {
                                                                                    ...toolCallResultsExpanded,
                                                                                };
                                                                        }}
                                                                    >
                                                                        <svg
                                                                            class="ai-message__tool-call-icon"
                                                                            class:collapsed={!resultExpanded}
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconRight"
                                                                            ></use>
                                                                        </svg>
                                                                        <strong>
                                                                            {t('tools.result')}
                                                                        </strong>
                                                                    </div>
                                                                    {#if resultExpanded}
                                                                        <pre
                                                                            class="ai-message__tool-call-code">{toolResult.content}</pre>
                                                                    {/if}
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/each}
                                            {/if}
                                        </div>
                                    {/if}
                                {/if}
                            {/each}
                        {:else}
                            {#if message.role === 'assistant' && message.openCodeTimeline && message.openCodeTimeline.length > 0 && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const finalAnswer = getOpenCodeFinalAnswer(message)}
                                {@const processTimeline = getOpenCodeProcessTimeline(message)}
                                {@const processKey = getOpenCodeProcessKey(message, `${messageIndex}-${msgIndex}`)}
                                {@const processCollapsed = openCodeProcessCollapsed[processKey] ?? true}

                                {#if processTimeline.length > 0}
                                    <button
                                        type="button"
                                        class="ai-message__process-toggle"
                                        on:click={() => toggleOpenCodeProcessCollapsed(processKey)}
                                        title={processCollapsed ? '展开过程' : '折叠过程'}
                                    >
                                        <svg class="ai-message__thinking-icon" class:collapsed={processCollapsed}>
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        <span>过程</span>
                                        <span class="ai-message__timeline-toggle-count">{groupOpenCodeTimeline(processTimeline).length}</span>
                                    </button>

                                    {#if !processCollapsed}
                                        <div class="ai-message__timeline ai-message__timeline--history">
                                            {#each groupOpenCodeTimeline(processTimeline) as item, timelineIndex (item.id)}
                                                {#if item.type === 'text'}
                                                    {@const processTextDisplay = getDisplayContent(item.content)}
                                                    <div class="ai-message__timeline-text ai-message__timeline-text--process b3-typography">
                                                        {@html processTextDisplay}
                                                    </div>
                                                {:else if item.type === 'thinking'}
                                                    {@const timelineThinkingKey = `timeline-thinking-${messageIndex}-${msgIndex}-${timelineIndex}`}
                                                    <div class="ai-message__thinking">
                                                        <div
                                                            class="ai-message__thinking-header"
                                                            on:click={() => toggleThinkingCollapsed(timelineThinkingKey)}
                                                        >
                                                            <svg
                                                                class="ai-message__thinking-icon"
                                                                class:collapsed={isThinkingCollapsed(thinkingCollapsed, timelineThinkingKey)}
                                                            >
                                                                <use xlink:href="#iconRight"></use>
                                                            </svg>
                                                            <span class="ai-message__thinking-title">思考</span>
                                                        </div>
                                                        {#if !isThinkingCollapsed(thinkingCollapsed, timelineThinkingKey)}
                                                            {@const timelineThinkingDisplay = getDisplayContent(item.content)}
                                                            <div class="ai-message__thinking-content b3-typography">
                                                                {@html timelineThinkingDisplay}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <div class="ai-message__tool-calls ai-message__tool-calls--timeline">
                                                        <div class="ai-message__tool-calls-title">工具</div>
                                                        {#each item.toolParts as toolPart (getOpenCodeToolPartKey(toolPart))}
                                                            {@const toolPartKey = getOpenCodeToolPartKey(toolPart)}
                                                            {@const toolPartCollapsed = !toolCallsExpanded[toolPartKey]}
                                                            {@const toolPartInput = formatOpenCodeToolValue(toolPart.input)}
                                                            {@const toolPartOutput = formatOpenCodeToolValue(toolPart.output)}
                                                            {@const toolPartError = formatOpenCodeToolValue(toolPart.error)}
                                                            <div
                                                                class="ai-message__tool-call"
                                                                class:ai-message__tool-call--running={toolPart.status === 'running' || toolPart.status === 'pending'}
                                                                class:ai-message__tool-call--error={toolPart.status === 'error'}
                                                            >
                                                                <div
                                                                    class="ai-message__tool-call-header"
                                                                    on:click={() => {
                                                                        toolCallsExpanded[toolPartKey] = !toolCallsExpanded[toolPartKey];
                                                                        toolCallsExpanded = { ...toolCallsExpanded };
                                                                    }}
                                                                >
                                                                    <div class="ai-message__tool-call-name">
                                                                        <svg
                                                                            class="ai-message__tool-call-icon"
                                                                            class:collapsed={toolPartCollapsed}
                                                                        >
                                                                            <use xlink:href="#iconRight"></use>
                                                                        </svg>
                                                                        <span>{toolPart.title || toolPart.toolName}</span>
                                                                        <span class="ai-message__tool-call-status">
                                                                            {getOpenCodeToolStatusIcon(toolPart.status)}
                                                                            {getOpenCodeToolStatusText(toolPart.status)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {#if !toolPartCollapsed && (toolPartInput || toolPartOutput || toolPartError)}
                                                                    <div class="ai-message__tool-call-details">
                                                                        {#if toolPartInput}
                                                                            <div class="ai-message__tool-call-params">
                                                                                <div class="ai-message__tool-call-section-header">
                                                                                    <strong>输入</strong>
                                                                                </div>
                                                                                <pre class="ai-message__tool-call-code">{toolPartInput}</pre>
                                                                            </div>
                                                                        {/if}
                                                                        {#if toolPartOutput}
                                                                            <div class="ai-message__tool-call-result">
                                                                                <div class="ai-message__tool-call-section-header">
                                                                                    <strong>{t('tools.result')}</strong>
                                                                                </div>
                                                                                <pre class="ai-message__tool-call-code">{toolPartOutput}</pre>
                                                                            </div>
                                                                        {/if}
                                                                        {#if toolPartError}
                                                                            <div class="ai-message__tool-call-result">
                                                                                <div class="ai-message__tool-call-section-header">
                                                                                    <strong>错误</strong>
                                                                                </div>
                                                                                <pre class="ai-message__tool-call-code">{toolPartError}</pre>
                                                                            </div>
                                                                        {/if}
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                {/if}

                                {#if finalAnswer.trim()}
                                    {@const finalDisplay = getDisplayContent(finalAnswer)}
                                    <div class="ai-message__content b3-typography" style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}>
                                        {@html finalDisplay}
                                    </div>
                                {/if}
                            {/if}

                            <!-- 兼容旧数据：显示工具调用前的思考过程 -->
                            {#if message.role === 'assistant' && (message.thinkingBeforeToolCalls || (message.thinking && !message.tool_calls)) && !(message.openCodeTimeline && message.openCodeTimeline.length > 0) && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const thinkingIndex = messageIndex + msgIndex}
                                {@const thinkingContent =
                                    message.thinkingBeforeToolCalls || message.thinking}
                                <div class="ai-message__thinking">
                                    <div
                                        class="ai-message__thinking-header"
                                        on:click={() => toggleThinkingCollapsed(thinkingIndex)}
                                    >
                                        <svg
                                            class="ai-message__thinking-icon"
                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, thinkingIndex)}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        <span class="ai-message__thinking-title">💭 思考过程</span>
                                    </div>
                                    {#if !isThinkingCollapsed(thinkingCollapsed, thinkingIndex)}
                                        {@const thinkDisplay = getDisplayContent(thinkingContent)}
                                        <div class="ai-message__thinking-content b3-typography">
                                            {@html thinkDisplay}
                                        </div>
                                    {/if}
                                </div>
                            {/if}

                            <!-- 用户消息内容保持原位；AI 最终内容统一放到工具与差异之后 -->
                            {#if message.role !== 'assistant' && message.content && message.content
                                    .toString()
                                    .trim() && !(message.role === 'assistant' && message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const displayContent = getDisplayContent(message.content)}
                                <div
                                    class="ai-message__content b3-typography"
                                    style={messageFontSize
                                        ? `font-size: ${messageFontSize}px;`
                                        : ''}
                                >
                                    {@html displayContent}
                                </div>
                            {/if}

                            <!-- 兼容旧数据：显示工具调用 -->
                            {#if message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0 && !message.toolCallThinkings && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const legacyToolGroupKey = `legacy-tools-${messageIndex}-${msgIndex}`}
                                {@const legacyToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, legacyToolGroupKey)}
                                <div class="ai-message__tool-calls">
                                    <div
                                        class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                        on:click={() => toggleToolCallGroup(legacyToolGroupKey)}
                                        title={legacyToolGroupCollapsed ? '展开工具执行' : '折叠工具执行'}
                                    >
                                        <svg
                                            class="ai-message__tool-call-icon"
                                            class:collapsed={legacyToolGroupCollapsed}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        🔧 {t('tools.calling')} ({message.tool_calls.length})
                                    </div>
                                    {#if !legacyToolGroupCollapsed}
                                    {#each message.tool_calls as toolCall}
                                        {@const toolResult = group.messages
                                            .slice(msgIndex + 1)
                                            .find(
                                                m =>
                                                    m.role === 'tool' &&
                                                    m.tool_call_id === toolCall.id
                                            )}
                                        {@const toolName = toolCall.function.name}
                                        {@const toolDisplayName = getToolDisplayName(toolName)}
                                        {@const isCompleted = !!toolResult}
                                        {@const toolCallCollapsed = !toolCallsExpanded[toolCall.id]}

                                        <div class="ai-message__tool-call">
                                            <div
                                                class="ai-message__tool-call-header"
                                                on:click={() => {
                                                    toolCallsExpanded[toolCall.id] =
                                                        !toolCallsExpanded[toolCall.id];
                                                    toolCallsExpanded = { ...toolCallsExpanded };
                                                }}
                                            >
                                                <div class="ai-message__tool-call-name">
                                                    <svg
                                                        class="ai-message__tool-call-icon"
                                                        class:collapsed={toolCallCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    <span>{toolDisplayName}</span>
                                                    {#if isCompleted}
                                                        <span class="ai-message__tool-call-status">
                                                            ✅
                                                        </span>
                                                    {:else}
                                                        <span class="ai-message__tool-call-status">
                                                            ⏳
                                                        </span>
                                                    {/if}
                                                </div>
                                            </div>

                                            {#if !toolCallCollapsed}
                                                {@const paramsKey = `${toolCall.id}_params`}
                                                {@const paramsExpanded =
                                                    toolCallResultsExpanded[paramsKey] !== false}
                                                {@const resultKey = `${toolCall.id}_result`}
                                                {@const resultExpanded =
                                                    toolCallResultsExpanded[resultKey] !== false}
                                                <div class="ai-message__tool-call-details">
                                                    <!-- 工具参数 -->
                                                    <div class="ai-message__tool-call-params">
                                                        <div
                                                            class="ai-message__tool-call-section-header"
                                                            on:click={() => {
                                                                toolCallResultsExpanded[paramsKey] =
                                                                    !paramsExpanded;
                                                                toolCallResultsExpanded = {
                                                                    ...toolCallResultsExpanded,
                                                                };
                                                            }}
                                                        >
                                                            <svg
                                                                class="ai-message__tool-call-icon"
                                                                class:collapsed={!paramsExpanded}
                                                            >
                                                                <use xlink:href="#iconRight"></use>
                                                            </svg>
                                                            <strong>
                                                                {t('tools.selector.parameters')}
                                                            </strong>
                                                        </div>
                                                        {#if paramsExpanded}
                                                            <pre
                                                                class="ai-message__tool-call-code">{toolCall
                                                                    .function.arguments}</pre>
                                                        {/if}
                                                    </div>

                                                    <!-- 工具结果 -->
                                                    {#if toolResult}
                                                        <div class="ai-message__tool-call-result">
                                                            <div
                                                                class="ai-message__tool-call-section-header"
                                                                on:click={() => {
                                                                    toolCallResultsExpanded[
                                                                        resultKey
                                                                    ] = !resultExpanded;
                                                                    toolCallResultsExpanded = {
                                                                        ...toolCallResultsExpanded,
                                                                    };
                                                                }}
                                                            >
                                                                <svg
                                                                    class="ai-message__tool-call-icon"
                                                                    class:collapsed={!resultExpanded}
                                                                >
                                                                    <use
                                                                        xlink:href="#iconRight"
                                                                    ></use>
                                                                </svg>
                                                                <strong>{t('tools.result')}</strong>
                                                            </div>
                                                            {#if resultExpanded}
                                                                <pre
                                                                    class="ai-message__tool-call-code">{toolResult.content}</pre>
                                                            {/if}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                    {/if}
                                </div>
                            {/if}

                            {#if message.role === 'assistant' && message.openCodeToolParts && message.openCodeToolParts.length > 0 && !(message.openCodeTimeline && message.openCodeTimeline.length > 0) && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const openCodeToolGroupKey = `opencode-tools-${messageIndex}-${msgIndex}`}
                                {@const openCodeToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, openCodeToolGroupKey)}
                                <div class="ai-message__tool-calls">
                                    <div
                                        class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                        on:click={() => toggleToolCallGroup(openCodeToolGroupKey)}
                                        title={openCodeToolGroupCollapsed ? '展开工具执行' : '折叠工具执行'}
                                    >
                                        <svg
                                            class="ai-message__tool-call-icon"
                                            class:collapsed={openCodeToolGroupCollapsed}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        🔧 工具执行
                                    </div>
                                    {#if !openCodeToolGroupCollapsed}
                                    {#each message.openCodeToolParts as toolPart (getOpenCodeToolPartKey(toolPart))}
                                        {@const toolPartKey = getOpenCodeToolPartKey(toolPart)}
                                        {@const toolPartCollapsed = !toolCallsExpanded[toolPartKey]}
                                        {@const toolPartInput = formatOpenCodeToolValue(toolPart.input)}
                                        {@const toolPartOutput = formatOpenCodeToolValue(toolPart.output)}
                                        {@const toolPartError = formatOpenCodeToolValue(toolPart.error)}
                                        <div
                                            class="ai-message__tool-call"
                                            class:ai-message__tool-call--error={toolPart.status === 'error'}
                                        >
                                            <div
                                                class="ai-message__tool-call-header"
                                                on:click={() => {
                                                    toolCallsExpanded[toolPartKey] =
                                                        !toolCallsExpanded[toolPartKey];
                                                    toolCallsExpanded = { ...toolCallsExpanded };
                                                }}
                                            >
                                                <div class="ai-message__tool-call-name">
                                                    <svg
                                                        class="ai-message__tool-call-icon"
                                                        class:collapsed={toolPartCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    <span>{toolPart.title || toolPart.toolName}</span>
                                                    <span class="ai-message__tool-call-status">
                                                        {getOpenCodeToolStatusIcon(toolPart.status)}
                                                        {getOpenCodeToolStatusText(toolPart.status)}
                                                    </span>
                                                </div>
                                            </div>

                                            {#if !toolPartCollapsed && (toolPartInput || toolPartOutput || toolPartError)}
                                                <div class="ai-message__tool-call-details">
                                                    {#if toolPartInput}
                                                        <div class="ai-message__tool-call-params">
                                                            <div class="ai-message__tool-call-section-header">
                                                                <strong>输入</strong>
                                                            </div>
                                                            <pre class="ai-message__tool-call-code">{toolPartInput}</pre>
                                                        </div>
                                                    {/if}
                                                    {#if toolPartOutput}
                                                        <div class="ai-message__tool-call-result">
                                                            <div class="ai-message__tool-call-section-header">
                                                                <strong>{t('tools.result')}</strong>
                                                            </div>
                                                            <pre class="ai-message__tool-call-code">{toolPartOutput}</pre>
                                                        </div>
                                                    {/if}
                                                    {#if toolPartError}
                                                        <div class="ai-message__tool-call-result">
                                                            <div class="ai-message__tool-call-section-header">
                                                                <strong>错误</strong>
                                                            </div>
                                                            <pre class="ai-message__tool-call-code">{toolPartError}</pre>
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                    {/if}
                                </div>
                            {/if}

                            <!-- 兼容旧数据：显示工具调用后的思考过程 -->
                            {#if message.role === 'assistant' && message.thinkingAfterToolCalls && !(message.multiModelResponses && message.multiModelResponses.length > 0)}
                                {@const thinkingAfterIndex = messageIndex + msgIndex + '_after'}
                                <div
                                    class="ai-message__thinking ai-message__thinking--after-toolcalls"
                                >
                                    <div
                                        class="ai-message__thinking-header"
                                        on:click={() => toggleThinkingCollapsed(thinkingAfterIndex)}
                                    >
                                        <svg
                                            class="ai-message__thinking-icon"
                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, thinkingAfterIndex)}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        <span class="ai-message__thinking-title">
                                            💭 思考过程（续）
                                        </span>
                                    </div>
                                    {#if !isThinkingCollapsed(thinkingCollapsed, thinkingAfterIndex)}
                                        {@const thinkAfterDisplay = getDisplayContent(
                                            message.thinkingAfterToolCalls
                                        )}
                                        <div class="ai-message__thinking-content b3-typography">
                                            {@html thinkAfterDisplay}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        {/if}

                        <!-- 显示多模型响应（历史消息） - 仅在用户已选择答案后显示 -->
                        {#if message.role === 'assistant' && message.multiModelResponses && message.multiModelResponses.length > 0 && message.multiModelResponses.some(r => r.isSelected)}
                            {@const layoutKey = `history_layout_${messageIndex}_${msgIndex}`}
                            {@const currentLayout =
                                thinkingCollapsed[layoutKey] || multiModelViewMode}
                            <div class="ai-message__multi-model-responses">
                                <div class="ai-message__multi-model-header">
                                    <div class="ai-message__multi-model-header-top">
                                        <h4>🤖 多模型响应</h4>
                                        <div class="ai-message__multi-model-layout-selector">
                                            <button
                                                class="b3-button b3-button--text b3-button--small"
                                                class:b3-button--primary={currentLayout === 'card'}
                                                on:click={() => {
                                                    thinkingCollapsed[layoutKey] = 'card';
                                                    thinkingCollapsed = { ...thinkingCollapsed };
                                                }}
                                                title={t('multiModel.layout.card')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconSplitLR"></use>
                                                </svg>
                                                {t('multiModel.layout.card')}
                                            </button>
                                            <button
                                                class="b3-button b3-button--text b3-button--small"
                                                class:b3-button--primary={currentLayout === 'tab'}
                                                on:click={() => {
                                                    thinkingCollapsed[layoutKey] = 'tab';
                                                    thinkingCollapsed = { ...thinkingCollapsed };
                                                }}
                                                title={t('multiModel.layout.tab')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconSplitTB"></use>
                                                </svg>
                                                {t('multiModel.layout.tab')}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {#if currentLayout === 'card'}
                                    <!-- 卡片视图 -->
                                    <div class="ai-sidebar__multi-model-cards">
                                        {#each message.multiModelResponses as response, index}
                                            <div
                                                class="ai-sidebar__multi-model-card"
                                                class:ai-sidebar__multi-model-card--selected={response.isSelected}
                                            >
                                                <div class="ai-sidebar__multi-model-card-header">
                                                    <div class="ai-sidebar__multi-model-card-title">
                                                        <span
                                                            class="ai-sidebar__multi-model-card-model-name"
                                                        >
                                                            {response.modelName}
                                                        </span>
                                                        {#if response.error}
                                                            <span
                                                                class="ai-sidebar__multi-model-card-status ai-sidebar__multi-model-card-status--error"
                                                            >
                                                                ❌ {t('multiModel.error')}
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="ai-sidebar__multi-model-card-actions"
                                                    >
                                                        {#if !response.error && response.content}
                                                            <button
                                                                class="b3-button b3-button--text"
                                                                on:click={() =>
                                                                    regenerateHistoryModelResponse(
                                                                        messageIndex + msgIndex,
                                                                        index
                                                                    )}
                                                                title={t(
                                                                    'aiSidebar.actions.regenerate'
                                                                )}
                                                            >
                                                                <svg class="b3-button__icon">
                                                                    <use
                                                                        xlink:href="#iconRefresh"
                                                                    ></use>
                                                                </svg>
                                                            </button>
                                                            <button
                                                                class="b3-button b3-button--text ai-sidebar__multi-model-copy-btn"
                                                                on:click={() =>
                                                                    copyMessage(
                                                                        response.content || ''
                                                                    )}
                                                                title={t(
                                                                    'aiSidebar.actions.copyMessage'
                                                                )}
                                                            >
                                                                <svg class="b3-button__icon">
                                                                    <use
                                                                        xlink:href="#iconCopy"
                                                                    ></use>
                                                                </svg>
                                                            </button>
                                                            <button
                                                                class="b3-button b3-button--primary ai-sidebar__multi-model-select-btn"
                                                                class:ai-sidebar__multi-model-select-btn--selected={response.isSelected}
                                                                on:click={() =>
                                                                    selectHistoryMultiModelAnswer(
                                                                        messageIndex + msgIndex,
                                                                        index
                                                                    )}
                                                            >
                                                                {response.isSelected
                                                                    ? t('multiModel.answerSelected')
                                                                    : t('multiModel.selectAnswer')}
                                                            </button>
                                                        {/if}
                                                    </div>
                                                </div>

                                                <div class="ai-sidebar__multi-model-card-scroll">
                                                    <!-- 思考过程 -->
                                                    {#if response.thinking}
                                                        {@const isCollapsed =
                                                            response.thinkingCollapsed ?? true}
                                                        <div class="ai-message__thinking">
                                                            <div
                                                                class="ai-message__thinking-header"
                                                                on:click={() => {
                                                                    message.multiModelResponses[
                                                                        index
                                                                    ].thinkingCollapsed =
                                                                        !isCollapsed;
                                                                    messages = [...messages];
                                                                }}
                                                            >
                                                                <svg
                                                                    class="ai-message__thinking-icon"
                                                                    class:collapsed={isCollapsed}
                                                                >
                                                                    <use
                                                                        xlink:href="#iconRight"
                                                                    ></use>
                                                                </svg>
                                                                <span
                                                                    class="ai-message__thinking-title"
                                                                >
                                                                    💭 {t(
                                                                        'aiSidebar.messages.thinking'
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {#if !isCollapsed}
                                                                {@const thinkingDisplay =
                                                                    getDisplayContent(
                                                                        response.thinking
                                                                    )}
                                                                <div
                                                                    class="ai-message__thinking-content b3-typography"
                                                                >
                                                                    {@html thinkingDisplay}
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    {/if}
                                                    <!-- 按轮次显示工具调用 -->
                                                    {#if response.toolCalls && response.toolCalls.length > 0}
                                                        {@const groupedToolCalls =
                                                            response.toolCalls.reduce(
                                                                (acc, tc, i) => {
                                                                    const key =
                                                                        tc.thinkingBefore || '';
                                                                    if (
                                                                        acc.length === 0 ||
                                                                        acc[acc.length - 1]
                                                                            .thinking !== key
                                                                    ) {
                                                                        acc.push({
                                                                            thinking: key,
                                                                            toolCalls: [tc],
                                                                        });
                                                                    } else {
                                                                        acc[
                                                                            acc.length - 1
                                                                        ].toolCalls.push(tc);
                                                                    }
                                                                    return acc;
                                                                },
                                                                []
                                                            )}

                                                        {#each groupedToolCalls as group, groupIndex}
                                                            <!-- 该轮工具调用前的思考 -->
                                                            {#if group.thinking}
                                                                <div class="ai-message__thinking">
                                                                    <div
                                                                        class="ai-message__thinking-header"
                                                                        on:click={() => toggleThinkingCollapsed(`hist-mm-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                    >
                                                                        <svg
                                                                            class="ai-message__thinking-icon"
                                                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, `hist-mm-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconRight"
                                                                            ></use>
                                                                        </svg>
                                                                        <span
                                                                            class="ai-message__thinking-title"
                                                                        >
                                                                            💭 {t(
                                                                                'aiSidebar.messages.thinking'
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                    {#if !isThinkingCollapsed(thinkingCollapsed, `hist-mm-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                        {@const groupThinkDisplay =
                                                                            getDisplayContent(
                                                                                group.thinking
                                                                            )}
                                                                        <div
                                                                            class="ai-message__thinking-content b3-typography"
                                                                        >
                                                                            {@html groupThinkDisplay}
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                            {/if}

                                                            <!-- 该轮工具调用 -->
                                                            {@const historyCardToolGroupKey = `hist-mm-tools-${messageIndex}-${msgIndex}-${index}-${groupIndex}`}
                                                            {@const historyCardToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, historyCardToolGroupKey)}
                                                            <div
                                                                class="ai-message__tool-calls"
                                                                style="margin-top: 8px;"
                                                            >
                                                                <div
                                                                    class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                                                    on:click={() =>
                                                                        toggleToolCallGroup(
                                                                            historyCardToolGroupKey
                                                                        )}
                                                                    title={historyCardToolGroupCollapsed
                                                                        ? '展开工具执行'
                                                                        : '折叠工具执行'}
                                                                >
                                                                    <svg
                                                                        class="ai-message__tool-call-icon"
                                                                        class:collapsed={historyCardToolGroupCollapsed}
                                                                    >
                                                                        <use
                                                                            xlink:href="#iconRight"
                                                                        ></use>
                                                                    </svg>
                                                                    🔧 {t('tools.calling')}
                                                                </div>
                                                                {#if !historyCardToolGroupCollapsed}
                                                                {#each group.toolCalls as toolCall}
                                                                    {@const toolDisplayName =
                                                                        getToolDisplayName(
                                                                            toolCall.function.name
                                                                        )}
                                                                    {@const isCompleted =
                                                                        toolCall.status ===
                                                                        'completed'}
                                                                    {@const isCollapsed =
                                                                        !toolCallsExpanded[
                                                                            toolCall.id
                                                                        ]}

                                                                    <div
                                                                        class="ai-message__tool-call"
                                                                    >
                                                                        <div
                                                                            class="ai-message__tool-call-header"
                                                                            on:click={() => {
                                                                                toolCallsExpanded[
                                                                                    toolCall.id
                                                                                ] =
                                                                                    !toolCallsExpanded[
                                                                                        toolCall.id
                                                                                    ];
                                                                                toolCallsExpanded =
                                                                                    {
                                                                                        ...toolCallsExpanded,
                                                                                    };
                                                                            }}
                                                                        >
                                                                            <div
                                                                                class="ai-message__tool-call-name"
                                                                            >
                                                                                <svg
                                                                                    class="ai-message__tool-call-icon"
                                                                                    class:collapsed={isCollapsed}
                                                                                >
                                                                                    <use
                                                                                        xlink:href="#iconRight"
                                                                                    ></use>
                                                                                </svg>
                                                                                <span>
                                                                                    {toolDisplayName}
                                                                                </span>
                                                                                {#if isCompleted}
                                                                                    <span
                                                                                        class="ai-message__tool-call-status"
                                                                                    >
                                                                                        ✅
                                                                                    </span>
                                                                                {:else}
                                                                                    <span
                                                                                        class="ai-message__tool-call-status"
                                                                                    >
                                                                                        ⏳
                                                                                    </span>
                                                                                {/if}
                                                                            </div>
                                                                        </div>

                                                                        {#if !isCollapsed}
                                                                            <div
                                                                                class="ai-message__tool-call-details"
                                                                            >
                                                                                <div
                                                                                    class="ai-message__tool-call-params"
                                                                                >
                                                                                    <div
                                                                                        class="ai-message__tool-call-section-header"
                                                                                    >
                                                                                        {t(
                                                                                            'aiSidebar.messages.params'
                                                                                        )}
                                                                                    </div>
                                                                                    <div
                                                                                        class="ai-message__tool-call-code-wrapper"
                                                                                    >
                                                                                        <pre
                                                                                            class="ai-message__tool-call-code"><code>{toolCall
                                                                                                    .function
                                                                                                    .arguments}</code></pre>
                                                                                    </div>
                                                                                </div>
                                                                                {#if toolCall.result}
                                                                                    <div
                                                                                        class="ai-message__tool-call-result"
                                                                                    >
                                                                                        <div
                                                                                            class="ai-message__tool-call-section-header"
                                                                                        >
                                                                                            {t(
                                                                                                'aiSidebar.messages.result'
                                                                                            )}
                                                                                        </div>
                                                                                        <div
                                                                                            class="ai-message__tool-call-code-wrapper"
                                                                                        >
                                                                                            <pre
                                                                                                class="ai-message__tool-call-code"><code>{toolCall.result}</code></pre>
                                                                                        </div>
                                                                                    </div>
                                                                                {/if}
                                                                            </div>
                                                                        {/if}
                                                                    </div>
                                                                {/each}
                                                                {/if}
                                                            </div>
                                                        {/each}

                                                        <!-- 最终思考（如果有） -->
                                                        {#if response.thinking && !response.toolCalls.some(tc => tc.thinkingBefore === response.thinking)}
                                                            <div
                                                                class="ai-message__thinking"
                                                                style="margin-top: 8px;"
                                                            >
                                                                <div
                                                                    class="ai-message__thinking-header"
                                                                    on:click={() => {
                                                                        message.multiModelResponses[
                                                                            index
                                                                        ].thinkingCollapsed =
                                                                            !response.thinkingCollapsed;
                                                                        messages = [...messages];
                                                                    }}
                                                                >
                                                                    <svg
                                                                        class="ai-message__thinking-icon"
                                                                        class:collapsed={response.thinkingCollapsed}
                                                                    >
                                                                        <use
                                                                            xlink:href="#iconRight"
                                                                        ></use>
                                                                    </svg>
                                                                    <span
                                                                        class="ai-message__thinking-title"
                                                                    >
                                                                        💭 {t(
                                                                            'aiSidebar.messages.thinking'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {#if !response.thinkingCollapsed}
                                                                    {@const finalThinkDisplay =
                                                                        getDisplayContent(
                                                                            response.thinking
                                                                        )}
                                                                    <div
                                                                        class="ai-message__thinking-content b3-typography"
                                                                    >
                                                                        {@html finalThinkDisplay}
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    {:else if response.thinking}
                                                        <!-- 没有工具调用时，只显示思考 -->
                                                        <div class="ai-message__thinking">
                                                            <div
                                                                class="ai-message__thinking-header"
                                                                on:click={() => {
                                                                    message.multiModelResponses[
                                                                        index
                                                                    ].thinkingCollapsed =
                                                                        !response.thinkingCollapsed;
                                                                    messages = [...messages];
                                                                }}
                                                            >
                                                                <svg
                                                                    class="ai-message__thinking-icon"
                                                                    class:collapsed={response.thinkingCollapsed}
                                                                >
                                                                    <use
                                                                        xlink:href="#iconRight"
                                                                    ></use>
                                                                </svg>
                                                                <span
                                                                    class="ai-message__thinking-title"
                                                                >
                                                                    💭 {t(
                                                                        'aiSidebar.messages.thinking'
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {#if !response.thinkingCollapsed}
                                                                {@const thinkingDisplay =
                                                                    getDisplayContent(
                                                                        response.thinking
                                                                    )}
                                                                <div
                                                                    class="ai-message__thinking-content b3-typography"
                                                                >
                                                                    {@html thinkingDisplay}
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    {/if}

                                                    <div
                                                        class="ai-sidebar__multi-model-card-content b3-typography"
                                                        style={messageFontSize
                                                            ? `font-size: ${messageFontSize}px;`
                                                            : ''}
                                                        on:contextmenu={e =>
                                                            handleContextMenu(
                                                                e,
                                                                messageIndex + msgIndex,
                                                                'assistant'
                                                            )}
                                                    >
                                                        {#if response.error}
                                                            <div
                                                                class="ai-sidebar__multi-model-card-error"
                                                            >
                                                                {response.error}
                                                            </div>
                                                        {:else if response.content}
                                                            {@const contentDisplay =
                                                                getDisplayContent(response.content)}
                                                            {@html contentDisplay}
                                                        {/if}
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <!-- 页签视图 -->
                                    <div class="ai-message__multi-model-tabs">
                                        <div class="ai-message__multi-model-tab-headers">
                                            {#each message.multiModelResponses as response, index}
                                                {@const tabKey = `history_multi_${messageIndex}_${msgIndex}`}
                                                {@const currentTabIndex =
                                                    thinkingCollapsed[`${tabKey}_selectedTab`] ??
                                                    message.multiModelResponses.findIndex(
                                                        r => r.isSelected
                                                    ) ??
                                                    0}
                                                <button
                                                    class="ai-message__multi-model-tab-header"
                                                    class:ai-message__multi-model-tab-header--active={currentTabIndex ===
                                                        index}
                                                    on:click={() => {
                                                        thinkingCollapsed[`${tabKey}_selectedTab`] =
                                                            index;
                                                        thinkingCollapsed = {
                                                            ...thinkingCollapsed,
                                                        };
                                                    }}
                                                >
                                                    <span class="ai-message__multi-model-tab-title">
                                                        {response.modelName}
                                                    </span>
                                                    {#if response.error}
                                                        <span
                                                            class="ai-message__multi-model-tab-status ai-message__multi-model-tab-status--error"
                                                        >
                                                            ❌
                                                        </span>
                                                    {/if}
                                                </button>
                                            {/each}
                                        </div>
                                        <div class="ai-message__multi-model-tab-content">
                                            {#each message.multiModelResponses as response, index}
                                                {@const tabKey = `history_multi_${messageIndex}_${msgIndex}`}
                                                {@const currentTabIndex =
                                                    thinkingCollapsed[`${tabKey}_selectedTab`] ??
                                                    message.multiModelResponses.findIndex(
                                                        r => r.isSelected
                                                    ) ??
                                                    0}
                                                {#if currentTabIndex === index}
                                                    <div class="ai-message__multi-model-tab-panel">
                                                        <!-- 添加面板头部，包含复制按钮 -->
                                                        <div
                                                            class="ai-message__multi-model-tab-panel-header"
                                                        >
                                                            <div
                                                                class="ai-message__multi-model-tab-panel-title"
                                                            >
                                                                <span
                                                                    class="ai-message__multi-model-tab-panel-model-name"
                                                                >
                                                                    {response.modelName}
                                                                </span>
                                                            </div>
                                                            <div
                                                                class="ai-message__multi-model-tab-panel-actions"
                                                            >
                                                                {#if !response.error && response.content}
                                                                    <button
                                                                        class="b3-button b3-button--text"
                                                                        on:click={() =>
                                                                            regenerateHistoryModelResponse(
                                                                                messageIndex +
                                                                                    msgIndex,
                                                                                index
                                                                            )}
                                                                        title={t(
                                                                            'aiSidebar.actions.regenerate'
                                                                        )}
                                                                    >
                                                                        <svg
                                                                            class="b3-button__icon"
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconRefresh"
                                                                            ></use>
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        class="b3-button b3-button--text ai-sidebar__multi-model-copy-btn"
                                                                        on:click={() =>
                                                                            copyMessage(
                                                                                response.content ||
                                                                                    ''
                                                                            )}
                                                                        title={t(
                                                                            'aiSidebar.actions.copyMessage'
                                                                        )}
                                                                    >
                                                                        <svg
                                                                            class="b3-button__icon"
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconCopy"
                                                                            ></use>
                                                                        </svg>
                                                                    </button>
                                                                {/if}
                                                            </div>
                                                        </div>

                                                        {#if response.thinking}
                                                            {@const isCollapsed =
                                                                response.thinkingCollapsed ?? true}
                                                            <div class="ai-message__thinking">
                                                                <div
                                                                    class="ai-message__thinking-header"
                                                                    on:click={() => {
                                                                        message.multiModelResponses[
                                                                            index
                                                                        ].thinkingCollapsed =
                                                                            !isCollapsed;
                                                                        messages = [...messages];
                                                                    }}
                                                                >
                                                                    <svg
                                                                        class="ai-message__thinking-icon"
                                                                        class:collapsed={isCollapsed}
                                                                    >
                                                                        <use
                                                                            xlink:href="#iconRight"
                                                                        ></use>
                                                                    </svg>
                                                                    <span
                                                                        class="ai-message__thinking-title"
                                                                    >
                                                                        💭 思考过程
                                                                    </span>
                                                                </div>
                                                                {#if !isCollapsed}
                                                                    {@const thinkingDisplay =
                                                                        getDisplayContent(
                                                                            response.thinking
                                                                        )}
                                                                    <div
                                                                        class="ai-message__thinking-content b3-typography"
                                                                    >
                                                                        {@html thinkingDisplay}
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/if}

                                                        <!-- 按轮次显示工具调用 -->
                                                        {#if response.toolCalls && response.toolCalls.length > 0}
                                                            {@const groupedToolCalls =
                                                                response.toolCalls.reduce(
                                                                    (acc, tc, i) => {
                                                                        const key =
                                                                            tc.thinkingBefore || '';
                                                                        if (
                                                                            acc.length === 0 ||
                                                                            acc[acc.length - 1]
                                                                                .thinking !== key
                                                                        ) {
                                                                            acc.push({
                                                                                thinking: key,
                                                                                toolCalls: [tc],
                                                                            });
                                                                        } else {
                                                                            acc[
                                                                                acc.length - 1
                                                                            ].toolCalls.push(tc);
                                                                        }
                                                                        return acc;
                                                                    },
                                                                    []
                                                                )}

                                                            {#each groupedToolCalls as group, groupIndex}
                                                                <!-- 该轮工具调用前的思考 -->
                                                                {#if group.thinking}
                                                                    <div
                                                                        class="ai-message__thinking"
                                                                    >
                                                                        <div
                                                                            class="ai-message__thinking-header"
                                                                            on:click={() => toggleThinkingCollapsed(`hist-tab-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                        >
                                                                            <svg
                                                                                class="ai-message__thinking-icon"
                                                                                class:collapsed={isThinkingCollapsed(thinkingCollapsed, `hist-tab-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                            >
                                                                                <use
                                                                                    xlink:href="#iconRight"
                                                                                ></use>
                                                                            </svg>
                                                                            <span
                                                                                class="ai-message__thinking-title"
                                                                            >
                                                                                💭 {t(
                                                                                    'aiSidebar.messages.thinking'
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        {#if !isThinkingCollapsed(thinkingCollapsed, `hist-tab-${messageIndex}-${msgIndex}-${index}-group-${groupIndex}`)}
                                                                            {@const groupThinkDisplay =
                                                                                getDisplayContent(
                                                                                    group.thinking
                                                                                )}
                                                                            <div
                                                                                class="ai-message__thinking-content b3-typography"
                                                                            >
                                                                                {@html groupThinkDisplay}
                                                                            </div>
                                                                        {/if}
                                                                    </div>
                                                                {/if}

                                                                <!-- 该轮工具调用 -->
                                                                {@const historyTabToolGroupKey = `hist-tab-tools-${messageIndex}-${msgIndex}-${index}-${groupIndex}`}
                                                                {@const historyTabToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, historyTabToolGroupKey)}
                                                                <div
                                                                    class="ai-message__tool-calls"
                                                                    style="margin-top: 8px;"
                                                                >
                                                                    <div
                                                                        class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                                                        on:click={() =>
                                                                            toggleToolCallGroup(
                                                                                historyTabToolGroupKey
                                                                            )}
                                                                        title={historyTabToolGroupCollapsed
                                                                            ? '展开工具执行'
                                                                            : '折叠工具执行'}
                                                                    >
                                                                        <svg
                                                                            class="ai-message__tool-call-icon"
                                                                            class:collapsed={historyTabToolGroupCollapsed}
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconRight"
                                                                            ></use>
                                                                        </svg>
                                                                        🔧 {t('tools.calling')}
                                                                    </div>
                                                                    {#if !historyTabToolGroupCollapsed}
                                                                    {#each group.toolCalls as toolCall}
                                                                        {@const toolDisplayName =
                                                                            getToolDisplayName(
                                                                                toolCall.function
                                                                                    .name
                                                                            )}
                                                                        {@const isCompleted =
                                                                            toolCall.status ===
                                                                            'completed'}
                                                                        {@const isCollapsed =
                                                                            !toolCallsExpanded[
                                                                                toolCall.id
                                                                            ]}

                                                                        <div
                                                                            class="ai-message__tool-call"
                                                                        >
                                                                            <div
                                                                                class="ai-message__tool-call-header"
                                                                                on:click={() => {
                                                                                    toolCallsExpanded[
                                                                                        toolCall.id
                                                                                    ] =
                                                                                        !toolCallsExpanded[
                                                                                            toolCall
                                                                                                .id
                                                                                        ];
                                                                                    toolCallsExpanded =
                                                                                        {
                                                                                            ...toolCallsExpanded,
                                                                                        };
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    class="ai-message__tool-call-name"
                                                                                >
                                                                                    <svg
                                                                                        class="ai-message__tool-call-icon"
                                                                                        class:collapsed={isCollapsed}
                                                                                    >
                                                                                        <use
                                                                                            xlink:href="#iconRight"
                                                                                        ></use>
                                                                                    </svg>
                                                                                    <span>
                                                                                        {toolDisplayName}
                                                                                    </span>
                                                                                    {#if isCompleted}
                                                                                        <span
                                                                                            class="ai-message__tool-call-status"
                                                                                        >
                                                                                            ✅
                                                                                        </span>
                                                                                    {:else}
                                                                                        <span
                                                                                            class="ai-message__tool-call-status"
                                                                                        >
                                                                                            ⏳
                                                                                        </span>
                                                                                    {/if}
                                                                                </div>
                                                                            </div>

                                                                            {#if !isCollapsed}
                                                                                <div
                                                                                    class="ai-message__tool-call-details"
                                                                                >
                                                                                    <div
                                                                                        class="ai-message__tool-call-params"
                                                                                    >
                                                                                        <div
                                                                                            class="ai-message__tool-call-section-header"
                                                                                        >
                                                                                            {t(
                                                                                                'aiSidebar.messages.params'
                                                                                            )}
                                                                                        </div>
                                                                                        <div
                                                                                            class="ai-message__tool-call-code-wrapper"
                                                                                        >
                                                                                            <pre
                                                                                                class="ai-message__tool-call-code"><code>{toolCall
                                                                                                        .function
                                                                                                        .arguments}</code></pre>
                                                                                        </div>
                                                                                    </div>
                                                                                    {#if toolCall.result}
                                                                                        <div
                                                                                            class="ai-message__tool-call-result"
                                                                                        >
                                                                                            <div
                                                                                                class="ai-message__tool-call-section-header"
                                                                                            >
                                                                                                {t(
                                                                                                    'aiSidebar.messages.result'
                                                                                                )}
                                                                                            </div>
                                                                                            <div
                                                                                                class="ai-message__tool-call-code-wrapper"
                                                                                            >
                                                                                                <pre
                                                                                                    class="ai-message__tool-call-code"><code>{toolCall.result}</code></pre>
                                                                                            </div>
                                                                                        </div>
                                                                                    {/if}
                                                                                </div>
                                                                            {/if}
                                                                        </div>
                                                                    {/each}
                                                                    {/if}
                                                                </div>
                                                            {/each}

                                                            <!-- 最终思考（如果有） -->
                                                            {#if response.thinking && !response.toolCalls.some(tc => tc.thinkingBefore === response.thinking)}
                                                                <div
                                                                    class="ai-message__thinking"
                                                                    style="margin-top: 8px;"
                                                                >
                                                                    <div
                                                                        class="ai-message__thinking-header"
                                                                        on:click={() => {
                                                                            message.multiModelResponses[
                                                                                index
                                                                            ].thinkingCollapsed =
                                                                                !response.thinkingCollapsed;
                                                                            messages = [
                                                                                ...messages,
                                                                            ];
                                                                        }}
                                                                    >
                                                                        <svg
                                                                            class="ai-message__thinking-icon"
                                                                            class:collapsed={response.thinkingCollapsed}
                                                                        >
                                                                            <use
                                                                                xlink:href="#iconRight"
                                                                            ></use>
                                                                        </svg>
                                                                        <span
                                                                            class="ai-message__thinking-title"
                                                                        >
                                                                            💭 {t(
                                                                                'aiSidebar.messages.thinking'
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                    {#if !response.thinkingCollapsed}
                                                                        {@const finalThinkDisplay =
                                                                            getDisplayContent(
                                                                                response.thinking
                                                                            )}
                                                                        <div
                                                                            class="ai-message__thinking-content b3-typography"
                                                                        >
                                                                            {@html finalThinkDisplay}
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                            {/if}
                                                        {:else if response.thinking}
                                                            <!-- 没有工具调用时，只显示思考 -->
                                                            <div class="ai-message__thinking">
                                                                <div
                                                                    class="ai-message__thinking-header"
                                                                    on:click={() => {
                                                                        message.multiModelResponses[
                                                                            index
                                                                        ].thinkingCollapsed =
                                                                            !response.thinkingCollapsed;
                                                                        messages = [...messages];
                                                                    }}
                                                                >
                                                                    <svg
                                                                        class="ai-message__thinking-icon"
                                                                        class:collapsed={response.thinkingCollapsed}
                                                                    >
                                                                        <use
                                                                            xlink:href="#iconRight"
                                                                        ></use>
                                                                    </svg>
                                                                    <span
                                                                        class="ai-message__thinking-title"
                                                                    >
                                                                        💭 {t(
                                                                            'aiSidebar.messages.thinking'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {#if !response.thinkingCollapsed}
                                                                    {@const thinkingDisplay =
                                                                        getDisplayContent(
                                                                            response.thinking
                                                                        )}
                                                                    <div
                                                                        class="ai-message__thinking-content b3-typography"
                                                                    >
                                                                        {@html thinkingDisplay}
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/if}

                                                        <div
                                                            class="ai-message__multi-model-tab-panel-content b3-typography"
                                                            style={messageFontSize
                                                                ? `font-size: ${messageFontSize}px;`
                                                                : ''}
                                                            on:contextmenu={e =>
                                                                handleContextMenu(
                                                                    e,
                                                                    messageIndex + msgIndex,
                                                                    'assistant'
                                                                )}
                                                        >
                                                            {#if response.error}
                                                                <div
                                                                    class="ai-message__multi-model-tab-panel-error"
                                                                >
                                                                    {response.error}
                                                                </div>
                                                            {:else if response.content}
                                                                {@const contentDisplay =
                                                                    getDisplayContent(
                                                                        response.content
                                                                    )}
                                                                {@html contentDisplay}
                                                            {/if}
                                                        </div>
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- 显示上下文文档和附件 -->
                        {#if (message.contextDocuments && message.contextDocuments.length > 0) || (message.attachments && message.attachments.length > 0)}
                            {@const contextCount =
                                (message.contextDocuments?.length || 0) +
                                (message.attachments?.length || 0)}
                            <div class="ai-message__context-docs">
                                <div class="ai-message__context-docs-title">
                                    {#if message.role === 'assistant'}
                                        🖼️ 图片与附件 ({contextCount})
                                    {:else}
                                        📎 {t('aiSidebar.context.content')} ({contextCount})
                                    {/if}
                                </div>

                                <!-- 显示附件 -->
                                {#if message.attachments && message.attachments.length > 0}
                                    <div class="ai-message__context-docs-list">
                                        {#each message.attachments as attachment}
                                            <div class="ai-message__attachment">
                                                {#if attachment.type === 'image'}
                                                    <img
                                                        src={attachment.data}
                                                        alt={attachment.name}
                                                        class="ai-message__attachment-image"
                                                        on:click={() =>
                                                            openImageViewer(
                                                                attachment.data,
                                                                attachment.name
                                                            )}
                                                        title="点击查看大图"
                                                    />
                                                    <button
                                                        class="b3-button b3-button--text ai-message__attachment-copy"
                                                        on:click={() => {
                                                            platformUtils.writeText(
                                                                attachment.data
                                                            );
                                                            pushMsg('已复制图片URL');
                                                        }}
                                                        title="复制图片URL"
                                                    >
                                                        <svg class="b3-button__icon">
                                                            <use xlink:href="#iconCopy"></use>
                                                        </svg>
                                                    </button>
                                                    <span class="ai-message__attachment-name">
                                                        {attachment.name}
                                                    </span>
                                                {:else}
                                                    <div class="ai-message__attachment-file">
                                                        {#if attachment.isWebPage}
                                                            <span
                                                                class="ai-message__attachment-icon-emoji"
                                                            >
                                                                🔗
                                                            </span>
                                                        {:else}
                                                            <svg
                                                                class="ai-message__attachment-icon"
                                                            >
                                                                <use xlink:href="#iconFile"></use>
                                                            </svg>
                                                        {/if}
                                                        <span class="ai-message__attachment-name">
                                                            {attachment.name}
                                                        </span>
                                                        <button
                                                            class="b3-button b3-button--text ai-message__attachment-copy"
                                                            on:click={() => {
                                                                platformUtils.writeText(
                                                                    attachment.data
                                                                );
                                                                pushMsg(
                                                                    attachment.isWebPage
                                                                        ? '已复制网页Markdown内容'
                                                                        : '已复制文件内容'
                                                                );
                                                            }}
                                                            title={attachment.isWebPage
                                                                ? '复制网页Markdown'
                                                                : '复制文件内容'}
                                                        >
                                                            <svg class="b3-button__icon">
                                                                <use xlink:href="#iconCopy"></use>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}

                                <!-- 显示上下文文档链接 -->
                                {#if message.contextDocuments && message.contextDocuments.length > 0}
                                    <div class="ai-message__context-docs-list">
                                        {#each message.contextDocuments as doc}
                                            <div class="ai-sidebar__context-doc-item">
                                                <button
                                                    class="ai-sidebar__context-doc-link"
                                                    on:click={() => openDocument(doc.id)}
                                                    title={doc.title}
                                                >
                                                    {doc.type === 'doc' ? '📄' : '📝'}
                                                    {doc.title}
                                                </button>
                                                <button
                                                    class="b3-button b3-button--text ai-sidebar__context-doc-copy"
                                                    on:click|stopPropagation={() =>
                                                        copyMessage(doc.content || '')}
                                                    title={t('aiSidebar.actions.copyMessage')}
                                                >
                                                    <svg class="b3-button__icon">
                                                        <use xlink:href="#iconCopy"></use>
                                                    </svg>
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- 显示编辑操作 -->
                        {#if message.role === 'assistant' && message.editOperations && message.editOperations.length > 0}
                            <div class="ai-message__edit-operations">
                                <div class="ai-message__edit-operations-title">
                                    📝 文档总差异 ({message.editOperations.length})
                                </div>
                                {#each message.editOperations as operation}
                                    <div
                                        class="ai-message__edit-operation"
                                        class:ai-message__edit-operation--applied={operation.status ===
                                            'applied'}
                                        class:ai-message__edit-operation--rejected={operation.status ===
                                            'rejected'}
                                    >
                                        <div class="ai-message__edit-operation-header">
                                            <span class="ai-message__edit-operation-id">
                                                📄 {operation.docTitle ||
                                                    operation.docId ||
                                                    operation.blockId}
                                            </span>
                                            <span class="ai-message__edit-operation-status">
                                                {#if operation.status === 'applied'}
                                                    ✓ {t('aiSidebar.actions.applied')}
                                                {:else if operation.status === 'rejected'}
                                                    ✗ {t('aiSidebar.actions.rejected')}
                                                {:else}
                                                    ⏳ {t('aiSidebar.edit.changes')}
                                                {/if}
                                            </span>
                                        </div>
                                        {#if operation.affectedBlockIds && operation.affectedBlockIds.length > 0}
                                            <div class="ai-message__edit-operation-block-ids">
                                                块ID: {operation.affectedBlockIds.join(', ')}
                                            </div>
                                        {/if}
                                        {#if operation.oldDocTitle && operation.newDocTitle && operation.oldDocTitle !== operation.newDocTitle}
                                            <div class="ai-message__edit-operation-block-ids">
                                                标题: {operation.oldDocTitle} → {operation.newDocTitle}
                                            </div>
                                        {/if}
                                        <div class="ai-message__edit-operation-actions">
                                            <!-- 查看差异按钮：所有状态都可以查看 -->
                                            <button
                                                class="b3-button b3-button--text"
                                                on:click={() => viewDiff(operation)}
                                                title={t('aiSidebar.actions.viewDiff')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconEye"></use>
                                                </svg>
                                                {t('aiSidebar.actions.viewDiff')}
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- 最终回复始终放在工具执行、差异汇总和附件之后 -->
                        {#if message.role === 'assistant' && message.finalReply && !(message.openCodeTimeline && message.openCodeTimeline.length > 0)}
                            {@const finalReplyDisplay = getDisplayContent(message.finalReply)}
                            <div
                                class="ai-message__content ai-message__final-reply b3-typography"
                                style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                            >
                                {@html finalReplyDisplay}
                            </div>
                        {:else if message.role === 'assistant' && message.content && message.content
                                .toString()
                                .trim() && !(message.multiModelResponses && message.multiModelResponses.length > 0) && !(message.openCodeTimeline && message.openCodeTimeline.length > 0)}
                            {@const assistantDisplayContent = getDisplayContent(message.content)}
                            <div
                                class="ai-message__content b3-typography"
                                style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                            >
                                {@html assistantDisplayContent}
                            </div>
                        {/if}
                    {/if}
                {/each}

                <!-- 消息操作按钮（组级别，只显示一次） -->
                <!-- 如果存在多模型响应且未选择答案，或者AI正在回答中，则不显示操作按钮 -->
                {#if !isLoading && (!firstMessage.multiModelResponses || (firstMessage.multiModelResponses && firstMessage.multiModelResponses.some(r => r.isSelected)))}
                    <div class="ai-message__actions">
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => copyMessage(getActualMessageContent(firstMessage))}
                            title={t('aiSidebar.actions.copyMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => openSaveToNoteDialog(messageIndex)}
                            title={t('aiSidebar.actions.saveToNote')}
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconDownload"></use>
                            </svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => startEditMessage(messageIndex)}
                            title={t('aiSidebar.actions.editMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => deleteMessage(messageIndex)}
                            title={t('aiSidebar.actions.deleteMessage')}
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconTrashcan"></use>
                            </svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => regenerateMessage(messageIndex)}
                            title={group.type === 'user'
                                ? t('aiSidebar.actions.resend')
                                : t('aiSidebar.actions.regenerate')}
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconRefresh"></use>
                            </svg>
                        </button>
                    </div>
                {/if}
            </div>
        {/each}

        {#if isLoading && !(enableMultiModel && chatMode === 'plan' && selectedMultiModels.length > 0)}
            <div
                class="ai-message ai-message--assistant ai-message--streaming"
                on:contextmenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <div class="ai-message__header">
                    <span class="ai-message__role">🤖 {getCurrentAssistantDisplayName()}</span>
                </div>

                {#if isContextCompactionLikely}
                    <div class="ai-message__context-compaction">
                        <span class="ai-message__context-compaction-dot"></span>
                        <span>上下文接近上限，OpenCode 可能正在压缩上下文</span>
                    </div>
                {/if}

                {#if openCodeTimeline.length > 0}
                    {@const streamingTimelineKey = 'opencode-timeline-streaming'}
                    {@const streamingTimelineItems = groupOpenCodeTimeline(openCodeTimeline)}
                    {@const streamingTimelineHidden = timelineCollapsed[streamingTimelineKey] ?? false}
                    {@const activeTimelineItemId = getActiveOpenCodeTimelineItemId(openCodeTimeline, isThinkingPhase)}
                    <div class="ai-message__timeline-shell">
                        <button
                            type="button"
                            class="ai-message__timeline-toggle"
                            on:click={() => toggleTimelineCollapsed(streamingTimelineKey, false)}
                            title={streamingTimelineHidden ? '展开思考和工具' : '折叠思考和工具'}
                        >
                            <svg
                                class="ai-message__thinking-icon"
                                class:collapsed={streamingTimelineHidden}
                            >
                                <use xlink:href="#iconRight"></use>
                            </svg>
                            <span>思考与工具</span>
                            <span class="ai-message__timeline-toggle-count">
                                {streamingTimelineItems.length}
                            </span>
                        </button>
                    <div
                        class="ai-message__timeline ai-message__timeline--streaming"
                        class:ai-message__timeline--hidden={streamingTimelineHidden}
                    >
                        {#each streamingTimelineItems as item, timelineIndex (item.id)}
                            {#if item.type === 'text'}
                                {@const timelineTextDisplay = getDisplayContent(item.content)}
                                <div
                                    class="ai-message__timeline-text b3-typography"
                                    style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                                >
                                    {@html timelineTextDisplay}
                                </div>
                            {:else if item.type === 'thinking'}
                                {@const streamingTimelineThinkingKey = `streaming-timeline-thinking-${timelineIndex}`}
                                <div class="ai-message__thinking">
                                    <div
                                        class="ai-message__thinking-header"
                                        class:ai-message__thinking-header--active={activeTimelineItemId === item.id}
                                        on:click={() => toggleThinkingCollapsed(streamingTimelineThinkingKey)}
                                    >
                                        <svg
                                            class="ai-message__thinking-icon"
                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, streamingTimelineThinkingKey)}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        <span class="ai-message__thinking-title">
                                            思考中
                                        </span>
                                    </div>
                                    {#if !isThinkingCollapsed(thinkingCollapsed, streamingTimelineThinkingKey)}
                                        {@const streamingTimelineThinkingDisplay = getDisplayContent(item.content)}
                                        <div class="ai-message__thinking-content ai-message__thinking-content--streaming b3-typography">
                                            {@html streamingTimelineThinkingDisplay}
                                        </div>
                                    {/if}
                                </div>
                            {:else}
                                <div class="ai-message__tool-calls ai-message__tool-calls--streaming ai-message__tool-calls--timeline">
                                    <div
                                        class="ai-message__tool-calls-title"
                                        class:ai-message__tool-calls-title--active={activeTimelineItemId === item.id}
                                    >
                                        工具
                                    </div>
                                    {#each item.toolParts as toolPart (getOpenCodeToolPartKey(toolPart))}
                                    {@const toolPartKey = getOpenCodeToolPartKey(toolPart)}
                                    {@const toolPartCollapsed = !toolCallsExpanded[toolPartKey]}
                                    {@const toolPartInput = formatOpenCodeToolValue(toolPart.input)}
                                    {@const toolPartOutput = formatOpenCodeToolValue(toolPart.output)}
                                    {@const toolPartError = formatOpenCodeToolValue(toolPart.error)}
                                    <div
                                        class="ai-message__tool-call"
                                        class:ai-message__tool-call--running={toolPart.status === 'running' ||
                                            toolPart.status === 'pending'}
                                        class:ai-message__tool-call--error={toolPart.status === 'error'}
                                    >
                                        <div
                                            class="ai-message__tool-call-header"
                                            on:click={() => {
                                                toolCallsExpanded[toolPartKey] =
                                                    !toolCallsExpanded[toolPartKey];
                                                toolCallsExpanded = { ...toolCallsExpanded };
                                            }}
                                        >
                                            <div class="ai-message__tool-call-name">
                                                <svg
                                                    class="ai-message__tool-call-icon"
                                                    class:collapsed={toolPartCollapsed}
                                                >
                                                    <use xlink:href="#iconRight"></use>
                                                </svg>
                                                <span>{toolPart.title || toolPart.toolName}</span>
                                                <span class="ai-message__tool-call-status">
                                                    {getOpenCodeToolStatusIcon(toolPart.status)}
                                                    {getOpenCodeToolStatusText(toolPart.status)}
                                                </span>
                                            </div>
                                        </div>
                                        {#if !toolPartCollapsed && (toolPartInput || toolPartOutput || toolPartError)}
                                            <div class="ai-message__tool-call-details">
                                                {#if toolPartInput}
                                                    <div class="ai-message__tool-call-params">
                                                        <div class="ai-message__tool-call-section-header">
                                                            <strong>输入</strong>
                                                        </div>
                                                        <pre class="ai-message__tool-call-code">{toolPartInput}</pre>
                                                    </div>
                                                {/if}
                                                {#if toolPartOutput}
                                                    <div class="ai-message__tool-call-result">
                                                        <div class="ai-message__tool-call-section-header">
                                                            <strong>{t('tools.result')}</strong>
                                                        </div>
                                                        <pre class="ai-message__tool-call-code">{toolPartOutput}</pre>
                                                    </div>
                                                {/if}
                                                {#if toolPartError}
                                                    <div class="ai-message__tool-call-result">
                                                        <div class="ai-message__tool-call-section-header">
                                                            <strong>错误</strong>
                                                        </div>
                                                        <pre class="ai-message__tool-call-code">{toolPartError}</pre>
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    </div>
                    </div>
                {/if}

                <!-- 显示流式思考过程 -->
                {#if streamingThinking && openCodeTimeline.length === 0}
                    <div class="ai-message__thinking">
                        <div
                            class="ai-message__thinking-header"
                            on:click={() => {
                                streamingThinkingCollapsed = !streamingThinkingCollapsed;
                            }}
                            title={streamingThinkingCollapsed ? 'Expand thinking' : 'Collapse thinking'}
                        >
                            <svg
                                class="ai-message__thinking-icon"
                                class:collapsed={streamingThinkingCollapsed}
                            >
                                <use xlink:href="#iconRight"></use>
                            </svg>
                            <span class="ai-message__thinking-title">
                                💭 思考中{isThinkingPhase ? '...' : ' (已完成)'}
                            </span>
                        </div>
                        {#if !streamingThinkingCollapsed}
                            {#if !isThinkingPhase}
                                {@const streamThinkingDisplay = getDisplayContent(streamingThinking)}
                                <div class="ai-message__thinking-content b3-typography">
                                    {@html streamThinkingDisplay}
                                </div>
                            {:else}
                                {@const streamThinkingDisplay2 = getDisplayContent(streamingThinking)}
                                <div
                                    class="ai-message__thinking-content ai-message__thinking-content--streaming b3-typography"
                                >
                                    {@html streamThinkingDisplay2}
                                </div>
                            {/if}
                        {/if}
                    </div>
                {/if}

                {#if openCodeToolParts.length > 0 && openCodeTimeline.length === 0}
                    <div class="ai-message__tool-calls ai-message__tool-calls--streaming">
                        <div
                            class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                            on:click={() => {
                                streamingToolCallsCollapsed = !streamingToolCallsCollapsed;
                            }}
                            title={streamingToolCallsCollapsed ? 'Expand tool calls' : 'Collapse tool calls'}
                        >
                            <svg
                                class="ai-message__tool-call-icon"
                                class:collapsed={streamingToolCallsCollapsed}
                            >
                                <use xlink:href="#iconRight"></use>
                            </svg>
                            🔧 工具执行
                        </div>
                        {#if !streamingToolCallsCollapsed}
                            {#each openCodeToolParts as toolPart (getOpenCodeToolPartKey(toolPart))}
                            {@const toolPartKey = getOpenCodeToolPartKey(toolPart)}
                            {@const toolPartCollapsed = !toolCallsExpanded[toolPartKey]}
                            {@const toolPartInput = formatOpenCodeToolValue(toolPart.input)}
                            {@const toolPartOutput = formatOpenCodeToolValue(toolPart.output)}
                            {@const toolPartError = formatOpenCodeToolValue(toolPart.error)}
                            <div
                                class="ai-message__tool-call"
                                class:ai-message__tool-call--running={toolPart.status === 'running' ||
                                    toolPart.status === 'pending'}
                                class:ai-message__tool-call--error={toolPart.status === 'error'}
                            >
                                <div
                                    class="ai-message__tool-call-header"
                                    on:click={() => {
                                        toolCallsExpanded[toolPartKey] =
                                            !toolCallsExpanded[toolPartKey];
                                        toolCallsExpanded = { ...toolCallsExpanded };
                                    }}
                                >
                                    <div class="ai-message__tool-call-name">
                                        <svg
                                            class="ai-message__tool-call-icon"
                                            class:collapsed={toolPartCollapsed}
                                        >
                                            <use xlink:href="#iconRight"></use>
                                        </svg>
                                        <span>{toolPart.title || toolPart.toolName}</span>
                                        <span class="ai-message__tool-call-status">
                                            {getOpenCodeToolStatusIcon(toolPart.status)}
                                            {getOpenCodeToolStatusText(toolPart.status)}
                                        </span>
                                    </div>
                                </div>

                                {#if !toolPartCollapsed && (toolPartInput || toolPartOutput || toolPartError)}
                                    <div class="ai-message__tool-call-details">
                                        {#if toolPartInput}
                                            <div class="ai-message__tool-call-params">
                                                <div class="ai-message__tool-call-section-header">
                                                    <strong>输入</strong>
                                                </div>
                                                <pre class="ai-message__tool-call-code">{toolPartInput}</pre>
                                            </div>
                                        {/if}
                                        {#if toolPartOutput}
                                            <div class="ai-message__tool-call-result">
                                                <div class="ai-message__tool-call-section-header">
                                                    <strong>{t('tools.result')}</strong>
                                                </div>
                                                <pre class="ai-message__tool-call-code">{toolPartOutput}</pre>
                                            </div>
                                        {/if}
                                        {#if toolPartError}
                                            <div class="ai-message__tool-call-result">
                                                <div class="ai-message__tool-call-section-header">
                                                    <strong>错误</strong>
                                                </div>
                                                <pre class="ai-message__tool-call-code">{toolPartError}</pre>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            {/each}
                        {/if}
                    </div>
                {/if}

                {#if streamingMessage && openCodeTimeline.length === 0}
                    {@const streamMsgDisplay = getDisplayContent(streamingMessage)}
                    <div
                        class="ai-message__content b3-typography"
                        style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                    >
                        {@html streamMsgDisplay}
                    </div>
                {:else if !streamingThinking}
                    <div class="ai-message__content b3-typography">
                        <div class="ai-message__waiting-placeholder">
                            <span class="jumping-dots">
                                <span class="dot"></span>
                                <span class="dot"></span>
                                <span class="dot"></span>
                            </span>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- 多模型响应 -->
        {#if multiModelResponses.length > 0}
            <div class="ai-sidebar__multi-model-responses">
                <div class="ai-sidebar__multi-model-header">
                    <div class="ai-sidebar__multi-model-header-top">
                        <h3>{t('multiModel.responses')}</h3>
                        <div class="ai-sidebar__multi-model-layout-selector">
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                class:b3-button--primary={multiModelLayout === 'card'}
                                on:click={() => (multiModelLayout = 'card')}
                                title={t('multiModel.layout.card')}
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconSplitLR"></use>
                                </svg>
                                {t('multiModel.layout.card')}
                            </button>
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                class:b3-button--primary={multiModelLayout === 'tab'}
                                on:click={() => (multiModelLayout = 'tab')}
                                title={t('multiModel.layout.tab')}
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconSplitTB"></use>
                                </svg>
                                {t('multiModel.layout.tab')}
                            </button>
                        </div>
                    </div>
                    {#if isWaitingForAnswerSelection}
                        <div class="ai-sidebar__multi-model-hint">
                            {t('multiModel.waitingSelection')}
                        </div>
                    {/if}
                </div>
                {#if multiModelLayout === 'card'}
                    <div class="ai-sidebar__multi-model-cards">
                        {#each multiModelResponses as response, index}
                            <div
                                class="ai-sidebar__multi-model-card"
                                class:ai-sidebar__multi-model-card--selected={selectedAnswerIndex ===
                                    index}
                            >
                                <div class="ai-sidebar__multi-model-card-header">
                                    <div class="ai-sidebar__multi-model-card-title">
                                        <span class="ai-sidebar__multi-model-card-model-name">
                                            {response.modelName}
                                            {#if selectedAnswerIndex === index}
                                                <span
                                                    class="ai-sidebar__multi-model-selected-indicator"
                                                >
                                                    ✅
                                                </span>
                                            {/if}
                                        </span>
                                        {#if response.isLoading}
                                            <span
                                                class="ai-sidebar__multi-model-card-status ai-sidebar__multi-model-card-status--loading"
                                            >
                                                ⏳ {t('multiModel.loading')}
                                            </span>
                                        {:else if response.error}
                                            <span
                                                class="ai-sidebar__multi-model-card-status ai-sidebar__multi-model-card-status--error"
                                            >
                                                ❌ {t('multiModel.error')}
                                            </span>
                                        {/if}
                                    </div>
                                    <div class="ai-sidebar__multi-model-card-actions">
                                        {#if !response.isLoading && !response.error}
                                            <button
                                                class="b3-button b3-button--text ai-sidebar__multi-model-copy-btn"
                                                on:click={() => copyMessage(response.content || '')}
                                                title={t('aiSidebar.actions.copyMessage')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconCopy"></use>
                                                </svg>
                                            </button>
                                        {/if}
                                        {#if !response.isLoading && isWaitingForAnswerSelection}
                                            <button
                                                class="b3-button b3-button--text"
                                                on:click={() => regenerateModelResponse(index)}
                                                title={t('aiSidebar.actions.regenerate')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconRefresh"></use>
                                                </svg>
                                            </button>
                                            <button
                                                class="b3-button b3-button--primary ai-sidebar__multi-model-select-btn"
                                                class:ai-sidebar__multi-model-select-btn--selected={selectedAnswerIndex ===
                                                    index}
                                                on:click={() => selectMultiModelAnswer(index)}
                                            >
                                                {selectedAnswerIndex === index
                                                    ? t('multiModel.answerSelected')
                                                    : t('multiModel.selectAnswer')}
                                            </button>
                                        {/if}
                                    </div>
                                </div>

                                <div class="ai-sidebar__multi-model-card-scroll">
                                    <!-- 按轮次显示思考、工具调用和回复 -->
                                    {#if response.toolCalls && response.toolCalls.length > 0}
                                        {@const groupedToolCalls = response.toolCalls.reduce(
                                            (acc, tc, i) => {
                                                const key = tc.thinkingBefore || '';
                                                if (
                                                    acc.length === 0 ||
                                                    acc[acc.length - 1].thinking !== key
                                                ) {
                                                    acc.push({ thinking: key, toolCalls: [tc] });
                                                } else {
                                                    acc[acc.length - 1].toolCalls.push(tc);
                                                }
                                                return acc;
                                            },
                                            []
                                        )}

                                        {#each groupedToolCalls as group, groupIndex}
                                            <!-- 该轮工具调用前的思考 -->
                                            {#if group.thinking}
                                                <div class="ai-message__thinking">
                                                    <div
                                                        class="ai-message__thinking-header"
                                                        on:click={() => toggleThinkingCollapsed(`mm-${index}-group-${groupIndex}`)}
                                                    >
                                                        <svg
                                                            class="ai-message__thinking-icon"
                                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, `mm-${index}-group-${groupIndex}`)}
                                                        >
                                                            <use xlink:href="#iconRight"></use>
                                                        </svg>
                                                        <span class="ai-message__thinking-title">
                                                            💭 {t('aiSidebar.messages.thinking')}
                                                        </span>
                                                    </div>
                                                    {#if !isThinkingCollapsed(thinkingCollapsed, `mm-${index}-group-${groupIndex}`)}
                                                        {@const streamCardThink = getDisplayContent(
                                                            group.thinking
                                                        )}
                                                        <div
                                                            class="ai-message__thinking-content b3-typography"
                                                        >
                                                            {@html streamCardThink}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}

                                            <!-- 该轮工具调用 -->
                                            {@const liveCardToolGroupKey = `mm-tools-${index}-${groupIndex}`}
                                            {@const liveCardToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, liveCardToolGroupKey)}
                                            <div
                                                class="ai-message__tool-calls"
                                                style="margin-top: 8px;"
                                            >
                                                <div
                                                    class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                                    on:click={() =>
                                                        toggleToolCallGroup(liveCardToolGroupKey)}
                                                    title={liveCardToolGroupCollapsed
                                                        ? '展开工具执行'
                                                        : '折叠工具执行'}
                                                >
                                                    <svg
                                                        class="ai-message__tool-call-icon"
                                                        class:collapsed={liveCardToolGroupCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    🔧 {t('tools.calling')}
                                                </div>
                                                {#if !liveCardToolGroupCollapsed}
                                                {#each group.toolCalls as toolCall}
                                                    {@const toolDisplayName = getToolDisplayName(
                                                        toolCall.function.name
                                                    )}
                                                    {@const isCompleted =
                                                        toolCall.status === 'completed'}
                                                    {@const isCollapsed =
                                                        !toolCallsExpanded[toolCall.id]}

                                                    <div class="ai-message__tool-call">
                                                        <div
                                                            class="ai-message__tool-call-header"
                                                            on:click={() => {
                                                                toolCallsExpanded[toolCall.id] =
                                                                    !toolCallsExpanded[toolCall.id];
                                                                toolCallsExpanded = {
                                                                    ...toolCallsExpanded,
                                                                };
                                                            }}
                                                        >
                                                            <div class="ai-message__tool-call-name">
                                                                <svg
                                                                    class="ai-message__tool-call-icon"
                                                                    class:collapsed={isCollapsed}
                                                                >
                                                                    <use
                                                                        xlink:href="#iconRight"
                                                                    ></use>
                                                                </svg>
                                                                <span>{toolDisplayName}</span>
                                                                {#if isCompleted}
                                                                    <span
                                                                        class="ai-message__tool-call-status"
                                                                    >
                                                                        ✅
                                                                    </span>
                                                                {:else}
                                                                    <span
                                                                        class="ai-message__tool-call-status"
                                                                    >
                                                                        ⏳
                                                                    </span>
                                                                {/if}
                                                            </div>
                                                        </div>

                                                        {#if !isCollapsed}
                                                            <div
                                                                class="ai-message__tool-call-details"
                                                            >
                                                                <div
                                                                    class="ai-message__tool-call-params"
                                                                >
                                                                    <div
                                                                        class="ai-message__tool-call-section-header"
                                                                    >
                                                                        {t(
                                                                            'aiSidebar.messages.params'
                                                                        )}
                                                                    </div>
                                                                    <div
                                                                        class="ai-message__tool-call-code-wrapper"
                                                                    >
                                                                        <pre
                                                                            class="ai-message__tool-call-code"><code>{toolCall
                                                                                    .function
                                                                                    .arguments}</code></pre>
                                                                    </div>
                                                                </div>
                                                                {#if toolCall.result}
                                                                    <div
                                                                        class="ai-message__tool-call-result"
                                                                    >
                                                                        <div
                                                                            class="ai-message__tool-call-section-header"
                                                                        >
                                                                            {t(
                                                                                'aiSidebar.messages.result'
                                                                            )}
                                                                        </div>
                                                                        <div
                                                                            class="ai-message__tool-call-code-wrapper"
                                                                        >
                                                                            <pre
                                                                                class="ai-message__tool-call-code"><code>{toolCall.result}</code></pre>
                                                                        </div>
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/each}
                                                {/if}
                                            </div>
                                        {/each}

                                        <!-- 最终思考（如果有） -->
                                        {#if response.thinking && !response.toolCalls.some(tc => tc.thinkingBefore === response.thinking)}
                                            <div
                                                class="ai-message__thinking"
                                                style="margin-top: 8px;"
                                            >
                                                <div
                                                    class="ai-message__thinking-header"
                                                    on:click={() => {
                                                        multiModelResponses[
                                                            index
                                                        ].thinkingCollapsed =
                                                            !multiModelResponses[index]
                                                                .thinkingCollapsed;
                                                        multiModelResponses = [
                                                            ...multiModelResponses,
                                                        ];
                                                    }}
                                                >
                                                    <svg
                                                        class="ai-message__thinking-icon"
                                                        class:collapsed={response.thinkingCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    <span class="ai-message__thinking-title">
                                                        💭 {t('aiSidebar.messages.thinking')}
                                                    </span>
                                                </div>
                                                {#if !response.thinkingCollapsed}
                                                    {@const streamCardThink = getDisplayContent(
                                                        response.thinking
                                                    )}
                                                    <div
                                                        class="ai-message__thinking-content b3-typography"
                                                    >
                                                        {@html streamCardThink}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {:else if response.thinking}
                                        <!-- 没有工具调用时，只显示思考 -->
                                        <div class="ai-message__thinking">
                                            <div
                                                class="ai-message__thinking-header"
                                                on:click={() => {
                                                    multiModelResponses[index].thinkingCollapsed =
                                                        !multiModelResponses[index]
                                                            .thinkingCollapsed;
                                                    multiModelResponses = [...multiModelResponses];
                                                }}
                                            >
                                                <svg
                                                    class="ai-message__thinking-icon"
                                                    class:collapsed={response.thinkingCollapsed}
                                                >
                                                    <use xlink:href="#iconRight"></use>
                                                </svg>
                                                <span class="ai-message__thinking-title">
                                                    💭 {t('aiSidebar.messages.thinking')}
                                                </span>
                                            </div>
                                            {#if !response.thinkingCollapsed}
                                                {@const streamCardThink = getDisplayContent(
                                                    response.thinking
                                                )}
                                                <div
                                                    class="ai-message__thinking-content b3-typography"
                                                >
                                                    {@html streamCardThink}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}

                                    <div
                                        class="ai-sidebar__multi-model-card-content b3-typography"
                                        style={messageFontSize
                                            ? `font-size: ${messageFontSize}px;`
                                            : ''}
                                        on:contextmenu={e =>
                                            handleContextMenu(e, index, 'assistant', true)}
                                    >
                                        {#if response.error}
                                            <div class="ai-sidebar__multi-model-card-error">
                                                {response.error}
                                            </div>
                                        {:else if response.content}
                                            {@const streamCardContent = getDisplayContent(
                                                response.content
                                            )}
                                            {@html streamCardContent}
                                        {:else if response.isLoading}
                                            <div class="ai-sidebar__multi-model-card-loading">
                                                <span class="jumping-dots">
                                                    <span class="dot"></span>
                                                    <span class="dot"></span>
                                                    <span class="dot"></span>
                                                </span>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="ai-sidebar__multi-model-tabs">
                        <div class="ai-sidebar__multi-model-tab-headers">
                            {#each multiModelResponses as response, index}
                                <button
                                    class="ai-sidebar__multi-model-tab-header"
                                    class:ai-sidebar__multi-model-tab-header--active={selectedTabIndex ===
                                        index}
                                    on:click={() => (selectedTabIndex = index)}
                                >
                                    <span class="ai-sidebar__multi-model-tab-title">
                                        {response.modelName}
                                        {#if selectedAnswerIndex === index}
                                            <span
                                                class="ai-sidebar__multi-model-selected-indicator"
                                            >
                                                ✅
                                            </span>
                                        {/if}
                                    </span>
                                    {#if response.isLoading}
                                        <span
                                            class="ai-sidebar__multi-model-tab-status ai-sidebar__multi-model-tab-status--loading"
                                        >
                                            <span class="jumping-dots jumping-dots--small">
                                                <span class="dot"></span>
                                                <span class="dot"></span>
                                                <span class="dot"></span>
                                            </span>
                                        </span>
                                    {:else if response.error}
                                        <span
                                            class="ai-sidebar__multi-model-tab-status ai-sidebar__multi-model-tab-status--error"
                                        >
                                            ❌
                                        </span>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                        <div class="ai-sidebar__multi-model-tab-content">
                            {#if multiModelResponses[selectedTabIndex]}
                                {@const response = multiModelResponses[selectedTabIndex]}
                                <div class="ai-sidebar__multi-model-tab-panel">
                                    <div class="ai-sidebar__multi-model-tab-panel-header">
                                        <div class="ai-sidebar__multi-model-tab-panel-title">
                                            <span
                                                class="ai-sidebar__multi-model-tab-panel-model-name"
                                            >
                                                {response.modelName}
                                                {#if selectedAnswerIndex === selectedTabIndex}
                                                    <span
                                                        class="ai-sidebar__multi-model-selected-indicator"
                                                    >
                                                        ✅
                                                    </span>
                                                {/if}
                                            </span>
                                            {#if response.isLoading}
                                                <span
                                                    class="ai-sidebar__multi-model-tab-panel-status ai-sidebar__multi-model-tab-panel-status--loading"
                                                >
                                                    <span class="jumping-dots jumping-dots--small">
                                                        <span class="dot"></span>
                                                        <span class="dot"></span>
                                                        <span class="dot"></span>
                                                    </span>
                                                </span>
                                            {:else if response.error}
                                                <span
                                                    class="ai-sidebar__multi-model-tab-panel-status ai-sidebar__multi-model-tab-panel-status--error"
                                                >
                                                    ❌ {t('multiModel.error')}
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="ai-sidebar__multi-model-tab-panel-actions">
                                            {#if !response.isLoading && !response.error}
                                                <button
                                                    class="b3-button b3-button--text ai-sidebar__multi-model-copy-btn"
                                                    on:click={() =>
                                                        copyMessage(response.content || '')}
                                                    title={t('aiSidebar.actions.copyMessage')}
                                                >
                                                    <svg class="b3-button__icon">
                                                        <use xlink:href="#iconCopy"></use>
                                                    </svg>
                                                </button>
                                            {/if}
                                            {#if !response.isLoading && isWaitingForAnswerSelection}
                                                <button
                                                    class="b3-button b3-button--text"
                                                    on:click={() =>
                                                        regenerateModelResponse(selectedTabIndex)}
                                                    title={t('aiSidebar.actions.regenerate')}
                                                >
                                                    <svg class="b3-button__icon">
                                                        <use xlink:href="#iconRefresh"></use>
                                                    </svg>
                                                </button>
                                                <button
                                                    class="b3-button b3-button--primary ai-sidebar__multi-model-select-btn"
                                                    class:ai-sidebar__multi-model-select-btn--selected={selectedAnswerIndex ===
                                                        selectedTabIndex}
                                                    on:click={() =>
                                                        selectMultiModelAnswer(selectedTabIndex)}
                                                >
                                                    {selectedAnswerIndex === selectedTabIndex
                                                        ? t('multiModel.answerSelected')
                                                        : t('multiModel.selectAnswer')}
                                                </button>
                                            {/if}
                                        </div>
                                    </div>

                                    <!-- 按轮次显示思考、工具调用和回复 -->
                                    {#if response.toolCalls && response.toolCalls.length > 0}
                                        {@const groupedToolCalls = response.toolCalls.reduce(
                                            (acc, tc, i) => {
                                                const key = tc.thinkingBefore || '';
                                                if (
                                                    acc.length === 0 ||
                                                    acc[acc.length - 1].thinking !== key
                                                ) {
                                                    acc.push({ thinking: key, toolCalls: [tc] });
                                                } else {
                                                    acc[acc.length - 1].toolCalls.push(tc);
                                                }
                                                return acc;
                                            },
                                            []
                                        )}

                                        {#each groupedToolCalls as group, groupIndex}
                                            <!-- 该轮工具调用前的思考 -->
                                            {#if group.thinking}
                                                <div class="ai-message__thinking">
                                                    <div
                                                        class="ai-message__thinking-header"
                                                        on:click={() => toggleThinkingCollapsed(`mm-tab-${selectedTabIndex}-group-${groupIndex}`)}
                                                    >
                                                        <svg
                                                            class="ai-message__thinking-icon"
                                                            class:collapsed={isThinkingCollapsed(thinkingCollapsed, `mm-tab-${selectedTabIndex}-group-${groupIndex}`)}
                                                        >
                                                            <use xlink:href="#iconRight"></use>
                                                        </svg>
                                                        <span class="ai-message__thinking-title">
                                                            💭 思考过程
                                                        </span>
                                                    </div>
                                                    {#if !isThinkingCollapsed(thinkingCollapsed, `mm-tab-${selectedTabIndex}-group-${groupIndex}`)}
                                                        {@const streamTabThink = getDisplayContent(
                                                            group.thinking
                                                        )}
                                                        <div
                                                            class="ai-message__thinking-content b3-typography"
                                                        >
                                                            {@html streamTabThink}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}

                                            <!-- 该轮工具调用 -->
                                            {@const liveTabToolGroupKey = `mm-tab-tools-${selectedTabIndex}-${groupIndex}`}
                                            {@const liveTabToolGroupCollapsed = isToolCallGroupCollapsed(toolCallGroupsCollapsed, liveTabToolGroupKey)}
                                            <div
                                                class="ai-message__tool-calls"
                                                style="margin-top: 8px;"
                                            >
                                                <div
                                                    class="ai-message__tool-calls-title ai-message__tool-calls-title--clickable"
                                                    on:click={() =>
                                                        toggleToolCallGroup(liveTabToolGroupKey)}
                                                    title={liveTabToolGroupCollapsed
                                                        ? '展开工具执行'
                                                        : '折叠工具执行'}
                                                >
                                                    <svg
                                                        class="ai-message__tool-call-icon"
                                                        class:collapsed={liveTabToolGroupCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    🔧 {t('tools.calling')}
                                                </div>
                                                {#if !liveTabToolGroupCollapsed}
                                                {#each group.toolCalls as toolCall}
                                                    {@const toolDisplayName = getToolDisplayName(
                                                        toolCall.function.name
                                                    )}
                                                    {@const isCompleted =
                                                        toolCall.status === 'completed'}
                                                    {@const isCollapsed =
                                                        !toolCallsExpanded[toolCall.id]}

                                                    <div class="ai-message__tool-call">
                                                        <div
                                                            class="ai-message__tool-call-header"
                                                            on:click={() => {
                                                                toolCallsExpanded[toolCall.id] =
                                                                    !toolCallsExpanded[toolCall.id];
                                                                toolCallsExpanded = {
                                                                    ...toolCallsExpanded,
                                                                };
                                                            }}
                                                        >
                                                            <div class="ai-message__tool-call-name">
                                                                <svg
                                                                    class="ai-message__tool-call-icon"
                                                                    class:collapsed={isCollapsed}
                                                                >
                                                                    <use
                                                                        xlink:href="#iconRight"
                                                                    ></use>
                                                                </svg>
                                                                <span>{toolDisplayName}</span>
                                                                {#if isCompleted}
                                                                    <span
                                                                        class="ai-message__tool-call-status"
                                                                    >
                                                                        ✅
                                                                    </span>
                                                                {:else}
                                                                    <span
                                                                        class="ai-message__tool-call-status"
                                                                    >
                                                                        ⏳
                                                                    </span>
                                                                {/if}
                                                            </div>
                                                        </div>

                                                        {#if !isCollapsed}
                                                            <div
                                                                class="ai-message__tool-call-details"
                                                            >
                                                                <div
                                                                    class="ai-message__tool-call-params"
                                                                >
                                                                    <div
                                                                        class="ai-message__tool-call-section-header"
                                                                    >
                                                                        {t(
                                                                            'aiSidebar.messages.params'
                                                                        )}
                                                                    </div>
                                                                    <div
                                                                        class="ai-message__tool-call-code-wrapper"
                                                                    >
                                                                        <pre
                                                                            class="ai-message__tool-call-code"><code>{toolCall
                                                                                    .function
                                                                                    .arguments}</code></pre>
                                                                    </div>
                                                                </div>
                                                                {#if toolCall.result}
                                                                    <div
                                                                        class="ai-message__tool-call-result"
                                                                    >
                                                                        <div
                                                                            class="ai-message__tool-call-section-header"
                                                                        >
                                                                            {t(
                                                                                'aiSidebar.messages.result'
                                                                            )}
                                                                        </div>
                                                                        <div
                                                                            class="ai-message__tool-call-code-wrapper"
                                                                        >
                                                                            <pre
                                                                                class="ai-message__tool-call-code"><code>{toolCall.result}</code></pre>
                                                                        </div>
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/each}
                                                {/if}
                                            </div>
                                        {/each}

                                        <!-- 最终思考（如果有） -->
                                        {#if response.thinking && !response.toolCalls.some(tc => tc.thinkingBefore === response.thinking)}
                                            <div
                                                class="ai-message__thinking"
                                                style="margin-top: 8px;"
                                            >
                                                <div
                                                    class="ai-message__thinking-header"
                                                    on:click={() => {
                                                        multiModelResponses[
                                                            selectedTabIndex
                                                        ].thinkingCollapsed =
                                                            !multiModelResponses[selectedTabIndex]
                                                                .thinkingCollapsed;
                                                        multiModelResponses = [
                                                            ...multiModelResponses,
                                                        ];
                                                    }}
                                                >
                                                    <svg
                                                        class="ai-message__thinking-icon"
                                                        class:collapsed={response.thinkingCollapsed}
                                                    >
                                                        <use xlink:href="#iconRight"></use>
                                                    </svg>
                                                    <span class="ai-message__thinking-title">
                                                        💭 思考过程
                                                    </span>
                                                </div>
                                                {#if !response.thinkingCollapsed}
                                                    {@const streamTabThink = getDisplayContent(
                                                        response.thinking
                                                    )}
                                                    <div
                                                        class="ai-message__thinking-content b3-typography"
                                                    >
                                                        {@html streamTabThink}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {:else if response.thinking}
                                        <!-- 没有工具调用时，只显示思考 -->
                                        <div class="ai-message__thinking">
                                            <div
                                                class="ai-message__thinking-header"
                                                on:click={() => {
                                                    multiModelResponses[
                                                        selectedTabIndex
                                                    ].thinkingCollapsed =
                                                        !multiModelResponses[selectedTabIndex]
                                                            .thinkingCollapsed;
                                                    multiModelResponses = [...multiModelResponses];
                                                }}
                                            >
                                                <svg
                                                    class="ai-message__thinking-icon"
                                                    class:collapsed={response.thinkingCollapsed}
                                                >
                                                    <use xlink:href="#iconRight"></use>
                                                </svg>
                                                <span class="ai-message__thinking-title">
                                                    💭 思考过程
                                                </span>
                                            </div>
                                            {#if !response.thinkingCollapsed}
                                                {@const streamTabThink = getDisplayContent(
                                                    response.thinking
                                                )}
                                                <div
                                                    class="ai-message__thinking-content b3-typography"
                                                >
                                                    {@html streamTabThink}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}

                                    <div
                                        class="ai-sidebar__multi-model-tab-panel-content b3-typography"
                                        style={messageFontSize
                                            ? `font-size: ${messageFontSize}px;`
                                            : ''}
                                        on:contextmenu={e =>
                                            handleContextMenu(
                                                e,
                                                selectedTabIndex,
                                                'assistant',
                                                true
                                            )}
                                    >
                                        {#if response.error}
                                            <div class="ai-sidebar__multi-model-tab-panel-error">
                                                {response.error}
                                            </div>
                                        {:else if response.content}
                                            {@const streamTabContent = getDisplayContent(
                                                response.content
                                            )}
                                            {@html streamTabContent}
                                        {:else if response.isLoading}
                                            <div class="ai-sidebar__multi-model-tab-panel-loading">
                                                {t('multiModel.loading')}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        {#if messages.filter(msg => msg.role !== 'system').length === 0 && !isLoading}
            <div class="ai-sidebar__empty">
                <div class="ai-sidebar__empty-illustration">
                    <img src={openCodeIconUrl} alt="" aria-hidden="true" />
                </div>
            </div>
        {/if}
    </div>
