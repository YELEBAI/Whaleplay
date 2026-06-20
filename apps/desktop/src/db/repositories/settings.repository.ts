import type { ModelConfig, RegexPreset } from "@neo-tavern/shared";
import { data, prefs, secret, sys, usage } from "../kv";
import type { PrefixedKV } from "../storage/namespaces";
import { dataKeys, resolveSettingStorageTarget, sysKeys, type SettingStorageTarget } from "../storage/keys";
import { loadArray, readOptional } from "../storage/repository-helpers";

function namespaceFor(target: SettingStorageTarget): PrefixedKV {
  if (target.scope === "secret") return secret;
  if (target.scope === "usage") return usage;
  return prefs;
}

async function loadFromStorage(): Promise<ModelConfig[]> {
  return loadArray<ModelConfig>(data, dataKeys.modelConfigs);
}

async function saveToStorage(configs: ModelConfig[]) {
  await data.setJson(dataKeys.modelConfigs, configs);
}

export const settingsRepository = {
  async get(key: string): Promise<string | null> {
    const target = resolveSettingStorageTarget(key);
    return readOptional(namespaceFor(target), target.key);
  },

  async set(key: string, value: string): Promise<void> {
    const target = resolveSettingStorageTarget(key);
    await namespaceFor(target).set(target.key, value);
  },

  async getAll(): Promise<Record<string, string>> {
    return prefs.entries();
  },

  async getAllModelConfigs(): Promise<ModelConfig[]> {
    return loadFromStorage();
  },

  async getModelConfig(id: string): Promise<ModelConfig | null> {
    return (await loadFromStorage()).find((config) => config.id === id) ?? null;
  },

  async saveModelConfig(config: ModelConfig): Promise<void> {
    const configs = (await loadFromStorage()).filter((candidate) => candidate.id !== config.id);
    configs.push(config);
    await saveToStorage(configs);
  },

  async deleteModelConfig(id: string): Promise<void> {
    const configs = (await loadFromStorage()).filter((config) => config.id !== id);
    await saveToStorage(configs);
    if ((await this.getActiveConfigId()) === id) await this.setActiveConfigId(configs[0]?.id ?? null);
  },

  async getActiveConfigId(): Promise<string | null> {
    return readOptional(sys, sysKeys.activeModelConfigId);
  },

  async setActiveConfigId(id: string | null): Promise<void> {
    if (id) await sys.set(sysKeys.activeModelConfigId, id);
    else await sys.remove(sysKeys.activeModelConfigId);
  },

  async loadRegexRules(): Promise<RegexPreset[]> {
    return (await loadArray<RegexPreset>(data, dataKeys.regexPresets)).filter((preset) =>
      Boolean(preset && Array.isArray(preset.rules)),
    );
  },

  async saveRegexRules(presets: RegexPreset[]): Promise<void> {
    await data.setJson(dataKeys.regexPresets, presets);
  },

  async getActiveRegexPresetId(): Promise<string | null> {
    return readOptional(sys, sysKeys.activeRegexPresetId);
  },

  async setActiveRegexPresetId(id: string | null): Promise<void> {
    if (id) await sys.set(sysKeys.activeRegexPresetId, id);
    else await sys.remove(sysKeys.activeRegexPresetId);
  },

  async loadPersona(): Promise<{ name: string; desc: string }> {
    const result = await data.getJson<{ name?: unknown; desc?: unknown }>(dataKeys.persona);
    if (result.status === "missing") return { name: "User", desc: "" };
    if (result.status === "error") throw new Error(`Unable to read persona: ${result.error}`);
    if (result.status === "corrupt") throw new Error("Stored persona JSON is corrupt");
    if (!result.value || typeof result.value !== "object" || Array.isArray(result.value)) {
      throw new Error("Stored persona must be a JSON object");
    }
    return {
      name: typeof result.value.name === "string" ? result.value.name : "User",
      desc: typeof result.value.desc === "string" ? result.value.desc : "",
    };
  },

  async savePersona(persona: { name: string; desc: string }): Promise<void> {
    await data.setJson(dataKeys.persona, persona);
  },
};
