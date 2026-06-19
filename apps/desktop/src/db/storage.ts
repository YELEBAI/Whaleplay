/**
 * App storage — Tauri backend store → REST → localStorage fallback.
 * All key-value persistence goes through getStorageItem / setStorageItem.
 */

import { getBackend } from "@/platform";

const MIGRATION_KEY = "neotavern_app_store_migrated_v1";
const STORAGE_PREFIX = "neotavern";
const LEGACY_LOCAL_CACHE_KEYS = ["neotavern-characters"];
const STORAGE_TIMEOUT_MS = 4000;

type StorageAttemptResult = { ok: true } | { ok: false; reason: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function getByteSize(value: string) {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getLocalStorageDiagnostics(writeKey?: string, writeValue?: string) {
  if (!canUseLocalStorage()) return "localStorage unavailable";
  try {
    const entries: Array<{ key: string; bytes: number }> = [];
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      // localStorage quota is usually counted as UTF-16 code units.
      const bytes = (key.length + value.length) * 2;
      totalBytes += bytes;
      if (key.startsWith(STORAGE_PREFIX) || key.startsWith("neotavern-")) entries.push({ key, bytes });
    }
    const largest = entries
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map((entry) => `${entry.key}=${formatBytes(entry.bytes)}`)
      .join(", ");
    const writeInfo = writeKey && writeValue ? `write ${writeKey}=${formatBytes(writeValue.length * 2)}` : "";
    return [`localStorage total~${formatBytes(totalBytes)}`, writeInfo, largest ? `largest: ${largest}` : ""]
      .filter(Boolean)
      .join("; ");
  } catch (error) {
    return `localStorage diagnostics failed: ${getErrorMessage(error)}`;
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = STORAGE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

function localSetItem(key: string, value: string): StorageAttemptResult {
  if (!canUseLocalStorage()) return { ok: false, reason: "localStorage unavailable" };
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `${getErrorMessage(error)}; ${getLocalStorageDiagnostics(key, value)}`,
    };
  }
}

function localRemoveItem(key: string): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
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

function cleanupLegacyLocalCaches() {
  for (const key of LEGACY_LOCAL_CACHE_KEYS) {
    localRemoveItem(key);
  }
}

async function appStoreGet(key: string): Promise<string | null> {
  try {
    return (await withTimeout(getBackend().store.get(key), `app store get ${key}`)) ?? null;
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

async function restSet(key: string, value: string): Promise<StorageAttemptResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("neo_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value }),
    });
    if (res.ok) return { ok: true };
    let body = "";
    try {
      body = (await res.text()).slice(0, 240);
    } catch {
      /* ignore body read errors */
    }
    return { ok: false, reason: `HTTP ${res.status}${body ? `: ${body}` : ""}` };
  } catch (error) {
    return { ok: false, reason: getErrorMessage(error) };
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
    const payload = (await res.json()) as Record<string, string> | [string, string][];
    const entries = Array.isArray(payload) ? payload : Object.entries(payload);
    const result: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k.startsWith(prefix)) result[k] = v;
    }
    return result;
  } catch {
    return null;
  }
}

async function appStoreSet(key: string, value: string): Promise<StorageAttemptResult> {
  try {
    await withTimeout(getBackend().store.set(key, value), `app store set ${key}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: getErrorMessage(error) };
  }
}

async function appStoreRemove(key: string): Promise<boolean> {
  try {
    await withTimeout(getBackend().store.remove(key), `app store remove ${key}`);
    return true;
  } catch {
    return false;
  }
}

async function appStoreEntries(): Promise<Record<string, string> | null> {
  try {
    return await withTimeout(getBackend().store.entries(), "app store entries");
  } catch {
    return null;
  }
}

export async function migrateLocalStorageToAppStore(prefix = STORAGE_PREFIX) {
  if (!canUseLocalStorage()) return;
  cleanupLegacyLocalCaches();

  try {
    const store = getBackend().store;

    const migrated = await withTimeout(store.get(MIGRATION_KEY), "app store migration check");
    if (migrated === "1") {
      return;
    }

    for (const [key, value] of Object.entries(localEntries(prefix))) {
      const existing = await withTimeout(store.get(key), `app store migration get ${key}`);
      if (existing == null) {
        await withTimeout(store.set(key, value), `app store migration set ${key}`);
      }
    }

    await withTimeout(store.set(MIGRATION_KEY, "1"), "app store migration complete");
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
  const reasons: string[] = [`value size ${formatBytes(getByteSize(value))}`];

  const appStoreResult = await appStoreSet(key, value);
  if (appStoreResult.ok) return;
  reasons.push(`appStore failed: ${appStoreResult.reason}`);

  const restResult = await restSet(key, value);
  if (restResult.ok) return;
  reasons.push(`REST failed: ${restResult.reason}`);

  const localResult = localSetItem(key, value);
  if (localResult.ok) return;
  reasons.push(`localStorage failed: ${localResult.reason}`);

  cleanupLegacyLocalCaches();
  const retryLocalResult = localSetItem(key, value);
  if (retryLocalResult.ok) return;
  reasons.push(`localStorage retry failed after cleanup: ${retryLocalResult.reason}`);

  throw new Error(`Failed to persist storage key: ${key}. ${reasons.join(" | ")}`);
}

export async function removeStorageItem(key: string): Promise<void> {
  if (await appStoreRemove(key)) return;
  if (await restRemove(key)) return;
  if (localRemoveItem(key)) return;
  throw new Error(`Failed to remove storage key: ${key}`);
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
