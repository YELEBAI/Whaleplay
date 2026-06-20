/**
 * Migration system types.
 *
 * Every migration is a self-contained, append-only file that exports a
 * `StorageMigration` object. Published migrations remain in the registry so
 * users can upgrade from every supported schema version.
 */
import type { StorageDriver, StorageOperation } from "../storage/driver";

/** Context provided to every migration's `plan` and `verify`. */
export interface MigrationContext {
  /** The canonical shared driver (prefs / data / sys / meta). */
  driver: StorageDriver;

  /**
   * Snapshot of the browser's localStorage taken BEFORE any migration
   * writes.  Migrations read legacy data from here, never from the
   * driver directly (which would mix new and old keys).
   */
  legacyLocalStorage: Record<string, string>;

  /** Current application version. Recorded in migration metadata. */
  appVersion: string;
}

/** Serialised to `meta:migration:{id}` on completion. */
export interface MigrationRecord {
  state: "completed";
  from: number;
  to: number;
  appVersion: string;
  startedAt: string;
  completedAt: string;
}

/** A single idempotent migration step. */
export interface StorageMigration {
  /** Stable unique identifier, e.g. `"001-import-legacy-client"`. */
  id: string;

  /** Applied when the current schema version is exactly this value. */
  from: number;

  /** Schema version after this migration completes. */
  to: number;

  /** Human-readable summary for logs. */
  description: string;

  /**
   * Return the list of atomic operations to apply.  Must be idempotent —
   * running it twice on the same data produces the same outcome.
   */
  plan(ctx: MigrationContext): Promise<StorageOperation[]>;

  /**
   * Assert that the migration was applied correctly.  Throws on failure,
   * which causes the runner to abort and leave the schema version unchanged
   * so the next startup can retry.
   */
  verify(ctx: MigrationContext): Promise<void>;
}
