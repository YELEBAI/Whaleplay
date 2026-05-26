import { generateId } from '@neo-tavern/shared'
import type {
  Worldbook,
  WorldbookEntry,
  CreateWorldbookInput,
  UpdateWorldbookInput,
  CreateWorldbookEntryInput,
  UpdateWorldbookEntryInput,
} from '@neo-tavern/shared'
import { getStorageItem, removeStorageItem, setStorageItem } from '../storage'

const STORAGE_KEY = 'neotavern_worldbooks'
const ACTIVE_KEY = 'neotavern_active_worldbook_id'

async function loadAll(): Promise<Worldbook[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
}

async function saveAll(wbs: Worldbook[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(wbs))
}

export const worldbookRepository = {
  async list(): Promise<Worldbook[]> {
    return (await loadAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async getById(id: string): Promise<Worldbook | null> {
    return (await loadAll()).find((w) => w.id === id) ?? null
  },

  async create(input: CreateWorldbookInput): Promise<Worldbook> {
    const now = new Date().toISOString()
    const wb: Worldbook = {
      id: generateId(),
      name: input.name,
      description: input.description,
      entries: [],
      createdAt: now,
      updatedAt: now,
    }
    const all = await loadAll()
    all.push(wb)
    await saveAll(all)
    return wb
  },

  async update(id: string, input: UpdateWorldbookInput): Promise<Worldbook> {
    const all = await loadAll()
    const idx = all.findIndex((w) => w.id === id)
    if (idx === -1) throw new Error(`Worldbook not found: ${id}`)
    const existing = all[idx]
    if (input.name !== undefined) existing.name = input.name
    if (input.description !== undefined) existing.description = input.description
    existing.updatedAt = new Date().toISOString()
    all[idx] = existing
    await saveAll(all)
    return existing
  },

  async delete(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((w) => w.id !== id))
    if ((await this.getActiveId()) === id) {
      await this.setActiveId(null)
    }
  },

  async addEntry(worldbookId: string, input: CreateWorldbookEntryInput): Promise<WorldbookEntry> {
    const all = await loadAll()
    const idx = all.findIndex((w) => w.id === worldbookId)
    if (idx === -1) throw new Error(`Worldbook not found: ${worldbookId}`)
    const now = new Date().toISOString()
    const entry: WorldbookEntry = {
      id: generateId(),
      worldbookId,
      title: input.title,
      keys: input.keys,
      content: input.content,
      priority: input.priority,
      type: input.type,
      triggerMode: input.triggerMode,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    }
    all[idx].entries.push(entry)
    all[idx].updatedAt = now
    await saveAll(all)
    return entry
  },

  async updateEntry(
    worldbookId: string,
    entryId: string,
    input: UpdateWorldbookEntryInput,
  ): Promise<WorldbookEntry> {
    const all = await loadAll()
    const wIdx = all.findIndex((w) => w.id === worldbookId)
    if (wIdx === -1) throw new Error(`Worldbook not found: ${worldbookId}`)
    const eIdx = all[wIdx].entries.findIndex((e) => e.id === entryId)
    if (eIdx === -1) throw new Error(`Entry not found: ${entryId}`)
    const entry = all[wIdx].entries[eIdx]
    if (input.title !== undefined) entry.title = input.title
    if (input.keys !== undefined) entry.keys = input.keys
    if (input.content !== undefined) entry.content = input.content
    if (input.priority !== undefined) entry.priority = input.priority
    if (input.type !== undefined) entry.type = input.type
    if (input.triggerMode !== undefined) entry.triggerMode = input.triggerMode
    if (input.enabled !== undefined) entry.enabled = input.enabled
    entry.updatedAt = new Date().toISOString()
    all[wIdx].entries[eIdx] = entry
    all[wIdx].updatedAt = new Date().toISOString()
    await saveAll(all)
    return entry
  },

  async deleteEntry(worldbookId: string, entryId: string): Promise<void> {
    const all = await loadAll()
    const wIdx = all.findIndex((w) => w.id === worldbookId)
    if (wIdx === -1) throw new Error(`Worldbook not found: ${worldbookId}`)
    all[wIdx].entries = all[wIdx].entries.filter((e) => e.id !== entryId)
    all[wIdx].updatedAt = new Date().toISOString()
    await saveAll(all)
  },

  async getActiveId(): Promise<string | null> {
    return getStorageItem(ACTIVE_KEY)
  },

  async setActiveId(id: string | null): Promise<void> {
    if (id) await setStorageItem(ACTIVE_KEY, id)
    else await removeStorageItem(ACTIVE_KEY)
  },

  async save(wbs: Worldbook[]): Promise<void> {
    await saveAll(wbs)
  },
}
