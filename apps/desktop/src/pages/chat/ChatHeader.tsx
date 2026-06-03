import { BarChart3 } from "lucide-react";
import { Button } from "@neo-tavern/ui";

interface ChatHeaderProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usageMessages: any[];
  totalPrompt: number;
  totalCompletion: number;
  cacheRate: string;
  contextUsageTitle: string;
  contextUsagePercent: number;
  contextUsageBarTone: string;
  contextUsageTone: string;
  contextUsageDisplay: string;
  onTokenDialogOpen: () => void;
  t: (key: string) => string;
}

export function ChatHeader({
  usageMessages,
  totalPrompt,
  totalCompletion,
  cacheRate,
  contextUsageTitle,
  contextUsagePercent,
  contextUsageBarTone,
  contextUsageTone,
  contextUsageDisplay,
  onTokenDialogOpen,
  t,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2 border-b shrink-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={onTokenDialogOpen}
        className="text-muted-foreground hover:text-foreground text-xs gap-1"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        {usageMessages.length > 0 ? (
          <span>
            P:{totalPrompt} C:{totalCompletion} | 🔥 {cacheRate}%
          </span>
        ) : (
          <span>{t("tokenStats")}</span>
        )}
      </Button>
      {usageMessages.length > 0 && (
        <button
          type="button"
          onClick={onTokenDialogOpen}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={contextUsageTitle}
        >
          <span className="text-[10px] font-medium">1M</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span
              className={`block h-full rounded-full transition-[width] ${contextUsageBarTone}`}
              style={{ width: `${contextUsagePercent}%` }}
            />
          </span>
          <span className={`w-10 text-right tabular-nums ${contextUsageTone}`}>{contextUsageDisplay}</span>
        </button>
      )}
    </div>
  );
}
