export interface PresetItem {
  id: string;
  presetId: string;
  name: string;
  enabled: boolean;
  hidden?: boolean;
  role: "system" | "user";
  content: string;
  injectionOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  items: PresetItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresetInput {
  name: string;
  description: string;
}

export interface UpdatePresetInput {
  name?: string;
  description?: string;
}

export interface CreatePresetItemInput {
  name: string;
  enabled: boolean;
  hidden?: boolean;
  role: "system" | "user";
  content: string;
  injectionOrder: number;
}

export interface UpdatePresetItemInput {
  name?: string;
  enabled?: boolean;
  role?: "system" | "user";
  content?: string;
  injectionOrder?: number;
}
