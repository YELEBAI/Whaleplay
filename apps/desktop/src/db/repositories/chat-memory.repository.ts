import { data } from "../kv";
import { dataKeys } from "../storage/keys";
import { loadArray } from "../storage/repository-helpers";

export interface ChatMemory {
  chatId: string;
  summary: string;
  sourceHash: string;
  sourceMessageCount: number;
  segments?: ChatMemorySegment[];
  compressorConfigId?: string | null;
  compressorKey?: string;
  compressionMode?: "local" | "model" | "fallback";
  memorySummaryMaxChars?: number;
  updatedAt: string;
}

export interface ChatMemorySegment {
  id: string;
  index: number;
  summary: string;
  sourceHash: string;
  sourceMessageCount: number;
  compressorConfigId?: string | null;
  compressorKey?: string;
  compressionMode?: "local" | "model" | "fallback";
  memorySummaryMaxChars?: number;
  createdAt: string;
}

async function loadAll(): Promise<ChatMemory[]> {
  return loadArray<ChatMemory>(data, dataKeys.chatMemories);
}

async function saveAll(memories: ChatMemory[]) {
  await data.setJson(dataKeys.chatMemories, memories);
}

export const chatMemoryRepository = {
  async get(chatId: string): Promise<ChatMemory | null> {
    return (await loadAll()).find((memory) => memory.chatId === chatId) ?? null;
  },

  async upsert(input: Omit<ChatMemory, "updatedAt">): Promise<ChatMemory> {
    const memory: ChatMemory = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const all = await loadAll();
    await saveAll([...all.filter((candidate) => candidate.chatId !== input.chatId), memory]);
    return memory;
  },

  async delete(chatId: string): Promise<void> {
    await saveAll((await loadAll()).filter((memory) => memory.chatId !== chatId));
  },

  async clearAll(): Promise<void> {
    await data.remove(dataKeys.chatMemories);
  },
};
