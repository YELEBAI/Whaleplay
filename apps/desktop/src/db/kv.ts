/**
 * KV storage convenience re-exports.
 *
 * All real implementation lives in `db/storage/namespaces.ts`.  This file
 * stays as the public entry point for the rest of the app so existing
 * imports don't need to change path.
 */
export {
  prefs,
  data,
  sys,
  meta,
  usage,
  secret,
  device,
  session,
  deviceSync,
  sessionSync,
  createPrefixedKV,
} from "./storage/namespaces";

export type { PrefixedKV, SyncPrefixedStorage } from "./storage/namespaces";
export type { ReadResult } from "./storage/driver";
