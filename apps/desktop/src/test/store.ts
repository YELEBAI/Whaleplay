/**
 * Centralized test store factory.
 * Pre-populates Zustand stores with safe defaults so page tests
 * don't need to set up individual mocks.
 *
 * Usage:
 *   import { setupTestStores, resetTestStores } from "@/test/store";
 *   beforeEach(() => setupTestStores());
 *   afterEach(() => resetTestStores());
 */

import { useSettingsStore } from "@/features/settings/settings.store";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { usePresetStore } from "@/features/preset/preset.store";

/** Snapshot of initial store state before test modifications */
const snapshots = new Map<string, unknown>();

function snapshot(key: string, getState: () => unknown) {
  if (!snapshots.has(key)) snapshots.set(key, getState());
}

function restore(key: string, setState: (s: unknown) => void) {
  const initial = snapshots.get(key);
  if (initial !== undefined) setState(initial);
}

/**
 * Set up all stores with safe test defaults.
 * Call in beforeEach().
 */
export function setupTestStores() {
  const settings = useSettingsStore;
  snapshot("settings", () => settings.getState());
  settings.setState({
    modelConfigs: [],
    modelConfig: null,
    activeConfigId: null,
    loading: false,
    saving: false,
    testing: false,
    error: null,
    regexPresets: [],
    activeRegexPresetId: null,
    contextTokens: 8000,
    lightweightMemoryEnabled: false,
    promptRecentTurns: 5,
    memorySummaryMaxChars: 2000,
    memoryCompressorConfigId: null,
    personaName: "User",
    personaDesc: "",
    debugMode: false,
    dailyCostWarningEnabled: false,
    dailyCostWarningLimitCny: 10,
    dailyCostSpentCny: 0,
    webSearchProvider: "default" as const,
    tavilyApiKey: "",
    tavilySearchDepth: "basic" as const,
  });

  const character = useCharacterStore;
  snapshot("character", () => character.getState());
  character.setState({
    characters: [],
    currentCharacter: null,
    loading: false,
    error: null,
  });

  const chat = useChatStore;
  snapshot("chat", () => chat.getState());
  chat.setState({
    chats: [],
    currentChat: null,
    messages: [],
    messagesHydrated: true,
    loading: false,
    sending: false,
    sendingChatId: null,
    streamingMessageId: null,
    generationPhase: null,
    activeGenerations: {},
    activeLeafId: null,
    error: null,
    lastDiceResult: null,
  });

  const worldbook = useWorldbookStore;
  snapshot("worldbook", () => worldbook.getState());
  worldbook.setState({
    worldbooks: [],
    activeWorldbookId: null,
    loading: false,
    error: null,
  });

  const preset = usePresetStore;
  snapshot("preset", () => preset.getState());
  preset.setState({
    presets: [],
    activePresetId: null,
    loading: false,
    error: null,
  });
}

/**
 * Restore all stores to their pre-test state.
 * Call in afterEach().
 */
export function resetTestStores() {
  restore("settings", (s) => useSettingsStore.setState(s as Partial<ReturnType<typeof useSettingsStore.getState>>));
  restore("character", (s) => useCharacterStore.setState(s as Partial<ReturnType<typeof useCharacterStore.getState>>));
  restore("chat", (s) => useChatStore.setState(s as Partial<ReturnType<typeof useChatStore.getState>>));
  restore("worldbook", (s) => useWorldbookStore.setState(s as Partial<ReturnType<typeof useWorldbookStore.getState>>));
  restore("preset", (s) => usePresetStore.setState(s as Partial<ReturnType<typeof usePresetStore.getState>>));
  snapshots.clear();
}
