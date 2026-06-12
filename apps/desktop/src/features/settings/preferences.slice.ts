import { settingsRepository } from "@/db/repositories";
import {
  DEFAULT_LIGHTWEIGHT_MEMORY_ENABLED,
  DEFAULT_MEMORY_SUMMARY_MAX_CHARS,
  DEFAULT_PROMPT_RECENT_TURNS,
} from "@/features/chat/memory";
import {
  DEFAULT_IMAGE_GENERATION_SETTINGS,
  normalizeImageSettings,
} from "@/features/image-generation/image-generation";
import type { ImageGenerationSettings } from "@/features/image-generation/image-generation";
import {
  DEFAULT_DAILY_COST_WARNING_LIMIT_CNY,
  loadDailyCostWarningSettings as loadDailyCostWarningSettingsFromStorage,
  loadTodayCostCny,
  saveDailyCostWarningEnabled,
  saveDailyCostWarningLimitCny,
} from "@/features/billing/daily-cost";

export interface PreferencesSlice {
  debugMode: boolean;
  autoUpdateEnabled: boolean;
  dailyCostWarningEnabled: boolean;
  dailyCostWarningLimitCny: number;
  dailyCostSpentCny: number;
  webSearchProvider: "default" | "tavily";
  tavilyApiKey: string;
  tavilySearchDepth: "basic" | "advanced" | "fast" | "ultra-fast";
  contextTokens: number;
  lightweightMemoryEnabled: boolean;
  promptRecentTurns: number;
  memorySummaryMaxChars: number;
  memoryCompressorConfigId: string | null;
  imageGeneration: ImageGenerationSettings;
  personaName: string;
  personaDesc: string;

  loadDebugMode: () => Promise<void>;
  setDebugMode: (enabled: boolean) => void;
  loadAutoUpdateEnabled: () => Promise<void>;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  loadDailyCostWarningSettings: () => Promise<void>;
  loadDailyCostSpent: () => Promise<void>;
  setDailyCostWarningEnabled: (enabled: boolean) => void;
  setDailyCostWarningLimitCny: (limitCny: number) => void;
  loadWebSearchSettings: () => Promise<void>;
  setWebSearchProvider: (provider: "default" | "tavily") => void;
  setTavilyApiKey: (key: string) => void;
  setTavilySearchDepth: (depth: "basic" | "advanced" | "fast" | "ultra-fast") => void;
  loadContextTokens: () => Promise<void>;
  setContextTokens: (tokens: number) => void;
  loadMemorySettings: () => Promise<void>;
  setLightweightMemoryEnabled: (enabled: boolean) => void;
  setPromptRecentTurns: (turns: number) => void;
  setMemorySummaryMaxChars: (chars: number) => void;
  setMemoryCompressorConfigId: (id: string | null) => void;
  loadImageGenerationSettings: () => Promise<void>;
  updateImageGenerationSettings: (patch: Partial<ImageGenerationSettings>) => void;
  loadPersona: () => Promise<void>;
  savePersona: (name: string, desc: string) => void;
  clearError: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const createPreferencesSlice = (set: any, _get: any, _api?: any): PreferencesSlice => ({
  debugMode: false,
  autoUpdateEnabled: false,
  dailyCostWarningEnabled: false,
  dailyCostWarningLimitCny: DEFAULT_DAILY_COST_WARNING_LIMIT_CNY,
  dailyCostSpentCny: 0,
  webSearchProvider: "default" as const,
  tavilyApiKey: "",
  tavilySearchDepth: "basic" as const,
  contextTokens: 0,
  lightweightMemoryEnabled: DEFAULT_LIGHTWEIGHT_MEMORY_ENABLED,
  promptRecentTurns: DEFAULT_PROMPT_RECENT_TURNS,
  memorySummaryMaxChars: DEFAULT_MEMORY_SUMMARY_MAX_CHARS,
  memoryCompressorConfigId: null,
  imageGeneration: DEFAULT_IMAGE_GENERATION_SETTINGS,
  personaName: "User",
  personaDesc: "",

  loadDebugMode: async () => {
    const raw = await settingsRepository.get("debugMode");
    if (raw !== null && raw !== undefined) set({ debugMode: raw === "1" });
  },

  setDebugMode: (enabled: boolean) => {
    void settingsRepository.set("debugMode", enabled ? "1" : "0");
    set({ debugMode: enabled });
  },

  loadAutoUpdateEnabled: async () => {
    const raw = await settingsRepository.get("autoUpdateEnabled");
    if (raw !== null && raw !== undefined) set({ autoUpdateEnabled: raw === "1" });
  },

  setAutoUpdateEnabled: (enabled: boolean) => {
    void settingsRepository.set("autoUpdateEnabled", enabled ? "1" : "0");
    set({ autoUpdateEnabled: enabled });
  },

  loadDailyCostWarningSettings: async () => {
    const settings = await loadDailyCostWarningSettingsFromStorage();
    set({
      dailyCostWarningEnabled: settings.enabled,
      dailyCostWarningLimitCny: settings.limitCny,
    });
  },

  loadDailyCostSpent: async () => {
    set({ dailyCostSpentCny: await loadTodayCostCny() });
  },

  setDailyCostWarningEnabled: (enabled: boolean) => {
    void saveDailyCostWarningEnabled(enabled);
    set({ dailyCostWarningEnabled: enabled });
  },

  setDailyCostWarningLimitCny: (limitCny: number) => {
    const next = Number.isFinite(limitCny)
      ? Math.max(0.01, Math.round(limitCny * 100) / 100)
      : DEFAULT_DAILY_COST_WARNING_LIMIT_CNY;
    void saveDailyCostWarningLimitCny(next);
    set({ dailyCostWarningLimitCny: next });
  },

  loadWebSearchSettings: async () => {
    const provider = await settingsRepository.get("webSearchProvider");
    if (provider === "tavily" || provider === "default") {
      set({ webSearchProvider: provider });
    }
    const key = await settingsRepository.get("tavilyApiKey");
    if (key) set({ tavilyApiKey: key });
    const depth = await settingsRepository.get("tavilySearchDepth");
    if (depth === "basic" || depth === "advanced" || depth === "fast" || depth === "ultra-fast") {
      set({ tavilySearchDepth: depth });
    }
  },

  setWebSearchProvider: (provider) => {
    void settingsRepository.set("webSearchProvider", provider);
    set({ webSearchProvider: provider });
  },

  setTavilyApiKey: (key) => {
    void settingsRepository.set("tavilyApiKey", key);
    set({ tavilyApiKey: key });
  },

  setTavilySearchDepth: (depth) => {
    void settingsRepository.set("tavilySearchDepth", depth);
    set({ tavilySearchDepth: depth });
  },

  loadContextTokens: async () => {
    const raw = await settingsRepository.get("contextTokens");
    if (raw !== null && raw !== undefined) set({ contextTokens: parseInt(raw) || 0 });
  },

  setContextTokens: (tokens: number) => {
    void settingsRepository.set("contextTokens", String(tokens));
    set({ contextTokens: tokens });
  },

  loadMemorySettings: async () => {
    const [enabledRaw, recentTurnsRaw, summaryMaxCharsRaw, compressorConfigIdRaw] = await Promise.all([
      settingsRepository.get("lightweightMemoryEnabled"),
      settingsRepository.get("promptRecentTurns"),
      settingsRepository.get("memorySummaryMaxChars"),
      settingsRepository.get("memoryCompressorConfigId"),
    ]);
    set({
      lightweightMemoryEnabled: enabledRaw == null ? DEFAULT_LIGHTWEIGHT_MEMORY_ENABLED : enabledRaw !== "0",
      promptRecentTurns: recentTurnsRaw
        ? Math.max(1, parseInt(recentTurnsRaw) || DEFAULT_PROMPT_RECENT_TURNS)
        : DEFAULT_PROMPT_RECENT_TURNS,
      memorySummaryMaxChars: summaryMaxCharsRaw
        ? Math.max(1000, parseInt(summaryMaxCharsRaw) || DEFAULT_MEMORY_SUMMARY_MAX_CHARS)
        : DEFAULT_MEMORY_SUMMARY_MAX_CHARS,
      memoryCompressorConfigId: compressorConfigIdRaw?.trim() || null,
    });
  },

  setLightweightMemoryEnabled: (enabled: boolean) => {
    void settingsRepository.set("lightweightMemoryEnabled", enabled ? "1" : "0");
    set({ lightweightMemoryEnabled: enabled });
  },

  setPromptRecentTurns: (turns: number) => {
    const next = Math.max(1, Math.round(turns));
    void settingsRepository.set("promptRecentTurns", String(next));
    set({ promptRecentTurns: next });
  },

  setMemorySummaryMaxChars: (chars: number) => {
    const next = Math.max(1000, Math.round(chars));
    void settingsRepository.set("memorySummaryMaxChars", String(next));
    set({ memorySummaryMaxChars: next });
  },

  setMemoryCompressorConfigId: (id: string | null) => {
    const next = id?.trim() || null;
    void settingsRepository.set("memoryCompressorConfigId", next ?? "");
    set({ memoryCompressorConfigId: next });
  },

  loadImageGenerationSettings: async () => {
    const raw = await settingsRepository.get("imageGeneration");
    if (!raw) {
      set({ imageGeneration: DEFAULT_IMAGE_GENERATION_SETTINGS });
      return;
    }
    try {
      set({ imageGeneration: normalizeImageSettings(JSON.parse(raw)) });
    } catch {
      set({ imageGeneration: DEFAULT_IMAGE_GENERATION_SETTINGS });
    }
  },

  updateImageGenerationSettings: (patch: Partial<ImageGenerationSettings>) => {
    const next = normalizeImageSettings({ ..._get().imageGeneration, ...patch });
    void settingsRepository.set("imageGeneration", JSON.stringify(next));
    set({ imageGeneration: next });
  },

  loadPersona: async () => {
    const persona = await settingsRepository.loadPersona();
    set({ personaName: persona.name, personaDesc: persona.desc });
  },

  savePersona: (name: string, desc: string) => {
    void settingsRepository.savePersona({ name, desc });
    set({ personaName: name, personaDesc: desc });
  },

  clearError: () => set({ error: null }),
});
/* eslint-enable @typescript-eslint/no-explicit-any */
