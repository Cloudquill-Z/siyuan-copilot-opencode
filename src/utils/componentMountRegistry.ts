export interface DestroyableComponent {
    $destroy(): void;
}

export class ComponentMountRegistry<T extends DestroyableComponent> {
    private readonly mounts = new Map<HTMLElement, T>();

    get size(): number {
        return this.mounts.size;
    }

    has(target: HTMLElement): boolean {
        return this.mounts.has(target);
    }

    set(target: HTMLElement, component: T): void {
        this.destroy(target);
        this.mounts.set(target, component);
    }

    destroy(target: HTMLElement): void {
        const component = this.mounts.get(target);
        if (!component) return;
        component.$destroy();
        this.mounts.delete(target);
    }

    destroyAll(): void {
        for (const component of this.mounts.values()) {
            component.$destroy();
        }
        this.mounts.clear();
    }
}
