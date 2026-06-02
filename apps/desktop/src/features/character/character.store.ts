import { create } from "zustand";
import { characterRepository } from "@/db/repositories";
import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@neo-tavern/shared";

interface CharacterState {
  characters: Character[];
  currentCharacter: Character | null;
  loading: boolean;
  error: string | null;

  loadCharacters: () => Promise<void>;
  loadCharacter: (id: string) => Promise<void>;
  createCharacter: (input: CreateCharacterInput) => Promise<Character>;
  updateCharacter: (id: string, input: UpdateCharacterInput) => Promise<Character>;
  deleteCharacter: (id: string) => Promise<void>;
  setCurrentCharacter: (character: Character | null) => void;
  clearError: () => void;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  currentCharacter: null,
  loading: false,
  error: null,

  loadCharacters: async () => {
    set({ loading: true, error: null });
    try {
      const characters = await characterRepository.list();
      set({ characters, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loadCharacter: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const character = await characterRepository.getById(id);
      set({ currentCharacter: character, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createCharacter: async (input: CreateCharacterInput) => {
    set({ loading: true, error: null });
    try {
      const character = await characterRepository.create(input);
      set((state) => ({
        characters: [...state.characters, character],
        loading: false,
      }));
      return character;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  updateCharacter: async (id: string, input: UpdateCharacterInput) => {
    set({ loading: true, error: null });
    try {
      const character = await characterRepository.update(id, input);
      set((state) => ({
        characters: state.characters.map((c) => (c.id === id ? character : c)),
        currentCharacter: state.currentCharacter?.id === id ? character : state.currentCharacter,
        loading: false,
      }));
      return character;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  deleteCharacter: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await characterRepository.delete(id);
      set((state) => ({
        characters: state.characters.filter((c) => c.id !== id),
        currentCharacter: state.currentCharacter?.id === id ? null : state.currentCharacter,
        loading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  setCurrentCharacter: (character: Character | null) => {
    set({ currentCharacter: character });
  },

  clearError: () => set({ error: null }),
}));
