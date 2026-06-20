import { generateId } from "@neo-tavern/shared";
import type {
  Worldbook,
  WorldbookEntry,
  CreateWorldbookInput,
  UpdateWorldbookInput,
  CreateWorldbookEntryInput,
  UpdateWorldbookEntryInput,
} from "@neo-tavern/shared";
import { data, sys } from "../kv";
import { dataKeys, sysKeys } from "../storage/keys";
import { loadArray, readOptional } from "../storage/repository-helpers";

async function loadAll(): Promise<Worldbook[]> {
  return loadArray<Worldbook>(data, dataKeys.worldbooks);
}

async function saveAll(wbs: Worldbook[]) {
  await data.setJson(dataKeys.worldbooks, wbs);
}

export const worldbookRepository = {
  async list(includeHidden = false): Promise<Worldbook[]> {
    return (await loadAll())
      .filter((w) => includeHidden || !w.hidden)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getById(id: string): Promise<Worldbook | null> {
    return (await loadAll()).find((w) => w.id === id) ?? null;
  },

  async create(input: CreateWorldbookInput): Promise<Worldbook> {
    const now = new Date().toISOString();
    const wb: Worldbook = {
      id: input.id ?? generateId(),
      name: input.name,
      hidden: input.hidden,
      description: input.description,
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    const all = await loadAll();
    all.push(wb);
    await saveAll(all);
    return wb;
  },

  async update(id: string, input: UpdateWorldbookInput): Promise<Worldbook> {
    const all = await loadAll();
    const idx = all.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error(`Worldbook not found: ${id}`);
    const existing = all[idx];
    if (input.name !== undefined) existing.name = input.name;
    if (input.hidden !== undefined) existing.hidden = input.hidden;
    if (input.description !== undefined) existing.description = input.description;
    existing.updatedAt = new Date().toISOString();
    all[idx] = existing;
    await saveAll(all);
    return existing;
  },

  async delete(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((w) => w.id !== id));
    if ((await this.getActiveId()) === id) {
      await this.setActiveId(null);
    }
  },

  async addEntry(worldbookId: string, input: CreateWorldbookEntryInput): Promise<WorldbookEntry> {
    const all = await loadAll();
    const idx = all.findIndex((w) => w.id === worldbookId);
    if (idx === -1) throw new Error(`Worldbook not found: ${worldbookId}`);
    const now = new Date().toISOString();
    const entry: WorldbookEntry = {
      id: generateId(),
      worldbookId,
      title: input.title,
      keys: input.keys,
      secondaryKeys: input.secondaryKeys ?? "",
      content: input.content,
      priority: input.priority,
      type: input.type,
      triggerMode: input.triggerMode,
      selectiveLogic: input.selectiveLogic ?? "or",
      scanDepth: input.scanDepth ?? 8,
      caseSensitive: input.caseSensitive ?? false,
      matchWholeWords: input.matchWholeWords ?? false,
      useProbability: input.useProbability ?? false,
      probability: input.probability ?? 100,
      position: input.position ?? "beforeHistory",
      depth: input.depth ?? 0,
      role: input.role ?? "system",
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    };
    all[idx].entries.push(entry);
    all[idx].updatedAt = now;
    await saveAll(all);
    return entry;
  },

  async updateEntry(worldbookId: string, entryId: string, input: UpdateWorldbookEntryInput): Promise<WorldbookEntry> {
    const all = await loadAll();
    const wIdx = all.findIndex((w) => w.id === worldbookId);
    if (wIdx === -1) throw new Error(`Worldbook not found: ${worldbookId}`);
    const eIdx = all[wIdx].entries.findIndex((e) => e.id === entryId);
    if (eIdx === -1) throw new Error(`Entry not found: ${entryId}`);
    const entry = all[wIdx].entries[eIdx];
    if (input.title !== undefined) entry.title = input.title;
    if (input.keys !== undefined) entry.keys = input.keys;
    if (input.secondaryKeys !== undefined) entry.secondaryKeys = input.secondaryKeys;
    if (input.content !== undefined) entry.content = input.content;
    if (input.priority !== undefined) entry.priority = input.priority;
    if (input.type !== undefined) entry.type = input.type;
    if (input.triggerMode !== undefined) entry.triggerMode = input.triggerMode;
    if (input.selectiveLogic !== undefined) entry.selectiveLogic = input.selectiveLogic;
    if (input.scanDepth !== undefined) entry.scanDepth = input.scanDepth;
    if (input.caseSensitive !== undefined) entry.caseSensitive = input.caseSensitive;
    if (input.matchWholeWords !== undefined) entry.matchWholeWords = input.matchWholeWords;
    if (input.useProbability !== undefined) entry.useProbability = input.useProbability;
    if (input.probability !== undefined) entry.probability = input.probability;
    if (input.position !== undefined) entry.position = input.position;
    if (input.depth !== undefined) entry.depth = input.depth;
    if (input.role !== undefined) entry.role = input.role;
    if (input.enabled !== undefined) entry.enabled = input.enabled;
    entry.updatedAt = new Date().toISOString();
    all[wIdx].entries[eIdx] = entry;
    all[wIdx].updatedAt = new Date().toISOString();
    await saveAll(all);
    return entry;
  },

  async deleteEntry(worldbookId: string, entryId: string): Promise<void> {
    const all = await loadAll();
    const wIdx = all.findIndex((w) => w.id === worldbookId);
    if (wIdx === -1) throw new Error(`Worldbook not found: ${worldbookId}`);
    all[wIdx].entries = all[wIdx].entries.filter((e) => e.id !== entryId);
    all[wIdx].updatedAt = new Date().toISOString();
    await saveAll(all);
  },

  async getActiveId(): Promise<string | null> {
    return readOptional(sys, sysKeys.activeWorldbookId);
  },

  async setActiveId(id: string | null): Promise<void> {
    if (id) await sys.set(sysKeys.activeWorldbookId, id);
    else await sys.remove(sysKeys.activeWorldbookId);
  },

  async save(wbs: Worldbook[], includeHidden = false): Promise<void> {
    if (includeHidden) {
      await saveAll(wbs);
      return;
    }
    const hidden = (await loadAll()).filter((w) => w.hidden && !wbs.some((visible) => visible.id === w.id));
    await saveAll([...wbs, ...hidden]);
  },
};
