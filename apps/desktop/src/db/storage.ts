import { invoke } from "@tauri-apps/api/core";

const MIGRATION_KEY = "neotavern_app_store_migrated_v1";
const STORAGE_PREFIX = "neotavern";

let appStoreAvailable: boolean | null = null;

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function localGetItem(key: string): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSetItem(key: string, value: string) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function localRemoveItem(key: string) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

function localEntries(prefix = STORAGE_PREFIX): Record<string, string> {
  const result: Record<string, string> = {};
  if (!canUseLocalStorage()) return result;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      result[key] = localStorage.getItem(key) ?? "";
    }
  } catch {
    /* storage unavailable */
  }
  return result;
}

async function appStoreGet(key: string): Promise<string | null> {
  if (appStoreAvailable === false) return null;
  try {
    const value = await invoke<string | null>("app_store_get", { key });
    appStoreAvailable = true;
    return value;
  } catch {
    appStoreAvailable = false;
    return null;
  }
}

async function appStoreSet(key: string, value: string): Promise<boolean> {
  if (appStoreAvailable === false) return false;
  try {
    await invoke("app_store_set", { key, value });
    appStoreAvailable = true;
    return true;
  } catch {
    appStoreAvailable = false;
    return false;
  }
}

async function appStoreRemove(key: string): Promise<boolean> {
  if (appStoreAvailable === false) return false;
  try {
    await invoke("app_store_remove", { key });
    appStoreAvailable = true;
    return true;
  } catch {
    appStoreAvailable = false;
    return false;
  }
}

async function appStoreEntries(): Promise<Record<string, string> | null> {
  if (appStoreAvailable === false) return null;
  try {
    const entries = await invoke<Record<string, string>>("app_store_entries");
    appStoreAvailable = true;
    return entries;
  } catch {
    appStoreAvailable = false;
    return null;
  }
}

export async function migrateLocalStorageToAppStore(prefix = STORAGE_PREFIX) {
  if (!canUseLocalStorage()) return;

  try {
    const migrated = await invoke<string | null>("app_store_get", { key: MIGRATION_KEY });
    appStoreAvailable = true;
    if (migrated === "1") return;

    for (const [key, value] of Object.entries(localEntries(prefix))) {
      const existing = await invoke<string | null>("app_store_get", { key });
      if (existing == null) {
        await invoke("app_store_set", { key, value });
      }
    }

    await invoke("app_store_set", { key: MIGRATION_KEY, value: "1" });
  } catch {
    appStoreAvailable = false;
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  const stored = await appStoreGet(key);
  if (stored != null) return stored;

  const legacy = localGetItem(key);
  if (legacy != null && appStoreAvailable !== false) {
    await appStoreSet(key, legacy);
  }
  return legacy;
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (await appStoreSet(key, value)) return;
  localSetItem(key, value);
}

export async function removeStorageItem(key: string): Promise<void> {
  if (await appStoreRemove(key)) return;
  localRemoveItem(key);
}

export async function getStorageEntries(prefix = STORAGE_PREFIX): Promise<Record<string, string>> {
  const stored = await appStoreEntries();
  if (stored) {
    return Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith(prefix)));
  }
  return localEntries(prefix);
}
