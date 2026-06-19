let metadataMutationQueue: Promise<void> = Promise.resolve();

async function withCrossContextLock<T>(operation: () => Promise<T>): Promise<T> {
    const locks = (globalThis as any).navigator?.locks;
    if (locks?.request) {
        return locks.request('siyuan-opencode-session-metadata', operation);
    }
    return operation();
}

export function mutateSessionMetadata<T>(
    read: () => Promise<T[]>,
    write: (items: T[]) => Promise<void>,
    mutate: (items: T[]) => T[] | Promise<T[]>
): Promise<void> {
    const operation = metadataMutationQueue.then(() =>
        withCrossContextLock(async () => {
            const current = await read();
            const next = await mutate(current);
            await write(next);
        })
    );
    metadataMutationQueue = operation.catch(() => undefined);
    return operation;
}
