/**
 * Backend interface — typed contract for all native operations.
 *
 * Implementations:
 *   - platform/tauri.ts   — Tauri desktop (invoke)
 *   - platform/rest.ts    — REST server (planned, LAN / standalone)
 *
 * Each section maps to a Rust module (db.rs, search.rs, comfy.rs, etc.).
 */

import type { Message } from "@neo-tavern/shared";
import type { NeoBuilderWebSearchResult } from "@/features/character/web-search";
import type { AgenticPlayStateRecord } from "@/db/repositories";

export interface Backend {
  // ── Key-value store (app_store_* Tauri commands) ──
  store: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    entries(): Promise<Record<string, string>>;
    batch(
      operations: Array<{ type: "set"; key: string; value: string } | { type: "remove"; key: string }>,
    ): Promise<void>;
    lock(): Promise<boolean>;
    unlock(): Promise<void>;
    backup(): Promise<string>;
  };

  // ── Messages + chat persistence (sqlite_* Tauri commands → db.rs) ──
  db: {
    listMessages(chatId: string): Promise<Message[]>;
    listRecentMessages(chatId: string, limit: number): Promise<Message[]>;
    listRecentTurnMessages(chatId: string, turnLimit: number): Promise<Message[]>;
    listChildMessages(parentId: string): Promise<Message[]>;
    createMessage(message: Message): Promise<Message>;
    updateMessage(id: string, content: string): Promise<Message>;
    patchMessage(id: string, patch: Partial<Message>): Promise<Message>;
    deleteMessage(id: string): Promise<void>;
    deleteMessages(ids: string[]): Promise<void>;
    deleteByChatId(chatId: string): Promise<void>;
    replaceByChatId(chatId: string, messages: Message[]): Promise<Message[]>;
    migrateParentIds(): Promise<number>;
    migrateRoundIndexes(): Promise<number>;
    mergeFromSavepoint(messages: Message[]): Promise<Message[]>;
    initMessages(legacyJson: string | null): Promise<void>;
  };

  // ── Agentic play state (sqlite_* Tauri commands) ──
  agenticPlay: {
    initFromJson(json: string | null): Promise<void>;
    get(chatId: string): Promise<AgenticPlayStateRecord | null>;
    upsert(record: AgenticPlayStateRecord): Promise<AgenticPlayStateRecord>;
    delete(chatId: string): Promise<void>;
    clearAll(): Promise<void>;
  };

  // ── RAG memory chunks (sqlite_* Tauri commands) ──
  rag: {
    upsertChunks(chunks: unknown[]): Promise<number>;
    listChunksByOwners(ownerIds: string[], embeddingModel?: string | null): Promise<unknown[]>;
    deleteChunksBySourceIds(sourceIds: string[]): Promise<number>;
    deleteChunksByOwner(scope: string, ownerId: string): Promise<number>;
    countChunksByOwner(scope: string, ownerId: string): Promise<number>;
  };

  // ── File system (rfd + std::fs → file.rs) ──
  file: {
    pickFolder(): Promise<string | null>;
    saveTextFile(defaultFilename: string, content: string): Promise<string | null>;
    saveWorkspaceDir(sessionId: string, entriesJson: string): Promise<void>;
    deleteWorkspaceDir(sessionId: string): Promise<void>;
    saveDebugPrompt(folder: string, filename: string, content: string): Promise<string>;
    writeFileToPath(path: string, content: string): Promise<void>;
  };

  // ── Web search (DuckDuckGo / Tavily / Bing → search.rs) ──
  search: {
    webSearch(query: string, limit: number): Promise<NeoBuilderWebSearchResult[]>;
  };

  // ── Ollama local model management and embeddings ──
  ollama: {
    check(baseUrl: string): Promise<Record<string, unknown>>;
    pull(baseUrl: string, model: string): Promise<Record<string, unknown>>;
    embed(baseUrl: string, model: string, input: string[]): Promise<number[][]>;
  };

  // ── ComfyUI image generation (comfy.rs) ──
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
