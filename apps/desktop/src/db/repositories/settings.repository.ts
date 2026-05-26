import type { ModelConfig, RegexPreset } from '@neo-tavern/shared'
import { getStorageEntries, getStorageItem, removeStorageItem, setStorageItem } from '../storage'

const STORAGE_KEY = 'neotavern_model_configs'
const ACTIVE_KEY = 'neotavern_active_config_id'
const REGEX_KEY = 'neotavern_regex_presets'
const REGEX_ACTIVE_KEY = 'neotavern_active_regex_preset_id'

async function loadFromStorage(): Promise<ModelConfig[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function saveToStorage(configs: ModelConfig[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(configs))
}

export const settingsRepository = {
  async get(key: string): Promise<string | null> {
    return getStorageItem(`neotavern_setting_${key}`)
  },

  async set(key: string, value: string): Promise<void> {
    await setStorageItem(`neotavern_setting_${key}`, value)
  },

  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    const entries = await getStorageEntries('neotavern_setting_')
    for (const k of Object.keys(entries)) {
      if (k?.startsWith('neotavern_setting_')) {
        result[k.replace('neotavern_setting_', '')] = entries[k] ?? ''
      }
    }
    return result
  },

  async getAllModelConfigs(): Promise<ModelConfig[]> {
    return loadFromStorage()
  },

  async getModelConfig(id: string): Promise<ModelConfig | null> {
    return (await loadFromStorage()).find((c) => c.id === id) ?? null
  },

  async saveModelConfig(config: ModelConfig): Promise<void> {
    const configs = (await loadFromStorage()).filter((c) => c.id !== config.id)
    configs.push(config)
    await saveToStorage(configs)
  },

  async deleteModelConfig(id: string): Promise<void> {
    let configs = await loadFromStorage()
    configs = configs.filter((c) => c.id !== id)
    await saveToStorage(configs)
    if (await this.getActiveConfigId() === id) {
      await this.setActiveConfigId(configs[0]?.id ?? null)
    }
  },

  async getActiveConfigId(): Promise<string | null> {
    return getStorageItem(ACTIVE_KEY)
  },

  async setActiveConfigId(id: string | null): Promise<void> {
    if (id) await setStorageItem(ACTIVE_KEY, id)
    else await removeStorageItem(ACTIVE_KEY)
  },

  async loadRegexRules(): Promise<RegexPreset[]> {
    try {
      const raw = await getStorageItem(REGEX_KEY)
      if (!raw) return []
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) return []
      return data.filter((p: any) => p && Array.isArray(p.rules))
    } catch { return [] }
  },

  async saveRegexRules(presets: RegexPreset[]): Promise<void> {
    await setStorageItem(REGEX_KEY, JSON.stringify(presets))
  },

  async getActiveRegexPresetId(): Promise<string | null> {
    return getStorageItem(REGEX_ACTIVE_KEY)
  },

  async setActiveRegexPresetId(id: string | null): Promise<void> {
    if (id) await setStorageItem(REGEX_ACTIVE_KEY, id)
    else await removeStorageItem(REGEX_ACTIVE_KEY)
  },

  async loadPersona(): Promise<{ name: string; desc: string }> {
    try {
      const raw = await getStorageItem('neotavern_persona')
      if (!raw) return { name: 'User', desc: '' }
      return JSON.parse(raw)
    } catch { return { name: 'User', desc: '' } }
  },

  async savePersona(persona: { name: string; desc: string }): Promise<void> {
    await setStorageItem('neotavern_persona', JSON.stringify(persona))
  },
}
