import { create } from 'zustand'
import { settingsRepository } from '@/db/repositories'
import { generateId } from '@neo-tavern/shared'
import type { ModelConfig, CreateModelConfigInput, UpdateModelConfigInput, RegexPreset, RegexRule, CreateRegexPresetInput, UpdateRegexPresetInput, CreateRegexRuleInput, UpdateRegexRuleInput } from '@neo-tavern/shared'

interface TestConnectionResult {
  ok: boolean
  message: string
}

interface SettingsState {
  modelConfigs: ModelConfig[]
  modelConfig: ModelConfig | null
  activeConfigId: string | null
  loading: boolean
  saving: boolean
  testing: boolean
  error: string | null
  regexPresets: RegexPreset[]
  activeRegexPresetId: string | null
  contextTokens: number
  personaName: string
  personaDesc: string

  loadAllConfigs: () => Promise<void>
  selectConfig: (id: string) => Promise<void>
  saveModelConfig: (input: CreateModelConfigInput) => Promise<ModelConfig>
  updateModelConfig: (id: string, input: UpdateModelConfigInput) => Promise<ModelConfig>
  deleteModelConfig: (id: string) => Promise<void>
  testConnection: (baseUrl: string, apiKey: string, model: string) => Promise<TestConnectionResult>
  loadRegexRules: () => Promise<void>
  loadContextTokens: () => Promise<void>
  createRegexPreset: (input: CreateRegexPresetInput) => Promise<RegexPreset>
  updateRegexPreset: (id: string, input: UpdateRegexPresetInput) => Promise<RegexPreset>
  deleteRegexPreset: (id: string) => Promise<void>
  setActiveRegexPreset: (id: string | null) => Promise<void>
  addRegexRule: (presetId: string, input: CreateRegexRuleInput) => Promise<RegexRule>
  updateRegexRule: (presetId: string, ruleId: string, input: UpdateRegexRuleInput) => Promise<RegexRule>
  deleteRegexRule: (presetId: string, ruleId: string) => Promise<void>
  toggleRegexRule: (presetId: string, ruleId: string) => Promise<void>
  getActiveRegexRules: () => RegexRule[]
  setContextTokens: (tokens: number) => void
  loadPersona: () => Promise<void>
  savePersona: (name: string, desc: string) => void
  clearError: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  modelConfigs: [],
  modelConfig: null,
  activeConfigId: null,
  loading: false,
  saving: false,
  testing: false,
  error: null,
  regexPresets: [],
  activeRegexPresetId: null,
  contextTokens: 0,
  personaName: 'User',
  personaDesc: '',

  loadAllConfigs: async () => {
    set({ loading: true, error: null })
    try {
      const configs = await settingsRepository.getAllModelConfigs()
      const activeId = await settingsRepository.getActiveConfigId()
      const current = activeId ? configs.find((c) => c.id === activeId) ?? null : null
      set({ modelConfigs: configs, activeConfigId: activeId, modelConfig: current, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  selectConfig: async (id: string) => {
    const configs = get().modelConfigs
    const config = configs.find((c) => c.id === id) ?? null
    await settingsRepository.setActiveConfigId(id)
    set({ modelConfig: config, activeConfigId: id })
  },

  saveModelConfig: async (input: CreateModelConfigInput) => {
    set({ saving: true, error: null })
    try {
      const now = new Date().toISOString()
      const config: ModelConfig = {
        id: generateId(),
        provider: input.provider,
        name: input.name,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
        temperature: input.temperature ?? 0.8,
        maxTokens: input.maxTokens ?? 800,
        reasoningEffort: input.reasoningEffort,
        createdAt: now,
        updatedAt: now,
      }
      await settingsRepository.saveModelConfig(config)
      await settingsRepository.setActiveConfigId(config.id)
      set((state) => ({
        modelConfigs: [...state.modelConfigs, config],
        modelConfig: config,
        activeConfigId: config.id,
        saving: false,
      }))
      return config
    } catch (err) {
      set({ error: (err as Error).message, saving: false })
      throw err
    }
  },

  updateModelConfig: async (id: string, input: UpdateModelConfigInput) => {
    set({ saving: true, error: null })
    try {
      const existing = get().modelConfigs.find((c) => c.id === id)
      if (!existing) throw new Error('Config not found')

      const now = new Date().toISOString()
      const config: ModelConfig = { ...existing, ...input, updatedAt: now }
      await settingsRepository.saveModelConfig(config)
      set((state) => ({
        modelConfigs: state.modelConfigs.map((c) => (c.id === id ? config : c)),
        modelConfig: state.activeConfigId === id ? config : state.modelConfig,
        saving: false,
      }))
      return config
    } catch (err) {
      set({ error: (err as Error).message, saving: false })
      throw err
    }
  },

  deleteModelConfig: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await settingsRepository.deleteModelConfig(id)
      const remaining = get().modelConfigs.filter((c) => c.id !== id)
      const nextActive = remaining[0] ?? null
      if (nextActive) {
        await settingsRepository.setActiveConfigId(nextActive.id)
        set({ modelConfigs: remaining, modelConfig: nextActive, activeConfigId: nextActive.id, loading: false })
      } else {
        await settingsRepository.setActiveConfigId(null)
        set({ modelConfigs: [], modelConfig: null, activeConfigId: null, loading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  testConnection: async (baseUrl: string, apiKey: string, model: string) => {
    set({ testing: true, error: null })
    try {
      const cleanUrl = baseUrl.replace(/\/$/, '')
      const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        set({ testing: false })
        return { ok: false, message: `Status ${response.status}: ${errorText.slice(0, 200)}` }
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      set({ testing: false })
      return { ok: true, message: content ? `OK — got reply: "${content}"` : 'OK — connected successfully' }
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error'
      set({ testing: false })
      return { ok: false, message: `Connection failed: ${msg}` }
    }
  },

  clearError: () => set({ error: null }),

  loadRegexRules: async () => {
    const presets = await settingsRepository.loadRegexRules()
    set({ regexPresets: presets })
  },

  getActiveRegexRules: () => {
    const { regexPresets, activeRegexPresetId } = get()
    const rules: RegexRule[] = []
    for (const p of regexPresets) {
      if (p.isGlobal) {
        rules.push(...p.rules.filter((r) => r.enabled))
      }
    }
    if (activeRegexPresetId) {
      const preset = regexPresets.find((p) => p.id === activeRegexPresetId)
      if (preset) {
        rules.push(...preset.rules.filter((r) => r.enabled))
      }
    }
    const seen = new Set<string>()
    return rules.filter((r) => { if (seen.has(r.pattern)) return false; seen.add(r.pattern); return true })
  },

  loadContextTokens: async () => {
    const raw = await settingsRepository.get('contextTokens')
    if (raw !== null && raw !== undefined) set({ contextTokens: parseInt(raw) || 0 })
  },

  createRegexPreset: async (input) => {
    set({ loading: true, error: null })
    try {
      const now = new Date().toISOString()
      const preset: RegexPreset = { id: generateId(), name: input.name, description: input.description, rules: [], isGlobal: input.isGlobal || false, createdAt: now, updatedAt: now }
      const presets = [...get().regexPresets, preset]
      await settingsRepository.saveRegexRules(presets)
      set({ regexPresets: presets, loading: false })
      return preset
    } catch (err) { set({ error: (err as Error).message, loading: false }); throw err }
  },

  updateRegexPreset: async (id, input) => {
    set({ loading: true, error: null })
    try {
      const presets = get().regexPresets.map((p) => {
        if (p.id !== id) return p
        const updated = { ...p, updatedAt: new Date().toISOString() }
        if (input.name !== undefined) updated.name = input.name
        if (input.description !== undefined) updated.description = input.description
        if (input.isGlobal !== undefined) updated.isGlobal = input.isGlobal
        return updated
      })
      await settingsRepository.saveRegexRules(presets)
      set({ regexPresets: presets, loading: false })
      return presets.find((p) => p.id === id)!
    } catch (err) { set({ error: (err as Error).message, loading: false }); throw err }
  },

  deleteRegexPreset: async (id) => {
    set({ loading: true, error: null })
    try {
      const presets = get().regexPresets.filter((p) => p.id !== id)
      await settingsRepository.saveRegexRules(presets)
      const nextActive = get().activeRegexPresetId === id ? null : get().activeRegexPresetId
      if (get().activeRegexPresetId === id && presets.length > 0) {
        await settingsRepository.setActiveRegexPresetId(presets[0].id)
        set({ regexPresets: presets, activeRegexPresetId: presets[0].id, loading: false })
      } else {
        if (get().activeRegexPresetId === id) await settingsRepository.setActiveRegexPresetId(null)
        set({ regexPresets: presets, activeRegexPresetId: nextActive, loading: false })
      }
    } catch (err) { set({ error: (err as Error).message, loading: false }); throw err }
  },

  setActiveRegexPreset: async (id) => {
    await settingsRepository.setActiveRegexPresetId(id)
    set({ activeRegexPresetId: id })
  },

  addRegexRule: async (presetId, input) => {
    set({ error: null })
    try {
      const now = new Date().toISOString()
      const rule: RegexRule = { id: generateId(), presetId, name: input.name, pattern: input.pattern, displayTemplate: input.displayTemplate, stripFromPrompt: input.stripFromPrompt, enabled: input.enabled, createdAt: now }
      const presets = get().regexPresets.map((p) => {
        if (p.id !== presetId) return p
        return { ...p, rules: [...p.rules, rule], updatedAt: now }
      })
      await settingsRepository.saveRegexRules(presets)
      set({ regexPresets: presets })
      return rule
    } catch (err) { set({ error: (err as Error).message }); throw err }
  },

  updateRegexRule: async (presetId, ruleId, input) => {
    set({ error: null })
    try {
      const presets = get().regexPresets.map((p) => {
        if (p.id !== presetId) return p
        const rules = p.rules.map((r) => {
          if (r.id !== ruleId) return r
          const updated = { ...r }
          if (input.name !== undefined) updated.name = input.name
          if (input.pattern !== undefined) updated.pattern = input.pattern
          if (input.displayTemplate !== undefined) updated.displayTemplate = input.displayTemplate
          if (input.stripFromPrompt !== undefined) updated.stripFromPrompt = input.stripFromPrompt
          if (input.enabled !== undefined) updated.enabled = input.enabled
          return updated
        })
        return { ...p, rules, updatedAt: new Date().toISOString() }
      })
      await settingsRepository.saveRegexRules(presets)
      set({ regexPresets: presets })
      const preset = presets.find((p) => p.id === presetId)!
      return preset.rules.find((r) => r.id === ruleId)!
    } catch (err) { set({ error: (err as Error).message }); throw err }
  },

  deleteRegexRule: async (presetId, ruleId) => {
    set({ error: null })
    try {
      const presets = get().regexPresets.map((p) => {
        if (p.id !== presetId) return p
        return { ...p, rules: p.rules.filter((r) => r.id !== ruleId), updatedAt: new Date().toISOString() }
      })
      await settingsRepository.saveRegexRules(presets)
      set({ regexPresets: presets })
    } catch (err) { set({ error: (err as Error).message }); throw err }
  },

  toggleRegexRule: async (presetId, ruleId) => {
    const preset = get().regexPresets.find((p) => p.id === presetId)
    if (!preset) return
    const rule = preset.rules.find((r) => r.id === ruleId)
    if (!rule) return
    await get().updateRegexRule(presetId, ruleId, { enabled: !rule.enabled })
  },

  setContextTokens: (tokens: number) => {
    void settingsRepository.set('contextTokens', String(tokens))
    set({ contextTokens: tokens })
  },

  loadPersona: async () => {
    const persona = await settingsRepository.loadPersona()
    set({ personaName: persona.name, personaDesc: persona.desc })
  },

  savePersona: (name: string, desc: string) => {
    void settingsRepository.savePersona({ name, desc })
    set({ personaName: name, personaDesc: desc })
  },
}))
