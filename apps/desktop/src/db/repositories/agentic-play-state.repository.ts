import type { Character } from "@neo-tavern/shared";
import {
  createInitialAgenticGameState,
  normalizeAgenticGameState,
  type AgenticGameState,
} from "@/features/agentic-play/agentic-play";
import { getStorageItem, removeStorageItem, setStorageItem } from "../storage";

const STORAGE_KEY = "neotavern_agentic_play_states";

export interface AgenticPlayStateRecord {
  chatId: string;
  characterId: string;
  enabled: boolean;
  gameState: AgenticGameState;
  createdAt: string;
  updatedAt: string;
}

async function loadAll(): Promise<AgenticPlayStateRecord[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(records: AgenticPlayStateRecord[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(records));
}

function createRecord(chatId: string, character: Character, enabled: boolean): AgenticPlayStateRecord {
  const now = new Date().toISOString();
  return {
    chatId,
    characterId: character.id,
    enabled,
    gameState: createInitialAgenticGameState(character),
    createdAt: now,
    updatedAt: now,
  };
}

export const agenticPlayStateRepository = {
  async get(chatId: string): Promise<AgenticPlayStateRecord | null> {
    return (await loadAll()).find((record) => record.chatId === chatId) ?? null;
  },

  async getOrCreate(chatId: string, character: Character, enabled = true): Promise<AgenticPlayStateRecord> {
    const all = await loadAll();
    const existing = all.find((record) => record.chatId === chatId);
    if (existing) {
      const normalized = {
        ...existing,
        characterId: existing.characterId || character.id,
        gameState: normalizeAgenticGameState(existing.gameState, character),
      };
      if (normalized !== existing) {
        await saveAll(all.map((record) => (record.chatId === chatId ? normalized : record)));
      }
      return normalized;
    }
    const record = createRecord(chatId, character, enabled);
    await saveAll([...all, record]);
    return record;
  },

  async setEnabled(chatId: string, character: Character, enabled: boolean): Promise<AgenticPlayStateRecord> {
    const all = await loadAll();
    const existing = all.find((record) => record.chatId === chatId);
    const now = new Date().toISOString();
    const record: AgenticPlayStateRecord = existing
      ? {
          ...existing,
          characterId: character.id,
          enabled,
          gameState: normalizeAgenticGameState(existing.gameState, character),
          updatedAt: now,
        }
      : {
          ...createRecord(chatId, character, enabled),
          updatedAt: now,
        };
    await saveAll([...all.filter((candidate) => candidate.chatId !== chatId), record]);
    return record;
  },

  async updateState(chatId: string, character: Character, gameState: AgenticGameState): Promise<AgenticPlayStateRecord> {
    const all = await loadAll();
    const existing = all.find((record) => record.chatId === chatId);
    const now = new Date().toISOString();
    const record: AgenticPlayStateRecord = existing
      ? {
          ...existing,
          characterId: character.id,
          gameState: normalizeAgenticGameState(gameState, character),
          updatedAt: now,
        }
      : {
          ...createRecord(chatId, character, true),
          gameState: normalizeAgenticGameState(gameState, character),
          updatedAt: now,
        };
    await saveAll([...all.filter((candidate) => candidate.chatId !== chatId), record]);
    return record;
  },

  async delete(chatId: string): Promise<void> {
    await saveAll((await loadAll()).filter((record) => record.chatId !== chatId));
  },

  async clearAll(): Promise<void> {
    await removeStorageItem(STORAGE_KEY);
  },
};
