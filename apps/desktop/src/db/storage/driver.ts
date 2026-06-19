/**
 * Canonical storage driver interface.
 *
 * Every "namespace" (prefs/data/sys/…) binds to a single StorageDriver at
 * creation time.  Unlike the legacy `db/storage.ts` 3-layer fallback, this
 * interface makes the separation between "key genuinely does not exist" and
 * "backend is temporarily unavailable" explicit through `ReadResult`.
 */

/** Outcome of a single read operation. */
export type ReadResult =
  | { status: "found"; value: string }
  | { status: "missing" }
  | { status: "error"; reason: string };

/** A single atomic mutation. */
export type StorageOperation = { type: "set"; key: string; value: string } | { type: "remove"; key: string };

export interface StorageDriver {
  get(key: string): Promise<ReadResult>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** All entries whose key starts with `prefix`. */
  entries(prefix: string): Promise<Record<string, string>>;
  /** Apply a batch; production shared drivers must implement this atomically. */
  batch(operations: StorageOperation[]): Promise<void>;
}

// ── Shims / adapters ────────────────────────────────────────────────────

/**
 * Wrap the legacy `getStorageItem` / `setStorageItem` / `removeStorageItem`
 * functions so existing migration and namespace code can consume a
 * `StorageDriver` while we prepare the real plugin-store / REST backends.
 */
import { getStorageItem, removeStorageItem, setStorageItem, getStorageEntries } from "../storage";

function wrapRead(raw: string | null): ReadResult {
  return raw !== null ? { status: "found", value: raw } : { status: "missing" };
}

export const legacyFallbackDriver: StorageDriver = {
  get: async (key) => {
    try {
      return wrapRead(await getStorageItem(key));
    } catch (e) {
      return { status: "error", reason: e instanceof Error ? e.message : String(e) };
    }
  },
  set: (key, value) => setStorageItem(key, value),
  remove: (key) => removeStorageItem(key),
  entries: (prefix) => getStorageEntries(prefix),
  batch: async (ops) => {
    // Prefer the atomic Tauri/REST backend when available.
    try {
      const { getBackend } = await import("@/platform");
      await getBackend().store.batch(ops);
      return;
    } catch {
      // Fall through to legacy one-by-one path.
    }
    // Legacy non-atomic fallback for browser-only sessions.
    for (const op of ops) {
      if (op.type === "set") await setStorageItem(op.key, op.value);
      else await removeStorageItem(op.key);
    }
  },
};
