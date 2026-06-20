import { generateId } from "@neo-tavern/shared";
import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@neo-tavern/shared";
import { data } from "../kv";
import { dataKeys } from "../storage/keys";
import { loadArray } from "../storage/repository-helpers";

async function loadAll(): Promise<Character[]> {
  return loadArray<Character>(data, dataKeys.characters);
}
async function saveAll(chars: Character[]) {
  await data.setJson(dataKeys.characters, chars);
}

export const characterRepository = {
  async list(includeHidden = false): Promise<Character[]> {
    return (await loadAll())
      .filter((c) => includeHidden || !c.hidden)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getById(id: string): Promise<Character | null> {
    return (await loadAll()).find((c) => c.id === id) ?? null;
  },

  async create(input: CreateCharacterInput): Promise<Character> {
    const now = new Date().toISOString();
    const char: Character = {
      id: input.id ?? generateId(),
      name: input.name,
      hidden: input.hidden,
      avatar: input.avatar,
      description: input.description,
      personality: input.personality,
      scenario: input.scenario,
      firstMessage: input.firstMessage,
      exampleDialogues: input.exampleDialogues,
      tags: input.tags,
      regexPresetId: input.regexPresetId,
      worldbookId: input.worldbookId,
      statusBars: input.statusBars,
      createdAt: now,
      updatedAt: now,
    };
    const all = await loadAll();
    all.push(char);
    await saveAll(all);
    return char;
  },

  async update(id: string, input: UpdateCharacterInput): Promise<Character> {
    const all = await loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Character not found: ${id}`);
    const existing = all[idx];
    if (input.name !== undefined) existing.name = input.name;
    if (input.hidden !== undefined) existing.hidden = input.hidden;
    if (input.avatar !== undefined) existing.avatar = input.avatar;
    if (input.description !== undefined) existing.description = input.description;
    if (input.personality !== undefined) existing.personality = input.personality;
    if (input.scenario !== undefined) existing.scenario = input.scenario;
    if (input.firstMessage !== undefined) existing.firstMessage = input.firstMessage;
    if (input.exampleDialogues !== undefined) existing.exampleDialogues = input.exampleDialogues;
    if (input.tags !== undefined) existing.tags = input.tags;
    if (input.regexPresetId !== undefined) existing.regexPresetId = input.regexPresetId;
    if (input.worldbookId !== undefined) existing.worldbookId = input.worldbookId;
    if (input.statusBars !== undefined) existing.statusBars = input.statusBars;
    existing.updatedAt = new Date().toISOString();
    all[idx] = existing;
    await saveAll(all);
    return existing;
  },

  async delete(id: string): Promise<void> {
    await saveAll((await loadAll()).filter((c) => c.id !== id));
  },
};
