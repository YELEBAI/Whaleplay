import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, cn } from "@neo-tavern/ui";

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
          {presets.map((preset) => (
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
  );
}
