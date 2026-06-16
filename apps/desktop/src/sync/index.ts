/**
 * Desktop sync wiring — inert scaffold.
 *
 * During the scaffold phase this module constructs `EmptySyncServer` /
 * `EmptySyncClient` instances that reject every call with
 * `SyncNotImplementedError`. The wiring point (`getSyncServer`) exists so
 * callers (settings UI, LAN bootstrap, future `useSync` hook) can reference a
 * sync surface without import-ing an unready implementation.
 *
 * When `dev-sync` lands it swaps the `Empty*` instances for real
 * implementations behind the same `SyncServer`/`SyncClient` interfaces from
 * `@neo-tavern/core`. No caller interface changes.
 */
import { EmptySyncServer, EmptySyncClient } from "@neo-tavern/core";
import type { SyncServer, SyncClient } from "@neo-tavern/core";

let server: SyncServer = new EmptySyncServer();
let client: SyncClient = new EmptySyncClient();

/** Provider side — the desktop serves its data to paired clients. */
export function getSyncServer(): SyncServer {
  return server;
}

/** Consumer side — the desktop can also pull from another desktop. */
export function getSyncClient(): SyncClient {
  return client;
}

/** Replace the server instance (filled in by `dev-sync`). */
export function setSyncServer(next: SyncServer): void {
  server = next;
}

/** Replace the client instance. */
export function setSyncClient(next: SyncClient): void {
  client = next;
}

/**
 * React hook stub — returns `{ ready: false }` during scaffold.
 *
 * Mobile / settings UI can depend on this shape without knowing whether the
 * implementation is ready. Real implementations will respect the same shape
 * and add `pair`, `pull`, `push`, `status`, etc.
 */
export function useSync() {
  return { ready: false } as const;
}
