/**
 * Disk-backed workspace persistence for worldbook entries.
 * Mirrors the original tavern-cards project directory layout.
 */
import type { CreateWorldbookEntryInput } from "@neo-tavern/shared";
import { getBackend } from "@/platform";

/**
 * Write workspace entries to disk under worldbook_workspaces/{sessionId}/.
 * Only writes entries that have an entryPath set (like "世界书/角色/苏云/基础信息.txt").
 */
export async function persistWorkspaceEntries(sessionId: string, entries: CreateWorldbookEntryInput[]): Promise<void> {
  const entriesWithPaths = entries.filter((e) => e.entryPath && e.content);
  if (entriesWithPaths.length === 0) return;

  try {
    await getBackend().file.saveWorkspaceDir(sessionId, JSON.stringify(entriesWithPaths));
  } catch (err) {
    console.error("[Whale Builder] Failed to persist workspace entries:", err);
  }
}

/**
 * Delete the entire workspace directory for a session.
 */
export async function deleteWorkspaceDir(sessionId: string): Promise<void> {
  await getBackend().file.deleteWorkspaceDir(sessionId);
}
