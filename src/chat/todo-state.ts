export type OpenCodeTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface OpenCodeTodo {
    content: string;
    status: OpenCodeTodoStatus;
    priority: string;
}

const SUPPORTED_STATUSES = new Set<OpenCodeTodoStatus>([
    'pending',
    'in_progress',
    'completed',
    'cancelled',
]);

export function normalizeOpenCodeTodos(value: unknown): OpenCodeTodo[] {
    if (!Array.isArray(value)) return [];

    return value.map(item => {
        const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const status = typeof raw.status === 'string' && SUPPORTED_STATUSES.has(raw.status as OpenCodeTodoStatus)
            ? raw.status as OpenCodeTodoStatus
            : 'pending';

        return {
            content: typeof raw.content === 'string' && raw.content.trim()
                ? raw.content.trim()
                : '未命名任务',
            status,
            priority: typeof raw.priority === 'string' ? raw.priority : 'medium',
        };
    });
}

export function getTodoProgress(todos: OpenCodeTodo[]): { completed: number; total: number } {
    return {
        completed: todos.filter(todo => todo.status === 'completed').length,
        total: todos.length,
    };
}
