import type { Character } from "@neo-tavern/shared";
import {
  createInitialAgenticGameState,
  normalizeAgenticGameState,
  type AgenticGameState,
} from "@/features/agentic-play/agentic-play";
import { getStorageItem, removeStorageItem, setStorageItem } from "../storage";
import { getBackend } from "@/platform";

const STORAGE_KEY = "neotavern_agentic_play_states";
let sqliteReady: Promise<boolean> | null = null;

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

async function ensureSqliteReady(): Promise<boolean> {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      try {
        const legacyStatesJson = await getStorageItem(STORAGE_KEY);
        await getBackend().agenticPlay.initFromJson(legacyStatesJson);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return sqliteReady;
}

async function sqliteGet(chatId: string): Promise<AgenticPlayStateRecord | null> {
  if (!(await ensureSqliteReady())) return null;
  try {
    return await getBackend().agenticPlay.get(chatId);
  } catch {
    return null;
  }
}

async function sqliteUpsert(record: AgenticPlayStateRecord): Promise<AgenticPlayStateRecord | null> {
  if (!(await ensureSqliteReady())) return null;
  try {
    return await getBackend().agenticPlay.upsert(record);
  } catch {
    return null;
  }
}

async function sqliteDelete(chatId: string): Promise<boolean> {
  if (!(await ensureSqliteReady())) return false;
  try {
    await getBackend().agenticPlay.delete(chatId);
    return true;
  } catch {
    return false;
  }
}

async function sqliteClearAll(): Promise<boolean> {
  if (!(await ensureSqliteReady())) return false;
  try {
    await getBackend().agenticPlay.clearAll();
    return true;
  } catch {
    return false;
  }
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
  async get(chatId: string, character?: Character): Promise<AgenticPlayStateRecord | null> {
    const stored = await sqliteGet(chatId);
    const record = stored ?? (await loadAll()).find((candidate) => candidate.chatId === chatId) ?? null;
    if (!record || !character) return record;
    return {
      ...record,
      characterId: record.characterId || character.id,
      gameState: normalizeAgenticGameState(record.gameState, character),
    };
  },

  async getOrCreate(chatId: string, character: Character, enabled = true): Promise<AgenticPlayStateRecord> {
    const sqliteExisting = await sqliteGet(chatId);
    if (sqliteExisting) {
      const normalized = {
        ...sqliteExisting,
        characterId: sqliteExisting.characterId || character.id,
        gameState: normalizeAgenticGameState(sqliteExisting.gameState, character),
      };
      await sqliteUpsert(normalized);
      return normalized;
    }

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
      await sqliteUpsert(normalized);
      return normalized;
    }
    const record = createRecord(chatId, character, enabled);
    const sqliteSaved = await sqliteUpsert(record);
    if (sqliteSaved) return sqliteSaved;
    await saveAll([...all, record]);
    return record;
  },

  async setEnabled(chatId: string, character: Character, enabled: boolean): Promise<AgenticPlayStateRecord> {
    const sqliteExisting = await sqliteGet(chatId);
    const all = await loadAll();
    const existing = all.find((record) => record.chatId === chatId);
    const now = new Date().toISOString();
    const source = sqliteExisting ?? existing;
    const record: AgenticPlayStateRecord = source
      ? {
          ...source,
          characterId: character.id,
          enabled,
          gameState: normalizeAgenticGameState(source.gameState, character),
          updatedAt: now,
        }
      : {
          ...createRecord(chatId, character, enabled),
          updatedAt: now,
        };
    const sqliteSaved = await sqliteUpsert(record);
    if (sqliteSaved) return sqliteSaved;
    await saveAll([...all.filter((candidate) => candidate.chatId !== chatId), record]);
    return record;
  },

  async updateState(
    chatId: string,
    character: Character,
    gameState: AgenticGameState,
  ): Promise<AgenticPlayStateRecord> {
    const sqliteExisting = await sqliteGet(chatId);
    const all = await loadAll();
    const existing = all.find((record) => record.chatId === chatId);
    const now = new Date().toISOString();
    const source = sqliteExisting ?? existing;
    const record: AgenticPlayStateRecord = source
      ? {
          ...source,
          characterId: character.id,
          gameState: normalizeAgenticGameState(gameState, character),
          updatedAt: now,
        }
      : {
          ...createRecord(chatId, character, true),
          gameState: normalizeAgenticGameState(gameState, character),
          updatedAt: now,
        };
    const sqliteSaved = await sqliteUpsert(record);
    if (sqliteSaved) return sqliteSaved;
    await saveAll([...all.filter((candidate) => candidate.chatId !== chatId), record]);
    return record;
  },

  async delete(chatId: string): Promise<void> {
    await sqliteDelete(chatId);
    await saveAll((await loadAll()).filter((record) => record.chatId !== chatId));
  },

  async clearAll(): Promise<void> {
    await sqliteClearAll();
    await removeStorageItem(STORAGE_KEY);
  },
};
