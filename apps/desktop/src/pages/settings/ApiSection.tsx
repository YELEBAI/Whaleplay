import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Save, Plug, Trash2, KeyRound, Server, Wallet, Plus, CircleCheck, SlidersHorizontal } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Label,
  SwitchButton,
  cn,
} from "@neo-tavern/ui";
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

interface ApiSectionProps {
  t: (key: string, params?: Record<string, string>) => string;
}

export function ApiSection({ t }: ApiSectionProps) {
  const { t: tt } = useTranslation("toast");
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);
  const activeConfigId = useSettingsStore((s) => s.activeConfigId);
  const saving = useSettingsStore((s) => s.saving);
  const testing = useSettingsStore((s) => s.testing);
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
      const re = reasoningEffort || undefined;
      const nextName = name.trim() || DEFAULT_DEEPSEEK_CONFIG_NAME;
      const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
      const nextApiKey = apiKey.trim();
      const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL;
      const nextStreamingEnabled = streamingEnabled;

      if (!nextApiKey) {
        toast("error", tt("apiKeyRequired"));
        return;
      }

      if (selectedId === "__new__") {
        await saveModelConfig({
          provider: "openai-compatible" as const,
          baseUrl: nextBaseUrl,
          apiKey: nextApiKey,
          model: nextModel,
          name: nextName,
          temperature: temp,
          maxTokens: tokens,
          reasoningEffort: re,
          streamingEnabled: nextStreamingEnabled,
        });
        toast("success", tt("apiSaved", { name: nextName }));
        const state = useSettingsStore.getState();
        const created = state.modelConfigs.at(-1);
        if (created) {
          fillForm(created);
          setSelectedId(created.id);
        }
      } else {
        const cfg = modelConfigs.find((c) => c.id === selectedId);
        if (!cfg) return;
        await updateModelConfig(selectedId, {
          provider: "openai-compatible" as const,
          baseUrl: nextBaseUrl,
          apiKey: nextApiKey,
          model: nextModel,
          name: nextName,
          temperature: temp,
          maxTokens: tokens,
          reasoningEffort: re,
          streamingEnabled: nextStreamingEnabled,
        });
        toast("success", tt("apiUpdated", { name: nextName }));
        setSelectedId(selectedId);
      }
    } catch (err) {
      toast("error", (err as Error).message || tt("apiSaveFailed"));
    }
  };

  const handleDelete = async () => {
    if (selectedId === "__new__") return;
    const cfg = modelConfigs.find((c) => c.id === selectedId);
    if (!cfg) return;
    try {
      await deleteModelConfigFromStore(selectedId);
      toast("info", tt("apiDeleted", { name: cfg.name }));
      setSelectedId("__new__");
      resetDeepSeekForm();
    } catch (err) {
      toast("error", (err as Error).message || tt("apiDeleteFailed"));
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast("error", tt("apiKeyRequired"));
      return;
    }
    const result = await testConnection(
      baseUrl.trim() || DEEPSEEK_BASE_URL,
      apiKey.trim(),
      model.trim() || DEFAULT_DEEPSEEK_MODEL,
    );
    toast(result.ok ? "success" : "error", result.message);
  };

  const handleFetchBalance = async () => {
    if (!apiKey.trim()) {
      toast("error", tt("apiKeyRequired"));
      return;
    }
    setCheckingBalance(true);
    try {
      const result = await fetchDeepSeekBalance({
        baseUrl: baseUrl.trim() || DEEPSEEK_BASE_URL,
        apiKey: apiKey.trim(),
      });
      setDeepSeekBalance(result);
      if (result.isAvailable) {
        const cny = result.balances.find((item) => item.currency === "CNY");
        toast("success", cny ? tt("apiBalance", { balance: formatCnyCost(cny.totalBalance) }) : tt("apiBalanceLoaded"));
      } else {
        toast("error", tt("apiBalanceUnavailable"));
      }
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
  const isProModel = isDeepSeekProModel(model);
  const temperatureLocked = isProModel || reasoningEffort !== "";

  const reasoningLabel =
    reasoningEffort === "max"
      ? t("api.reasoningMax")
      : reasoningEffort === "high"
        ? t("api.reasoningHigh")
        : t("api.reasoningOff");

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="border-b pb-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Plug className="h-6 w-6" />
            {t("api.deepseekConnection")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("api.description")}</p>
        </div>
        <p className="text-muted-foreground animate-pulse text-sm">{t("api.loading")}</p>
      </div>
    );
  }

  const sectionHeader = "text-muted-foreground text-xs font-semibold uppercase tracking-wide";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 border-b pb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Plug className="h-6 w-6" />
          {t("api.deepseekConnection")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("api.description")}</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 pt-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Left: scrollable config ── */}
        <div className="min-w-0 space-y-4 overflow-y-auto pr-1">
          {/* ── Card 1: Profile management ── */}
          <Card>
            <CardHeader>
              <CardTitle className="card-title-row">
                <KeyRound className="h-5 w-5" />
                {t("api.connectionProfile")}
              </CardTitle>
              <CardDescription>{t("api.profileDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="config-select" className="mb-1.5 block">
                    {t("api.profiles")}
                  </Label>
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
                      <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {selectedId !== "__new__" && activeConfigId === selectedId && (
                    <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                      <CircleCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      {t("api.active")}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => applyConfigSelection("__new__")}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("api.newProfile")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Card 2: Connection info ── */}
          <Card>
            <CardHeader>
              <CardTitle className="card-title-row">
                <SlidersHorizontal className="h-5 w-5" />
                {t("api.connectionDetails")}
              </CardTitle>
              <CardDescription>{t("api.connectionDetailsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 连接配置 */}
              <div className="space-y-4">
                <h3 className={sectionHeader}>{t("api.credentials")}</h3>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="space-y-1.5">
                    <Label htmlFor="config-name">{t("api.profileName")}</Label>
                    <Input
                      id="config-name"
                      value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                      placeholder={DEFAULT_DEEPSEEK_CONFIG_NAME}
                    />
                  </div>
                  <div className="space-y-1.5">
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
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="base-url">{t("api.baseUrl")}</Label>
                  <div className="relative">
                    <Server className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="base-url"
                      value={baseUrl || DEEPSEEK_BASE_URL}
                      readOnly
                      className="text-muted-foreground bg-muted/50 pl-9 font-mono text-xs"
                    />
                  </div>
                  <p className="text-muted-foreground/60 text-[10px]">{t("api.officialBase")} — api.deepseek.com</p>
                </div>

                <div className="space-y-2">
                  <Label>{t("api.model")}</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEEPSEEK_MODEL_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setModel(option.id);
                          if (!name.trim() || name === DEFAULT_DEEPSEEK_CONFIG_NAME) setName(option.label);
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
                              model === option.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {t("api.models." + option.id + ".badge")}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                          {t("api.modelId")}: {option.id}
                        </p>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {t("api.models." + option.id + ".description")}
                        </p>
                      </button>
                    ))}
                  </div>
                  {isLegacyDeepSeekModel && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t("api.legacyWarning")}</p>
                  )}
                </div>
              </div>

              {/* 生成参数 */}
              <div className="space-y-4">
                <h3 className={sectionHeader}>{t("api.generationDefaults")}</h3>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
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
                  <div className="space-y-1.5">
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
                  {!temperatureLocked && (
                    <div className="space-y-1.5">
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
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("api.streaming")}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{t("api.streamingHint")}</p>
                    </div>
                    <SwitchButton
                      checked={streamingEnabled}
                      onClick={() => setStreamingEnabled(!streamingEnabled)}
                      label={t("api.toggleStreaming")}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row">
                <Button onClick={handleSave} disabled={saving} className="flex-[2]">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? t("api.saving") : t("api.saveProfile")}
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="flex-1">
                  <Plug className="mr-2 h-4 w-4" />
                  {testing ? t("api.testing") : t("api.testConnection")}
                </Button>
                <Button variant="outline" onClick={handleFetchBalance} disabled={checkingBalance} className="flex-1">
                  <Wallet className="mr-2 h-4 w-4" />
                  {checkingBalance ? t("api.balanceChecking") : t("api.balance")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: summary ── */}
        <div className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <Card className="bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="card-title-row text-sm">
                <CircleCheck className="h-4 w-4" />
                {t("api.currentDefault")}
              </CardTitle>
              <CardDescription>{t("api.currentDefaultDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("api.profileName")}</p>
                <p className="mt-1 truncate text-sm font-medium">
                  {selectedId === "__new__" ? t("api.newProfile") : name || model || "—"}
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("api.model")}</p>
                <p className="mt-1 truncate font-mono text-xs">{model || DEFAULT_DEEPSEEK_MODEL}</p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("api.endpoint")}</p>
                <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
                  {baseUrl || DEEPSEEK_BASE_URL}
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("api.reasoningEffort")}</p>
                <p className="mt-1 text-sm">{reasoningLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("api.maxTokens")}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">{maxTokens || "—"}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("api.streaming")}</p>
                  <p className="mt-1 text-sm font-medium">{streamingEnabled ? t("api.enabled") : t("api.disabled")}</p>
                </div>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("api.balance")}</p>
                {deepSeekBalance ? (
                  <div className="mt-1 space-y-0.5">
                    {deepSeekBalance.balances.map((balance) => (
                      <p key={balance.currency} className="text-sm tabular-nums">
                        <span className="font-medium">{balance.currency}</span>{" "}
                        {balance.currency === "CNY"
                          ? formatCnyCost(balance.totalBalance)
                          : balance.totalBalance.toFixed(4)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1 text-xs">—</p>
                )}
              </div>
              {deepSeekBalance && !deepSeekBalance.isAvailable && (
                <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
                  Balance unavailable
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
