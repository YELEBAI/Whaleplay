import { create } from "zustand";
import { createModelConfigSlice, type ModelConfigSlice } from "./model-config.slice";
import { createRegexSlice, type RegexSlice } from "./regex.slice";
import { createPreferencesSlice, type PreferencesSlice } from "./preferences.slice";

export { normalizeReasoningEffort } from "./model-config.slice";

export interface SettingsState extends ModelConfigSlice, RegexSlice, PreferencesSlice {}

export const useSettingsStore = create<SettingsState>()((...args) => ({
  ...createModelConfigSlice(...args),
  ...createRegexSlice(...args),
  ...createPreferencesSlice(...args),
}));

// Re-export types for external consumers
export type { ModelConfigSlice, RegexSlice, PreferencesSlice };
