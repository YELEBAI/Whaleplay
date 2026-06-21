import type { Worldbook, WorldbookEntry } from "@neo-tavern/shared";

export function selectWorldbookReferenceEntries(
  worldbooks: Worldbook[],
  entryIds: readonly string[] | undefined,
  limit = 8,
): WorldbookEntry[] {
  const ids = Array.from(new Set((entryIds ?? []).map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  const entriesById = new Map<string, WorldbookEntry>();
  for (const worldbook of worldbooks) {
    for (const entry of worldbook.entries) {
      entriesById.set(entry.id, entry);
    }
  }

  return ids
    .map((id) => entriesById.get(id))
    .filter((entry): entry is WorldbookEntry => !!entry)
    .slice(0, limit);
}
