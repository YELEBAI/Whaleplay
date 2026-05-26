import { generateId } from '@neo-tavern/shared'
import type { Chat, CreateChatInput, UpdateChatInput } from '@neo-tavern/shared'
import { getStorageItem, setStorageItem } from '../storage'

const STORAGE_KEY = 'neotavern_chats'

async function loadAll(): Promise<Chat[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
async function saveAll(chats: Chat[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(chats))
}

export const chatRepository = {
  async list(): Promise<Chat[]> {
    return (await loadAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async getById(id: string): Promise<Chat | null> {
    return (await loadAll()).find((c) => c.id === id) ?? null
  },

  async getByCharacterId(characterId: string): Promise<Chat[]> {
    return (await loadAll()).filter((c) => c.characterId === characterId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async create(input: CreateChatInput): Promise<Chat> {
    const now = new Date().toISOString()
    const chat: Chat = { id: generateId(), characterId: input.characterId, title: input.title, createdAt: now, updatedAt: now }
    const all = await loadAll()
    all.push(chat)
    await saveAll(all)
    return chat
  },

  async update(id: string, input: UpdateChatInput): Promise<Chat> {
    const all = await loadAll()
    const idx = all.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error(`Chat not found: ${id}`)
    if (input.title !== undefined) all[idx].title = input.title
    all[idx].updatedAt = new Date().toISOString()
    await saveAll(all)
    return all[idx]
  },

  async delete(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((c) => c.id !== id))
  },
}
