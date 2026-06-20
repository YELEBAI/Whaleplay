import type { StorageDriver, StorageOperation } from "../storage/driver";
import { getDeviceDriver, getSessionDriver, getSharedDriver, isRemoteLanClient } from "../storage/runtime";

const DEVICE_SCHEMA_KEY = "device:meta:schema-version";
const SESSION_SCHEMA_KEY = "session:meta:schema-version";

function browserEntries(storageName: "localStorage" | "sessionStorage"): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof window === "undefined") return result;
  try {
    const storage = window[storageName];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) result[key] = storage.getItem(key) ?? "";
    }
  } catch {
    /* Browser-owned migration is unavailable in this environment. */
  }
  return result;
}

async function readFound(driver: StorageDriver, key: string): Promise<string | null> {
  const result = await driver.get(key);
  if (result.status === "error") throw new Error(`Browser storage migration could not read ${key}: ${result.reason}`);
  return result.status === "found" ? result.value : null;
}

async function migrateDeviceScope(): Promise<void> {
  const driver = getDeviceDriver();
  if ((await readFound(driver, DEVICE_SCHEMA_KEY)) === "1") return;

  const local = browserEntries("localStorage");
  const shared = isRemoteLanClient() ? null : getSharedDriver();
  const operations: StorageOperation[] = [];

  const fixed = [
    { source: "neo:last-chat-id", target: "device:last-chat-id", json: false },
    { source: "neo:character-builder:workspace:v1", target: "device:builder-workspace", json: true },
    { source: "neo:character-builder:workspace-records:v1", target: "device:builder-records", json: true },
  ] as const;

  for (const mapping of fixed) {
    if ((await readFound(driver, mapping.target)) != null) continue;
    const value = local[mapping.source] ?? (shared ? await readFound(shared, mapping.source) : null);
    if (value == null) continue;
    if (mapping.json) {
      try {
        JSON.parse(value);
      } catch {
        console.warn(`[migration] Skipping corrupt device draft ${mapping.source}`);
        continue;
      }
    }
    operations.push({ type: "set", key: mapping.target, value });
  }

  const drafts = new Map<string, string>();
  for (const [key, value] of Object.entries(local)) {
    if (key.startsWith("neotavern_chat_draft_")) drafts.set(key, value);
  }
  if (shared) {
    for (const [key, value] of Object.entries(await shared.entries("neotavern_chat_draft_"))) drafts.set(key, value);
  }
  for (const [source, value] of drafts) {
    const chatId = source.slice("neotavern_chat_draft_".length);
    if (!chatId) continue;
    const target = `device:chat-draft:${chatId}`;
    if ((await readFound(driver, target)) == null) operations.push({ type: "set", key: target, value });
  }

  operations.push({ type: "set", key: DEVICE_SCHEMA_KEY, value: "1" });
  await driver.batch(operations);
}

async function migrateSessionScope(): Promise<void> {
  const driver = getSessionDriver();
  if ((await readFound(driver, SESSION_SCHEMA_KEY)) === "1") return;
  const legacy = browserEntries("sessionStorage");
  const operations: StorageOperation[] = [];
  for (const mapping of [
    { source: "neotavern_settings_tab", target: "session:settings-tab" },
    { source: "neo_token", target: "session:auth-token" },
  ]) {
    if ((await readFound(driver, mapping.target)) == null && legacy[mapping.source] != null) {
      operations.push({ type: "set", key: mapping.target, value: legacy[mapping.source] });
    }
  }
  operations.push({ type: "set", key: SESSION_SCHEMA_KEY, value: "1" });
  await driver.batch(operations);
}

export async function runBrowserScopeMigrations(): Promise<void> {
  await migrateDeviceScope();
  await migrateSessionScope();
}
