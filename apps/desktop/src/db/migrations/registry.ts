/**
 * Migration registry — ordered list of all active migrations.
 *
 * To add a migration:
 *   1. Create `004-<description>.ts` exporting a `StorageMigration`.
 *   2. Import it here and add it to the array.
 *
 * Published migrations are append-only. Removing an old entry creates a gap
 * for users upgrading from that schema version.
 */
import type { StorageMigration } from "./types";

// ── Import active migrations ──────────────────────────────────────────
// (currently empty — Phase D will add the first migrations)

// ── Registry ──────────────────────────────────────────────────────────

/** Active migrations in application order. */
export const migrations: StorageMigration[] = [
  // Add new migrations here.
];
