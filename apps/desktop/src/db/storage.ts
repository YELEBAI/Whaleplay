/**
 * App storage — Tauri plugin-store → REST → localStorage fallback.
 * All key-value persistence goes through getStorageItem / setStorageItem.
 */

import { Store } from "@tauri-apps/plugin-store";

const MIGRATION_KEY = "neotavern_app_store_migrated_v1";
const STORAGE_PREFIX = "neotavern";

let storeInstance: Store | null = null;

async function getStore(): Promise<Store | null> {
  if (!storeInstance) {
    try {
      storeInstance = await Store.load("store.json");
    } catch {
      return null;
    }
  }
  return storeInstance;
}

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
  try {
    const store = await getStore();
    if (!store) return null;
    return (await store.get<string>(key)) ?? null;
  } catch {
    return null;
  }
}

// ── REST fallback (LAN browser shares Tauri store.json) ─

async function restGet(key: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: string | null };
    return data.value ?? null;
  } catch {
    return null;
  }
}

async function restSet(key: string, value: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function restRemove(key: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, { method: "DELETE", headers });
    return res.ok;
  } catch {
    return false;
  }
}

async function restEntries(prefix: string): Promise<Record<string, string> | null> {
  try {
    const headers: Record<string, string> = {};
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/store", { headers });
    if (!res.ok) return null;
    const entries = (await res.json()) as [string, string][];
    const result: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k.startsWith(prefix)) result[k] = v;
    }
    return result;
  } catch {
    return null;
  }
}

async function appStoreSet(key: string, value: string): Promise<boolean> {
  try {
    const store = await getStore();
    if (!store) return false;
    await store.set(key, value);
    await store.save();
    return true;
  } catch {
    return false;
  }
}

async function appStoreRemove(key: string): Promise<boolean> {
  try {
    const store = await getStore();
    if (!store) return false;
    await store.delete(key);
    await store.save();
    return true;
  } catch {
    return false;
  }
}

async function appStoreEntries(): Promise<Record<string, string> | null> {
  try {
    const store = await getStore();
    if (!store) return null;
    const entries = await store.entries();
    const result: Record<string, string> = {};
    for (const [key, value] of entries) {
      result[key] = String(value ?? "");
    }
    return result;
  } catch {
    return null;
  }
}

export async function migrateLocalStorageToAppStore(prefix = STORAGE_PREFIX) {
  if (!canUseLocalStorage()) return;

  try {
    const store = await getStore();
    if (!store) return;

    const migrated = await store.get<string>(MIGRATION_KEY);
    if (migrated === "1") return;

    for (const [key, value] of Object.entries(localEntries(prefix))) {
      const existing = await store.get<string>(key);
      if (existing == null) {
        await store.set(key, value);
      }
    }

    await store.set(MIGRATION_KEY, "1");
    await store.save();
  } catch {
    /* store unavailable */
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  // 1. Tauri invoke
  const stored = await appStoreGet(key);
  if (stored != null) return stored;

  // 2. REST API (LAN browser sharing store.json)
  const restValue = await restGet(key);
  if (restValue != null) return restValue;

  // 3. localStorage fallback
  return localGetItem(key);
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (await appStoreSet(key, value)) return;
  if (await restSet(key, value)) return;
  localSetItem(key, value);
}

export async function removeStorageItem(key: string): Promise<void> {
  if (await appStoreRemove(key)) return;
  if (await restRemove(key)) return;
  localRemoveItem(key);
}

export async function getStorageEntries(prefix = STORAGE_PREFIX): Promise<Record<string, string>> {
  const stored = await appStoreEntries();
  if (stored) {
    return Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith(prefix)));
  }
  const restEntries_ = await restEntries(prefix);
  if (restEntries_) return restEntries_;
  return localEntries(prefix);
}
