import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Plug, Sun, Moon, Monitor, Palette, Trash2, Plus, Regex, SlidersHorizontal, CheckCircle2, Globe, KeyRound, Server, Zap, BookOpen, Image as ImageIcon, Upload, Bug, Wallet, Bell } from 'lucide-react'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, ScrollArea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Textarea } from '@neo-tavern/ui'
import { useSettingsStore } from '@/features/settings/settings.store'
import { useThemeStore } from '@/app/theme.store'
import { getStorageItem, setStorageItem } from '@/db/storage'
import { generateComfyImage, IMAGE_GENERATION_PARAMETER_PRESETS, IMAGE_RESOLUTION_OPTIONS, IMAGE_SAMPLER_OPTIONS, IMAGE_SCHEDULER_OPTIONS, normalizeImageSettings, testComfyConnection } from '@/features/image-generation/image-generation'
import { fetchDeepSeekBalance, formatCnyCost, formatCnyExact, type DeepSeekBalanceResult } from '@/features/billing/deepseek-billing'
import { DAILY_COST_WARNING_RATIO } from '@/features/billing/daily-cost'
import { isDeepSeekProModel } from '@/features/settings/model-capabilities'

function toast(type: 'success' | 'error' | 'info', message: string) {
  const fn = (window as any).__toast
  if (fn) fn(type, message)
}

type Section = 'general' | 'api' | 'appearance' | 'regex' | 'context' | 'image'

const sections: { key: Section; icon: typeof Plug; label: string }[] = [
  { key: 'general', icon: Bug, label: 'General' },
  { key: 'api', icon: Plug, label: 'DeepSeek API' },
  { key: 'appearance', icon: Palette, label: 'Appearance' },
  { key: 'context', icon: SlidersHorizontal, label: 'Context' },
  { key: 'image', icon: ImageIcon, label: 'Image Gen' },
  { key: 'regex', icon: Regex, label: 'Regex Rules' },
]

const themes = [
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
  { value: 'sepia' as const, icon: BookOpen, label: 'Eye Care' },
  { value: 'system' as const, icon: Monitor, label: 'System' },
]

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEFAULT_DEEPSEEK_CONFIG_NAME = 'DeepSeek V4 Flash'
const DEEPSEEK_LEGACY_MODELS = ['deepseek-chat', 'deepseek-reasoner']

const DEEPSEEK_MODEL_OPTIONS = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    badge: 'Recommended',
    description: 'Best first choice for daily chat and roleplay. Lower cost.',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    badge: 'Pro',
    description: 'Use for deeper reasoning and complex writing. Higher cost.',
  },
] as const

function fillForm(cfg: {
  name: string; baseUrl: string; apiKey: string; model: string
  temperature: number; maxTokens: number
  reasoningEffort?: string; streamingEnabled?: boolean
}) {
  setFormName(cfg.name)
  setFormBaseUrl(cfg.baseUrl)
  setFormApiKey(cfg.apiKey)
  setFormModel(cfg.model)
  setFormTemperature(String(cfg.temperature))
  setFormMaxTokens(String(cfg.maxTokens))
  setFormReasoningEffort(cfg.reasoningEffort || '')
  setFormStreamingEnabled(cfg.streamingEnabled !== false)
}

let setFormName: (v: string) => void = () => {}
let setFormBaseUrl: (v: string) => void = () => {}
let setFormApiKey: (v: string) => void = () => {}
let setFormModel: (v: string) => void = () => {}
let setFormTemperature: (v: string) => void = () => {}
let setFormMaxTokens: (v: string) => void = () => {}
let setFormReasoningEffort: (v: string) => void = () => {}
let setFormStreamingEnabled: (v: boolean) => void = () => {}

function SwitchButton({
  checked,
  onClick,
  label,
}: {
  checked: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
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
  const lightweightMemoryEnabled = useSettingsStore((s) => s.lightweightMemoryEnabled)
  const promptRecentTurns = useSettingsStore((s) => s.promptRecentTurns)
  const memorySummaryMaxChars = useSettingsStore((s) => s.memorySummaryMaxChars)
  const memoryCompressorConfigId = useSettingsStore((s) => s.memoryCompressorConfigId)
  const loadMemorySettings = useSettingsStore((s) => s.loadMemorySettings)
  const setLightweightMemoryEnabled = useSettingsStore((s) => s.setLightweightMemoryEnabled)
  const setPromptRecentTurns = useSettingsStore((s) => s.setPromptRecentTurns)
  const setMemorySummaryMaxChars = useSettingsStore((s) => s.setMemorySummaryMaxChars)
  const setMemoryCompressorConfigId = useSettingsStore((s) => s.setMemoryCompressorConfigId)
  const imageGeneration = useSettingsStore((s) => s.imageGeneration)
  const loadImageGenerationSettings = useSettingsStore((s) => s.loadImageGenerationSettings)
  const updateImageGenerationSettings = useSettingsStore((s) => s.updateImageGenerationSettings)
  const debugMode = useSettingsStore((s) => s.debugMode)
  const setDebugMode = useSettingsStore((s) => s.setDebugMode)
  const dailyCostWarningEnabled = useSettingsStore((s) => s.dailyCostWarningEnabled)
  const dailyCostWarningLimitCny = useSettingsStore((s) => s.dailyCostWarningLimitCny)
  const dailyCostSpentCny = useSettingsStore((s) => s.dailyCostSpentCny)
  const loadDailyCostWarningSettings = useSettingsStore((s) => s.loadDailyCostWarningSettings)
  const loadDailyCostSpent = useSettingsStore((s) => s.loadDailyCostSpent)
  const setDailyCostWarningEnabled = useSettingsStore((s) => s.setDailyCostWarningEnabled)
  const setDailyCostWarningLimitCny = useSettingsStore((s) => s.setDailyCostWarningLimitCny)

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.8')
  const [maxTokens, setMaxTokens] = useState('4096')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [streamingEnabled, setStreamingEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('__new__')

  const [checkingBalance, setCheckingBalance] = useState(false)
  const [deepSeekBalance, setDeepSeekBalance] = useState<DeepSeekBalanceResult | null>(null)
  const [easterEggClicks, setEasterEggClicks] = useState(0)
  const [secretUnlocked, setSecretUnlocked] = useState(false)
  const workflowFileInputRef = useRef<HTMLInputElement>(null)
  const [testingComfyConnection, setTestingComfyConnection] = useState(false)
  const [testingComfyImage, setTestingComfyImage] = useState(false)
  const [comfyTestMessage, setComfyTestMessage] = useState('')
  const [comfyTestImage, setComfyTestImage] = useState<string | null>(null)

  setFormName = setName
  setFormBaseUrl = setBaseUrl
  setFormApiKey = setApiKey
  setFormModel = setModel
  setFormTemperature = setTemperature
  setFormMaxTokens = setMaxTokens
  setFormReasoningEffort = setReasoningEffort
  setFormStreamingEnabled = setStreamingEnabled

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

  const resetDeepSeekForm = () => {
    setName(DEFAULT_DEEPSEEK_CONFIG_NAME)
    setBaseUrl(DEEPSEEK_BASE_URL)
    setApiKey('')
    setModel(DEFAULT_DEEPSEEK_MODEL)
    setTemperature('0.8')
    setMaxTokens('4096')
    setReasoningEffort('')
    setStreamingEnabled(true)
    setDeepSeekBalance(null)
  }

  const handleWorkflowFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      updateImageGenerationSettings({ comfyWorkflowJson: JSON.stringify(parsed, null, 2) })
      toast('success', `Imported workflow "${file.name}"`)
    } catch {
      toast('error', 'Invalid ComfyUI workflow JSON')
    }
  }

  const applyImageParameterPreset = (presetId: string) => {
    const preset = IMAGE_GENERATION_PARAMETER_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    updateImageGenerationSettings({
      generationPreset: preset.id,
      ...preset.settings,
    })
  }

  const resolutionSelectValue = IMAGE_RESOLUTION_OPTIONS.some((option) => (
    option.width === imageGeneration.width && option.height === imageGeneration.height
  ))
    ? `${imageGeneration.width}x${imageGeneration.height}`
    : 'custom'

  const handleImageResolutionChange = (value: string) => {
    const option = IMAGE_RESOLUTION_OPTIONS.find((item) => `${item.width}x${item.height}` === value)
    if (!option) return
    updateImageGenerationSettings({
      width: option.width,
      height: option.height,
      generationPreset: 'custom',
    })
  }

  const handleTestComfyConnection = async () => {
    setTestingComfyConnection(true)
    setComfyTestMessage('')
    try {
      const result = await testComfyConnection(normalizeImageSettings(imageGeneration))
      const deviceText = result.devices > 0 ? `${result.devices} device${result.devices === 1 ? '' : 's'}` : 'no device info'
      setComfyTestMessage(`Connected: ${result.system}, ${deviceText}`)
      toast('success', 'ComfyUI connected')
    } catch (err) {
      const message = (err as Error).message || 'ComfyUI connection failed'
      setComfyTestMessage(message)
      toast('error', message)
    } finally {
      setTestingComfyConnection(false)
    }
  }

  const handleTestComfyImage = async () => {
    setTestingComfyImage(true)
    setComfyTestImage(null)
    setComfyTestMessage('Generating test image...')
    try {
      const image = await generateComfyImage(
        'masterpiece, cozy fantasy tavern library, warm lantern light, open book on wooden table, cinematic composition, highly detailed',
        normalizeImageSettings(imageGeneration)
      )
      setComfyTestImage(image)
      setComfyTestMessage('Test image generated successfully.')
      toast('success', 'ComfyUI image generated')
    } catch (err) {
      const message = (err as Error).message || 'ComfyUI image test failed'
      setComfyTestMessage(message)
      toast('error', message)
    } finally {
      setTestingComfyImage(false)
    }
  }

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
        resetDeepSeekForm()
      }
      setLoaded(true)
    }
    load()
    loadRegexRules()
    loadMemorySettings()
    loadImageGenerationSettings()
    loadDailyCostWarningSettings()
    loadDailyCostSpent()
    getStorageItem('neotavern_secret_unlocked').then((value) => {
      if (!cancelled) setSecretUnlocked(value === '1')
    })
    return () => { cancelled = true }
  }, [])

  const applyConfigSelection = (id: string) => {
    setSelectedId(id)
    if (id === '__new__') {
      resetDeepSeekForm()
      return
    }
    const cfg = modelConfigs.find((c) => c.id === id)
    if (cfg) {
      selectConfig(id)
      fillForm(cfg)
      setDeepSeekBalance(null)
    }
  }

  const handleSave = async () => {
    try {
      const temp = parseFloat(temperature) || 0.8
      const tokens = parseInt(maxTokens) || 4096
      const re = reasoningEffort || undefined
      const nextName = name.trim() || DEFAULT_DEEPSEEK_CONFIG_NAME
      const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL
      const nextApiKey = apiKey.trim()
      const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL
      const nextStreamingEnabled = streamingEnabled
      if (!nextApiKey) {
        toast('error', 'Please enter your DeepSeek API key first.')
        return
      }
      if (selectedId !== '__new__' && modelConfigs.some((c) => c.id === selectedId)) {
        await updateModelConfig(selectedId, { baseUrl: nextBaseUrl, apiKey: nextApiKey, model: nextModel, name: nextName, temperature: temp, maxTokens: tokens, reasoningEffort: re, streamingEnabled: nextStreamingEnabled })
        setName(nextName)
        setBaseUrl(nextBaseUrl)
        setApiKey(nextApiKey)
        setModel(nextModel)
        toast('success', `"${nextName}" updated.`)
      } else {
        const cfg = await saveModelConfig({ provider: 'openai-compatible', baseUrl: nextBaseUrl, apiKey: nextApiKey, model: nextModel, name: nextName, temperature: temp, maxTokens: tokens, reasoningEffort: re, streamingEnabled: nextStreamingEnabled })
        setName(nextName)
        setBaseUrl(nextBaseUrl)
        setApiKey(nextApiKey)
        setModel(nextModel)
        setSelectedId(cfg.id)
        toast('success', `"${nextName}" saved.`)
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
        resetDeepSeekForm()
        setSelectedId('__new__')
      }
      toast('info', `"${cfg.name || 'Configuration'}" deleted.`)
    } catch {
      toast('error', error || 'Failed to delete.')
    }
  }

  const handleTestConnection = async () => {
    const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL
    const nextApiKey = apiKey.trim()
    const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL
    if (!nextApiKey) {
      toast('error', 'Please enter your DeepSeek API key first.')
      return
    }
    setBaseUrl(nextBaseUrl)
    setModel(nextModel)
    const result = await testConnection(nextBaseUrl, nextApiKey, nextModel)
    if (result.ok) toast('success', result.message)
    else toast('error', result.message)
  }

  const handleFetchBalance = async () => {
    const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL
    const nextApiKey = apiKey.trim()
    if (!nextApiKey) {
      toast('error', 'Please enter your DeepSeek API key first.')
      return
    }
    setBaseUrl(nextBaseUrl)
    setCheckingBalance(true)
    try {
      const result = await fetchDeepSeekBalance({ baseUrl: nextBaseUrl, apiKey: nextApiKey })
      setDeepSeekBalance(result)
      const cny = result.balances.find((item) => item.currency === 'CNY')
      toast('success', cny ? `DeepSeek balance: ${formatCnyCost(cny.totalBalance)}` : 'DeepSeek balance loaded')
    } catch (err) {
      toast('error', `Balance failed: ${(err as Error).message}`)
    } finally {
      setCheckingBalance(false)
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
  const isLegacyDeepSeekModel = DEEPSEEK_LEGACY_MODELS.includes(model)
  const dailyWarningAtCny = dailyCostWarningLimitCny * DAILY_COST_WARNING_RATIO
  const dailyCostRate = dailyCostWarningLimitCny > 0
    ? Math.min(999, (dailyCostSpentCny / dailyCostWarningLimitCny) * 100)
    : 0
  const compressorSelectValue = memoryCompressorConfigId && modelConfigs.some((c) => c.id === memoryCompressorConfigId)
    ? memoryCompressorConfigId
    : ''
  const selectedProfile = selectedId === '__new__'
    ? null
    : modelConfigs.find((c) => c.id === selectedId) ?? null
  const selectedProfileName = selectedProfile?.name || selectedProfile?.model || 'New profile'
  const displayBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL
  const temperatureLocked = isDeepSeekProModel(model)

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
        {section === 'general' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bug className="h-5 w-5" />General</CardTitle>
              <CardDescription>Debug and development settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Debug Mode</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Save every round&apos;s full prompt as a JSON file under the app data debug_prompts folder. Each file includes the built messages array, context blocks, and metadata.
                  </p>
                </div>
                <SwitchButton
                  checked={debugMode}
                  onClick={() => setDebugMode(!debugMode)}
                  label="Toggle debug prompt saving"
                />
              </div>
              {debugMode && (
                <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Each chat creates a subfolder named after the character and chat id. Prompt files include the usage round, trigger, attempt, and assistant id, for example <code className="rounded bg-muted px-1 py-0.5 text-[11px]">round_0003_continue_attempt_1_xxxxxxxx.json</code>.
                </p>
              )}
              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Bell className="h-4 w-4" />Daily Cost Warning
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Warn once when today&apos;s DeepSeek spend reaches 80% of the daily yuan limit.
                    </p>
                  </div>
                  <SwitchButton
                    checked={dailyCostWarningEnabled}
                    onClick={() => setDailyCostWarningEnabled(!dailyCostWarningEnabled)}
                    label="Toggle daily cost warning"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="daily-cost-limit">Daily limit (元/天)</Label>
                    <Input
                      id="daily-cost-limit"
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={dailyCostWarningLimitCny}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDailyCostWarningLimitCny(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="rounded-md border bg-accent/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Today spent</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyCostSpentCny)}>{formatCnyCost(dailyCostSpentCny)}</p>
                  </div>
                  <div className="rounded-md border bg-accent/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Warning at</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyWarningAtCny)}>{formatCnyCost(dailyWarningAtCny)}</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${dailyCostRate >= 80 ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, dailyCostRate)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'api' && (
          <div className="max-w-5xl space-y-4">
            <div className="border-b pb-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Official DeepSeek
                </div>
                <div>
                  <h1 className="flex items-center gap-2 text-2xl font-bold tracking-normal">
                    <Plug className="h-6 w-6" />DeepSeek API
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paste your API key, choose a model, then save. The official endpoint is already filled in.
                  </p>
                </div>
              </div>
            </div>

            {!loaded && <p className="text-sm text-muted-foreground animate-pulse">Loading saved DeepSeek profiles...</p>}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Quick Setup</CardTitle>
                  <CardDescription>For the default setup, only the API key and model choice need attention.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-2">
                      <Label htmlFor="api-key">API Key</Label>
                      <Input
                        id="api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="config-select">Profile</Label>
                      <div className="flex gap-2">
                        <select
                          id="config-select"
                          value={selectedId}
                          onChange={(e) => applyConfigSelection(e.target.value)}
                          className="min-w-0 flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="__new__">New profile</option>
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
                        <p className="text-xs text-green-600 dark:text-green-400">Active in chats</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <div className="grid gap-2 md:grid-cols-2">
                      {DEEPSEEK_MODEL_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setModel(option.id)
                            if (!name.trim() || name.startsWith('DeepSeek')) setName(option.label)
                          }}
                          className={`rounded-md border p-3 text-left transition-colors ${model === option.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-accent/50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{option.label}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${model === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{option.badge}</span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{option.id}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>
                    {isLegacyDeepSeekModel && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Legacy alias. Switch to a V4 model before July 24, 2026.</p>
                    )}
                  </div>

                  <details className="rounded-md border">
                    <summary className="cursor-pointer px-3 py-3 text-sm font-medium">Advanced options</summary>
                    <div className="space-y-4 border-t p-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="config-name">Profile name</Label>
                          <Input id="config-name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder={DEFAULT_DEEPSEEK_CONFIG_NAME} />
                        </div>
                        <div>
                          <Label htmlFor="model">Exact model ID</Label>
                          <Input id="model" value={model} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)} placeholder={DEFAULT_DEEPSEEK_MODEL} className="font-mono text-xs" />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="base-url">Base URL</Label>
                        <div className="relative">
                          <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="base-url" value={baseUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)} placeholder={DEEPSEEK_BASE_URL} className="pl-9 font-mono text-xs" />
                        </div>
                      </div>

                      <div className={`grid gap-4 ${temperatureLocked ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                        {!temperatureLocked && (
                          <div>
                            <Label htmlFor="temperature">Temperature</Label>
                            <Input id="temperature" value={temperature} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemperature(e.target.value)} placeholder="0.8" type="number" step="0.1" min="0" max="2" />
                          </div>
                        )}
                        <div>
                          <Label htmlFor="max-tokens">Max output</Label>
                          <Input id="max-tokens" value={maxTokens} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxTokens(e.target.value)} placeholder="4096" type="number" min="1" max="384000" />
                        </div>
                        <div>
                          <Label htmlFor="reasoning-effort">Reasoning</Label>
                          <select
                            id="reasoning-effort"
                            value={reasoningEffort}
                            onChange={(e) => setReasoningEffort(e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="">Default</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Live text</p>
                          <p className="mt-1 text-xs text-muted-foreground">Show output while it is generating.</p>
                        </div>
                        <SwitchButton
                          checked={streamingEnabled}
                          onClick={() => setStreamingEnabled(!streamingEnabled)}
                          label="Toggle live text display"
                        />
                      </div>
                    </div>
                  </details>

                  <div className="flex flex-col gap-2 rounded-md border bg-accent/30 p-3 sm:flex-row">
                    <Button onClick={handleSave} disabled={saving} className="flex-1">
                      <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="sm:min-w-[120px]">
                      <Plug className="h-4 w-4 mr-2" />{testing ? 'Testing...' : 'Test'}
                    </Button>
                    <Button variant="outline" onClick={handleFetchBalance} disabled={checkingBalance} className="sm:min-w-[120px]">
                      <Wallet className="h-4 w-4 mr-2" />{checkingBalance ? 'Checking...' : 'Balance'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Current Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Profile</p>
                    <p className="mt-1 truncate font-medium">{selectedId === '__new__' ? 'New profile' : selectedProfileName}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="mt-1 truncate font-mono text-xs">{model || DEFAULT_DEEPSEEK_MODEL}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Endpoint</p>
                    <p className="mt-1 truncate font-mono text-xs">{displayBaseUrl}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    {deepSeekBalance ? (
                      <div className="mt-1 space-y-1">
                        {deepSeekBalance.balances.map((balance) => (
                          <p key={balance.currency} className="tabular-nums">
                            <span className="font-medium">{balance.currency}</span>{' '}
                            {balance.currency === 'CNY' ? formatCnyCost(balance.totalBalance) : balance.totalBalance.toFixed(4)}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground">Not checked</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">Context</p>
                      <p className="mt-1 font-semibold">1M</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">Output</p>
                      <p className="mt-1 font-semibold">384K</p>
                    </div>
                  </div>
                  {deepSeekBalance && !deepSeekBalance.isAvailable && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Balance is unavailable for API calls.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        )}

        {section === 'appearance' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}Appearance
              </CardTitle>
              <CardDescription>Choose your color scheme. Changes apply instantly and are saved for restart.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {themes.map((t) => (
                  <button key={t.value} onClick={() => setTheme(t.value)}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors
                      ${theme === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}
                  >
                    {theme === t.value && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5" />}
                    <t.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                Active appearance: <span className="font-medium text-foreground">{theme === 'system' ? `System (${resolvedTheme})` : theme === 'sepia' ? 'Eye Care' : theme}</span>
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

              <div className="rounded-lg border bg-card/40 p-4">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold">Lightweight Memory</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Older turns are compacted into incremental long-term memory segments; only recent turns stay as full chat history.
                    </p>
                  </div>
                  <SwitchButton
                    checked={lightweightMemoryEnabled}
                    onClick={() => setLightweightMemoryEnabled(!lightweightMemoryEnabled)}
                    label="Toggle lightweight memory"
                  />
                </div>
                <div className={`grid gap-4 md:grid-cols-2 ${lightweightMemoryEnabled ? '' : 'opacity-45'}`}>
                  <label className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">Recent full turns</span>
                      <span className="text-sm font-semibold tabular-nums">{promptRecentTurns}</span>
                    </div>
                    <input
                      type="range"
                      disabled={!lightweightMemoryEnabled}
                      min="4"
                      max="40"
                      step="1"
                      value={promptRecentTurns}
                      onChange={(e) => setPromptRecentTurns(parseInt(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-muted-foreground/20 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">Prompt keeps this many latest story turns in full, including hidden continue replies.</p>
                  </label>
                  <label className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">Memory max chars</span>
                      <span className="text-sm font-semibold tabular-nums">{memorySummaryMaxChars}</span>
                    </div>
                    <input
                      type="range"
                      disabled={!lightweightMemoryEnabled}
                      min="1000"
                      max="12000"
                      step="500"
                      value={memorySummaryMaxChars}
                      onChange={(e) => setMemorySummaryMaxChars(parseInt(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-muted-foreground/20 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">Caps the compact memory block built from older messages.</p>
                  </label>
                </div>
                <label className="mt-4 block space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">Compression API</span>
                  <select
                    value={compressorSelectValue}
                    onChange={(e) => setMemoryCompressorConfigId(e.target.value || null)}
                    disabled={!lightweightMemoryEnabled}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Local fast compression</option>
                    {modelConfigs.map((cfg) => (
                      <option key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.model} · {cfg.model}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Selected profiles summarize older turns before chat generation; if the API fails, local compression is used.
                  </p>
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'image' && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Image Generation</CardTitle>
                    <CardDescription>Generate roleplay scene images with local ComfyUI. Planning is handled by a secondary API profile.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Enable Image Generation</p>
                        <p className="mt-1 text-xs text-muted-foreground">Choose manual buttons or automatic generation after every AI reply.</p>
                      </div>
                      <SwitchButton
                        checked={imageGeneration.enabled}
                        onClick={() => updateImageGenerationSettings({ enabled: !imageGeneration.enabled })}
                        label="Toggle image generation"
                      />
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label>Trigger Mode</Label>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => updateImageGenerationSettings({ mode: 'manual' })}
                            className={`rounded-md border p-3 text-left transition-colors ${imageGeneration.mode === 'manual' ? 'border-primary bg-primary/10' : 'hover:bg-accent/50'}`}
                          >
                            <p className="text-sm font-medium">Manual Trigger</p>
                            <p className="mt-1 text-xs text-muted-foreground">Show an image button on each AI reply. Click only when you want pictures.</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageGenerationSettings({ mode: 'auto' })}
                            className={`rounded-md border p-3 text-left transition-colors ${imageGeneration.mode === 'auto' ? 'border-primary bg-primary/10' : 'hover:bg-accent/50'}`}
                          >
                            <p className="text-sm font-medium">Auto Trigger</p>
                            <p className="mt-1 text-xs text-muted-foreground">After every AI reply, ask the secondary API to plan images and send them to ComfyUI.</p>
                          </button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="planner-config">Secondary API for Image Planning</Label>
                        <select
                          id="planner-config"
                          value={imageGeneration.plannerConfigId ?? ''}
                          onChange={(e) => updateImageGenerationSettings({ plannerConfigId: e.target.value || null })}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Select a profile before generating images</option>
                          {modelConfigs.map((cfg) => (
                            <option key={cfg.id} value={cfg.id}>{cfg.name || cfg.model} · {cfg.model}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">This profile writes image prompts. ComfyUI handles the final image generation.</p>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">World Book Reference</p>
                          <p className="mt-1 text-xs text-muted-foreground">When reply text matches world book keywords, send those entries to the secondary API for visual details.</p>
                        </div>
                        <SwitchButton
                          checked={imageGeneration.worldbookReferenceEnabled}
                          onClick={() => updateImageGenerationSettings({ worldbookReferenceEnabled: !imageGeneration.worldbookReferenceEnabled })}
                          label="Toggle world book references for image planning"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Generation Parameters</CardTitle>
                    <CardDescription>These values fill common ComfyUI KSampler and latent size inputs, and can also be used as workflow placeholders.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Parameter Preset</Label>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        {IMAGE_GENERATION_PARAMETER_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyImageParameterPreset(preset.id)}
                            className={`rounded-md border p-3 text-left transition-colors ${imageGeneration.generationPreset === preset.id ? 'border-primary bg-primary/10' : 'hover:bg-accent/50'}`}
                          >
                            <p className="text-sm font-medium">{preset.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="image-resolution">Resolution</Label>
                        <select
                          id="image-resolution"
                          value={resolutionSelectValue}
                          onChange={(e) => handleImageResolutionChange(e.target.value)}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          {resolutionSelectValue === 'custom' && (
                            <option value="custom">Custom {imageGeneration.width}x{imageGeneration.height}</option>
                          )}
                          {IMAGE_RESOLUTION_OPTIONS.map((option) => (
                            <option key={`${option.width}x${option.height}`} value={`${option.width}x${option.height}`}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="image-steps">Steps</Label>
                        <Input
                          id="image-steps"
                          type="number"
                          min="1"
                          max="150"
                          value={imageGeneration.steps}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ steps: Number(e.target.value), generationPreset: 'custom' })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="image-cfg">CFG</Label>
                        <Input
                          id="image-cfg"
                          type="number"
                          min="0"
                          max="30"
                          step="0.1"
                          value={imageGeneration.cfgScale}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ cfgScale: Number(e.target.value), generationPreset: 'custom' })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <Label htmlFor="image-sampler">Sampler</Label>
                        <select
                          id="image-sampler"
                          value={imageGeneration.samplerName}
                          onChange={(e) => updateImageGenerationSettings({ samplerName: e.target.value, generationPreset: 'custom' })}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          {IMAGE_SAMPLER_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="image-scheduler">Scheduler</Label>
                        <select
                          id="image-scheduler"
                          value={imageGeneration.scheduler}
                          onChange={(e) => updateImageGenerationSettings({ scheduler: e.target.value, generationPreset: 'custom' })}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          {IMAGE_SCHEDULER_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="image-denoise">Denoise</Label>
                        <Input
                          id="image-denoise"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={imageGeneration.denoise}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ denoise: Number(e.target.value), generationPreset: 'custom' })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="image-max">Images / Trigger</Label>
                        <Input
                          id="image-max"
                          type="number"
                          min="0"
                          max="6"
                          value={imageGeneration.maxImages}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ maxImages: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                      <div>
                        <Label htmlFor="image-seed-mode">Seed Mode</Label>
                        <select
                          id="image-seed-mode"
                          value={imageGeneration.seedMode}
                          onChange={(e) => updateImageGenerationSettings({ seedMode: e.target.value === 'fixed' ? 'fixed' : 'random' })}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="random">Random</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="image-fixed-seed">Fixed Seed</Label>
                        <Input
                          id="image-fixed-seed"
                          type="number"
                          min="0"
                          max="4294967295"
                          value={imageGeneration.fixedSeed}
                          disabled={imageGeneration.seedMode !== 'fixed'}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ fixedSeed: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Prompt Rules</CardTitle>
                    <CardDescription>Instructions sent to the secondary image-planning API.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="image-instruction">Planner Instruction</Label>
                      <Textarea
                        id="image-instruction"
                        value={imageGeneration.promptInstruction}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateImageGenerationSettings({ promptInstruction: e.target.value })}
                        rows={6}
                        className="font-mono text-xs"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">This is sent only to the secondary image planner in manual and auto modes.</p>
                    </div>

                    <div>
                      <Label htmlFor="negative-prompt">Negative Prompt</Label>
                      <Textarea
                        id="negative-prompt"
                        value={imageGeneration.negativePrompt}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateImageGenerationSettings({ negativePrompt: e.target.value })}
                        rows={3}
                        className="font-mono text-xs"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>ComfyUI Connection</CardTitle>
                    <CardDescription>Local server and workflow used for every image.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="comfy-url">ComfyUI URL</Label>
                      <Input
                        id="comfy-url"
                        value={imageGeneration.comfyUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageGenerationSettings({ comfyUrl: e.target.value })}
                        placeholder="http://127.0.0.1:8188"
                        className="font-mono text-xs"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">Uses /prompt, /history/&lt;prompt_id&gt;, and /view.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={handleTestComfyConnection}
                        disabled={testingComfyConnection || testingComfyImage}
                      >
                        <Plug className="mr-2 h-4 w-4" />{testingComfyConnection ? 'Testing...' : 'Test Connection'}
                      </Button>
                      <Button
                        onClick={handleTestComfyImage}
                        disabled={testingComfyConnection || testingComfyImage || !imageGeneration.comfyWorkflowJson.trim()}
                      >
                        <ImageIcon className="mr-2 h-4 w-4" />{testingComfyImage ? 'Generating...' : 'Test Image'}
                      </Button>
                    </div>
                    {comfyTestMessage && (
                      <div className="rounded-md border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                        {comfyTestMessage}
                      </div>
                    )}
                    {comfyTestImage && (
                      <img
                        src={comfyTestImage}
                        alt="ComfyUI test output"
                        className="max-h-72 w-full rounded-md border object-contain bg-background"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Workflow</CardTitle>
                        <CardDescription>Paste or import a ComfyUI API workflow JSON.</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => workflowFileInputRef.current?.click()}
                        className="shrink-0"
                      >
                        <Upload className="mr-1 h-3.5 w-3.5" />JSON
                      </Button>
                    </div>
                    <input
                      ref={workflowFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleWorkflowFileImport}
                      className="hidden"
                    />
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={imageGeneration.comfyWorkflowJson}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateImageGenerationSettings({ comfyWorkflowJson: e.target.value })}
                      rows={18}
                      placeholder='{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}'
                      className="font-mono text-xs"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Placeholders: {'{{prompt}}'}, {'{{negativePrompt}}'}, {'{{seed}}'}, {'{{width}}'}, {'{{height}}'}, {'{{steps}}'}, {'{{cfg}}'}, {'{{samplerName}}'}, {'{{scheduler}}'}, {'{{denoise}}'}.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
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
