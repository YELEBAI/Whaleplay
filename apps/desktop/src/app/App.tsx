import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { registerDevFixtures } from "./dev-fixtures";
import { check } from "@tauri-apps/plugin-updater";
import {
  seedTestCharacter,
  seedBuiltinRegex,
  seedLunaWorldbook,
  seedWritingPreset,
  seedSeraphina,
  seedEldoriaWorldbook,
} from "./seed";
import { ToastContainer, useToast } from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import { migrateLocalStorageToAppStore } from "@/db/storage";
import { messageRepository } from "@/db/repositories";
import { LoginGate } from "@/components/LoginGate";
import { useThemeStore } from "./theme.store";

let seeded = false;

function AppContent() {
  const { toasts, addToast, removeToast } = useToast();
  const themeInit = useThemeStore((s) => s.init);
  useEffect(() => {
    window.__toast = addToast;
    registerDevFixtures();
  }, [addToast]);

  useEffect(() => {
    themeInit();

    if (seeded) return;
    seeded = true;

    void (async () => {
      await migrateLocalStorageToAppStore();
      const migratedCount = await messageRepository.migrateParentIds();
      if (migratedCount > 0) {
        console.warn(`[migration] Set parentId for ${migratedCount} messages`);
      }
      await seedTestCharacter();
      await seedBuiltinRegex();
      await seedLunaWorldbook();
      await seedWritingPreset();
      await seedSeraphina();
      await seedEldoriaWorldbook();
      await useSettingsStore.getState().loadAllConfigs();
      await useSettingsStore.getState().loadMemorySettings();
      await useSettingsStore.getState().loadImageGenerationSettings();
      await useSettingsStore.getState().loadRegexRules();
    })();
  }, [themeInit]);

  // Auto-update check on startup
  useEffect(() => {
    const store = useSettingsStore.getState();
    if (!store.autoUpdateEnabled) return;
    void (async () => {
      try {
        const update = await check();
        if (update) {
          // Download in background
          await update.downloadAndInstall(() => {});
          console.warn("[updater] Update downloaded, will install on next restart");
        }
      } catch {
        // No update or check failed — silently ignore
      }
    })();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export function App() {
  return (
    <LoginGate>
      <AppContent />
    </LoginGate>
  );
}
