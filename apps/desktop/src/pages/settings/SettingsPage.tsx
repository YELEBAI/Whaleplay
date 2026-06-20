import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bug, Plug, Palette, Regex, SlidersHorizontal, Image as ImageIcon } from "lucide-react";
import { useSettingsStore } from "@/features/settings/settings.store";
import { sessionSync } from "@/db/kv";
import { SettingsSidebar } from "./SettingsSidebar";
import { AppearanceSection } from "./AppearanceSection";
import { ContextSection } from "./ContextSection";
import { GeneralSection } from "./GeneralSection";
import { ApiSection } from "./ApiSection";
import { ImageSection } from "./ImageSection";
import { RegexSection } from "./RegexSection";
import { toast } from "@/utils/toast";
import { getLocale, type Locale } from "@/i18n";
import { useTranslation } from "react-i18next";
import type { Section, SectionWithLabel } from "./types";

const SETTINGS_TAB_TTL_MS = 60_000; // 1 minute

function readCachedTab(): Section | null {
  try {
    const raw = sessionSync.get("settings-tab");
    if (!raw) return null;
    const { tab, ts } = JSON.parse(raw) as { tab: string; ts: number };
    if (Date.now() - ts > SETTINGS_TAB_TTL_MS) {
      sessionSync.remove("settings-tab");
      return null;
    }
    return tab as Section;
  } catch {
    return null;
  }
}

function writeCachedTab(tab: Section) {
  sessionSync.setJson("settings-tab", { tab, ts: Date.now() });
}

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>(() => readCachedTab() ?? "api");
  const [locale, setLocale] = useState<Locale>(getLocale);
  const [easterEggClicks, setEasterEggClicks] = useState(0);
  const [secretUnlocked, setSecretUnlocked] = useState(() => sessionSync.get("secret-unlocked") === "1");

  // Persist selected tab in the session namespace (1-minute TTL).
  useEffect(() => {
    writeCachedTab(section);
  }, [section]);

  const contextTokens = useSettingsStore((s) => s.contextTokens);
  const setContextTokens = useSettingsStore((s) => s.setContextTokens);
  const loadAllConfigs = useSettingsStore((s) => s.loadAllConfigs);
  const loadRegexRules = useSettingsStore((s) => s.loadRegexRules);
  const loadMemorySettings = useSettingsStore((s) => s.loadMemorySettings);
  const loadImageGenerationSettings = useSettingsStore((s) => s.loadImageGenerationSettings);
  const loadDailyCostWarningSettings = useSettingsStore((s) => s.loadDailyCostWarningSettings);
  const loadDailyCostSpent = useSettingsStore((s) => s.loadDailyCostSpent);

  const sections: SectionWithLabel[] = [
    { key: "general", icon: Bug, label: t("sections.general") },
    { key: "api", icon: Plug, label: t("sections.api") },
    { key: "appearance", icon: Palette, label: t("sections.appearance") },
    { key: "context", icon: SlidersHorizontal, label: t("sections.context") },
    { key: "image", icon: ImageIcon, label: t("sections.image") },
    { key: "regex", icon: Regex, label: t("sections.regex") },
  ];

  useEffect(() => {
    loadAllConfigs();
    loadRegexRules();
    loadMemorySettings();
    loadImageGenerationSettings();
    loadDailyCostWarningSettings();
    loadDailyCostSpent();
  }, [
    loadAllConfigs,
    loadRegexRules,
    loadMemorySettings,
    loadImageGenerationSettings,
    loadDailyCostWarningSettings,
    loadDailyCostSpent,
  ]);

  const handleContextEasterEgg = () => {
    if (secretUnlocked) {
      setSection("context");
      return;
    }
    const next = easterEggClicks + 1;
    setEasterEggClicks(next);
    if (next >= 10) {
      sessionSync.set("secret-unlocked", "1");
      setSecretUnlocked(true);
      window.dispatchEvent(new Event("neotavern-secret-changed"));
      toast("success", tt("secretUnlocked"));
    }
    setSection("context");
  };

  return (
    <div className="flex h-full">
      <SettingsSidebar
        section={section}
        sections={sections}
        onSelect={(s) => (s === "context" ? handleContextEasterEgg() : setSection(s))}
        onBack={() => navigate("/")}
        onContextClick={handleContextEasterEgg}
        t={t}
      />

      <div className="flex-1 overflow-auto p-6">
        {section === "general" && <GeneralSection locale={locale} setLocale={setLocale} t={t} />}
        {section === "api" && <ApiSection t={t} />}
        {section === "appearance" && <AppearanceSection t={t} />}
        {section === "context" && (
          <ContextSection contextTokens={contextTokens} setContextTokens={setContextTokens} t={t} />
        )}
        {section === "image" && <ImageSection t={t} />}
        {section === "regex" && <RegexSection t={t} />}
      </div>
    </div>
  );
}
