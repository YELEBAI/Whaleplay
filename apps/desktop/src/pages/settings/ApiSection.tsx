import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Save, Plug, Trash2, KeyRound, Server, Zap, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input, Label, cn } from "@neo-tavern/ui";
import { normalizeReasoningEffort, useSettingsStore } from "@/features/settings/settings.store";
import { toast } from "@/utils/toast";
import { fetchDeepSeekBalance, formatCnyCost, type DeepSeekBalanceResult } from "@/features/billing/deepseek-billing";
import { isDeepSeekProModel } from "@/features/settings/model-capabilities";
import {
  DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_CONFIG_NAME,
  DEEPSEEK_LEGACY_MODELS,
  DEEPSEEK_MODEL_OPTIONS,
} from "./types";

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

interface ApiSectionProps {
  t: (key: string, params?: Record<string, string>) => string;
}

export function ApiSection({ t }: ApiSectionProps) {
  const { t: tt } = useTranslation("toast");
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);
  const activeConfigId = useSettingsStore((s) => s.activeConfigId);
  const saving = useSettingsStore((s) => s.saving);
  const testing = useSettingsStore((s) => s.testing);
  const error = useSettingsStore((s) => s.error);
  const loadAllConfigs = useSettingsStore((s) => s.loadAllConfigs);
  const selectConfig = useSettingsStore((s) => s.selectConfig);
  const saveModelConfig = useSettingsStore((s) => s.saveModelConfig);
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig);
  const deleteModelConfigFromStore = useSettingsStore((s) => s.deleteModelConfig);
  const testConnection = useSettingsStore((s) => s.testConnection);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("0.8");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("__new__");

  const [checkingBalance, setCheckingBalance] = useState(false);
  const [deepSeekBalance, setDeepSeekBalance] = useState<DeepSeekBalanceResult | null>(null);

  const fillForm = (cfg: {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    reasoningEffort?: string;
    streamingEnabled?: boolean;
  }) => {
    setName(cfg.name);
    setBaseUrl(cfg.baseUrl);
    setApiKey(cfg.apiKey);
    setModel(cfg.model);
    setTemperature(String(cfg.temperature));
    setMaxTokens(String(cfg.maxTokens));
    setReasoningEffort(normalizeReasoningEffort(cfg.reasoningEffort) || "");
    setStreamingEnabled(cfg.streamingEnabled !== false);
  };

  const resetDeepSeekForm = () => {
    setName(DEFAULT_DEEPSEEK_CONFIG_NAME);
    setBaseUrl(DEEPSEEK_BASE_URL);
    setApiKey("");
    setModel(DEFAULT_DEEPSEEK_MODEL);
    setTemperature("0.8");
    setMaxTokens("4096");
    setReasoningEffort("");
    setStreamingEnabled(true);
    setDeepSeekBalance(null);
  };

  const applyConfigSelection = (id: string) => {
    setSelectedId(id);
    if (id === "__new__") {
      resetDeepSeekForm();
      return;
    }
    const cfg = modelConfigs.find((c) => c.id === id);
    if (cfg) {
      selectConfig(id);
      fillForm(cfg);
      setDeepSeekBalance(null);
    }
  };

  const handleSave = async () => {
    try {
      const temp = parseFloat(temperature) || 0.8;
      const tokens = parseInt(maxTokens) || 4096;
      const re = normalizeReasoningEffort(reasoningEffort);
      const nextName = name.trim() || DEFAULT_DEEPSEEK_CONFIG_NAME;
      const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
      const nextApiKey = apiKey.trim();
      const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL;
      const nextStreamingEnabled = streamingEnabled;
      if (!nextApiKey) {
        toast("error", tt("apiKeyRequired"));
        return;
      }
      if (selectedId !== "__new__" && modelConfigs.some((c) => c.id === selectedId)) {
        await updateModelConfig(selectedId, {
          baseUrl: nextBaseUrl,
          apiKey: nextApiKey,
          model: nextModel,
          name: nextName,
          temperature: temp,
          maxTokens: tokens,
          reasoningEffort: re,
          streamingEnabled: nextStreamingEnabled,
        });
        setName(nextName);
        setBaseUrl(nextBaseUrl);
        setApiKey(nextApiKey);
        setModel(nextModel);
        toast("success", tt("apiUpdated", { name: nextName }));
      } else {
        const cfg = await saveModelConfig({
          provider: "openai-compatible",
          baseUrl: nextBaseUrl,
          apiKey: nextApiKey,
          model: nextModel,
          name: nextName,
          temperature: temp,
          maxTokens: tokens,
          reasoningEffort: re,
          streamingEnabled: nextStreamingEnabled,
        });
        setName(nextName);
        setBaseUrl(nextBaseUrl);
        setApiKey(nextApiKey);
        setModel(nextModel);
        setSelectedId(cfg.id);
        toast("success", tt("apiSaved", { name: nextName }));
      }
    } catch {
      toast("error", error || tt("apiSaveFailed"));
    }
  };

  const handleDelete = async () => {
    if (selectedId === "__new__") return;
    const cfg = modelConfigs.find((c) => c.id === selectedId);
    if (!cfg) return;
    try {
      await deleteModelConfigFromStore(selectedId);
      const state = useSettingsStore.getState();
      if (state.modelConfig) {
        fillForm(state.modelConfig);
        setSelectedId(state.modelConfig.id);
      } else {
        resetDeepSeekForm();
        setSelectedId("__new__");
      }
      toast("info", tt("apiDeleted", { name: cfg.name || "Configuration" }));
    } catch {
      toast("error", error || tt("apiDeleteFailed"));
    }
  };

  const handleTestConnection = async () => {
    const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
    const nextApiKey = apiKey.trim();
    const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL;
    if (!nextApiKey) {
      toast("error", tt("apiKeyRequired"));
      return;
    }
    setBaseUrl(nextBaseUrl);
    setModel(nextModel);
    const result = await testConnection(nextBaseUrl, nextApiKey, nextModel);
    if (result.ok) toast("success", result.message);
    else toast("error", result.message);
  };

  const handleFetchBalance = async () => {
    const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
    const nextApiKey = apiKey.trim();
    if (!nextApiKey) {
      toast("error", tt("apiKeyRequired"));
      return;
    }
    setBaseUrl(nextBaseUrl);
    setCheckingBalance(true);
    try {
      const result = await fetchDeepSeekBalance({ baseUrl: nextBaseUrl, apiKey: nextApiKey });
      setDeepSeekBalance(result);
      const cny = result.balances.find((item) => item.currency === "CNY");
      toast("success", cny ? tt("apiBalance", { balance: formatCnyCost(cny.totalBalance) }) : tt("apiBalanceLoaded"));
    } catch (err) {
      toast("error", tt("apiBalanceFailed", { message: (err as Error).message }));
    } finally {
      setCheckingBalance(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await loadAllConfigs();
      if (cancelled) return;
      const state = useSettingsStore.getState();
      if (state.modelConfig) {
        const c = state.modelConfig;
        fillForm(c);
        setSelectedId(c.id);
      } else {
        setSelectedId("__new__");
        resetDeepSeekForm();
      }
      setLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAllConfigs]);

  const isLegacyDeepSeekModel = DEEPSEEK_LEGACY_MODELS.includes(model);
  const selectedProfile = selectedId === "__new__" ? null : (modelConfigs.find((c) => c.id === selectedId) ?? null);
  const selectedProfileName = selectedProfile?.name || selectedProfile?.model || "New profile";
  const displayBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
  const temperatureLocked = isDeepSeekProModel(model) || reasoningEffort !== "";

  return (
    <div className="max-w-5xl space-y-4">
      <div className="border-b pb-5">
        <div className="space-y-2">
          <div className="border-primary/30 bg-primary/10 text-primary inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium">
            <span className="bg-primary h-2 w-2 rounded-full" />
            {t("api.deepseekDedicated")}
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-normal">
              <Plug className="h-6 w-6" />
              {t("api.deepseekConnection")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("api.description")}</p>
          </div>
        </div>
      </div>

      {!loaded && <p className="text-muted-foreground animate-pulse text-sm">{t("api.loading")}</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="card-title-row">
              <KeyRound className="h-5 w-5" />
              {t("api.connectionProfile")}
            </CardTitle>
            <CardDescription>{t("api.profileDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-2">
                <Label htmlFor="api-key">{t("api.apiKey")}</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-select">{t("api.profiles")}</Label>
                <div className="flex gap-2">
                  <select
                    id="config-select"
                    value={selectedId}
                    onChange={(e) => applyConfigSelection(e.target.value)}
                    className="border-input focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <option value="__new__">{t("api.newProfile")}</option>
                    {modelConfigs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.model || c.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  {selectedId !== "__new__" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="text-destructive hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {selectedId !== "__new__" && activeConfigId === selectedId && (
                  <p className="text-xs text-green-600 dark:text-green-400">{t("api.active")}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("api.model")}</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {DEEPSEEK_MODEL_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setModel(option.id);
                      if (!name.trim() || name.startsWith("DeepSeek")) setName(option.label);
                    }}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors",
                      model === option.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t("api.models." + option.id + ".label")}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          model === option.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t("api.models." + option.id + ".badge")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 font-mono text-[11px]">{option.id}</p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {t("api.models." + option.id + ".description")}
                    </p>
                  </button>
                ))}
              </div>
              {isLegacyDeepSeekModel && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Legacy alias. Switch to a V4 model before July 24, 2026.
                </p>
              )}
            </div>

            <details className="rounded-md border">
              <summary className="cursor-pointer px-3 py-3 text-sm font-medium">{t("api.advancedOptions")}</summary>
              <div className="space-y-4 border-t p-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="config-name">{t("api.profileName")}</Label>
                    <Input
                      id="config-name"
                      value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                      placeholder={DEFAULT_DEEPSEEK_CONFIG_NAME}
                    />
                  </div>
                  <div>
                    <Label htmlFor="model">{t("api.modelId")}</Label>
                    <Input
                      id="model"
                      value={model}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
                      placeholder={DEFAULT_DEEPSEEK_MODEL}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="base-url">{t("api.baseUrl")}</Label>
                  <div className="relative">
                    <Server className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                      placeholder={DEEPSEEK_BASE_URL}
                      className="pl-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className={cn("grid gap-4", temperatureLocked ? "md:grid-cols-2" : "md:grid-cols-3")}>
                  {!temperatureLocked && (
                    <div>
                      <Label htmlFor="temperature">{t("api.temperature")}</Label>
                      <Input
                        id="temperature"
                        value={temperature}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemperature(e.target.value)}
                        placeholder="0.8"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="max-tokens">{t("api.maxTokens")}</Label>
                    <Input
                      id="max-tokens"
                      value={maxTokens}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxTokens(e.target.value)}
                      placeholder="4096"
                      type="number"
                      min="1"
                      max="384000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reasoning-effort">{t("api.reasoningEffort")}</Label>
                    <select
                      id="reasoning-effort"
                      value={reasoningEffort}
                      onChange={(e) => setReasoningEffort(e.target.value)}
                      className="border-input focus-visible:ring-ring h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <option value="">{t("api.reasoningOff")}</option>
                      <option value="high">{t("api.reasoningHigh")}</option>
                      <option value="max">{t("api.reasoningMax")}</option>
                    </select>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("api.streaming")}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{t("api.streamingHint")}</p>
                  </div>
                  <SwitchButton
                    checked={streamingEnabled}
                    onClick={() => setStreamingEnabled(!streamingEnabled)}
                    label="Toggle live text display"
                  />
                </div>
              </div>
            </details>

            <div className="bg-accent/30 flex flex-col gap-2 rounded-md border p-3 sm:flex-row">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("api.saving") : t("api.saveProfile")}
              </Button>
              <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="sm:min-w-[120px]">
                <Plug className="mr-2 h-4 w-4" />
                {testing ? t("api.testing") : t("api.testConnection")}
              </Button>
              <Button
                variant="outline"
                onClick={handleFetchBalance}
                disabled={checkingBalance}
                className="sm:min-w-[120px]"
              >
                <Wallet className="mr-2 h-4 w-4" />
                {checkingBalance ? t("api.balanceChecking") : t("api.balance")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="card-title-row">
              <Zap className="h-5 w-5" />
              {t("api.currentDefault")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{t("api.profiles")}</p>
              <p className="mt-1 truncate font-medium">
                {selectedId === "__new__" ? "New profile" : selectedProfileName}
              </p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{t("api.model")}</p>
              <p className="mt-1 truncate font-mono text-xs">{model || DEFAULT_DEEPSEEK_MODEL}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{t("api.endpoint")}</p>
              <p className="mt-1 truncate font-mono text-xs">{displayBaseUrl}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{t("api.balance")}</p>
              {deepSeekBalance ? (
                <div className="mt-1 space-y-1">
                  {deepSeekBalance.balances.map((balance) => (
                    <p key={balance.currency} className="tabular-nums">
                      <span className="font-medium">{balance.currency}</span>{" "}
                      {balance.currency === "CNY"
                        ? formatCnyCost(balance.totalBalance)
                        : balance.totalBalance.toFixed(4)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground mt-1">Not checked</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground">{t("sections.context")}</p>
                <p className="mt-1 font-semibold">1M</p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground">Output</p>
                <p className="mt-1 font-semibold">384K</p>
              </div>
            </div>
            {deepSeekBalance && !deepSeekBalance.isAvailable && (
              <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
                Balance is unavailable for API calls.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
