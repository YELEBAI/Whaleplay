/**
 * Migration runner — executes pending migrations in order.
 *
 * Invariants:
 * - Schema version (`meta:schema-version`) is written LAST.
 * - On failure the version is NOT advanced, so the next startup retries.
 * - Legacy data is NOT deleted during migration; cleanup is deferred to
 *   a later stable release (Phase F).
 */
import type { StorageDriver } from "../storage/driver";
import type { MigrationContext, StorageMigration } from "./types";

const SCHEMA_VERSION_KEY = "meta:schema-version";
const MIGRATION_PREFIX = "meta:migration:";

/** In-memory snapshot of localStorage taken before any writes. */
function snapshotLocalStorage(): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof window === "undefined" || !window.localStorage) return result;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) result[key] = window.localStorage.getItem(key) ?? "";
    }
  } catch {
    /* best-effort */
  }
  return result;
}

/** Read the current schema version. Missing means legacy/unversioned. */
async function currentVersion(driver: StorageDriver): Promise<number> {
  const r = await driver.get(SCHEMA_VERSION_KEY);
  if (r.status === "error") throw new Error(`Unable to read storage schema version: ${r.reason}`);
  if (r.status === "missing") return -1;
  if (r.status === "found") {
    if (!/^-?\d+$/.test(r.value)) throw new Error(`Invalid storage schema version: ${r.value}`);
    return Number(r.value);
  }
  throw new Error("Unable to determine storage schema version");
}

function validateRegistry(migrations: StorageMigration[]): StorageMigration[] {
  const sorted = [...migrations].sort((a, b) => a.from - b.from);
  const ids = new Set<string>();
  for (let index = 0; index < sorted.length; index += 1) {
    const migration = sorted[index];
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    ids.add(migration.id);
    if (migration.to <= migration.from) {
      throw new Error(`Migration ${migration.id} must advance the schema version`);
    }
    const previous = sorted[index - 1];
    if (previous && previous.to !== migration.from) {
      throw new Error(`Migration gap between v${previous.to} and v${migration.from}`);
    }
  }
  return sorted;
}

function makeContext(driver: StorageDriver, appVersion: string): MigrationContext {
  return {
    driver,
    legacyLocalStorage: snapshotLocalStorage(),
    appVersion,
  };
}

/**
 * Run all registered migrations that have not yet been applied.
 *
 * @returns `true` if all migrations completed or were already up-to-date.
 *          `false` if one failed (schema version was not advanced).
 */
export async function runMigrations(
  driver: StorageDriver,
  migrations: StorageMigration[],
  appVersion: string,
): Promise<boolean> {
  if (migrations.length === 0) return true;
  const sorted = validateRegistry(migrations);
  let version = await currentVersion(driver);
  const latestVersion = sorted.at(-1)!.to;

  if (version > latestVersion) {
    throw new Error(`Storage schema v${version} is newer than this app supports (v${latestVersion})`);
  }
  if (version === latestVersion) return true;

  const startIndex = sorted.findIndex((migration) => migration.from === version);
  if (startIndex === -1) throw new Error(`No migration starts from storage schema v${version}`);

  const ctx = makeContext(driver, appVersion);
  console.warn(`[migration] Current schema version: ${version}. Running ${sorted.length - startIndex} migration(s).`);

  for (let i = startIndex; i < sorted.length; i++) {
    const migration = sorted[i];
    if (migration.from !== version) {
      throw new Error(`Migration ${migration.id} expected v${migration.from}, current schema is v${version}`);
    }
    console.warn(`[migration] Running ${migration.id} (${migration.from} → ${migration.to}): ${migration.description}`);

    try {
      const startedAt = new Date().toISOString();
      const ops = await migration.plan(ctx);
      await driver.batch(ops);
      await migration.verify(ctx);

      // Record completion
      const record = {
        state: "completed" as const,
        from: migration.from,
        to: migration.to,
        appVersion,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      await driver.batch([
        { type: "set", key: `${MIGRATION_PREFIX}${migration.id}`, value: JSON.stringify(record) },
        { type: "set", key: SCHEMA_VERSION_KEY, value: String(migration.to) },
      ]);
      version = migration.to;

      console.warn(`[migration] ${migration.id} completed. Schema now at v${migration.to}.`);
    } catch (err) {
      console.error(
        `[migration] ${migration.id} FAILED:`,
        err instanceof Error ? err.message : err,
        `. Schema stays at v${version}. Will retry next launch.`,
      );
      return false;
    }
  }

  return true;
}
