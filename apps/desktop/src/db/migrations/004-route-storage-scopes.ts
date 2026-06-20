import type { StorageOperation } from "../storage/driver";
import type { MigrationContext, StorageMigration } from "./types";

type ValueKind = "raw" | "json-object" | "json-array";
type LegacyMapping = Readonly<{ source: string; target: string; kind: ValueKind }>;

const FIXED_MAPPINGS: readonly LegacyMapping[] = [
  { source: "neotavern_theme", target: "prefs:theme", kind: "raw" },
  { source: "neotavern_locale", target: "prefs:locale", kind: "raw" },
  { source: "neotavern_chat_font_size", target: "prefs:chat:font-size", kind: "raw" },
  { source: "neotavern_setting_debugMode", target: "prefs:debug-mode", kind: "raw" },
  { source: "neotavern_setting_autoUpdateEnabled", target: "prefs:auto-update-enabled", kind: "raw" },
  {
    source: "neotavern_setting_dailyCostWarningEnabled",
    target: "prefs:billing:daily-cost-warning-enabled",
    kind: "raw",
  },
  {
    source: "neotavern_setting_dailyCostWarningLimitCny",
    target: "prefs:billing:daily-cost-warning-limit-cny",
    kind: "raw",
  },
  { source: "neotavern_setting_webSearchProvider", target: "prefs:web-search:provider", kind: "raw" },
  { source: "neotavern_setting_tavilyApiKey", target: "secret:web-search:tavily:api-key", kind: "raw" },
  { source: "neotavern_setting_tavilySearchDepth", target: "prefs:web-search:tavily:depth", kind: "raw" },
  { source: "neotavern_setting_contextTokens", target: "prefs:chat:context-tokens", kind: "raw" },
  {
    source: "neotavern_setting_lightweightMemoryEnabled",
    target: "prefs:memory:lightweight-enabled",
    kind: "raw",
  },
  {
    source: "neotavern_setting_promptRecentTurns",
    target: "prefs:memory:prompt-recent-turns",
    kind: "raw",
  },
  {
    source: "neotavern_setting_memorySummaryMaxChars",
    target: "prefs:memory:summary-max-chars",
    kind: "raw",
  },
  {
    source: "neotavern_setting_memoryCompressorConfigId",
    target: "prefs:memory:compressor-config-id",
    kind: "raw",
  },
  { source: "neotavern_setting_imageGeneration", target: "prefs:image-generation", kind: "json-object" },
  { source: "neotavern_persona", target: "data:persona", kind: "json-object" },
  { source: "neotavern_model_configs", target: "data:model-configs", kind: "json-array" },
  { source: "neotavern_regex_presets", target: "data:regex-presets", kind: "json-array" },
  { source: "neotavern_characters", target: "data:characters", kind: "json-array" },
  { source: "neotavern_chats", target: "data:chats", kind: "json-array" },
  { source: "neotavern_presets", target: "data:presets", kind: "json-array" },
  { source: "neotavern_worldbooks", target: "data:worldbooks", kind: "json-array" },
  { source: "neotavern_chat_memories", target: "data:chat-memories", kind: "json-array" },
  { source: "neotavern_chat_savepoints", target: "data:chat-savepoints", kind: "json-array" },
  { source: "neotavern_messages", target: "data:messages", kind: "json-array" },
  { source: "neotavern_agentic_play_states", target: "data:agentic-play-states", kind: "json-array" },
  { source: "neotavern_secondary_api_usage", target: "usage:secondary-api", kind: "json-array" },
  { source: "neotavern_active_config_id", target: "sys:active:model-config-id", kind: "raw" },
  { source: "neotavern_active_regex_preset_id", target: "sys:active:regex-preset-id", kind: "raw" },
  { source: "neotavern_active_preset_id", target: "sys:active:preset-id", kind: "raw" },
  { source: "neotavern_active_worldbook_id", target: "sys:active:worldbook-id", kind: "raw" },
  { source: "neotavern_lan_enabled", target: "sys:lan:enabled", kind: "raw" },
  { source: "neotavern_lan_addr", target: "sys:lan:address", kind: "raw" },
  { source: "neotavern_lan_port", target: "sys:lan:port", kind: "raw" },
  { source: "neotavern_lan_password", target: "secret:lan:password", kind: "raw" },
];

function validateLegacyValue(mapping: LegacyMapping, value: string): void {
  if (mapping.kind === "raw") return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`004-route: ${mapping.source} contains invalid JSON`, { cause: error });
  }
  if (mapping.kind === "json-array" && !Array.isArray(parsed)) {
    throw new Error(`004-route: ${mapping.source} must contain a JSON array`);
  }
  if (mapping.kind === "json-object" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new Error(`004-route: ${mapping.source} must contain a JSON object`);
  }
}

async function readLegacyValue(ctx: MigrationContext, key: string): Promise<string | null> {
  const canonical = await ctx.driver.get(key);
  if (canonical.status === "error") throw new Error(`004-route: unable to read ${key}: ${canonical.reason}`);
  if (canonical.status === "found") return canonical.value;
  return ctx.legacyLocalStorage[key] ?? null;
}

async function collectMappings(ctx: MigrationContext): Promise<Array<LegacyMapping & { value: string }>> {
  const mappings: Array<LegacyMapping & { value: string }> = [];
  for (const mapping of FIXED_MAPPINGS) {
    const value = await readLegacyValue(ctx, mapping.source);
    if (value == null) continue;
    mappings.push({ ...mapping, value });
  }

  const dynamicPrefixes = [
    {
      source: "neotavern_setting_dailyCostSpend:",
      target: "usage:daily-cost-spend:",
    },
    {
      source: "neotavern_setting_dailyCostWarningNotified:",
      target: "usage:daily-cost-warning-notified:",
    },
  ] as const;

  for (const prefix of dynamicPrefixes) {
    const values = new Map<string, string>();
    for (const [key, value] of Object.entries(ctx.legacyLocalStorage)) {
      if (key.startsWith(prefix.source)) values.set(key, value);
    }
    for (const [key, value] of Object.entries(await ctx.driver.entries(prefix.source))) values.set(key, value);
    for (const [source, value] of values) {
      mappings.push({
        source,
        target: `${prefix.target}${source.slice(prefix.source.length)}`,
        kind: "raw",
        value,
      });
    }
  }

  return mappings;
}

async function requireTargetRead(ctx: MigrationContext, key: string) {
  const result = await ctx.driver.get(key);
  if (result.status === "error") throw new Error(`004-route: unable to read ${key}: ${result.reason}`);
  return result;
}

export const migration004: StorageMigration = {
  id: "004-route-storage-scopes",
  from: 3,
  to: 4,
  description: "Copy legacy shared KV into prefs/data/sys/usage/secret namespaces",
  plan: async (ctx): Promise<StorageOperation[]> => {
    const operations: StorageOperation[] = [];
    for (const mapping of await collectMappings(ctx)) {
      const target = await requireTargetRead(ctx, mapping.target);
      if (target.status === "missing") {
        validateLegacyValue(mapping, mapping.value);
        operations.push({ type: "set", key: mapping.target, value: mapping.value });
      }
    }
    return operations;
  },
  verify: async (ctx) => {
    for (const mapping of await collectMappings(ctx)) {
      const target = await requireTargetRead(ctx, mapping.target);
      if (target.status !== "found") {
        validateLegacyValue(mapping, mapping.value);
        throw new Error(`004-route: ${mapping.target} was not populated`);
      }
    }
  },
};
