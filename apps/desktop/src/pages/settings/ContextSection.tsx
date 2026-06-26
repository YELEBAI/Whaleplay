import { useState } from "react";
import { SlidersHorizontal, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  cn,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";
import { usePresetStore } from "@/features/preset/preset.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { NSFW_PRESET_ID, NSFW_ITEM_NAME } from "@/features/healthy-mode/healthy-mode";
import { toast } from "@/utils/toast";

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

interface ContextSectionProps {
  contextTokens: number;
  setContextTokens: (v: number) => void;
  healthyMode: boolean;
  setHealthyMode: (v: boolean) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export function ContextSection({
  contextTokens,
  setContextTokens,
  healthyMode,
  setHealthyMode,
  t,
}: ContextSectionProps) {
  const presets = usePresetStore((s) => s.presets);
  const [conflictOpen, setConflictOpen] = useState(false);

  const isNsfwEnabled = (() => {
    const writingPreset = presets.find((p) => p.id === NSFW_PRESET_ID);
    if (!writingPreset) return false;
    return writingPreset.items.some((item) => item.name === NSFW_ITEM_NAME && item.enabled);
  })();

  const handleToggleHealthyMode = () => {
    if (!healthyMode && isNsfwEnabled) {
      setConflictOpen(true);
      return;
    }
    setHealthyMode(!healthyMode);
  };

  const handleConfirmDisableNsfw = async () => {
    const writingPreset = presets.find((p) => p.id === NSFW_PRESET_ID);
    if (writingPreset) {
      const nsfwItem = writingPreset.items.find((item) => item.name === NSFW_ITEM_NAME);
      if (nsfwItem?.enabled) {
        await usePresetStore.getState().updateItem(writingPreset.id, nsfwItem.id, { enabled: false });
      }
    }
    setHealthyMode(true);
    setConflictOpen(false);
    toast("success", t("context.healthyMode.nsfwDisabled"));
  };

  const contextPresets = [
    { label: t("context.presets.minimal"), value: 2048, desc: t("context.presetDescs.minimal") },
    { label: t("context.presets.short"), value: 8192, desc: t("context.presetDescs.short") },
    { label: t("context.presets.medium"), value: 32768, desc: t("context.presetDescs.medium") },
    { label: t("context.presets.full"), value: 0, desc: t("context.presetDescs.full") },
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
            <span className="min-w-[70px] text-center text-2xl font-bold tabular-nums">
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
            {t("context.healthyMode.title")}
          </CardTitle>
          <CardDescription>{t("context.healthyMode.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="setting-row">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("context.healthyMode.enable")}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t("context.healthyMode.enableHint")}</p>
            </div>
            <SwitchButton
              checked={healthyMode}
              onClick={handleToggleHealthyMode}
              label={t("context.healthyMode.enable")}
            />
          </div>

          {healthyMode && (
            <div className="border-border space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t("context.healthyMode.features.title")}</p>
              <ul className="text-muted-foreground space-y-1.5 text-xs">
                <li>• {t("context.healthyMode.features.prompt")}</li>
                <li>• {t("context.healthyMode.features.explicit")}</li>
                <li>• {t("context.healthyMode.features.flood")}</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("context.healthyMode.conflict.title")}</DialogTitle>
            <DialogDescription>{t("context.healthyMode.conflict.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictOpen(false)}>
              {t("context.healthyMode.conflict.cancel")}
            </Button>
            <Button onClick={handleConfirmDisableNsfw}>{t("context.healthyMode.conflict.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
