import { useState } from "react";
import { BrainCircuit, Download, PlugZap } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, cn } from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import { checkOllama, embedTexts, pullOllamaModel } from "@/features/rag/ollama-client";
import { downloadBuiltinEmbeddingModel } from "@/features/rag/builtin-embedding";
import { RAG_EMBEDDING_MODEL_PRESETS, normalizeRagMemorySettings } from "@/features/rag/rag-settings";
import type { RagMemorySettings } from "@/features/rag/rag-settings";
import { toast } from "@/utils/toast";
import type { SettingsSectionProps } from "./types";

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

export function RagSection({ t }: SettingsSectionProps) {
  const ragMemory = useSettingsStore((state) => state.ragMemory);
  const updateRagMemorySettings = useSettingsStore((state) => state.updateRagMemorySettings);
  const modelConfigs = useSettingsStore((state) => state.modelConfigs);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");

  const settings = normalizeRagMemorySettings(ragMemory);

  const pullAndUse = async (preset: (typeof RAG_EMBEDDING_MODEL_PRESETS)[number]) => {
    const modelKey = preset.provider === "builtin" ? preset.builtinModel : preset.ollamaModel;
    setBusyModel(modelKey);
    try {
      let next = settings;
      if (preset.provider === "builtin") {
        setStatus(`正在下载内置模型 ${preset.builtinModel}...`);
        await downloadBuiltinEmbeddingModel({ builtinModel: preset.builtinModel }, setStatus);
        next = normalizeRagMemorySettings({
          ...settings,
          enabled: true,
          embeddingProvider: "builtin",
          builtinModel: preset.builtinModel,
          embeddingModel: preset.builtinModel,
        });
      } else {
        setStatus("正在检测 Ollama...");
        await checkOllama(settings.ollamaBaseUrl);
        setStatus(`正在拉取 ${preset.ollamaModel}，可能需要几分钟...`);
        await pullOllamaModel(settings.ollamaBaseUrl, preset.ollamaModel);
        next = normalizeRagMemorySettings({
          ...settings,
          enabled: true,
          embeddingProvider: "ollama",
          embeddingModel: preset.ollamaModel,
        });
      }
      updateRagMemorySettings(next);
      setStatus("拉取完成，正在测试 embedding...");
      const vectors = await embedTexts(next, ["玛丽从长发变成短发，并向马克许下承诺。"]);
      if (!vectors[0]?.length) throw new Error("Embedding test returned an empty vector.");
      setStatus(`已使用 ${next.embeddingModel}，测试向量维度 ${vectors[0].length}`);
      toast("success", "RAG embedding 模型已配置");
    } catch (error) {
      const message = (error as Error).message || "模型拉取失败";
      setStatus(message);
      toast("error", message);
    } finally {
      setBusyModel(null);
    }
  };

  const testEmbedding = async () => {
    setTesting(true);
    setStatus("正在测试 embedding...");
    try {
      if (settings.embeddingProvider === "ollama") await checkOllama(settings.ollamaBaseUrl);
      const vectors = await embedTexts(settings, ["测试 Whale Play RAG 记忆系统"]);
      if (!vectors[0]?.length) throw new Error("Embedding test returned an empty vector.");
      setStatus(`测试成功，向量维度 ${vectors[0].length}`);
      toast("success", "RAG embedding 测试成功");
    } catch (error) {
      const message = (error as Error).message || "Embedding test failed";
      setStatus(message);
      toast("error", message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="card-title-row">
            <BrainCircuit className="h-5 w-5" />
            {t("rag.title")}
          </CardTitle>
          <CardDescription>{t("rag.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="setting-row">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("rag.enable")}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t("rag.enableHint")}</p>
            </div>
            <SwitchButton
              checked={settings.enabled}
              onClick={() => updateRagMemorySettings({ enabled: !settings.enabled })}
              label="Toggle RAG memory"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {RAG_EMBEDDING_MODEL_PRESETS.map((preset) => {
              const modelKey = preset.provider === "builtin" ? preset.builtinModel : preset.ollamaModel;
              const isCurrent =
                preset.provider === "builtin"
                  ? settings.embeddingProvider === "builtin" && settings.builtinModel === preset.builtinModel
                  : settings.embeddingProvider === "ollama" && settings.embeddingModel === preset.ollamaModel;
              return (
                <div key={preset.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{preset.label}</p>
                      <p className="text-muted-foreground text-xs">{preset.badge}</p>
                    </div>
                    {isCurrent && (
                      <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs">当前</span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-2 min-h-10 text-xs">{preset.description}</p>
                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    variant={isCurrent ? "secondary" : "default"}
                    disabled={!!busyModel}
                    onClick={() => void pullAndUse(preset)}
                  >
                    <Download className={cn("mr-2 h-4 w-4", busyModel === modelKey && "animate-pulse")} />
                    {busyModel === modelKey ? "处理中" : preset.provider === "builtin" ? "下载并使用" : "拉取并使用"}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div>
              <Label>Embedding Provider</Label>
              <select
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-3 text-sm"
                value={settings.embeddingProvider}
                onChange={(event) =>
                  updateRagMemorySettings({ embeddingProvider: event.target.value === "ollama" ? "ollama" : "builtin" })
                }
              >
                <option value="builtin">内置本地模型</option>
                <option value="ollama">Ollama 服务</option>
              </select>
            </div>
            <div>
              <Label>{settings.embeddingProvider === "ollama" ? "Ollama Base URL" : "内置模型"}</Label>
              <Input
                className="mt-1"
                value={settings.embeddingProvider === "ollama" ? settings.ollamaBaseUrl : settings.builtinModel}
                onChange={(event) =>
                  updateRagMemorySettings(
                    settings.embeddingProvider === "ollama"
                      ? { ollamaBaseUrl: event.target.value }
                      : { builtinModel: event.target.value, embeddingModel: event.target.value },
                  )
                }
              />
            </div>
            <div>
              <Label>Embedding Model</Label>
              <Input
                className="mt-1"
                value={settings.embeddingModel}
                onChange={(event) =>
                  updateRagMemorySettings(
                    settings.embeddingProvider === "builtin"
                      ? { builtinModel: event.target.value, embeddingModel: event.target.value }
                      : { embeddingModel: event.target.value },
                  )
                }
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" disabled={testing} onClick={() => void testEmbedding()}>
                <PlugZap className={cn("mr-2 h-4 w-4", testing && "animate-pulse")} />
                测试
              </Button>
            </div>
          </div>

          {status && <p className="text-muted-foreground text-xs whitespace-pre-wrap">{status}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>召回与记忆参数</CardTitle>
          <CardDescription>这些参数会影响查询构造、召回数量、剧情小结和动态事实提取。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>查询最近轮数</Label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={12}
              value={settings.queryRecentTurns}
              onChange={(event) => updateRagMemorySettings({ queryRecentTurns: Number(event.target.value) })}
            />
          </div>
          <div className="setting-row rounded-md border p-3 md:col-span-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">AI 查询改写</p>
              <p className="text-muted-foreground mt-1 text-xs">
                让副 AI 根据最近剧情生成多条短查询，再分别检索并合并召回；会额外调用一次 API。
              </p>
            </div>
            <SwitchButton
              checked={settings.queryRewriteEnabled}
              onClick={() => updateRagMemorySettings({ queryRewriteEnabled: !settings.queryRewriteEnabled })}
              label="Toggle RAG query rewrite"
            />
          </div>
          <div>
            <Label>查询改写 API</Label>
            <select
              className="border-input bg-background mt-1 h-9 w-full rounded-md border px-3 text-sm"
              value={settings.queryRewriteConfigId ?? ""}
              onChange={(event) => updateRagMemorySettings({ queryRewriteConfigId: event.target.value || null })}
              disabled={!settings.queryRewriteEnabled}
            >
              <option value="">使用当前聊天 API</option>
              {modelConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name} · {config.model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>小结取最近轮数</Label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={8}
              value={settings.summarySourceTurns}
              onChange={(event) => updateRagMemorySettings({ summarySourceTurns: Number(event.target.value) })}
            />
          </div>
          <div>
            <Label>最大召回块数</Label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={16}
              value={settings.maxRecallChunks}
              onChange={(event) => updateRagMemorySettings({ maxRecallChunks: Number(event.target.value) })}
            />
          </div>
          <div>
            <Label>相似度阈值</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={settings.similarityThreshold}
              onChange={(event) => updateRagMemorySettings({ similarityThreshold: Number(event.target.value) })}
            />
          </div>
          <div>
            <Label>切块最大字符</Label>
            <Input
              className="mt-1"
              type="number"
              min={120}
              max={2000}
              value={settings.maxChunkChars}
              onChange={(event) => updateRagMemorySettings({ maxChunkChars: Number(event.target.value) })}
            />
          </div>
          <div>
            <Label>超长 AI 回复占位阈值 Token</Label>
            <Input
              className="mt-1"
              type="number"
              min={200}
              max={12000}
              value={settings.maxAssistantTokensForIndex}
              onChange={(event) => updateRagMemorySettings({ maxAssistantTokensForIndex: Number(event.target.value) })}
            />
          </div>
          <div>
            <Label>剧情小结 API</Label>
            <select
              className="border-input bg-background mt-1 h-9 w-full rounded-md border px-3 text-sm"
              value={settings.summarizerConfigId ?? ""}
              onChange={(event) => updateRagMemorySettings({ summarizerConfigId: event.target.value || null })}
            >
              <option value="">使用当前聊天 API</option>
              {modelConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name} · {config.model}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {[
              ["indexCharacter", "索引角色卡"],
              ["indexWorldbook", "索引世界书"],
              ["indexChatMemory", "索引剧情小结"],
              ["extractDynamicFacts", "提取动态事实"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key as keyof typeof settings])}
                  onChange={(event) =>
                    updateRagMemorySettings({ [key]: event.target.checked } as Partial<RagMemorySettings>)
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
