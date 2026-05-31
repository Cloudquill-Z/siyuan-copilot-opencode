import type { Message } from "../ai-chat";

export interface MemorySettings {
    enabled: boolean;
    notebookId: string;
    rootPath: string;
    overviewDocId: string;
    autoExtract: boolean;
    saveFullConversation: boolean;
    maxOverviewChars: number;
    maxCoreChars: number;
    maxEpisodicItems: number;
    maxTopicItems: number;
    maxMemoryPromptChars: number;
    minImportance: number;
    coreDocId: string;
}

export interface MemoryExtractionState {
    messageCount: number;
    messageHash: string;
    memoryDocId: string;
    updatedAt: number;
}

export interface MemoryContextItem {
    id: string;
    title: string;
    content: string;
    hpath?: string;
    updated?: number;
}

export interface MemoryContext {
    overview?: MemoryContextItem;
    core?: MemoryContextItem;
    episodic: MemoryContextItem[];
    topics: MemoryContextItem[];
}

export interface ExtractedMemoryDraft {
    title: string;
    summary: string;
    facts: string[];
    followUps: string[];
    topics: string[];
    importance: number;
    shouldRemember: boolean;
}

export interface MemoryPromptOptions {
    settings: any;
    query: string;
    skipCoreDocId?: string;
}

export interface MemoryExtractionInput {
    settings: any;
    sessionId: string;
    messages: Message[];
    modelId?: string;
    serverUrl?: string;
}
