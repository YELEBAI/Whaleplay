import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createModelConfigSlice, type ModelConfigSlice } from "./model-config.slice";
import { createRegexSlice, type RegexSlice } from "./regex.slice";
import { createPreferencesSlice, type PreferencesSlice } from "./preferences.slice";

export { normalizeReasoningEffort } from "./model-config.slice";

export interface SettingsState extends ModelConfigSlice, RegexSlice, PreferencesSlice {}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (...args) => ({
      ...createModelConfigSlice(...args),
      ...createRegexSlice(...args),
      ...createPreferencesSlice(...args),
    }),
    {
      name: "neotavern-settings",
      partialize: (state) => ({
        debugMode: state.debugMode,
        contextTokens: state.contextTokens,
        personaName: state.personaName,
        personaDesc: state.personaDesc,
        webSearchProvider: state.webSearchProvider,
        tavilyApiKey: state.tavilyApiKey,
        tavilySearchDepth: state.tavilySearchDepth,
        dailyCostWarningEnabled: state.dailyCostWarningEnabled,
        dailyCostWarningLimitCny: state.dailyCostWarningLimitCny,
        dailyCostSpentCny: state.dailyCostSpentCny,
        smartStreamingScrollEnabled: state.smartStreamingScrollEnabled,
      }),
    },
  ),
);

// Re-export types for external consumers
export type { ModelConfigSlice, RegexSlice, PreferencesSlice };
