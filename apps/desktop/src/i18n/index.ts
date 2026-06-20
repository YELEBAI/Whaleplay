import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { prefs } from "@/db/kv";
import { prefKeys } from "@/db/storage/keys";
import { readOptional } from "@/db/storage/repository-helpers";

// Eagerly load all locale JSON files at build time.
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
const modules = import.meta.glob("../locales/*/*.json", { eager: true });

for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  if (!resources[lang]) resources[lang] = {};
  resources[lang][ns] = (mod as { default: Record<string, unknown> }).default;
}

export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Fast synchronous default — overridden by loadPersistedLocale() in main.tsx.
i18n.use(initReactI18next).init({
  resources,
  lng: "zh",
  fallbackLng: "zh",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Load persisted locale from the selected authoritative preferences driver. */
export async function loadPersistedLocale() {
  try {
    const saved = await readOptional(prefs, prefKeys.locale);
    if (saved && (saved === "zh" || saved === "en") && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
  } catch {
    /* Fall back to the default */
  }
}

export function changeLocale(locale: Locale) {
  i18n.changeLanguage(locale);
  void prefs.set(prefKeys.locale, locale);
}

export function getLocale(): Locale {
  return (i18n.language as Locale) || "zh";
}

export default i18n;
