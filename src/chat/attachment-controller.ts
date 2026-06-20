export interface ManagedAttachment {
    type: 'image' | 'file';
    name: string;
    data: string;
    mimeType?: string;
    path?: string;
    isWebPage?: boolean;
    url?: string;
}

export type AttachmentValidationError = 'unsupported' | 'too_large' | null;

export function validateAttachmentFile(file: File): AttachmentValidationError {
    const isImage = file.type.startsWith('image/');
    const isText =
        file.type.startsWith('text/') ||
        /\.(md|txt|json|xml|csv)$/i.test(file.name);
    if (!isImage && !isText) return 'unsupported';
    const maxSize = isImage ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    return file.size > maxSize ? 'too_large' : null;
}

export class AttachmentController {
    private items: ManagedAttachment[] = [];
    private pending = new Set<Promise<void>>();

    constructor(
        private readonly saveAsset: (file: Blob, name: string) => Promise<string>,
        private readonly onChange: (attachments: ManagedAttachment[]) => void = () => undefined
    ) {}

    get attachments(): ManagedAttachment[] {
        return [...this.items];
    }

    get isSaving(): boolean {
        return this.pending.size > 0;
    }

    replace(attachments: ManagedAttachment[]): void {
        this.items = [...attachments];
        this.emit();
    }

    async addImage(file: File, previewUrl: string): Promise<void> {
        if (!file.type.startsWith('image/')) throw new Error('image_only');
        const attachment: ManagedAttachment = {
            type: 'image',
            name: file.name,
            data: previewUrl,
            path: '',
            mimeType: file.type,
        };
        this.items = [...this.items, attachment];
        this.emit();

        const task = this.persistImage(file, attachment);
        this.pending.add(task);
        try {
            await task;
        } finally {
            this.pending.delete(task);
        }
    }

    private async persistImage(file: File, attachment: ManagedAttachment): Promise<void> {
        try {
            const path = await this.saveAsset(file, file.name);
            this.items = this.items.map(item => item === attachment ? { ...item, path } : item);
            this.emit();
        } catch (error) {
            this.items = this.items.filter(item => item !== attachment);
            this.emit();
            throw error;
        }
    }

    async addText(file: File): Promise<void> {
        const validationError = validateAttachmentFile(file);
        if (validationError) throw new Error(validationError);
        const [data, path] = await Promise.all([file.text(), this.saveAsset(file, file.name)]);
        this.items = [...this.items, {
            type: 'file',
            name: file.name,
            data,
            path,
            mimeType: file.type,
        }];
        this.emit();
    }

    addWebPage(url: string, markdown: string, path: string): void {
        this.items = [...this.items, {
            type: 'file',
            name: url,
            data: markdown,
            path,
            mimeType: 'text/markdown',
            isWebPage: true,
            url,
        }];
        this.emit();
    }

    remove(index: number): void {
        this.items = this.items.filter((_, itemIndex) => itemIndex !== index);
        this.emit();
    }

    async waitForPendingSaves(): Promise<void> {
        await Promise.all([...this.pending]);
    }

    private emit(): void {
        this.onChange(this.attachments);
    }
}
