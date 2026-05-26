import { generateId } from '@neo-tavern/shared'
import type { Message, CreateMessageInput } from '@neo-tavern/shared'
import { getStorageItem, setStorageItem } from '../storage'

const STORAGE_KEY = 'neotavern_messages'

async function loadAll(): Promise<Message[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
async function saveAll(msgs: Message[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(msgs))
}

export const messageRepository = {
  async listByChatId(chatId: string): Promise<Message[]> {
    return (await loadAll()).filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async create(input: CreateMessageInput): Promise<Message> {
    const msg: Message = { id: generateId(), chatId: input.chatId, role: input.role, content: input.content, reasoningContent: input.reasoningContent, generateDuration: input.generateDuration, usage: input.usage, createdAt: new Date().toISOString() }
    const all = await loadAll()
    all.push(msg)
    await saveAll(all)
    return msg
  },

  async deleteByChatId(chatId: string): Promise<void> {
    await saveAll((await loadAll()).filter((m) => m.chatId !== chatId))
  },

  async update(id: string, content: string): Promise<Message> {
    const all = await loadAll()
    const idx = all.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error(`Message not found: ${id}`)
    all[idx].content = content
    await saveAll(all)
    return all[idx]
  },

  async deleteMessage(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((m) => m.id !== id))
  },

  async deleteMessages(ids: string[]): Promise<void> {
    const idSet = new Set(ids)
    await saveAll((await loadAll()).filter((m) => !idSet.has(m.id)))
  },
}
