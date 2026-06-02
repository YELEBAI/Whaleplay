import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem("neotavern_locale") || "zh",
  fallbackLng: "zh",
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export function changeLocale(locale: Locale) {
  i18n.changeLanguage(locale);
  localStorage.setItem("neotavern_locale", locale);
}

export function getLocale(): Locale {
  return (i18n.language as Locale) || "zh";
}

export default i18n;
