export const prefKeys = {
  theme: "theme",
  locale: "locale",
  chatFontSize: "chat:font-size",
  debugMode: "debug-mode",
  autoUpdateEnabled: "auto-update-enabled",
  dailyCostWarningEnabled: "billing:daily-cost-warning-enabled",
  dailyCostWarningLimitCny: "billing:daily-cost-warning-limit-cny",
  webSearchProvider: "web-search:provider",
  tavilySearchDepth: "web-search:tavily:depth",
  contextTokens: "chat:context-tokens",
  lightweightMemoryEnabled: "memory:lightweight-enabled",
  promptRecentTurns: "memory:prompt-recent-turns",
  memorySummaryMaxChars: "memory:summary-max-chars",
  memoryCompressorConfigId: "memory:compressor-config-id",
  ragMemory: "rag:memory",
  smartStreamingScrollEnabled: "chat:smart-streaming-scroll-enabled",
  imageGeneration: "image-generation",
} as const;

export const dataKeys = {
  characters: "characters",
  chats: "chats",
  presets: "presets",
  worldbooks: "worldbooks",
  modelConfigs: "model-configs",
  regexPresets: "regex-presets",
  persona: "persona",
  chatMemories: "chat-memories",
  chatSavepoints: "chat-savepoints",
  messages: "messages",
  agenticPlayStates: "agentic-play-states",
} as const;

export const sysKeys = {
  activeModelConfigId: "active:model-config-id",
  activeRegexPresetId: "active:regex-preset-id",
  activePresetId: "active:preset-id",
  activeWorldbookId: "active:worldbook-id",
  lanEnabled: "lan:enabled",
  lanAddress: "lan:address",
  lanPort: "lan:port",
} as const;

export const secretKeys = {
  tavilyApiKey: "web-search:tavily:api-key",
  lanPassword: "lan:password",
} as const;

export const usageKeys = {
  secondaryApi: "secondary-api",
  dailyCostSpend: (date: string) => `daily-cost-spend:${date}`,
  dailyCostWarningNotified: (date: string) => `daily-cost-warning-notified:${date}`,
} as const;

export type SettingStorageTarget =
  | { scope: "prefs"; key: string }
  | { scope: "secret"; key: string }
  | { scope: "usage"; key: string };

const settingPrefs = new Map<string, string>([
  ["debugMode", prefKeys.debugMode],
  ["autoUpdateEnabled", prefKeys.autoUpdateEnabled],
  ["dailyCostWarningEnabled", prefKeys.dailyCostWarningEnabled],
  ["dailyCostWarningLimitCny", prefKeys.dailyCostWarningLimitCny],
  ["webSearchProvider", prefKeys.webSearchProvider],
  ["tavilySearchDepth", prefKeys.tavilySearchDepth],
  ["contextTokens", prefKeys.contextTokens],
  ["lightweightMemoryEnabled", prefKeys.lightweightMemoryEnabled],
  ["promptRecentTurns", prefKeys.promptRecentTurns],
  ["memorySummaryMaxChars", prefKeys.memorySummaryMaxChars],
  ["memoryCompressorConfigId", prefKeys.memoryCompressorConfigId],
  ["ragMemory", prefKeys.ragMemory],
  ["smartStreamingScrollEnabled", prefKeys.smartStreamingScrollEnabled],
  ["imageGeneration", prefKeys.imageGeneration],
]);

export function resolveSettingStorageTarget(key: string): SettingStorageTarget {
  if (key === "tavilyApiKey") return { scope: "secret", key: secretKeys.tavilyApiKey };
  if (key.startsWith("dailyCostSpend:")) {
    return { scope: "usage", key: usageKeys.dailyCostSpend(key.slice("dailyCostSpend:".length)) };
  }
  if (key.startsWith("dailyCostWarningNotified:")) {
    return {
      scope: "usage",
      key: usageKeys.dailyCostWarningNotified(key.slice("dailyCostWarningNotified:".length)),
    };
  }
  const prefKey = settingPrefs.get(key);
  if (!prefKey) throw new Error(`Unknown settings storage key: ${key}`);
  return { scope: "prefs", key: prefKey };
}
