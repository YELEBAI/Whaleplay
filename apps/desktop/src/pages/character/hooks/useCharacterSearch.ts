import { useEffect, useState } from "react";
import { prefs } from "@/db/kv";
import { prefKeys } from "@/db/storage/keys";
import type { Character } from "@neo-tavern/shared";
import type { SearchMatches, ViewMode } from "../types";

/**
 * Manages search state, filtering, and view-mode preferences.
 *
 * searchExpanded is derived during render from the user's explicit
 * preference (loaded from prefs) falling back to an auto-expand
 * heuristic — no effect-level setState needed.
 */
export function useCharacterSearch(characters: Character[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // null = not yet loaded from prefs → fall back to heuristic
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  // Load view mode and search expanded preferences on first mount
  useEffect(() => {
    (async () => {
      const mode = await prefs.getJson<ViewMode>(prefKeys.characterViewMode);
      const expanded = await prefs.getJson<boolean>(prefKeys.characterSearchExpanded);
      setViewMode(mode.status === "valid" ? (mode.value === "list" ? "list" : "grid") : "grid");
      setUserExpanded(expanded.status === "valid" ? expanded.value : null);
      setPrefsLoaded(true);
    })();
  }, []);

  // Derived during render: user's explicit choice wins; otherwise
  // auto-expand when there are many characters.
  const searchExpanded = userExpanded !== null ? userExpanded : prefsLoaded && characters.length > 20;

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    void prefs.setJson(prefKeys.characterViewMode, mode);
  };

  const handleSearchToggle = () => {
    const next = !searchExpanded;
    setUserExpanded(next);
    void prefs.setJson(prefKeys.characterSearchExpanded, next);
    if (!next) setSearchQuery("");
  };

  // Single-pass search with priority: name > description > personality
  const query = searchQuery.trim().toLowerCase();
  let searchMatches: SearchMatches | null = null;
  if (query) {
    const nameMatches: Character[] = [];
    const descMatches: Character[] = [];
    const personalityMatches: Character[] = [];
    for (const char of characters) {
      if (char.name.toLowerCase().includes(query)) {
        nameMatches.push(char);
      } else if (char.description?.toLowerCase().includes(query)) {
        descMatches.push(char);
      } else if (char.personality?.toLowerCase().includes(query)) {
        personalityMatches.push(char);
      }
    }
    searchMatches = { nameMatches, descMatches, personalityMatches };
  }

  const hasSearchResults =
    searchMatches !== null &&
    (searchMatches.nameMatches.length > 0 ||
      searchMatches.descMatches.length > 0 ||
      searchMatches.personalityMatches.length > 0);

  return {
    searchQuery,
    setSearchQuery,
    searchExpanded,
    viewMode,
    prefsLoaded,
    searchMatches,
    hasSearchResults,
    handleViewModeChange,
    handleSearchToggle,
  };
}
