/**
 * Migration entry point — call once during app bootstrap, before any
 * business logic hydrates from storage.
 */
import { legacyFallbackDriver } from "../storage/driver";
import { runMigrations } from "./runner";
import { migrations } from "./registry";

let running: Promise<void> | null = null;

/**
 * Run all pending storage migrations.
 *
 * Must be called before locale/theme hydrate, repository loads, and
 * Zustand store initialisations.  Idempotent — safe to call multiple
 * times (subsequent calls are no-ops).
 */
export async function runAllMigrations(): Promise<void> {
  if (running) return running;
  running = (async () => {
    // Transitional: replace this with the selected shared driver before the
    // first production data migration is registered.
    const driver = legacyFallbackDriver;
    const appVersion = await import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).catch(() => "web");
    const ok = await runMigrations(driver, migrations, appVersion);
    if (!ok) throw new Error("Storage migration failed; application startup aborted");
  })();
  try {
    await running;
  } catch (error) {
    running = null;
    throw error;
  }
}
