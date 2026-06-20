/**
 * Extract settings from the legacy Zustand `neotavern-settings` envelope.
 *
 * The migration driver must be the canonical backend driver. Target existence
 * checks must never fall through to localStorage, otherwise a legacy local key
 * can make an absent app-store key look present and suppress the copy.
 */
import type { MigrationContext, StorageMigration } from "./types";
import type { StorageOperation } from "../storage/driver";

const PERSIST_FIELDS = [
  "debugMode",
  "contextTokens",
  "personaName",
  "personaDesc",
  "webSearchProvider",
  "tavilyApiKey",
  "tavilySearchDepth",
  "dailyCostWarningEnabled",
  "dailyCostWarningLimitCny",
] as const;

// `dailyCostSpentCny` is deliberately excluded. The old envelope did not
// record which day the aggregate belonged to, while the current repository
// stores it under `dailyCostSpend:YYYY-MM-DD`. Guessing the migration date
// would silently move historical spend into the wrong day.

type PersistField = (typeof PERSIST_FIELDS)[number];
type PersistState = Partial<Record<PersistField, unknown>>;

const BOOLEAN_FIELDS = new Set<PersistField>(["debugMode", "dailyCostWarningEnabled"]);

function toRepoKey(field: PersistField): string {
  if (field === "personaName" || field === "personaDesc") return "neotavern_persona";
  return `neotavern_setting_${field}`;
}

function encodeField(field: PersistField, value: unknown): string {
  if (BOOLEAN_FIELDS.has(field)) return value ? "1" : "0";
  return String(value);
}

async function readPersistState(ctx: MigrationContext): Promise<PersistState | null> {
  const canonical = await ctx.driver.get("neotavern-settings");
  if (canonical.status === "error")
    throw new Error(`002-extract: unable to read canonical envelope: ${canonical.reason}`);

  const raw = canonical.status === "found" ? canonical.value : ctx.legacyLocalStorage["neotavern-settings"];
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`002-extract: corrupt neotavern-settings envelope: ${String(error)}`, { cause: error });
  }

  if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
    throw new Error("002-extract: neotavern-settings has no state object");
  }
  const state = (parsed as { state?: unknown }).state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("002-extract: neotavern-settings state is invalid");
  }
  return state as PersistState;
}

async function requireCanonicalRead(ctx: MigrationContext, key: string) {
  const result = await ctx.driver.get(key);
  if (result.status === "error") throw new Error(`002-extract: unable to read ${key}: ${result.reason}`);
  return result;
}

export async function planSettingsExtraction(ctx: MigrationContext): Promise<StorageOperation[]> {
  const state = await readPersistState(ctx);
  if (!state) return [];

  const ops: StorageOperation[] = [];
  for (const field of PERSIST_FIELDS) {
    if (field === "personaName" || field === "personaDesc") continue;
    const value = state[field];
    if (value === undefined || value === null) continue;

    const repoKey = toRepoKey(field);
    const existing = await requireCanonicalRead(ctx, repoKey);
    if (existing.status === "missing") {
      ops.push({ type: "set", key: repoKey, value: encodeField(field, value) });
    }
  }

  const hasPersona = state.personaName != null || state.personaDesc != null;
  if (hasPersona) {
    const existing = await requireCanonicalRead(ctx, "neotavern_persona");
    if (existing.status === "missing") {
      ops.push({
        type: "set",
        key: "neotavern_persona",
        value: JSON.stringify({
          name: state.personaName == null ? "User" : String(state.personaName),
          desc: state.personaDesc == null ? "" : String(state.personaDesc),
        }),
      });
    }
  }

  return ops;
}

export async function verifySettingsExtraction(ctx: MigrationContext): Promise<void> {
  const state = await readPersistState(ctx);
  if (!state) return;

  for (const field of PERSIST_FIELDS) {
    const value = state[field];
    if (value === undefined || value === null) continue;
    const result = await requireCanonicalRead(ctx, toRepoKey(field));
    if (result.status !== "found") {
      throw new Error(`002-extract: ${toRepoKey(field)} was not populated`);
    }
  }
}

export const migration002: StorageMigration = {
  id: "002-extract-settings-persist",
  from: 1,
  to: 2,
  description: "Extract settings fields from the legacy Zustand persist envelope",
  plan: planSettingsExtraction,
  verify: verifySettingsExtraction,
};
