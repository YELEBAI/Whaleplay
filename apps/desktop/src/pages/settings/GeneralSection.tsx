import { useState, useEffect } from "react";
import { Bell, Bug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Button } from "@neo-tavern/ui";
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
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
              <p className="mt-1 text-xs text-muted-foreground">{t("general.debugHint")}</p>
            </div>
            <SwitchButton
              checked={debugMode}
              onClick={() => setDebugMode(!debugMode)}
              label={t("general.toggleDebug")}
            />
          </div>
          {debugMode && (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">{t("general.dailyCostHint")}</p>
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
              <div className="rounded-md border bg-accent/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Today spent</p>
                <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyCostSpentCny)}>
                  {formatCnyCost(dailyCostSpentCny)}
                </p>
              </div>
              <div className="rounded-md border bg-accent/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Warning at</p>
                <p className="mt-1 text-sm font-semibold tabular-nums" title={formatCnyExact(dailyWarningAtCny)}>
                  {formatCnyCost(dailyWarningAtCny)}
                </p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${dailyCostRate >= 80 ? "bg-destructive" : "bg-primary"}`}
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
                <p className="text-xs text-muted-foreground mt-0.5">{t("appearance.languageHint")}</p>
              </div>
              <select
                value={locale}
                onChange={(e) => {
                  const next = e.target.value as Locale;
                  setLocale(next);
                  changeLocale(next);
                }}
                className="h-8 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("appearance.lanServer")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("appearance.lanEnable")}</p>
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
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${lanEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${lanEnabled ? "translate-x-5" : "translate-x-0.5"}`}
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
                      className="h-7 text-xs mt-1"
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
                      className="h-7 text-xs mt-1"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">{t("appearance.lanRestartHint")}</p>
                <div className="pt-2 border-t">
                  <Label className="text-xs">{t("appearance.lanPassword")}</Label>
                  <p className="text-[10px] text-muted-foreground mb-1">{t("appearance.lanPasswordHint")}</p>
                  <div className="flex gap-2">
                    <Input value={lanPassword} readOnly className="h-7 text-xs font-mono flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] shrink-0"
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
    </div>
  );
}
