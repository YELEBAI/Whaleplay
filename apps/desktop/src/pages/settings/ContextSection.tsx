import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@neo-tavern/ui";

interface ContextSectionProps {
  contextTokens: number;
  setContextTokens: (v: number) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export function ContextSection({ contextTokens, setContextTokens, t }: ContextSectionProps) {
  const presets = [
    { label: t("context.presets.minimal"), value: 2048, desc: t("context.presetDescs.minimal") },
    { label: t("context.presets.short"), value: 8192, desc: t("context.presetDescs.short") },
    { label: t("context.presets.medium"), value: 32768, desc: t("context.presetDescs.medium") },
    { label: t("context.presets.full"), value: 0, desc: t("context.presetDescs.full") },
  ];

  return (
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
            className="flex-1 h-2 rounded-full appearance-none bg-muted-foreground/20 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-2xl font-bold tabular-nums min-w-[70px] text-center">
            {contextTokens === 0
              ? "∞"
              : contextTokens >= 1000
                ? (contextTokens / 1000).toFixed(contextTokens % 1000 === 0 ? 0 : 1) + "k"
                : contextTokens}
          </span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>∞</span>
          <span>32k</span>
          <span>64k</span>
          <span>128k</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setContextTokens(preset.value)}
              className={`rounded-lg border p-2 text-center transition-colors ${contextTokens === preset.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
            >
              <p className="text-xs font-medium">{preset.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">{t("context.tokenEstimate")}</p>
      </CardContent>
    </Card>
  );
}
