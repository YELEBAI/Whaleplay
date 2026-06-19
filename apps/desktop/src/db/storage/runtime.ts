/**
 * Storage runtime — selects the canonical driver for each namespace scope.
 *
 * Today there is only one implementation (the legacy 3-layer fallback). When
 * plugin-store and a dedicated REST driver are available they will be wired
 * here and the appropriate instance returned per scope.
 *
 * Key principle: the same logical data scope gets ONE driver.  We do NOT
 * fall back per-operation when the primary driver returns "missing" — that
 * would make it impossible to distinguish "authentically absent" from
 * "backend temporarily down".
 */
import { legacyFallbackDriver } from "./driver";
import type { StorageDriver } from "./driver";

/** Shared canonical driver (KV — prefs / data / sys / meta). */
export function getSharedDriver(): StorageDriver {
  return legacyFallbackDriver;
}

/** Device-local driver (persisted per browser / app install). */
export function getDeviceDriver(): StorageDriver {
  // For now the device scope also uses the legacy fallback. In the future
  // this will be a dedicated `deviceStorage` driver backed by the
  // WebView's localStorage adapter (non-shared, never synced).
  return legacyFallbackDriver;
}

/** Session driver (cleared when the browsing context ends). */
export function getSessionDriver(): StorageDriver {
  // Currently implementation uses the shared driver as the backing store
  // because Tauri windows share a persistent profile. A real sessionStorage
  // adapter will replace this for browser/LAN contexts.
  return legacyFallbackDriver;
}
