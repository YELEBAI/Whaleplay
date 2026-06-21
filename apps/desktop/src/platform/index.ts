/**
 * Platform abstraction — decouples the frontend from Tauri invoke().
 *
 * All native calls go through getBackend(), which returns a typed Backend
 * interface. The default remains the Tauri backend so existing behavior is
 * unchanged. A REST backend (`rest.ts`) is now available for opt-in via
 * setBackend() — the browser/mobile path and the LAN sync bootstrap will flip
 * to it once the REST db/search/comfy mirrors are implemented (dev-sync).
 */
import { tauriBackend } from "./tauri";
import type { Backend } from "./types";

// Default to Tauri to preserve current runtime behavior. Browser mode still
// works today because db/storage.ts has its own REST/localStorage fallback;
// we are NOT switching getBackend() to REST automatically yet.
let backend: Backend = tauriBackend;

export function getBackend(): Backend {
  return backend;
}

/**
 * Force a backend (Tauri / REST / future mobile). Used by bootstrap code when
 * the runtime knows better — e.g. a mobile build that always wants REST, or a
 * browser tab pointed at a LAN server.
 */
export function setBackend(next: Backend): void {
  backend = next;
}

export { tauriBackend } from "./tauri";
export { restBackend } from "./rest";
export type { Backend } from "./types";
