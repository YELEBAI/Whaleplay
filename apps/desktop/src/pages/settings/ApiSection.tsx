import { useState, useEffect } from "react";
import { Save, Plug, Trash2, KeyRound, Server, Zap, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input, Label } from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface ApiSectionProps {
  t: (key: string, params?: Record<string, string>) => string;
}

export function ApiSection({ t }: ApiSectionProps) {
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
    setReasoningEffort(cfg.reasoningEffort || "");
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
        toast("error", "Please enter your DeepSeek API key first.");
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
        toast("success", `"${nextName}" updated.`);
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
        toast("success", `"${nextName}" saved.`);
      }
    } catch {
      toast("error", error || "Failed to save configuration.");
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
      toast("info", `"${cfg.name || "Configuration"}" deleted.`);
    } catch {
      toast("error", error || "Failed to delete.");
    }
  };

  const handleTestConnection = async () => {
    const nextBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
    const nextApiKey = apiKey.trim();
    const nextModel = model.trim() || DEFAULT_DEEPSEEK_MODEL;
    if (!nextApiKey) {
      toast("error", "Please enter your DeepSeek API key first.");
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
      toast("error", "Please enter your DeepSeek API key first.");
      return;
    }
    setBaseUrl(nextBaseUrl);
    setCheckingBalance(true);
    try {
      const result = await fetchDeepSeekBalance({ baseUrl: nextBaseUrl, apiKey: nextApiKey });
      setDeepSeekBalance(result);
      const cny = result.balances.find((item) => item.currency === "CNY");
      toast("success", cny ? `DeepSeek balance: ${formatCnyCost(cny.totalBalance)}` : "DeepSeek balance loaded");
    } catch (err) {
      toast("error", `Balance failed: ${(err as Error).message}`);
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
  }, []);

  const isLegacyDeepSeekModel = DEEPSEEK_LEGACY_MODELS.includes(model);
  const selectedProfile = selectedId === "__new__" ? null : (modelConfigs.find((c) => c.id === selectedId) ?? null);
  const selectedProfileName = selectedProfile?.name || selectedProfile?.model || "New profile";
  const displayBaseUrl = baseUrl.trim() || DEEPSEEK_BASE_URL;
  const temperatureLocked = isDeepSeekProModel(model);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="border-b pb-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {t("api.deepseekDedicated")}
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-normal">
              <Plug className="h-6 w-6" />
              {t("api.deepseekConnection")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("api.description")}</p>
          </div>
        </div>
      </div>

      {!loaded && <p className="text-sm text-muted-foreground animate-pulse">{t("api.loading")}</p>}

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
                    className="min-w-0 flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    className={`rounded-md border p-3 text-left transition-colors ${
                      model === option.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          model === option.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {option.badge}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{option.id}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
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
              <summary className="cursor-pointer px-3 py-3 text-sm font-medium">Advanced options</summary>
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
                    <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                      placeholder={DEEPSEEK_BASE_URL}
                      className="pl-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className={`grid gap-4 ${temperatureLocked ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
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
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Default</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Live text</p>
                    <p className="mt-1 text-xs text-muted-foreground">Show output while it is generating.</p>
                  </div>
                  <SwitchButton
                    checked={streamingEnabled}
                    onClick={() => setStreamingEnabled(!streamingEnabled)}
                    label="Toggle live text display"
                  />
                </div>
              </div>
            </details>

            <div className="flex flex-col gap-2 rounded-md border bg-accent/30 p-3 sm:flex-row">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="sm:min-w-[120px]">
                <Plug className="h-4 w-4 mr-2" />
                {testing ? "Testing..." : "Test"}
              </Button>
              <Button
                variant="outline"
                onClick={handleFetchBalance}
                disabled={checkingBalance}
                className="sm:min-w-[120px]"
              >
                <Wallet className="h-4 w-4 mr-2" />
                {checkingBalance ? "Checking..." : "Balance"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="card-title-row">
              <Zap className="h-5 w-5" />
              Current Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("api.profiles")}</p>
              <p className="mt-1 truncate font-medium">
                {selectedId === "__new__" ? "New profile" : selectedProfileName}
              </p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("api.model")}</p>
              <p className="mt-1 truncate font-mono text-xs">{model || DEFAULT_DEEPSEEK_MODEL}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Endpoint</p>
              <p className="mt-1 truncate font-mono text-xs">{displayBaseUrl}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Balance</p>
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
                <p className="mt-1 text-muted-foreground">Not checked</p>
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
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Balance is unavailable for API calls.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
