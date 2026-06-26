import { useEffect, useState, startTransition } from "react";
import type { Character } from "@neo-tavern/shared";
import { readCachedSidebarCharId, writeCachedSidebarCharId, clearCachedSidebarCharId } from "../utils";

/**
 * Sidebar panel state: open/close, session-cache restore, sync with store updates.
 */
export function useCharacterSidebar(characters: Character[], prefsLoaded: boolean) {
  const [sidebarChar, setSidebarChar] = useState<Character | null>(null);

  const openSidebar = (char: Character) => {
    setSidebarChar(char);
    writeCachedSidebarCharId(char.id);
  };

  const closeSidebar = () => {
    setSidebarChar(null);
    clearCachedSidebarCharId();
  };

  // Restore open sidebar from session cache after prefs load
  useEffect(() => {
    if (!prefsLoaded) return;
    const cachedCharId = readCachedSidebarCharId();
    if (cachedCharId) {
      const char = characters.find((c) => c.id === cachedCharId);
      if (char) {
        startTransition(() => setSidebarChar(char));
      }
    }
  }, [prefsLoaded, characters]);

  // Keep sidebarChar in sync with character store updates.
  // Using startTransition avoids cascading renders when a store update
  // triggers a re-sync — the ref guard prevents the effect body from
  // depending on the state it sets.
  useEffect(() => {
    if (sidebarChar) {
      const updated = characters.find((c) => c.id === sidebarChar.id);
      if (updated && updated !== sidebarChar) {
        startTransition(() => setSidebarChar(updated));
      }
    }
  }, [characters, sidebarChar]);

  return { sidebarChar, openSidebar, closeSidebar };
}
