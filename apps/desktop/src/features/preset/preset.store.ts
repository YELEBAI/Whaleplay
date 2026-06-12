import { create } from "zustand";
import { persist } from "zustand/middleware";
import { presetRepository } from "@/db/repositories";
import { useSettingsStore } from "@/features/settings/settings.store";
import type {
  Preset,
  PresetItem,
  CreatePresetInput,
  UpdatePresetInput,
  CreatePresetItemInput,
  UpdatePresetItemInput,
} from "@neo-tavern/shared";

interface PresetState {
  presets: Preset[];
  activePreset: Preset | null;
  activePresetId: string | null;
  loading: boolean;
  error: string | null;

  loadPresets: () => Promise<void>;
  createPreset: (input: CreatePresetInput) => Promise<Preset>;
  updatePreset: (id: string, input: UpdatePresetInput) => Promise<Preset>;
  deletePreset: (id: string) => Promise<void>;
  setActivePreset: (id: string | null) => Promise<void>;

  addItem: (presetId: string, input: CreatePresetItemInput) => Promise<PresetItem>;
  updateItem: (presetId: string, itemId: string, input: UpdatePresetItemInput) => Promise<PresetItem>;
  deleteItem: (presetId: string, itemId: string) => Promise<void>;
  reorderItems: (presetId: string, orderedItemIds: string[]) => Promise<void>;
  toggleItem: (presetId: string, itemId: string) => Promise<void>;

  importPreset: (json: string) => Promise<Preset>;
  exportPreset: (id: string) => Promise<string>;

  clearError: () => void;
}

export const usePresetStore = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [],
      activePreset: null,
      activePresetId: null,
      loading: false,
      error: null,

      loadPresets: async () => {
        set({ loading: true, error: null });
        try {
          const presets = await presetRepository.list();
          const activeId = await presetRepository.getActivePresetId();
          const active = activeId ? (presets.find((p) => p.id === activeId) ?? null) : null;
          set({ presets, activePreset: active, activePresetId: activeId, loading: false });
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
        }
      },

      createPreset: async (input) => {
        set({ loading: true, error: null });
        try {
          const preset = await presetRepository.create(input);
          set((state) => ({ presets: [preset, ...state.presets], loading: false }));
          return preset;
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      updatePreset: async (id, input) => {
        set({ loading: true, error: null });
        try {
          const preset = await presetRepository.update(id, input);
          set((state) => ({
            presets: state.presets.map((p) => (p.id === id ? preset : p)),
            activePreset: state.activePreset?.id === id ? preset : state.activePreset,
            loading: false,
          }));
          return preset;
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      deletePreset: async (id) => {
        set({ loading: true, error: null });
        try {
          await presetRepository.delete(id);
          set((state) => ({
            presets: state.presets.filter((p) => p.id !== id),
            activePreset: state.activePreset?.id === id ? null : state.activePreset,
            activePresetId: state.activePresetId === id ? null : state.activePresetId,
            loading: false,
          }));
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      setActivePreset: async (id) => {
        await presetRepository.setActivePresetId(id);
        const { presets } = get();
        const active = id ? (presets.find((p) => p.id === id) ?? null) : null;
        set({ activePreset: active, activePresetId: id });
      },

      addItem: async (presetId, input) => {
        set({ error: null });
        try {
          const item = await presetRepository.addItem(presetId, input);
          set((state) => ({
            presets: state.presets.map((p) =>
              p.id === presetId ? { ...p, items: [...p.items, item], updatedAt: item.createdAt } : p,
            ),
            activePreset:
              state.activePreset?.id === presetId
                ? { ...state.activePreset, items: [...state.activePreset.items, item], updatedAt: item.createdAt }
                : state.activePreset,
          }));
          return item;
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      updateItem: async (presetId, itemId, input) => {
        set({ error: null });
        try {
          const item = await presetRepository.updateItem(presetId, itemId, input);
          const updateItems = (items: PresetItem[]) => items.map((i) => (i.id === itemId ? item : i));
          set((state) => ({
            presets: state.presets.map((p) =>
              p.id === presetId ? { ...p, items: updateItems(p.items), updatedAt: item.updatedAt } : p,
            ),
            activePreset:
              state.activePreset?.id === presetId
                ? { ...state.activePreset, items: updateItems(state.activePreset.items), updatedAt: item.updatedAt }
                : state.activePreset,
          }));
          return item;
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      deleteItem: async (presetId, itemId) => {
        set({ error: null });
        try {
          await presetRepository.deleteItem(presetId, itemId);
          set((state) => ({
            presets: state.presets.map((p) =>
              p.id === presetId
                ? { ...p, items: p.items.filter((i) => i.id !== itemId), updatedAt: new Date().toISOString() }
                : p,
            ),
            activePreset:
              state.activePreset?.id === presetId
                ? {
                    ...state.activePreset,
                    items: state.activePreset.items.filter((i) => i.id !== itemId),
                    updatedAt: new Date().toISOString(),
                  }
                : state.activePreset,
          }));
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      reorderItems: async (presetId, orderedItemIds) => {
        set({ error: null });
        try {
          const preset = await presetRepository.reorderItems(presetId, orderedItemIds);
          set((state) => ({
            presets: state.presets.map((p) => (p.id === presetId ? preset : p)),
            activePreset: state.activePreset?.id === presetId ? preset : state.activePreset,
          }));
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      toggleItem: async (presetId, itemId) => {
        const { presets } = get();
        const preset = presets.find((p) => p.id === presetId);
        if (!preset) return;
        const item = preset.items.find((i) => i.id === itemId);
        if (!item) return;
        await get().updateItem(presetId, itemId, { enabled: !item.enabled });
      },

      importPreset: async (json) => {
        set({ loading: true, error: null });
        try {
          const preset = await presetRepository.importFromJson(json);
          set((state) => ({
            presets: [preset, ...state.presets],
            loading: false,
          }));
          useSettingsStore.getState().loadRegexRules();
          return preset;
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      exportPreset: async (id) => {
        const preset = await presetRepository.getById(id);
        if (!preset) throw new Error("Preset not found");
        const data = {
          name: preset.name,
          description: preset.description,
          prompts: [...preset.items]
            .sort((a, b) => a.injectionOrder - b.injectionOrder)
            .map((i) => ({
              name: i.name,
              enabled: i.enabled,
              role: i.role,
              content: i.content,
              injection_order: i.injectionOrder,
            })),
        };
        return JSON.stringify(data, null, 2);
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "neotavern-presets",
      partialize: (state) => ({ presets: state.presets, activePresetId: state.activePresetId }),
    },
  ),
);
