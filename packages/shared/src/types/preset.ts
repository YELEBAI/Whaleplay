export interface PresetItem {
  id: string;
  presetId: string;
  name: string;
  enabled: boolean;
  hidden?: boolean;
  builtinKind?: string;
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
  // ── sync metadata (optional; populated when the entity enters the sync pipeline) ──
  revision?: string;
  deletedAt?: string | null;
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
  builtinKind?: string;
  role: "system" | "user";
  content: string;
  injectionOrder: number;
}

export interface UpdatePresetItemInput {
  name?: string;
  enabled?: boolean;
  hidden?: boolean;
  builtinKind?: string;
  role?: "system" | "user";
  content?: string;
  injectionOrder?: number;
}
