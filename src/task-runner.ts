export type TaskRunState = 'running' | 'queued' | 'idle';

export class TaskRunner {
    private readonly maxConcurrent: number;
    private readonly activeTaskIds = new Set<string>();
    private readonly queuedTaskIds: string[] = [];

    constructor(maxConcurrentTasks = 2) {
        this.maxConcurrent = Math.min(4, Math.max(1, Math.floor(maxConcurrentTasks) || 1));
    }

    start(taskId: string): TaskRunState {
        if (!taskId) return 'idle';
        if (this.activeTaskIds.has(taskId)) return 'running';
        if (this.queuedTaskIds.includes(taskId)) return 'queued';

        if (this.activeTaskIds.size < this.maxConcurrent) {
            this.activeTaskIds.add(taskId);
            return 'running';
        }

        this.queuedTaskIds.push(taskId);
        return 'queued';
    }

    complete(taskId: string): string | null {
        this.activeTaskIds.delete(taskId);
        const queuedIndex = this.queuedTaskIds.indexOf(taskId);
        if (queuedIndex >= 0) {
            this.queuedTaskIds.splice(queuedIndex, 1);
        }
        return this.promoteNext();
    }

    cancel(taskId: string): string | null {
        const wasRunning = this.activeTaskIds.delete(taskId);
        const queuedIndex = this.queuedTaskIds.indexOf(taskId);
        if (queuedIndex >= 0) {
            this.queuedTaskIds.splice(queuedIndex, 1);
        }
        return wasRunning ? this.promoteNext() : null;
    }

    getActiveTaskIds(): string[] {
        return Array.from(this.activeTaskIds);
    }

    getQueuedTaskIds(): string[] {
        return [...this.queuedTaskIds];
    }

    getState(taskId: string): TaskRunState {
        if (this.activeTaskIds.has(taskId)) return 'running';
        if (this.queuedTaskIds.includes(taskId)) return 'queued';
        return 'idle';
    }

    private promoteNext(): string | null {
        if (this.activeTaskIds.size >= this.maxConcurrent) return null;
        const nextTaskId = this.queuedTaskIds.shift();
        if (!nextTaskId) return null;
        this.activeTaskIds.add(nextTaskId);
        return nextTaskId;
    }
}
