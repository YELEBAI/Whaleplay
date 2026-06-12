export type CharacterStatusBarAssetId =
  | "health"
  | "mana"
  | "stamina"
  | "affection"
  | "experience"
  | "sanity"
  | "danger"
  | string;

export interface CharacterStatusBar {
  id: string;
  assetId: CharacterStatusBarAssetId;
  label: string;
  value: number | null;
  max: number;
  min?: number;
  description?: string;
  valueLabel?: string;
  visible?: boolean;
  mvuPath?: string;
}

export interface CharacterStatusBarConfig {
  version: 1;
  bars: CharacterStatusBar[];
  source?: "whale-builder" | "import" | "manual" | string;
  updatedAt?: string;
}

export interface Character {
  id: string;
  name: string;
  hidden?: boolean;
  avatar?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogues?: string;
  tags?: string[];
  regexPresetId?: string;
  worldbookId?: string;
  statusBars?: CharacterStatusBarConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterInput {
  id?: string;
  name: string;
  hidden?: boolean;
  avatar?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogues?: string;
  tags?: string[];
  regexPresetId?: string;
  worldbookId?: string;
  statusBars?: CharacterStatusBarConfig;
}

export interface UpdateCharacterInput {
  name?: string;
  hidden?: boolean;
  avatar?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  exampleDialogues?: string;
  tags?: string[];
  regexPresetId?: string;
  worldbookId?: string;
  statusBars?: CharacterStatusBarConfig;
}
