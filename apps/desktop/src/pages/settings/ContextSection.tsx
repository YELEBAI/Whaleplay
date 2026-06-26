import { useEffect } from "react";
import { SlidersHorizontal, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, cn } from "@neo-tavern/ui";
import { usePresetStore } from "@/features/preset/preset.store";
import { isNsfwPresetItem, NSFW_PRESET_ID, type ContentMode } from "@/features/content-policy/content-policy";
import { toast } from "@/utils/toast";

interface ContextSectionProps {
  contextTokens: number;
  setContextTokens: (v: number) => void;
  contentMode: ContentMode;
  setContentMode: (mode: ContentMode) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export function ContextSection({
  contextTokens,
  setContextTokens,
  contentMode,
  setContentMode,
  t,
}: ContextSectionProps) {
  const presets = usePresetStore((s) => s.presets);
  const loadPresets = usePresetStore((s) => s.loadPresets);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const isNsfwEnabled = (() => {
    const writingPreset = presets.find((p) => p.id === NSFW_PRESET_ID);
    if (!writingPreset) return false;
    return writingPreset.items.some((item) => isNsfwPresetItem(item) && item.enabled);
  })();

  const setBuiltinNsfwEnabled = async (enabled: boolean) => {
    const writingPreset = presets.find((p) => p.id === NSFW_PRESET_ID);
    if (writingPreset) {
      const nsfwItem = writingPreset.items.find(isNsfwPresetItem);
      if (nsfwItem && nsfwItem.enabled !== enabled) {
        await usePresetStore.getState().updateItem(writingPreset.id, nsfwItem.id, { enabled });
      }
    }
  };

  const handleSelectContentMode = async (mode: ContentMode) => {
    if (mode === contentMode) return;
    if (mode === "adultLimited") {
      await setBuiltinNsfwEnabled(true);
      toast("info", t("context.contentMode.adultEnabled"));
    } else {
      await setBuiltinNsfwEnabled(false);
      if (isNsfwEnabled) toast("info", t("context.healthyMode.nsfwDisabled"));
    }
    setContentMode(mode);
  };

  const contextPresets = [
    { label: t("context.presets.minimal"), value: 2048, desc: t("context.presetDescs.minimal") },
    { label: t("context.presets.short"), value: 8192, desc: t("context.presetDescs.short") },
    { label: t("context.presets.medium"), value: 32768, desc: t("context.presetDescs.medium") },
    { label: t("context.presets.full"), value: 0, desc: t("context.presetDescs.full") },
  ];

  const contentModeOptions: Array<{
    value: ContentMode;
    label: string;
    description: string;
  }> = [
    {
      value: "normal",
      label: t("context.contentMode.normal"),
      description: t("context.contentMode.normalDesc"),
    },
    {
      value: "healthy",
      label: t("context.contentMode.healthy"),
      description: t("context.contentMode.healthyDesc"),
    },
    {
      value: "adultLimited",
      label: t("context.contentMode.adultLimited"),
      description: t("context.contentMode.adultLimitedDesc"),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="card-title-row">
            <SlidersHorizontal className="h-5 w-5" />
            {t("context.title")}
          </CardTitle>
          <CardDescription>{t("context.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="131072"
              step="512"
              value={contextTokens}
              onChange={(e) => setContextTokens(parseInt(e.target.value))}
              className="bg-muted-foreground/20 [&::-webkit-slider-thumb]:bg-primary h-2 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="min-w-17.5 text-center text-2xl font-bold tabular-nums">
              {contextTokens === 0
                ? "∞"
                : contextTokens >= 1000
                  ? (contextTokens / 1000).toFixed(contextTokens % 1000 === 0 ? 0 : 1) + "k"
                  : contextTokens}
            </span>
          </div>
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>∞</span>
            <span>32k</span>
            <span>64k</span>
            <span>128k</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {contextPresets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setContextTokens(preset.value)}
                className={cn(
                  "rounded-lg border p-2 text-center transition-colors",
                  contextTokens === preset.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                )}
              >
                <p className="text-xs font-medium">{preset.label}</p>
                <p className="text-muted-foreground mt-0.5 text-[10px]">{preset.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mt-4 text-xs">{t("context.tokenEstimate")}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="card-title-row">
            <ShieldCheck className="h-5 w-5" />
            {t("context.contentMode.title")}
          </CardTitle>
          <CardDescription>{t("context.contentMode.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            {contentModeOptions.map((option) => (
              <div
                key={option.value}
                role="button"
                tabIndex={0}
                aria-pressed={contentMode === option.value}
                onClick={() => void handleSelectContentMode(option.value)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleSelectContentMode(option.value);
                  }
                }}
                className={cn(
                  "focus-visible:ring-ring cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:ring-1 focus-visible:outline-none",
                  contentMode === option.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50",
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{option.description}</p>
              </div>
            ))}
          </div>

          {contentMode === "healthy" && (
            <div className="border-border space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t("context.healthyMode.features.title")}</p>
              <ul className="text-muted-foreground space-y-1.5 text-xs">
                <li>• {t("context.healthyMode.features.prompt")}</li>
                <li>• {t("context.healthyMode.features.explicit")}</li>
                <li>• {t("context.healthyMode.features.nsfw")}</li>
              </ul>
            </div>
          )}

          {contentMode === "adultLimited" && (
            <div className="border-primary/20 bg-primary/5 text-muted-foreground rounded-lg border p-3 text-xs">
              {t("context.contentMode.adultLimitedActive")}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
