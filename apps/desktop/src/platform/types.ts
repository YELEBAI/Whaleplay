import type { Message } from "@neo-tavern/shared";
import type { NeoBuilderWebSearchResult } from "@/features/character/web-search";
import type { AgenticPlayStateRecord } from "@/db/repositories";

export interface Backend {
  // Store (key-value)
  store: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    entries(): Promise<Record<string, string>>;
  };

  // Messages (SQLite)
  db: {
    listMessages(chatId: string): Promise<Message[]>;
    listRecentMessages(chatId: string, limit: number): Promise<Message[]>;
    listChildMessages(parentId: string): Promise<Message[]>;
    createMessage(message: Message): Promise<Message>;
    updateMessage(id: string, content: string): Promise<Message>;
    patchMessage(id: string, patch: Partial<Message>): Promise<Message>;
    deleteMessage(id: string): Promise<void>;
    deleteMessages(ids: string[]): Promise<void>;
    deleteByChatId(chatId: string): Promise<void>;
    replaceByChatId(chatId: string, messages: Message[]): Promise<Message[]>;
    migrateParentIds(): Promise<number>;
    mergeFromSavepoint(messages: Message[]): Promise<Message[]>;
    initMessages(legacyJson: string | null): Promise<void>;
  };

  // Agentic play state
  agenticPlay: {
    initFromJson(json: string | null): Promise<void>;
    get(chatId: string): Promise<AgenticPlayStateRecord | null>;
    upsert(record: AgenticPlayStateRecord): Promise<AgenticPlayStateRecord>;
    delete(chatId: string): Promise<void>;
    clearAll(): Promise<void>;
  };

  // File operations
  file: {
    pickFolder(): Promise<string | null>;
    saveTextFile(defaultFilename: string, content: string): Promise<string | null>;
    saveWorkspaceDir(sessionId: string, entriesJson: string): Promise<void>;
    deleteWorkspaceDir(sessionId: string): Promise<void>;
    saveDebugPrompt(folder: string, filename: string, content: string): Promise<string>;
    writeFileToPath(path: string, content: string): Promise<void>;
  };

  // Search
  search: {
    webSearch(query: string, limit: number): Promise<NeoBuilderWebSearchResult[]>;
  };

  // ComfyUI
  comfy: {
    getSystemStats(baseUrl: string): Promise<Record<string, unknown>>;
    queuePrompt(baseUrl: string, workflow: Record<string, unknown>, clientId: string): Promise<Record<string, unknown>>;
    getHistory(baseUrl: string, promptId: string): Promise<Record<string, unknown>>;
    getImageDataUrl(
      baseUrl: string,
      filename: string,
      subfolder: string | null,
      imageType: string | null,
    ): Promise<string>;
  };
}
