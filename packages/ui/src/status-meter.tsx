import * as React from "react";
import { cn } from "./lib/utils";

export type StatusMeterTone =
  | "health"
  | "mana"
  | "stamina"
  | "affection"
  | "experience"
  | "sanity"
  | "danger"
  | "neutral";

export interface StatusMeterProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  max?: number;
  min?: number;
  tone?: StatusMeterTone;
  icon?: React.ReactNode;
  description?: string;
  valueLabel?: string;
  compact?: boolean;
}

const toneStyles: Record<StatusMeterTone, { fill: string; track: string; text: string }> = {
  health: {
    fill: "from-rose-500 via-red-500 to-red-700",
    track: "bg-rose-950/20",
    text: "text-rose-400",
  },
  mana: {
    fill: "from-sky-400 via-blue-500 to-indigo-600",
    track: "bg-blue-950/20",
    text: "text-sky-400",
  },
  stamina: {
    fill: "from-lime-400 via-emerald-500 to-teal-600",
    track: "bg-emerald-950/20",
    text: "text-emerald-400",
  },
  affection: {
    fill: "from-pink-300 via-rose-400 to-fuchsia-500",
    track: "bg-pink-950/20",
    text: "text-pink-400",
  },
  experience: {
    fill: "from-amber-300 via-yellow-400 to-orange-500",
    track: "bg-amber-950/20",
    text: "text-amber-400",
  },
  sanity: {
    fill: "from-violet-300 via-purple-500 to-indigo-600",
    track: "bg-violet-950/20",
    text: "text-violet-400",
  },
  danger: {
    fill: "from-orange-400 via-red-500 to-red-700",
    track: "bg-orange-950/20",
    text: "text-orange-400",
  },
  neutral: {
    fill: "from-muted-foreground/70 via-muted-foreground/60 to-muted-foreground/50",
    track: "bg-muted",
    text: "text-muted-foreground",
  },
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function StatusMeter({
  label,
  value,
  max = 100,
  min = 0,
  tone = "neutral",
  icon,
  description,
  valueLabel,
  compact = false,
  className,
  ...props
}: StatusMeterProps) {
  const safeMax = max > min ? max : min + 1;
  const normalized = ((clamp(value, min, safeMax) - min) / (safeMax - min)) * 100;
  const styles = toneStyles[tone] ?? toneStyles.neutral;
  const displayValue = valueLabel ?? `${Math.round(value)} / ${Math.round(safeMax)}`;

  return (
    <div
      className={cn(
        "bg-background/78 rounded-md border px-3 py-2 shadow-sm",
        compact ? "space-y-1.5" : "space-y-2",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon && <span className={cn("shrink-0", styles.text)}>{icon}</span>}
          <span className="text-foreground truncate text-xs font-medium">{label}</span>
        </div>
        <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", styles.text)}>{displayValue}</span>
      </div>
      <div className={cn("h-2 overflow-hidden rounded-full", styles.track)}>
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-300", styles.fill)}
          style={{ width: `${normalized}%` }}
        />
      </div>
      {description && !compact && (
        <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">{description}</p>
      )}
    </div>
  );
}
