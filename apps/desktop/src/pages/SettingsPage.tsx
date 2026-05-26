import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Plug, Sun, Moon, Monitor, Palette, Trash2, Plus, Regex, SlidersHorizontal, CheckCircle2, Globe, Download } from 'lucide-react'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, ScrollArea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@neo-tavern/ui'
import { useSettingsStore } from '@/features/settings/settings.store'
import { useTheme } from '@/app/theme'
import { getStorageItem, setStorageItem } from '@/db/storage'

function toast(type: 'success' | 'error' | 'info', message: string) {
  const fn = (window as any).__toast
  if (fn) fn(type, message)
}

type Section = 'api' | 'appearance' | 'regex' | 'context'

const sections: { key: Section; icon: typeof Plug; label: string }[] = [
  { key: 'api', icon: Plug, label: 'API Connection' },
  { key: 'appearance', icon: Palette, label: 'Appearance' },
  { key: 'context', icon: SlidersHorizontal, label: 'Context' },
  { key: 'regex', icon: Regex, label: 'Regex Rules' },
]

const themes = [
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
  { value: 'system' as const, icon: Monitor, label: 'System' },
]

function fillForm(cfg: {
  name: string; baseUrl: string; apiKey: string; model: string
  temperature: number; maxTokens: number
  reasoningEffort?: string
}) {
  setFormName(cfg.name)
  setFormBaseUrl(cfg.baseUrl)
  setFormApiKey(cfg.apiKey)
  setFormModel(cfg.model)
  setFormTemperature(String(cfg.temperature))
  setFormMaxTokens(String(cfg.maxTokens))
  setFormReasoningEffort(cfg.reasoningEffort || '')
}

let setFormName: (v: string) => void = () => {}
let setFormBaseUrl: (v: string) => void = () => {}
let setFormApiKey: (v: string) => void = () => {}
let setFormModel: (v: string) => void = () => {}
let setFormTemperature: (v: string) => void = () => {}
let setFormMaxTokens: (v: string) => void = () => {}
let setFormReasoningEffort: (v: string) => void = () => {}

export function SettingsPage() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [section, setSection] = useState<Section>('api')

  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const activeConfigId = useSettingsStore((s) => s.activeConfigId)
  const saving = useSettingsStore((s) => s.saving)
  const testing = useSettingsStore((s) => s.testing)
  const error = useSettingsStore((s) => s.error)
  const loadAllConfigs = useSettingsStore((s) => s.loadAllConfigs)
  const selectConfig = useSettingsStore((s) => s.selectConfig)
  const saveModelConfig = useSettingsStore((s) => s.saveModelConfig)
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig)
  const deleteModelConfigFromStore = useSettingsStore((s) => s.deleteModelConfig)
  const testConnection = useSettingsStore((s) => s.testConnection)
  const regexPresets = useSettingsStore((s) => s.regexPresets)
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId)
  const loadRegexRules = useSettingsStore((s) => s.loadRegexRules)
  const createRegexPreset = useSettingsStore((s) => s.createRegexPreset)
  const updateRegexPreset = useSettingsStore((s) => s.updateRegexPreset)
  const deleteRegexPresetFromStore = useSettingsStore((s) => s.deleteRegexPreset)
  const setActiveRegexPreset = useSettingsStore((s) => s.setActiveRegexPreset)
  const addRegexRule = useSettingsStore((s) => s.addRegexRule)
  const updateRegexRuleFromStore = useSettingsStore((s) => s.updateRegexRule)
  const deleteRegexRuleFromStore = useSettingsStore((s) => s.deleteRegexRule)
  const toggleRegexRule = useSettingsStore((s) => s.toggleRegexRule)
  const contextTokens = useSettingsStore((s) => s.contextTokens)
  const setContextTokens = useSettingsStore((s) => s.setContextTokens)

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.8')
  const [maxTokens, setMaxTokens] = useState('800')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('__new__')

  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [easterEggClicks, setEasterEggClicks] = useState(0)
  const [secretUnlocked, setSecretUnlocked] = useState(false)

  setFormName = setName
  setFormBaseUrl = setBaseUrl
  setFormApiKey = setApiKey
  setFormModel = setModel
  setFormTemperature = setTemperature
  setFormMaxTokens = setMaxTokens
  setFormReasoningEffort = setReasoningEffort

  const [selectedRegexPresetId, setSelectedRegexPresetId] = useState<string | null>(null)
  const [regexPresetName, setRegexPresetName] = useState('')
  const [regexPresetDesc, setRegexPresetDesc] = useState('')
  const [regexDeleteTarget, setRegexDeleteTarget] = useState<typeof regexPresets[0] | null>(null)

  const [regexName, setRegexName] = useState('')
  const [regexPattern, setRegexPattern] = useState('')
  const [regexTemplate, setRegexTemplate] = useState('')
  const [regexStrip, setRegexStrip] = useState(true)
  const [regexEnabled, setRegexEnabled] = useState(true)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await loadAllConfigs()
      if (cancelled) return
      const state = useSettingsStore.getState()
      if (state.modelConfig) {
        const c = state.modelConfig
        fillForm(c)
        setSelectedId(c.id)
      } else {
        setSelectedId('__new__')
      }
      setLoaded(true)
    }
    load()
    loadRegexRules()
    getStorageItem('neotavern_secret_unlocked').then((value) => {
      if (!cancelled) setSecretUnlocked(value === '1')
    })
    return () => { cancelled = true }
  }, [])

  const applyConfigSelection = (id: string) => {
    setSelectedId(id)
    if (id === '__new__') {
      setName('')
      setBaseUrl('')
      setApiKey('')
      setModel('')
      setTemperature('0.8')
      setMaxTokens('800')
      return
    }
    const cfg = modelConfigs.find((c) => c.id === id)
    if (cfg) {
      selectConfig(id)
      fillForm(cfg)
    }
  }

  const handleSave = async () => {
    try {
      const temp = parseFloat(temperature) || 0.8
      const tokens = parseInt(maxTokens) || 800
      const re = reasoningEffort || undefined
      if (selectedId !== '__new__' && modelConfigs.some((c) => c.id === selectedId)) {
        await updateModelConfig(selectedId, { baseUrl, apiKey, model, name, temperature: temp, maxTokens: tokens, reasoningEffort: re })
        toast('success', `"${name || 'Configuration'}" updated.`)
      } else {
        const cfg = await saveModelConfig({ provider: 'openai-compatible', baseUrl, apiKey, model, name, temperature: temp, maxTokens: tokens, reasoningEffort: re })
        setSelectedId(cfg.id)
        toast('success', `"${name || 'Configuration'}" saved.`)
      }
    } catch {
      toast('error', error || 'Failed to save configuration.')
    }
  }

  const handleDelete = async () => {
    if (selectedId === '__new__') return
    const cfg = modelConfigs.find((c) => c.id === selectedId)
    if (!cfg) return
    try {
      await deleteModelConfigFromStore(selectedId)
      const state = useSettingsStore.getState()
      if (state.modelConfig) {
        fillForm(state.modelConfig)
        setSelectedId(state.modelConfig.id)
      } else {
        setName(''); setBaseUrl(''); setApiKey(''); setModel('')
        setTemperature('0.8'); setMaxTokens('800')
        setSelectedId('__new__')
      }
      toast('info', `"${cfg.name || 'Configuration'}" deleted.`)
    } catch {
      toast('error', error || 'Failed to delete.')
    }
  }

  const handleTestConnection = async () => {
    if (!baseUrl.trim()) { toast('error', 'Please enter a Base URL first.'); return }
    const result = await testConnection(baseUrl, apiKey, model || 'gpt-4o-mini')
    if (result.ok) toast('success', result.message)
    else toast('error', result.message)
  }

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) { toast('error', 'Please enter a Base URL first.'); return }
    setFetchingModels(true)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map((m) => m.id).sort((a, b) => a.localeCompare(b))
      if (models.length === 0) { toast('error', 'No models returned from API'); return }
      setAvailableModels(models)
      if (!model || !models.includes(model)) setModel(models[0])
      toast('success', `Loaded ${models.length} models`)
    } catch (err) {
      toast('error', `Failed: ${(err as Error).message}`)
    } finally {
      setFetchingModels(false)
    }
  }

  const handleContextEasterEgg = () => {
    if (secretUnlocked) { setSection('context'); return }
    const next = easterEggClicks + 1
    setEasterEggClicks(next)
    if (next >= 10) {
      void setStorageItem('neotavern_secret_unlocked', '1')
      setSecretUnlocked(true)
      window.dispatchEvent(new Event('neotavern-secret-changed'))
      toast('success', '🔓 Secret unlocked! Check the writing preset.')
    }
    setSection('context')
  }

  const selectedRegexPreset = regexPresets.find((p) => p.id === selectedRegexPresetId) ?? null
  const selectedRules = selectedRegexPreset ? [...selectedRegexPreset.rules] : []

  const handleSelectRegexPreset = (id: string) => {
    setSelectedRegexPresetId(id)
    const preset = regexPresets.find((p) => p.id === id)
    if (preset) {
      setRegexPresetName(preset.name)
      setRegexPresetDesc(preset.description)
    }
    resetRuleForm()
  }

  const handleCreateRegexPreset = async () => {
    try {
      const p = await createRegexPreset({ name: 'New Regex Preset', description: '' })
      setSelectedRegexPresetId(p.id)
    } catch { toast('error', 'Failed') }
  }

  const handleSaveRegexPresetMeta = async () => {
    if (!selectedRegexPresetId) return
    try {
      await updateRegexPreset(selectedRegexPresetId, { name: regexPresetName, description: regexPresetDesc })
      toast('success', 'Saved')
    } catch { toast('error', 'Failed') }
  }

  const handleDeleteRegexPreset = async () => {
    if (!regexDeleteTarget) return
    try {
      await deleteRegexPresetFromStore(regexDeleteTarget.id)
      if (selectedRegexPresetId === regexDeleteTarget.id) {
        setSelectedRegexPresetId(null)
        setRegexPresetName('')
        setRegexPresetDesc('')
      }
      setRegexDeleteTarget(null)
      toast('info', `"${regexDeleteTarget.name}" deleted`)
    } catch { toast('error', 'Failed') }
  }

  const handleActivateRegexPreset = async () => {
    if (!selectedRegexPresetId) return
    const newId = activeRegexPresetId === selectedRegexPresetId ? null : selectedRegexPresetId
    await setActiveRegexPreset(newId)
    toast('info', newId ? `Activated "${selectedRegexPreset?.name}"` : 'Deactivated')
  }

  const handleToggleGlobalRegex = async () => {
    if (!selectedRegexPresetId || !selectedRegexPreset) return
    await updateRegexPreset(selectedRegexPresetId, { isGlobal: !selectedRegexPreset.isGlobal })
    toast('info', selectedRegexPreset.isGlobal ? 'Removed global flag' : 'Set as global regex')
  }

  const resetRuleForm = () => {
    setEditingRuleId(null)
    setRegexName('')
    setRegexPattern('')
    setRegexTemplate('')
    setRegexStrip(true)
    setRegexEnabled(true)
  }

  const startEditRule = (rule: { id: string; name: string; pattern: string; displayTemplate: string; stripFromPrompt: boolean; enabled: boolean }) => {
    setEditingRuleId(rule.id)
    setRegexName(rule.name)
    setRegexPattern(rule.pattern)
    setRegexTemplate(rule.displayTemplate)
    setRegexStrip(rule.stripFromPrompt)
    setRegexEnabled(rule.enabled)
  }

  const handleSaveRule = () => {
    if (!selectedRegexPresetId || !regexName.trim() || !regexPattern.trim()) {
      toast('error', 'Name and Pattern are required')
      return
    }
    try { new RegExp(regexPattern, 'gs') } catch { toast('error', 'Invalid regex pattern'); return }
    try {
      if (editingRuleId) {
        updateRegexRuleFromStore(selectedRegexPresetId, editingRuleId, {
          name: regexName.trim(), pattern: regexPattern.trim(), displayTemplate: regexTemplate,
          stripFromPrompt: regexStrip, enabled: regexEnabled,
        })
        toast('success', `"${regexName}" updated`)
      } else {
        addRegexRule(selectedRegexPresetId, {
          name: regexName.trim(), pattern: regexPattern.trim(), displayTemplate: regexTemplate,
          stripFromPrompt: regexStrip, enabled: regexEnabled,
        })
        toast('success', `"${regexName}" added`)
      }
      resetRuleForm()
    } catch { toast('error', 'Failed') }
  }

  const handleDeleteRule = (ruleId: string) => {
    if (!selectedRegexPresetId) return
    const rule = selectedRules.find((r) => r.id === ruleId)
    deleteRegexRuleFromStore(selectedRegexPresetId, ruleId)
    if (editingRuleId === ruleId) resetRuleForm()
    toast('info', `"${rule?.name || 'Rule'}" deleted`)
  }

  const handleToggleRule = (ruleId: string) => {
    if (!selectedRegexPresetId) return
    toggleRegexRule(selectedRegexPresetId, ruleId)
  }

  return (
    <div className="flex h-full">
      <div className="w-48 border-r p-4 flex flex-col gap-1">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 px-2">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        {sections.map((s) => (
          <button key={s.key}
            onClick={() => s.key === 'context' ? handleContextEasterEgg() : setSection(s.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
              ${section === s.key ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
          ><s.icon className="h-4 w-4" />{s.label}</button>
        ))}
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {section === 'api' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" />API Connection</CardTitle>
              <CardDescription>Configure your OpenAI-compatible API endpoint. Save multiple configs and switch between them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!loaded && <p className="text-sm text-muted-foreground animate-pulse">Loading saved configurations...</p>}

              <div>
                <Label htmlFor="config-select">Saved Configurations</Label>
                <div className="flex gap-2">
                  <select id="config-select" value={selectedId} onChange={(e) => applyConfigSelection(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="__new__">+ New Configuration</option>
                    {modelConfigs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.model || c.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  {selectedId !== '__new__' && (
                    <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {selectedId !== '__new__' && activeConfigId === selectedId && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Active — used in chats</p>
                )}
              </div>

              <div>
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input id="config-name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="My API Config" />
              </div>
              <div>
                <Label htmlFor="base-url">Base URL</Label>
                <Input id="base-url" value={baseUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
                <p className="text-xs text-muted-foreground mt-1">e.g. https://api.openai.com/v1 or http://localhost:11434/v1 for Ollama</p>
              </div>
              <div>
                <Label htmlFor="api-key">API Key</Label>
                <Input id="api-key" type="password" value={apiKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)} placeholder="sk-..." />
              </div>
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="model">Model</Label>
                    {availableModels.length > 0 ? (
                      <select id="model" value={model} onChange={(e) => setModel(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {availableModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <Input id="model" value={model} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleFetchModels} disabled={fetchingModels} className="shrink-0">
                    <Download className="h-3.5 w-3.5 mr-1" />{fetchingModels ? 'Loading...' : 'Fetch'}
                  </Button>
                </div>
                {availableModels.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{availableModels.length} models available</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input id="temperature" value={temperature} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemperature(e.target.value)} placeholder="0.8" type="number" step="0.1" min="0" max="2" />
                </div>
                <div>
                  <Label htmlFor="max-tokens">Max Tokens</Label>
                  <Input id="max-tokens" value={maxTokens} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxTokens(e.target.value)} placeholder="800" type="number" min="1" max="128000" />
                </div>
              </div>
              <div>
                <Label htmlFor="reasoning-effort">Reasoning Effort</Label>
                <select
                  id="reasoning-effort"
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Off</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">Relevant for o1/o3 reasoning models. Leave off for most models.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Configuration'}
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                  <Plug className="h-4 w-4 mr-2" />{testing ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'appearance' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}Appearance
              </CardTitle>
              <CardDescription>Choose your preferred color scheme. Changes apply instantly.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {themes.map((t) => (
                  <button key={t.value} onClick={() => setTheme(t.value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors
                      ${theme === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}
                  ><t.icon className="h-5 w-5" /><span className="text-sm font-medium">{t.label}</span></button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'context' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" />Context Tokens</CardTitle>
              <CardDescription>Max token budget for chat history. Messages are trimmed from oldest to newest until the budget is met. Set to 0 for unlimited.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="131072"
                  step="512"
                  value={contextTokens}
                  onChange={(e) => setContextTokens(parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-full appearance-none bg-muted-foreground/20 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="text-2xl font-bold tabular-nums min-w-[70px] text-center">{contextTokens === 0 ? '∞' : (contextTokens >= 1000 ? (contextTokens / 1000).toFixed(contextTokens % 1000 === 0 ? 0 : 1) + 'k' : contextTokens)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>∞</span>
                <span>32k</span>
                <span>64k</span>
                <span>128k</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[
                  { label: 'Minimal', value: 2048, desc: '~512 words' },
                  { label: 'Short', value: 8192, desc: '~2k words' },
                  { label: 'Medium', value: 32768, desc: '~8k words' },
                  { label: 'Full', value: 0, desc: 'Unlimited' },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setContextTokens(preset.value)}
                    className={`rounded-lg border p-2 text-center transition-colors ${contextTokens === preset.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}
                  >
                    <p className="text-xs font-medium">{preset.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Token estimation uses ~4 chars per token. Actual token count depends on the model&apos;s tokenizer.
              </p>
            </CardContent>
          </Card>
        )}

        {section === 'regex' && (
          <div className="flex h-full -m-6">
            <div className="w-52 border-r p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presets</h2>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCreateRegexPreset}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              <ScrollArea className="flex-1 -mx-2 px-2">
                <div className="flex flex-col gap-0.5">
                  {regexPresets.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">No presets</p>
                  )}
                  {regexPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectRegexPreset(p.id)}
                      className={`text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-1
                        ${selectedRegexPresetId === p.id ? 'bg-accent text-foreground font-medium' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}`}
                    >
                      <span className="truncate text-xs">{p.name}</span>
                      {activeRegexPresetId === p.id && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {!selectedRegexPreset ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center space-y-2">
                    <p>Select a preset or create one</p>
                    <Button variant="outline" size="sm" onClick={handleCreateRegexPreset}><Plus className="h-3.5 w-3.5 mr-1" />New Preset</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 pb-2 shrink-0 border-b">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 space-y-1.5">
                        <Input value={regexPresetName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegexPresetName(e.target.value)} className="border-0 border-b rounded-none px-0 h-auto text-lg font-bold focus-visible:ring-0" placeholder="Preset name" />
                        <Input value={regexPresetDesc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegexPresetDesc(e.target.value)} className="border-0 border-b rounded-none px-0 h-auto text-xs text-muted-foreground focus-visible:ring-0" placeholder="Description" />
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={handleSaveRegexPresetMeta}>Save</Button>
                        <Button size="sm" variant={selectedRegexPreset?.isGlobal ? 'default' : 'outline'} onClick={handleToggleGlobalRegex} title="Toggle global regex">
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant={activeRegexPresetId === selectedRegexPresetId ? 'default' : 'outline'} onClick={handleActivateRegexPreset}>
                          {activeRegexPresetId === selectedRegexPresetId ? 'Active' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRegexDeleteTarget(selectedRegexPreset)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 shrink-0 border-b">
                    <h3 className="text-sm font-semibold mb-3">{editingRuleId ? 'Edit Rule' : 'Add Rule'}</h3>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <Input value={regexName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegexName(e.target.value)} placeholder="Rule name" className="text-xs" />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <button type="button" role="switch" aria-checked={regexEnabled} onClick={() => setRegexEnabled(!regexEnabled)}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${regexEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${regexEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                          </button>
                          <span className="text-[10px]">On</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <button type="button" role="switch" aria-checked={regexStrip} onClick={() => setRegexStrip(!regexStrip)}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${regexStrip ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${regexStrip ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                          </button>
                          <span className="text-[10px]">Strip</span>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <Input value={regexPattern} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegexPattern(e.target.value)} placeholder='e.g. <summary>([\s\S]*?)</summary>' className="font-mono text-[10px]" />
                      <Input value={regexTemplate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegexTemplate(e.target.value)} placeholder='e.g. $1' className="font-mono text-[10px]" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveRule}>{editingRuleId ? 'Update' : 'Add'} Rule</Button>
                      {editingRuleId && <Button size="sm" variant="outline" onClick={resetRuleForm}>Cancel</Button>}
                      <Button size="sm" variant="outline" className="ml-auto text-[10px]" onClick={() => {
                        resetRuleForm()
                        setRegexName('Summary')
                        setRegexPattern('<summary>([\\s\\S]*?)<\\/summary>')
                        setRegexTemplate('$1')
                        setRegexStrip(true)
                        setRegexEnabled(true)
                      }}>Quick: Summary</Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-1.5">
                      {selectedRules.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">No rules yet</p>
                      )}
                      {selectedRules.map((rule) => (
                        <div key={rule.id} className={`flex items-center gap-2 p-2 rounded-lg ${!rule.enabled ? 'opacity-40' : 'hover:bg-accent/50'}`}>
                          <button type="button" role="switch" aria-checked={rule.enabled}
                            onClick={() => handleToggleRule(rule.id)}
                            className={`shrink-0 relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">{rule.name}</span>
                              {rule.stripFromPrompt && <span className="text-[8px] bg-muted px-1 py-0.5 rounded font-mono shrink-0">strip</span>}
                            </div>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">{rule.pattern}</p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditRule(rule)}><span className="text-[10px]">✎</span></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteRule(rule.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          </div>
        )}

        <Dialog open={!!regexDeleteTarget} onOpenChange={() => setRegexDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Regex Preset</DialogTitle>
              <DialogDescription>Delete "{regexDeleteTarget?.name}" and all its rules? This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRegexDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteRegexPreset}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}
