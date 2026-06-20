/**
 * Storage runtime — selects the canonical driver for each namespace scope.
 *
 * Key principle: the same logical data scope gets ONE driver.  We do NOT
 * fall back per-operation when the primary driver returns "missing" — that
 * would make it impossible to distinguish "authentically absent" from
 * "backend temporarily down".
 */
import { isTauri } from "@tauri-apps/api/core";
import { canonicalBackendDriver, restBackendDriver } from "./driver";
import type { StorageDriver } from "./driver";

type BrowserStorageName = "localStorage" | "sessionStorage";

function browserStorage(name: BrowserStorageName): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window[name];
  } catch {
    return null;
  }
}

/** Build an isolated driver for browser-owned device/session state. */
export function createBrowserStorageDriver(name: BrowserStorageName): StorageDriver {
  const requireStorage = () => {
    const storage = browserStorage(name);
    if (!storage) throw new Error(`${name} is unavailable`);
    return storage;
  };

  return {
    get: async (key) => {
      try {
        const value = requireStorage().getItem(key);
        return value === null ? { status: "missing" } : { status: "found", value };
      } catch (error) {
        return { status: "error", reason: error instanceof Error ? error.message : String(error) };
      }
    },
    set: async (key, value) => {
      requireStorage().setItem(key, value);
    },
    remove: async (key) => {
      requireStorage().removeItem(key);
    },
    entries: async (prefix) => {
      const storage = requireStorage();
      const result: Record<string, string> = {};
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        result[key] = storage.getItem(key) ?? "";
      }
      return result;
    },
    batch: async (operations) => {
      const storage = requireStorage();
      const previous = new Map<string, string | null>();
      for (const operation of operations) {
        if (!previous.has(operation.key)) previous.set(operation.key, storage.getItem(operation.key));
      }
      try {
        for (const operation of operations) {
          if (operation.type === "set") storage.setItem(operation.key, operation.value);
          else storage.removeItem(operation.key);
        }
      } catch (error) {
        for (const [key, value] of previous) {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        }
        throw error;
      }
    },
  };
}

const deviceDriver = createBrowserStorageDriver("localStorage");
const sessionDriver = createBrowserStorageDriver("sessionStorage");

export function isRemoteLanClient(): boolean {
  if (isTauri() || typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".localhost");
}

const sharedDriver = isTauri()
  ? canonicalBackendDriver
  : isRemoteLanClient()
    ? restBackendDriver
    : createBrowserStorageDriver("localStorage");

/** Shared canonical driver (KV — prefs / data / sys / meta). */
export function getSharedDriver(): StorageDriver {
  return sharedDriver;
}

/** Device-local driver (persisted per browser / app install). */
export function getDeviceDriver(): StorageDriver {
  return deviceDriver;
}

/** Session driver (cleared when the browsing context ends). */
export function getSessionDriver(): StorageDriver {
  return sessionDriver;
}
