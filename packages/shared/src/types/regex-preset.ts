export interface RegexRule {
  id: string;
  presetId: string;
  name: string;
  pattern: string;
  displayTemplate: string;
  stripFromPrompt: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface RegexPreset {
  id: string;
  name: string;
  description: string;
  rules: RegexRule[];
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRegexPresetInput {
  name: string;
  description: string;
  isGlobal?: boolean;
}

export interface UpdateRegexPresetInput {
  name?: string;
  description?: string;
  isGlobal?: boolean;
}

export interface CreateRegexRuleInput {
  name: string;
  pattern: string;
  displayTemplate: string;
  stripFromPrompt: boolean;
  enabled: boolean;
}

export interface UpdateRegexRuleInput {
  name?: string;
  pattern?: string;
  displayTemplate?: string;
  stripFromPrompt?: boolean;
  enabled?: boolean;
}
