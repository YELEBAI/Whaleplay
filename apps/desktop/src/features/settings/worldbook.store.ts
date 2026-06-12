import { create } from "zustand";
import { persist } from "zustand/middleware";
import { worldbookRepository } from "@/db/repositories";
import type {
  Worldbook,
  WorldbookEntry,
  CreateWorldbookInput,
  UpdateWorldbookInput,
  CreateWorldbookEntryInput,
  UpdateWorldbookEntryInput,
} from "@neo-tavern/shared";

interface WorldbookState {
  worldbooks: Worldbook[];
  activeWorldbookId: string | null;
  loading: boolean;
  error: string | null;

  loadWorldbooks: () => Promise<void>;
  createWorldbook: (input: CreateWorldbookInput) => Promise<Worldbook>;
  updateWorldbook: (id: string, input: UpdateWorldbookInput) => Promise<Worldbook>;
  deleteWorldbook: (id: string) => Promise<void>;
  setActiveWorldbook: (id: string | null) => Promise<void>;

  addEntry: (worldbookId: string, input: CreateWorldbookEntryInput) => Promise<WorldbookEntry>;
  updateEntry: (worldbookId: string, entryId: string, input: UpdateWorldbookEntryInput) => Promise<WorldbookEntry>;
  deleteEntry: (worldbookId: string, entryId: string) => Promise<void>;
  toggleEntry: (worldbookId: string, entryId: string) => Promise<void>;

  getActiveEntries: () => WorldbookEntry[];
  clearError: () => void;
}

export const useWorldbookStore = create<WorldbookState>()(
  persist(
    (set, get) => ({
      worldbooks: [],
      activeWorldbookId: null,
      loading: false,
      error: null,

      loadWorldbooks: async () => {
        set({ loading: true, error: null });
        try {
          const worldbooks = await worldbookRepository.list();
          const activeId = await worldbookRepository.getActiveId();
          set({ worldbooks, activeWorldbookId: activeId, loading: false });
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
        }
      },

      createWorldbook: async (input) => {
        set({ loading: true, error: null });
        try {
          const wb = await worldbookRepository.create(input);
          set((state) => ({
            worldbooks: [...state.worldbooks, wb],
            loading: false,
          }));
          return wb;
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      updateWorldbook: async (id, input) => {
        set({ loading: true, error: null });
        try {
          const wb = await worldbookRepository.update(id, input);
          set((state) => ({
            worldbooks: state.worldbooks.map((w) => (w.id === id ? wb : w)),
            loading: false,
          }));
          return wb;
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      deleteWorldbook: async (id) => {
        set({ loading: true, error: null });
        try {
          await worldbookRepository.delete(id);
          const remaining = get().worldbooks.filter((w) => w.id !== id);
          const nextActive = get().activeWorldbookId === id ? (remaining[0]?.id ?? null) : get().activeWorldbookId;
          if (get().activeWorldbookId === id) {
            await worldbookRepository.setActiveId(nextActive);
          }
          set({ worldbooks: remaining, activeWorldbookId: nextActive, loading: false });
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
          throw err;
        }
      },

      setActiveWorldbook: async (id) => {
        await worldbookRepository.setActiveId(id);
        set({ activeWorldbookId: id });
      },

      addEntry: async (worldbookId, input) => {
        set({ error: null });
        try {
          const entry = await worldbookRepository.addEntry(worldbookId, input);
          set((state) => ({
            worldbooks: state.worldbooks.map((w) =>
              w.id === worldbookId ? { ...w, entries: [...w.entries, entry], updatedAt: new Date().toISOString() } : w,
            ),
          }));
          return entry;
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      updateEntry: async (worldbookId, entryId, input) => {
        set({ error: null });
        try {
          const entry = await worldbookRepository.updateEntry(worldbookId, entryId, input);
          set((state) => ({
            worldbooks: state.worldbooks.map((w) => {
              if (w.id !== worldbookId) return w;
              return {
                ...w,
                entries: w.entries.map((e) => (e.id === entryId ? entry : e)),
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          return entry;
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      deleteEntry: async (worldbookId, entryId) => {
        set({ error: null });
        try {
          await worldbookRepository.deleteEntry(worldbookId, entryId);
          set((state) => ({
            worldbooks: state.worldbooks.map((w) => {
              if (w.id !== worldbookId) return w;
              return {
                ...w,
                entries: w.entries.filter((e) => e.id !== entryId),
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
        } catch (err) {
          set({ error: (err as Error).message });
          throw err;
        }
      },

      toggleEntry: async (worldbookId, entryId) => {
        const wb = get().worldbooks.find((w) => w.id === worldbookId);
        if (!wb) return;
        const entry = wb.entries.find((e) => e.id === entryId);
        if (!entry) return;
        await get().updateEntry(worldbookId, entryId, { enabled: !entry.enabled });
      },

      getActiveEntries: () => {
        const { worldbooks, activeWorldbookId } = get();
        if (!activeWorldbookId) return [];
        const wb = worldbooks.find((w) => w.id === activeWorldbookId);
        if (!wb) return [];
        return wb.entries;
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "neotavern-worldbooks",
      partialize: (state) => ({ worldbooks: state.worldbooks, activeWorldbookId: state.activeWorldbookId }),
    },
  ),
);
