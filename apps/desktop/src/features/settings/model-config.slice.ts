import { settingsRepository } from "@/db/repositories";
import { generateId } from "@neo-tavern/shared";
import type { ModelConfig, CreateModelConfigInput, UpdateModelConfigInput } from "@neo-tavern/shared";

interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface ModelConfigSlice {
  modelConfigs: ModelConfig[];
  modelConfig: ModelConfig | null;
  activeConfigId: string | null;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;

  loadAllConfigs: () => Promise<void>;
  selectConfig: (id: string) => Promise<void>;
  saveModelConfig: (input: CreateModelConfigInput) => Promise<ModelConfig>;
  updateModelConfig: (id: string, input: UpdateModelConfigInput) => Promise<ModelConfig>;
  deleteModelConfig: (id: string) => Promise<void>;
  testConnection: (baseUrl: string, apiKey: string, model: string) => Promise<TestConnectionResult>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const createModelConfigSlice = (set: any, get: any, _api?: any): ModelConfigSlice => ({
  modelConfigs: [],
  modelConfig: null,
  activeConfigId: null,
  loading: false,
  saving: false,
  testing: false,
  error: null,

  loadAllConfigs: async () => {
    set({ loading: true, error: null });
    try {
      const configs = await settingsRepository.getAllModelConfigs();
      const activeId = await settingsRepository.getActiveConfigId();
      const current = activeId ? (configs.find((c) => c.id === activeId) ?? null) : null;
      set({ modelConfigs: configs, activeConfigId: activeId, modelConfig: current, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  selectConfig: async (id: string) => {
    const configs: ModelConfig[] = get().modelConfigs;
    const config = configs.find((c) => c.id === id) ?? null;
    await settingsRepository.setActiveConfigId(id);
    set({ modelConfig: config, activeConfigId: id });
  },

  saveModelConfig: async (input: CreateModelConfigInput) => {
    set({ saving: true, error: null });
    try {
      const now = new Date().toISOString();
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
        streamingEnabled: input.streamingEnabled ?? true,
        createdAt: now,
        updatedAt: now,
      };
      await settingsRepository.saveModelConfig(config);
      await settingsRepository.setActiveConfigId(config.id);
      set((state: { modelConfigs: any }) => ({
        modelConfigs: [...state.modelConfigs, config],
        modelConfig: config,
        activeConfigId: config.id,
        saving: false,
      }));
      return config;
    } catch (err) {
      set({ error: (err as Error).message, saving: false });
      throw err;
    }
  },

  updateModelConfig: async (id: string, input: UpdateModelConfigInput) => {
    set({ saving: true, error: null });
    try {
      const existing: ModelConfig | undefined = get().modelConfigs.find((c: ModelConfig) => c.id === id);
      if (!existing) throw new Error("Config not found");

      const now = new Date().toISOString();
      const config: ModelConfig = { ...existing, ...input, updatedAt: now };
      await settingsRepository.saveModelConfig(config);
      set((state: any) => ({
        modelConfigs: state.modelConfigs.map((c: ModelConfig) => (c.id === id ? config : c)),
        modelConfig: state.activeConfigId === id ? config : state.modelConfig,
        saving: false,
      }));
      return config;
    } catch (err) {
      set({ error: (err as Error).message, saving: false });
      throw err;
    }
  },

  deleteModelConfig: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await settingsRepository.deleteModelConfig(id);
      const remaining: ModelConfig[] = get().modelConfigs.filter((c: ModelConfig) => c.id !== id);
      const nextActive = remaining[0] ?? null;
      if (nextActive) {
        await settingsRepository.setActiveConfigId(nextActive.id);
        set({ modelConfigs: remaining, modelConfig: nextActive, activeConfigId: nextActive.id, loading: false });
      } else {
        await settingsRepository.setActiveConfigId(null);
        set({ modelConfigs: [], modelConfig: null, activeConfigId: null, loading: false });
      }
      if (get().memoryCompressorConfigId === id) {
        await settingsRepository.set("memoryCompressorConfigId", "");
        set({ memoryCompressorConfigId: null });
      }
      if (get().imageGeneration?.plannerConfigId === id) {
        const next = { ...get().imageGeneration, plannerConfigId: null };
        await settingsRepository.set("imageGeneration", JSON.stringify(next));
        set({ imageGeneration: next });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  testConnection: async (baseUrl: string, apiKey: string, model: string) => {
    set({ testing: true, error: null });
    try {
      const cleanUrl = baseUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        set({ testing: false });
        return { ok: false, message: `Status ${response.status}: ${errorText.slice(0, 200)}` };
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      set({ testing: false });
      return { ok: true, message: content ? `OK — got reply: "${content}"` : "OK — connected successfully" };
    } catch (err) {
      const msg = (err as Error).message || "Unknown error";
      set({ testing: false });
      return { ok: false, message: `Connection failed: ${msg}` };
    }
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */
