import { create } from "zustand";
import { prefs } from "@/db/kv";
import { prefKeys } from "@/db/storage/keys";
import { readOptional } from "@/db/storage/repository-helpers";

export type Theme = "light" | "dark" | "sepia" | "blue" | "system";
export type ResolvedTheme = "light" | "dark" | "sepia" | "blue";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(t: Theme): ResolvedTheme {
  return t === "system" ? getSystemTheme() : t;
}

function applyDOMTheme(t: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.classList.toggle("sepia", t === "sepia");
  document.documentElement.classList.toggle("blue", t === "blue");
  document.documentElement.style.colorScheme = t === "dark" || t === "blue" ? "dark" : "light";
}

interface ThemeStore {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  /** Load persisted theme (call once on app mount) */
  init: () => Promise<void>;
  /** Set theme and persist */
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "system",
  resolvedTheme: resolveTheme("system"),

  init: async () => {
    const saved = await readOptional(prefs, prefKeys.theme);
    if (saved === "light" || saved === "dark" || saved === "sepia" || saved === "blue" || saved === "system") {
      const resolved = resolveTheme(saved);
      set({ theme: saved, resolvedTheme: resolved });
      applyDOMTheme(resolved);
    } else {
      // First launch: persist default "system"
      void prefs.set(prefKeys.theme, "system");
      const resolved = getSystemTheme();
      set({ theme: "system", resolvedTheme: resolved });
      applyDOMTheme(resolved);
    }
  },

  setTheme: (t: Theme) => {
    const resolved = resolveTheme(t);
    set({ theme: t, resolvedTheme: resolved });
    applyDOMTheme(resolved);
    void prefs.set(prefKeys.theme, t);
  },
}));

// System theme listener — runs once, globally
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const { theme } = useThemeStore.getState();
    if (theme !== "system") return;
    const resolved: ResolvedTheme = e.matches ? "dark" : "light";
    useThemeStore.setState({ resolvedTheme: resolved });
    applyDOMTheme(resolved);
  });
}
