/**
 * REST backend — implements the same Backend interface as `tauri.ts`, but over
 * HTTP against the desktop's LAN server (or a standalone server build).
 *
 * Status: scaffold. Store CRUD and batch writes are real (the LAN server
 * already serves `/api/store/*`). Native migration locking/backups and the
 * SQLite-backed sections
 * (`db`/`agenticPlay`), `search`, `comfy`, and `file` throw NotImplemented so
 * callers fail loudly rather than silently no-op'ing. Real REST mirrors land
 * alongside the sync work on `dev-sync`.
 *
 * This backend is NOT selected by default. `platform/index.ts` still returns
 * the Tauri backend; a future `setBackend(restBackend)` (browser/mobile mode)
 * flips it at runtime.
 */
import type { Backend } from "./types";
import type { Message } from "@neo-tavern/shared";
import type { NeoBuilderWebSearchResult } from "@/features/character/web-search";
import type { AgenticPlayStateRecord } from "@/db/repositories";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {
    /* sessionStorage may be unavailable */
  }
  return headers;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`REST ${url} failed: ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

function notImplemented(operation: string): never {
  throw new Error(`REST backend does not implement ${operation} yet (dev-sync)`);
}

export const restBackend: Backend = {
  store: {
    get: async (key) => {
      const data = await request<{ value: string | null }>(`/api/store/${encodeURIComponent(key)}`);
      return data.value ?? null;
    },
    set: async (key, value) => {
      await request(`/api/store/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    },
    remove: async (key) => {
      await request(`/api/store/${encodeURIComponent(key)}`, { method: "DELETE" });
    },
    entries: async () => {
      const entries = await request<[string, string][]>("/api/store");
      return Object.fromEntries(entries);
    },
    batch: async (operations) => {
      await request("/api/store/batch", {
        method: "POST",
        body: JSON.stringify(operations),
      });
    },
    lock: () => notImplemented("store.lock"),
    unlock: () => notImplemented("store.unlock"),
    backup: () => notImplemented("store.backup"),
  },

  db: {
    listMessages: () => notImplemented("db.listMessages"),
    listRecentMessages: () => notImplemented("db.listRecentMessages"),
    listChildMessages: () => notImplemented("db.listChildMessages"),
    createMessage: (() => notImplemented("db.createMessage")) as (m: Message) => Promise<Message>,
    updateMessage: (() => notImplemented("db.updateMessage")) as (id: string, content: string) => Promise<Message>,
    patchMessage: (() => notImplemented("db.patchMessage")) as (
      id: string,
      patch: Partial<Message>,
    ) => Promise<Message>,
    deleteMessage: () => notImplemented("db.deleteMessage"),
    deleteMessages: () => notImplemented("db.deleteMessages"),
    deleteByChatId: () => notImplemented("db.deleteByChatId"),
    replaceByChatId: (() => notImplemented("db.replaceByChatId")) as (
      chatId: string,
      messages: Message[],
    ) => Promise<Message[]>,
    migrateParentIds: (() => notImplemented("db.migrateParentIds")) as () => Promise<number>,
    mergeFromSavepoint: (() => notImplemented("db.mergeFromSavepoint")) as (messages: Message[]) => Promise<Message[]>,
    initMessages: () => notImplemented("db.initMessages"),
    getVersion: () => notImplemented("db.getVersion"),
    setVersion: () => notImplemented("db.setVersion"),
  },

  agenticPlay: {
    initFromJson: () => notImplemented("agenticPlay.initFromJson"),
    get: () => notImplemented("agenticPlay.get"),
    upsert: (() => notImplemented("agenticPlay.upsert")) as (
      record: AgenticPlayStateRecord,
    ) => Promise<AgenticPlayStateRecord>,
    delete: () => notImplemented("agenticPlay.delete"),
    clearAll: () => notImplemented("agenticPlay.clearAll"),
  },

  file: {
    pickFolder: () => notImplemented("file.pickFolder"),
    saveTextFile: () => notImplemented("file.saveTextFile"),
    saveWorkspaceDir: () => notImplemented("file.saveWorkspaceDir"),
    deleteWorkspaceDir: () => notImplemented("file.deleteWorkspaceDir"),
    saveDebugPrompt: () => notImplemented("file.saveDebugPrompt"),
    writeFileToPath: () => notImplemented("file.writeFileToPath"),
  },

  search: {
    webSearch: (() => notImplemented("search.webSearch")) as (
      query: string,
      limit: number,
    ) => Promise<NeoBuilderWebSearchResult[]>,
  },

  comfy: {
    getSystemStats: () => notImplemented("comfy.getSystemStats"),
    queuePrompt: () => notImplemented("comfy.queuePrompt"),
    getHistory: () => notImplemented("comfy.getHistory"),
    getImageDataUrl: () => notImplemented("comfy.getImageDataUrl"),
  },
};
