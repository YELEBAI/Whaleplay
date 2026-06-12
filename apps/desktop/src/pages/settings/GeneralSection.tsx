import { useState, useEffect } from "react";
import { Bell, Bug, Globe, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Button, cn } from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import { getStorageItem, setStorageItem } from "@/db/storage";
import { changeLocale, type Locale } from "@/i18n";
import { formatCnyCost, formatCnyExact } from "@/features/billing/deepseek-billing";
import { DAILY_COST_WARNING_RATIO } from "@/features/billing/daily-cost";

function SwitchButton({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "bg-background inline-block h-5 w-5 rounded-full shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

interface GeneralSectionProps {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export function GeneralSection({ locale, setLocale, t }: GeneralSectionProps) {
  const debugMode = useSettingsStore((s) => s.debugMode);
  const setDebugMode = useSettingsStore((s) => s.setDebugMode);
  const dailyCostWarningEnabled = useSettingsStore((s) => s.dailyCostWarningEnabled);
  const dailyCostWarningLimitCny = useSettingsStore((s) => s.dailyCostWarningLimitCny);
  const dailyCostSpentCny = useSettingsStore((s) => s.dailyCostSpentCny);
  const setDailyCostWarningEnabled = useSettingsStore((s) => s.setDailyCostWarningEnabled);
  const setDailyCostWarningLimitCny = useSettingsStore((s) => s.setDailyCostWarningLimitCny);
  const webSearchProvider = useSettingsStore((s) => s.webSearchProvider);
  const tavilyApiKey = useSettingsStore((s) => s.tavilyApiKey);
  const tavilySearchDepth = useSettingsStore((s) => s.tavilySearchDepth);
  const setWebSearchProvider = useSettingsStore((s) => s.setWebSearchProvider);
  const setTavilyApiKey = useSettingsStore((s) => s.setTavilyApiKey);
  const setTavilySearchDepth = useSettingsStore((s) => s.setTavilySearchDepth);
  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);
  const setAutoUpdateEnabled = useSettingsStore((s) => s.setAutoUpdateEnabled);

  const [lanEnabled, setLanEnabled] = useState(false);
  const [lanAddr, setLanAddr] = useState("0.0.0.0");
  const [lanPort, setLanPort] = useState("3000");
  const [lanPassword, setLanPassword] = useState("");

  useEffect(() => {
    (async () => {
      const en = await getStorageItem("neotavern_lan_enabled");
      const ad = await getStorageItem("neotavern_lan_addr");
      const po = await getStorageItem("neotavern_lan_port");
      const pw = await getStorageItem("neotavern_lan_password");
      setLanEnabled(en === "true");
      if (ad) setLanAddr(ad);
      if (po) setLanPort(po);
      if (pw) setLanPassword(pw);
    })();
  }, []);

  const handleRegenPassword = async () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&";
    let pw = "";
    const buf = new Uint32Array(12);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 12; i++) pw += chars[buf[i] % chars.length];
    setLanPassword(pw);
    await setStorageItem("neotavern_lan_password", pw);
  };

  const dailyWarningAtCny = dailyCostWarningLimitCny * DAILY_COST_WARNING_RATIO;
  const dailyCostRate =
    dailyCostWarningLimitCny > 0 ? Math.min(999, (dailyCostSpentCny / dailyCostWarningLimitCny) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="card-title-row">
            <Bug className="h-5 w-5" />
            {t("general.title")}
          </CardTitle>
          <CardDescription>{t("general.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="setting-row">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("general.debugMode")}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t("general.debugHint")}</p>
            </div>
            <SwitchButton
              checked={debugMode}
              onClick={() => setDebugMode(!debugMode)}
              label={t("general.toggleDebug")}
            />
          </div>
          {debugMode && (
            <p className="border-primary/20 bg-primary/5 text-muted-foreground rounded-md border px-3 py-2 text-xs">
              {t("general.debugDetail")}
            </p>
          )}
          <div className="space-y-3 rounded-md border px-3 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Bell className="h-4 w-4" />
                  {t("general.dailyCostWarning")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{t("general.dailyCostHint")}</p>
              </div>
              <SwitchButton
                checked={dailyCostWarningEnabled}
                onClick={() => setDailyCostWarningEnabled(!dailyCostWarningEnabled)}
                label={t("general.toggleDailyCost")}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">{t("general.dailyCostLimitYuan")}</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={dailyCostWarningLimitCny}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDailyCostWarningLimitCny(parseFloat(e.target.value))
                  }
                />
              </div>
              <div className="bg-accent/30 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">Today spent</p>
                <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyCostSpentCny)}>
                  {formatCnyCost(dailyCostSpentCny)}
                </p>
              </div>
              <div className="bg-accent/30 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">Warning at</p>
                <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyWarningAtCny)}>
                  {formatCnyCost(dailyWarningAtCny)}
                </p>
              </div>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  dailyCostRate >= 80 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, dailyCostRate)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language + LAN */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("appearance.language")}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{t("appearance.languageHint")}</p>
              </div>
              <select
                value={locale}
                onChange={(e) => {
                  const next = e.target.value as Locale;
                  setLocale(next);
                  changeLocale(next);
                }}
                className="border-input focus-visible:ring-ring h-8 rounded-md border bg-transparent px-2 py-0.5 text-xs shadow-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border px-3 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("appearance.lanServer")}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{t("appearance.lanEnable")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lanEnabled}
                onClick={async () => {
                  const next = !lanEnabled;
                  setLanEnabled(next);
                  await setStorageItem("neotavern_lan_enabled", String(next));
                }}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                  lanEnabled ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "bg-background inline-block h-5 w-5 rounded-full shadow-sm transition-transform",
                    lanEnabled ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
            {lanEnabled && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t("appearance.lanAddr")}</Label>
                    <Input
                      value={lanAddr}
                      onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                        setLanAddr(e.target.value);
                        await setStorageItem("neotavern_lan_addr", e.target.value);
                      }}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("appearance.lanPort")}</Label>
                    <Input
                      value={lanPort}
                      onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                        setLanPort(e.target.value);
                        await setStorageItem("neotavern_lan_port", e.target.value);
                      }}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-[10px]">{t("appearance.lanRestartHint")}</p>
                <div className="border-t pt-2">
                  <Label className="text-xs">{t("appearance.lanPassword")}</Label>
                  <p className="text-muted-foreground mb-1 text-[10px]">{t("appearance.lanPasswordHint")}</p>
                  <p className="text-muted-foreground/70 mb-2 text-[10px]">{t("appearance.lanPasswordNote")}</p>
                  <div className="flex gap-2">
                    <Input value={lanPassword} readOnly className="h-7 flex-1 font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 text-[10px]"
                      onClick={handleRegenPassword}
                    >
                      {t("appearance.lanPasswordGenerate")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Web Search */}
      <Card>
        <CardHeader>
          <CardTitle className="card-title-row">
            <Globe className="h-5 w-5" />
            {t("websearch.title")}
          </CardTitle>
          <CardDescription>{t("websearch.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Provider selector */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-xs font-medium">{t("websearch.provider")}</span>
                <span className="group relative inline-flex">
                  <span className="bg-muted text-muted-foreground inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[9px] font-bold">
                    ?
                  </span>
                  <span className="bg-foreground text-background pointer-events-none absolute -top-7 left-0 rounded px-2 py-1 text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                    {t("websearch.help")}
                  </span>
                </span>
              </div>
              <select
                value={webSearchProvider}
                onChange={(e) => setWebSearchProvider(e.target.value as typeof webSearchProvider)}
                className="bg-background focus-visible:ring-ring w-52 rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                <option value="default">{t("websearch.default")}</option>
                <option value="tavily">Tavily</option>
              </select>
            </div>

            {/* Tavily config */}
            {webSearchProvider === "tavily" && (
              <>
                <div className="border-t pt-4">
                  <Label htmlFor="tavily-key" className="text-xs">
                    {t("websearch.tavilyKey")}
                  </Label>
                  <Input
                    id="tavily-key"
                    type="password"
                    value={tavilyApiKey}
                    onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder="tvly-..."
                    className="mt-1 h-8 w-1/2 text-xs"
                  />
                  <p className="text-muted-foreground mt-1 text-[10px]">{t("websearch.tavilyKeyHint")}</p>
                </div>
                <div>
                  <Label htmlFor="tavily-depth" className="text-xs">
                    {t("websearch.depth")}
                  </Label>
                  <select
                    id="tavily-depth"
                    value={tavilySearchDepth}
                    onChange={(e) => setTavilySearchDepth(e.target.value as typeof tavilySearchDepth)}
                    className="bg-background focus-visible:ring-ring mt-1 w-52 rounded-md border px-2 py-1 text-xs shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <option value="fast">{t("websearch.depthFast")}</option>
                    <option value="basic">{t("websearch.depthBasic")}</option>
                    <option value="advanced">{t("websearch.depthAdvanced")}</option>
                    <option value="ultra-fast">{t("websearch.depthUltraFast")}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="card-title-row">
            <RefreshCw className="h-5 w-5" />
            {t("general.autoUpdate")}
          </CardTitle>
          <CardDescription>{t("general.autoUpdateHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border px-3 py-3">
            <div>
              <p className="text-sm font-medium">{t("general.autoUpdateToggle")}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t("general.autoUpdateToggleHint")}</p>
            </div>
            <SwitchButton
              checked={autoUpdateEnabled}
              onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
              label={t("general.autoUpdateToggle")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
