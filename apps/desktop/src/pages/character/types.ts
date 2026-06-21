import type { Character } from "@neo-tavern/shared";

export type ViewMode = "grid" | "list";

export type CharacterMenu = {
  x: number;
  y: number;
  character: Character;
};

export interface SearchMatches {
  nameMatches: Character[];
  descMatches: Character[];
  personalityMatches: Character[];
}
