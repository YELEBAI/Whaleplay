/**
 * Repair v2 stores created by the original 002 migration.
 *
 * The original migration used the legacy fallback driver for target-existence
 * checks. A value found only in localStorage therefore suppressed writing the
 * corresponding app-store key, while verification made the same mistake and
 * still advanced the schema to v2.
 */
import type { StorageMigration } from "./types";
import { planSettingsExtraction, verifySettingsExtraction } from "./002-extract-settings-persist";

export const migration003: StorageMigration = {
  id: "003-repair-settings-persist",
  from: 2,
  to: 3,
  description: "Repair settings skipped by 002 fallback target checks",
  plan: planSettingsExtraction,
  verify: verifySettingsExtraction,
};
