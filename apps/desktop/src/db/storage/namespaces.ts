/**
 * Storage namespaces — prefixed views on a canonical driver.
 *
 * Each namespace instance is bound to a single `StorageDriver`.  When the
 * driver says `{ status: "missing" }` the namespace treats the key as
 * genuinely absent, rather than falling back to another backend.
 */
import type { StorageDriver, StorageOperation } from "./driver";
import type { ReadResult } from "./driver";
import { decodeArray, decodeOr, decodeReadResult } from "./codecs";
import type { DecodeResult } from "./codecs";

export interface PrefixedKV {
  /** Raw read. Returns the driver's `ReadResult` directly. */
  get(key: string): Promise<ReadResult>;
  /** Raw write. */
  set(key: string, value: string): Promise<void>;
  /** Delete the key. */
  remove(key: string): Promise<void>;

  /** Read + JSON.parse. Distinguishes missing / corrupt / valid. */
  getJson<T = unknown>(key: string): Promise<DecodeResult<T>>;
  /** JSON.stringify + write. */
  setJson(key: string, value: unknown): Promise<void>;

  /** Read expected-JSON-array, with corrupt detection. */
  getArray<T = unknown>(
    key: string,
  ): Promise<
    | { ok: true; value: T[] }
    | { ok: false; status: "corrupt"; raw: string }
    | { ok: false; status: "error"; error: string }
  >;

  /**
   * Legacy-compatible read: returns `fallback` when key is missing or corrupt.
   * Prefer `getJson` in new code; this exists for incremental migration.
   */
  getOr<T>(key: string, fallback: T): Promise<T>;

  /** All keys under this prefix (without the prefix in the returned keys). */
  entries(): Promise<Record<string, string>>;

  /** Remove every key under this prefix. */
  clear(): Promise<void>;
}

export interface SyncPrefixedStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  getJson<T = unknown>(key: string): T | null;
  setJson(key: string, value: unknown): void;
}

export function createPrefixedKV(prefix: string, driver: StorageDriver): PrefixedKV {
  const pk = (name: string) => `${prefix}${name}`;

  return {
    get: (key) => driver.get(pk(key)),
    set: (key, value) => driver.set(pk(key), value),
    remove: (key) => driver.remove(pk(key)),

    getJson: async <T = unknown>(key: string): Promise<DecodeResult<T>> => {
      const result = await driver.get(pk(key));
      return decodeReadResult<T>(result);
    },

    setJson: async (key: string, value: unknown): Promise<void> => {
      await driver.set(pk(key), JSON.stringify(value));
    },

    getArray: async <T = unknown>(key: string) => {
      const result = await driver.get(pk(key));
      return decodeArray<T>(result);
    },

    getOr: async <T>(key: string, fallback: T): Promise<T> => {
      const result = await driver.get(pk(key));
      return decodeOr<T>(result, fallback);
    },

    entries: async () => {
      const all = await driver.entries(prefix);
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(prefix)) result[k.slice(prefix.length)] = v;
      }
      return result;
    },

    clear: async () => {
      const all = await driver.entries(prefix);
      const ops: StorageOperation[] = [];
      for (const k of Object.keys(all)) {
        if (k.startsWith(prefix)) ops.push({ type: "remove", key: k });
      }
      if (ops.length > 0) await driver.batch(ops);
    },
  };
}

function createSyncBrowserNamespace(
  prefix: string,
  storageName: "localStorage" | "sessionStorage",
): SyncPrefixedStorage {
  const storage = () => {
    if (typeof window === "undefined") return null;
    try {
      return window[storageName];
    } catch {
      return null;
    }
  };
  const keyFor = (key: string) => `${prefix}${key}`;

  return {
    get: (key) => storage()?.getItem(keyFor(key)) ?? null,
    set: (key, value) => storage()?.setItem(keyFor(key), value),
    remove: (key) => storage()?.removeItem(keyFor(key)),
    getJson: <T = unknown>(key: string): T | null => {
      const raw = storage()?.getItem(keyFor(key));
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson: (key, value) => storage()?.setItem(keyFor(key), JSON.stringify(value)),
  };
}

// ── Pre-built instances ──────────────────────────────────────────────────
//
// Shared namespaces use the transitional shared driver. Device and session
// namespaces are isolated in localStorage and sessionStorage.

import { getSharedDriver, getDeviceDriver, getSessionDriver } from "./runtime";

/** User preferences — safe to reset without data loss. */
export const prefs = createPrefixedKV("prefs:", getSharedDriver());

/** Core user data (characters, chats, presets, worldbooks, etc.). */
export const data = createPrefixedKV("data:", getSharedDriver());

/** System / driver state (LAN config, migration markers, active IDs). */
export const sys = createPrefixedKV("sys:", getSharedDriver());

/** Migration metadata (schema version, lock, migration completion records). */
export const meta = createPrefixedKV("meta:", getSharedDriver());

/** Usage aggregates and temporary usage detail awaiting the Phase E SQLite move. */
export const usage = createPrefixedKV("usage:", getSharedDriver());

/** Sensitive values. Exact-key access is allowed; enumeration is filtered from LAN REST. */
export const secret = createPrefixedKV("secret:", getSharedDriver());

/** Device-scoped data (last-chat-id, Builder drafts, local-only prefs). */
export const device = createPrefixedKV("device:", getDeviceDriver());

/** Session-scoped data (cleared when the browsing context ends). */
export const session = createPrefixedKV("session:", getSessionDriver());

/** Synchronous browser-owned adapters for state initialisers that cannot await. */
export const deviceSync = createSyncBrowserNamespace("device:", "localStorage");
export const sessionSync = createSyncBrowserNamespace("session:", "sessionStorage");

// No __z: instance — canonical Zustand persist is being removed per the survey.
