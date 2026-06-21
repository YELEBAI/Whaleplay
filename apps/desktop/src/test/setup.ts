import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Radix Dialog may leave portal nodes in document.body between tests.
  // Clear them explicitly so later tests don't see stale dialog content.
  document.body.querySelectorAll("[data-radix-focus-guard]").forEach((el) => el.remove());
  document.body.querySelectorAll("[data-radix-dialog-overlay]").forEach((el) => el.remove());
  document.body.querySelectorAll('[role="dialog"]').forEach((el) => el.remove());
  document.body.removeAttribute("data-scroll-locked");
  document.body.style.pointerEvents = "";
});

// ── Mock Tauri APIs ──────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false),
}));

vi.mock("@/platform", () => ({
  getBackend: vi.fn().mockReturnValue({
    store: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      entries: vi.fn().mockResolvedValue({}),
      batch: vi.fn().mockResolvedValue(undefined),
      lock: vi.fn().mockResolvedValue(true),
      unlock: vi.fn().mockResolvedValue(undefined),
      backup: vi.fn().mockResolvedValue("/mock/store.backup.json"),
    },
    db: {
      initMessages: vi.fn().mockResolvedValue(undefined),
      listMessages: vi.fn().mockResolvedValue([]),
      listRecentMessages: vi.fn().mockResolvedValue([]),
      listChildMessages: vi.fn().mockResolvedValue([]),
      createMessage: vi.fn().mockResolvedValue({}),
      updateMessage: vi.fn().mockResolvedValue({}),
      patchMessage: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessages: vi.fn().mockResolvedValue(undefined),
      deleteByChatId: vi.fn().mockResolvedValue(undefined),
      replaceByChatId: vi.fn().mockResolvedValue([]),
      migrateParentIds: vi.fn().mockResolvedValue(0),
      mergeFromSavepoint: vi.fn().mockResolvedValue([]),
    },
    agenticPlay: {
      initFromJson: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
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
