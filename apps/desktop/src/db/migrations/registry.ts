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
import { migration001 } from "./001-bootstrap";
import { migration002 } from "./002-extract-settings-persist";
import { migration003 } from "./003-repair-settings-persist";
import { migration004 } from "./004-route-storage-scopes";

// ── Registry ──────────────────────────────────────────────────────────

/** Active migrations in application order. */
export const migrations: StorageMigration[] = [migration001, migration002, migration003, migration004];
