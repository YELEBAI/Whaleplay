/**
 * Platform abstraction — decouples the frontend from Tauri invoke().
 *
 * All native calls go through getBackend(), which returns a typed Backend interface.
 * To swap implementations (e.g. Tauri → REST server), change the import in index.ts.
 */

import { tauriBackend } from "./tauri";
import type { Backend } from "./types";

// eslint-disable-next-line prefer-const -- reserved for future setBackend() REST mode
let backend: Backend = tauriBackend;

export function getBackend(): Backend {
  return backend;
}

// For future REST mode:
// export function setBackend(b: Backend) { backend = b; }

export type { Backend } from "./types";
