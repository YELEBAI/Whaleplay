import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ── Mock Tauri APIs ──────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/platform", () => ({
  getBackend: vi.fn().mockReturnValue({
    store: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      entries: vi.fn().mockResolvedValue({}),
    },
    db: {
      initMessages: vi.fn().mockResolvedValue(undefined),
      listMessages: vi.fn().mockResolvedValue([]),
      listRecentMessages: vi.fn().mockResolvedValue([]),
      listRecentTurnMessages: vi.fn().mockResolvedValue([]),
      listChildMessages: vi.fn().mockResolvedValue([]),
      createMessage: vi.fn().mockResolvedValue({}),
      updateMessage: vi.fn().mockResolvedValue({}),
      patchMessage: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessages: vi.fn().mockResolvedValue(undefined),
      deleteByChatId: vi.fn().mockResolvedValue(undefined),
      replaceByChatId: vi.fn().mockResolvedValue([]),
      migrateParentIds: vi.fn().mockResolvedValue(0),
      migrateRoundIndexes: vi.fn().mockResolvedValue(0),
      mergeFromSavepoint: vi.fn().mockResolvedValue([]),
    },
    agenticPlay: {
      initFromJson: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
    },
    rag: {
      upsertChunks: vi.fn().mockResolvedValue(0),
      listChunksByOwners: vi.fn().mockResolvedValue([]),
      deleteChunksBySourceIds: vi.fn().mockResolvedValue(0),
      deleteChunksByOwner: vi.fn().mockResolvedValue(0),
      countChunksByOwner: vi.fn().mockResolvedValue(0),
    },
    file: {
      pickFolder: vi.fn().mockResolvedValue(null),
      saveTextFile: vi.fn().mockResolvedValue(null),
      saveWorkspaceDir: vi.fn().mockResolvedValue(undefined),
      deleteWorkspaceDir: vi.fn().mockResolvedValue(undefined),
      saveDebugPrompt: vi.fn().mockResolvedValue("/mock/path.json"),
      writeFileToPath: vi.fn().mockResolvedValue(undefined),
    },
    search: {
      webSearch: vi.fn().mockResolvedValue([]),
    },
    ollama: {
      check: vi.fn().mockResolvedValue({ version: "test" }),
      pull: vi.fn().mockResolvedValue({ status: "success" }),
      embed: vi.fn().mockResolvedValue([]),
    },
    comfy: {
      getSystemStats: vi.fn().mockResolvedValue({}),
      queuePrompt: vi.fn().mockResolvedValue({}),
      getHistory: vi.fn().mockResolvedValue({}),
      getImageDataUrl: vi.fn().mockResolvedValue(""),
    },
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    startDragging: vi.fn(),
    toggleMaximize: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(false),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));

// ── i18n ──────────────────────────────────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "zh", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// ── Browser APIs not available in jsdom ──────────────
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("inside a test was not wrapped in act")) return;
  originalError.call(console, ...args);
};
