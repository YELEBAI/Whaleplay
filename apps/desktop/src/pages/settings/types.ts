import type { Plug, Sun } from "lucide-react";

export type Section = "api" | "appearance" | "regex" | "context";

export type SectionWithLabel = { key: Section; icon: typeof Plug; label: string };

export type ThemeOption = {
  value: "light" | "dark" | "sepia" | "system";
  icon: typeof Sun;
  label: string;
};

// ── ApiSection ──────────────────────────────────────────
export interface ModelOption {
  id: string;
  label: string;
  badge: string;
  description: string;
}

export interface ApiSectionProps {
  t: (key: string, params?: Record<string, string>) => string;

  modelConfigs: Array<{ id: string; name: string }>;
  activeConfigId: string | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  saving: boolean;
  testing: boolean;

  name: string;
  setName: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  temperature: string;
  setTemperature: (v: string) => void;
  maxTokens: string;
  setMaxTokens: (v: string) => void;
  reasoningEffort: string;
  setReasoningEffort: (v: string) => void;
  streamingEnabled: boolean;
  setStreamingEnabled: (v: boolean) => void;

  fetchingModels: boolean;
  availableModels: string[];
  onFetchModels: () => void;

  onSave: () => void;
  onDelete: (configId: string) => void;
  onTestConnection: () => void;
  onResetForm: () => void;
  onSelectConfig: (configId: string) => void;
  onNewProfile: () => void;

  modelSelectOptions: ModelOption[];
  baseModelOptions: ModelOption[];
  selectedModelMeta: ModelOption | undefined;
  isLegacyModel: boolean;
}

// ── RegexSection ────────────────────────────────────────
export interface RegexRuleForm {
  id?: string;
  name: string;
  pattern: string;
  displayTemplate: string;
  stripFromPrompt: boolean;
  enabled: boolean;
}

export interface RegexPresetData {
  id: string;
  name: string;
  description: string;
  isGlobal: boolean;
  rules: RegexRuleForm[];
}

export interface RegexSectionProps {
  t: (key: string, params?: Record<string, string>) => string;

  presets: RegexPresetData[];
  activePresetId: string | null;
  selectedPresetId: string | null;

  presetName: string;
  setPresetName: (v: string) => void;
  presetDesc: string;
  setPresetDesc: (v: string) => void;

  ruleName: string;
  setRuleName: (v: string) => void;
  rulePattern: string;
  setRulePattern: (v: string) => void;
  ruleTemplate: string;
  setRuleTemplate: (v: string) => void;
  ruleStrip: boolean;
  setRuleStrip: (v: boolean) => void;
  ruleEnabled: boolean;
  setRuleEnabled: (v: boolean) => void;
  editingRuleId: string | null;

  deleteTarget: RegexPresetData | null;
  setDeleteTarget: (p: RegexPresetData | null) => void;

  onSelectPreset: (id: string) => void;
  onCreatePreset: () => void;
  onSavePresetMeta: () => void;
  onDeletePreset: () => void;
  onActivatePreset: () => void;
  onToggleGlobal: () => void;
  onSaveRule: () => void;
  onDeleteRule: (ruleId: string) => void;
  onToggleRule: (ruleId: string) => void;
  onEditRule: (rule: RegexRuleForm & { id: string }) => void;
  onResetRuleForm: () => void;
  onQuickSummary: () => void;
}
