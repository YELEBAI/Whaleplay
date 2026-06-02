import { generateId } from "@neo-tavern/shared";
import type { Message } from "@neo-tavern/shared";
import { getStorageItem, setStorageItem } from "../storage";

const STORAGE_KEY = "neotavern_chat_savepoints";

export interface ChatSavepoint {
  id: string;
  chatId: string;
  characterId: string;
  name: string;
  messageCount: number;
  messages: Message[];
  createdAt: string;
}

export interface CreateChatSavepointInput {
  chatId: string;
  characterId: string;
  name?: string;
  messages: Message[];
}

export function createDefaultSavepointName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `存档 ${month}-${day} ${hour}:${minute}`;
}

async function loadAll(): Promise<ChatSavepoint[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAll(savepoints: ChatSavepoint[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(savepoints));
}

export const chatSavepointRepository = {
  async listByChatId(chatId: string): Promise<ChatSavepoint[]> {
    return (await loadAll())
      .filter((savepoint) => savepoint.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getById(id: string): Promise<ChatSavepoint | null> {
    return (await loadAll()).find((savepoint) => savepoint.id === id) ?? null;
  },

  async create(input: CreateChatSavepointInput): Promise<ChatSavepoint> {
    const now = new Date().toISOString();
    const name = input.name?.trim() || createDefaultSavepointName(new Date(now));
    const savepoint: ChatSavepoint = {
      id: generateId(),
      chatId: input.chatId,
      characterId: input.characterId,
      name,
      messageCount: input.messages.length,
      messages: input.messages.map((message) => ({ ...message })),
      createdAt: now,
    };
    const all = await loadAll();
    all.push(savepoint);
    await saveAll(all);
    return savepoint;
  },

  async delete(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((savepoint) => savepoint.id !== id));
  },

  async deleteByChatId(chatId: string): Promise<void> {
    await saveAll((await loadAll()).filter((savepoint) => savepoint.chatId !== chatId));
  },
};
