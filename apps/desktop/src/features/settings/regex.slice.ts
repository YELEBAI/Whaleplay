import { settingsRepository } from "@/db/repositories";
import { generateId } from "@neo-tavern/shared";
import type {
  RegexPreset,
  RegexRule,
  CreateRegexPresetInput,
  UpdateRegexPresetInput,
  CreateRegexRuleInput,
  UpdateRegexRuleInput,
} from "@neo-tavern/shared";

export interface RegexSlice {
  regexPresets: RegexPreset[];
  activeRegexPresetId: string | null;
  loading: boolean;
  error: string | null;

  loadRegexRules: () => Promise<void>;
  getActiveRegexRules: () => RegexRule[];
  createRegexPreset: (input: CreateRegexPresetInput) => Promise<RegexPreset>;
  updateRegexPreset: (id: string, input: UpdateRegexPresetInput) => Promise<RegexPreset>;
  deleteRegexPreset: (id: string) => Promise<void>;
  setActiveRegexPreset: (id: string | null) => Promise<void>;
  addRegexRule: (presetId: string, input: CreateRegexRuleInput) => Promise<RegexRule>;
  updateRegexRule: (presetId: string, ruleId: string, input: UpdateRegexRuleInput) => Promise<RegexRule>;
  deleteRegexRule: (presetId: string, ruleId: string) => Promise<void>;
  toggleRegexRule: (presetId: string, ruleId: string) => Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const createRegexSlice = (set: any, get: any, _api?: any): RegexSlice => ({
  regexPresets: [],
  activeRegexPresetId: null,
  loading: false,
  error: null,

  loadRegexRules: async () => {
    const presets = await settingsRepository.loadRegexRules();
    set({ regexPresets: presets });
  },

  getActiveRegexRules: () => {
    const { regexPresets, activeRegexPresetId } = get();
    const rules: RegexRule[] = [];
    for (const p of regexPresets) {
      if (p.isGlobal) {
        rules.push(...p.rules.filter((r: RegexRule) => r.enabled));
      }
    }
    if (activeRegexPresetId) {
      const preset = regexPresets.find((p: RegexPreset) => p.id === activeRegexPresetId);
      if (preset) {
        rules.push(...preset.rules.filter((r: RegexRule) => r.enabled));
      }
    }
    const seen = new Set<string>();
    return rules.filter((r) => {
      if (seen.has(r.pattern)) return false;
      seen.add(r.pattern);
      return true;
    });
  },

  createRegexPreset: async (input) => {
    set({ loading: true, error: null });
    try {
      const now = new Date().toISOString();
      const preset: RegexPreset = {
        id: generateId(),
        name: input.name,
        description: input.description,
        rules: [],
        isGlobal: input.isGlobal || false,
        createdAt: now,
        updatedAt: now,
      };
      const presets = [...get().regexPresets, preset];
      await settingsRepository.saveRegexRules(presets);
      set({ regexPresets: presets, loading: false });
      return preset;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  updateRegexPreset: async (id, input) => {
    set({ loading: true, error: null });
    try {
      const presets = get().regexPresets.map((p: RegexPreset) => {
        if (p.id !== id) return p;
        const updated = { ...p, updatedAt: new Date().toISOString() };
        if (input.name !== undefined) updated.name = input.name;
        if (input.description !== undefined) updated.description = input.description;
        if (input.isGlobal !== undefined) updated.isGlobal = input.isGlobal;
        return updated;
      });
      await settingsRepository.saveRegexRules(presets);
      set({ regexPresets: presets, loading: false });
      return presets.find((p: RegexPreset) => p.id === id)!;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  deleteRegexPreset: async (id) => {
    set({ loading: true, error: null });
    try {
      const presets = get().regexPresets.filter((p: RegexPreset) => p.id !== id);
      await settingsRepository.saveRegexRules(presets);
      const nextActive = get().activeRegexPresetId === id ? null : get().activeRegexPresetId;
      if (get().activeRegexPresetId === id && presets.length > 0) {
        await settingsRepository.setActiveRegexPresetId(presets[0].id);
        set({ regexPresets: presets, activeRegexPresetId: presets[0].id, loading: false });
      } else {
        if (get().activeRegexPresetId === id) await settingsRepository.setActiveRegexPresetId(null);
        set({ regexPresets: presets, activeRegexPresetId: nextActive, loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  setActiveRegexPreset: async (id) => {
    await settingsRepository.setActiveRegexPresetId(id);
    set({ activeRegexPresetId: id });
  },

  addRegexRule: async (presetId, input) => {
    set({ error: null });
    try {
      const now = new Date().toISOString();
      const rule: RegexRule = {
        id: generateId(),
        presetId,
        name: input.name,
        pattern: input.pattern,
        displayTemplate: input.displayTemplate,
        stripFromPrompt: input.stripFromPrompt,
        enabled: input.enabled,
        createdAt: now,
      };
      const presets = get().regexPresets.map((p: RegexPreset) => {
        if (p.id !== presetId) return p;
        return { ...p, rules: [...p.rules, rule], updatedAt: now };
      });
      await settingsRepository.saveRegexRules(presets);
      set({ regexPresets: presets });
      return rule;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateRegexRule: async (presetId, ruleId, input) => {
    set({ error: null });
    try {
      const presets = get().regexPresets.map((p: RegexPreset) => {
        if (p.id !== presetId) return p;
        const rules = p.rules.map((r) => {
          if (r.id !== ruleId) return r;
          const updated = { ...r };
          if (input.name !== undefined) updated.name = input.name;
          if (input.pattern !== undefined) updated.pattern = input.pattern;
          if (input.displayTemplate !== undefined) updated.displayTemplate = input.displayTemplate;
          if (input.stripFromPrompt !== undefined) updated.stripFromPrompt = input.stripFromPrompt;
          if (input.enabled !== undefined) updated.enabled = input.enabled;
          return updated;
        });
        return { ...p, rules, updatedAt: new Date().toISOString() };
      });
      await settingsRepository.saveRegexRules(presets);
      set({ regexPresets: presets });
      const preset = presets.find((p: RegexPreset) => p.id === presetId)!;
      return preset.rules.find((r: RegexRule) => r.id === ruleId)!;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteRegexRule: async (presetId, ruleId) => {
    set({ error: null });
    try {
      const presets = get().regexPresets.map((p: RegexPreset) => {
        if (p.id !== presetId) return p;
        return { ...p, rules: p.rules.filter((r) => r.id !== ruleId), updatedAt: new Date().toISOString() };
      });
      await settingsRepository.saveRegexRules(presets);
      set({ regexPresets: presets });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  toggleRegexRule: async (presetId, ruleId) => {
    const preset = get().regexPresets.find((p: RegexPreset) => p.id === presetId);
    if (!preset) return;
    const rule = preset.rules.find((r: RegexRule) => r.id === ruleId);
    if (!rule) return;
    await get().updateRegexRule(presetId, ruleId, { enabled: !rule.enabled });
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */
