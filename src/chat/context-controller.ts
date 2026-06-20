export interface ManagedContextDocument {
    id: string;
    title: string;
    content: string;
    type?: 'doc' | 'block';
}

export function buildDocumentSearchQuery(keyword: string): string {
    const conditions = keyword
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.replace(/'/g, "''"))
        .map(part => `content LIKE '%${part}%'`)
        .join(' AND ');
    return `SELECT * FROM blocks WHERE ${conditions} AND type = 'd' ORDER BY updated DESC LIMIT 20`;
}

export function createContextTitle(content: string, fallback: string): string {
    const preview = content.replace(/\n/g, ' ').trim();
    return preview.length > 20
        ? `${preview.substring(0, 20)}...`
        : preview || fallback;
}

export async function refreshContextDocuments<T extends ManagedContextDocument>(
    documents: T[],
    loadContent: (document: T) => Promise<string | undefined>
): Promise<T[]> {
    return Promise.all(
        documents.map(async document => {
            try {
                const content = await loadContent(document);
                return content ? { ...document, content } : document;
            } catch (error) {
                console.error(`Failed to refresh context ${document.id}:`, error);
                return document;
            }
        })
    );
}

export class ContextController {
    private items: ManagedContextDocument[] = [];

    constructor(
        private readonly onChange: (documents: ManagedContextDocument[]) => void = () => undefined
    ) {}

    get documents(): ManagedContextDocument[] {
        return [...this.items];
    }

    replace(documents: ManagedContextDocument[]): void {
        this.items = [...documents];
        this.emit();
    }

    has(id: string): boolean {
        return this.items.some(document => document.id === id);
    }

    add(document: ManagedContextDocument): boolean {
        if (this.has(document.id)) return false;
        this.items = [...this.items, document];
        this.emit();
        return true;
    }

    remove(id: string): void {
        this.items = this.items.filter(document => document.id !== id);
        this.emit();
    }

    private emit(): void {
        this.onChange(this.documents);
    }
}
