export class TaskStateController<T> {
    private foregroundStates: Record<string, T> = {};
    private backgroundStates = new Map<string, T>();
    private unreadTaskIds = new Set<string>();
    private taskIds: string[];

    constructor(
        private readonly createBlankState: () => T,
        initialTaskIds: string[] = [],
        private readonly maxTabs = 4
    ) {
        this.taskIds = [...initialTaskIds];
    }

    get activeTaskIds(): string[] {
        return [...this.taskIds];
    }

    get unreadIds(): Set<string> {
        return new Set(this.unreadTaskIds);
    }

    isUnread(taskId: string): boolean {
        return this.unreadTaskIds.has(taskId);
    }

    markUnread(taskId: string, activeTaskId: string): void {
        if (taskId && taskId !== activeTaskId) {
            this.unreadTaskIds.add(taskId);
        }
    }

    clearUnread(taskId: string): void {
        this.unreadTaskIds.delete(taskId);
    }

    saveForeground(taskId: string, state: T): void {
        if (taskId) {
            this.foregroundStates = { ...this.foregroundStates, [taskId]: state };
        }
    }

    getForeground(taskId: string): T | undefined {
        return this.foregroundStates[taskId];
    }

    hasState(taskId: string): boolean {
        return this.backgroundStates.has(taskId) || taskId in this.foregroundStates;
    }

    hasBackgroundState(taskId: string): boolean {
        return this.backgroundStates.has(taskId);
    }

    getState(taskId: string): T {
        return this.backgroundStates.get(taskId) ?? this.foregroundStates[taskId] ?? this.createBlankState();
    }

    updateState(taskId: string, isActive: boolean, updater: (state: T) => T): T {
        const nextState = updater(this.getState(taskId));
        if (isActive) {
            this.saveForeground(taskId, nextState);
        } else {
            this.backgroundStates.set(taskId, nextState);
        }
        return nextState;
    }

    flushBackground(taskId: string): T | null {
        const state = this.backgroundStates.get(taskId);
        if (!state) return null;
        this.backgroundStates.delete(taskId);
        this.saveForeground(taskId, state);
        return state;
    }

    ensureTab(taskId: string, activeTaskId: string, runningTaskIds: Set<string>): void {
        if (!taskId || this.taskIds.includes(taskId)) return;
        const next = [...this.taskIds, taskId];
        if (next.length > this.maxTabs) {
            const removableIndex = next.findIndex(
                id => id !== activeTaskId && !runningTaskIds.has(id)
            );
            next.splice(removableIndex >= 0 ? removableIndex : 0, 1);
        }
        this.taskIds = next;
    }

    replaceDraft(draftId: string, taskId: string): void {
        if (!draftId || !this.taskIds.includes(draftId)) {
            return;
        }
        const draftState = this.foregroundStates[draftId];
        if (draftState) {
            const nextStates = { ...this.foregroundStates, [taskId]: draftState };
            delete nextStates[draftId];
            this.foregroundStates = nextStates;
        }
        this.taskIds = Array.from(new Set(this.taskIds.map(id => id === draftId ? taskId : id)));
        this.clearUnread(draftId);
    }

    addDraft(taskId: string, state: T, activeTaskId: string, runningTaskIds: Set<string>): void {
        this.saveForeground(taskId, state);
        this.ensureTab(taskId, activeTaskId, runningTaskIds);
    }

    removeTask(taskId: string): void {
        this.taskIds = this.taskIds.filter(id => id !== taskId);
        const nextStates = { ...this.foregroundStates };
        delete nextStates[taskId];
        this.foregroundStates = nextStates;
        this.backgroundStates.delete(taskId);
        this.unreadTaskIds.delete(taskId);
    }
}
