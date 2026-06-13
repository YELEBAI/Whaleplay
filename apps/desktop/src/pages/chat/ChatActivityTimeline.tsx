import { useState, useEffect } from "react";
import { Brain, CheckCircle2, ChevronDown, ChevronRight, CircleDashed } from "lucide-react";
import type { Message } from "@neo-tavern/shared";
import { formatDuration, getGenerationStatus } from "./utils";

export function ChatActivityTimeline({
  message,
  active,
  generationStatus,
}: {
  message: Message;
  active: boolean;
  generationStatus: ReturnType<typeof getGenerationStatus>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const startedAt = new Date(message.createdAt).getTime();
  const activeElapsed = active && Number.isFinite(startedAt) ? now - startedAt : null;
  const finalElapsed = message.generateDuration ?? message.thinkingDuration ?? null;
  const elapsed = activeElapsed ?? finalElapsed;

  const reasoningLines = (message.reasoningContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const reasoningPreview = reasoningLines.length
    ? reasoningLines[reasoningLines.length - 1]
    : active
      ? generationStatus.detail
      : "回复已生成";

  return (
    <div className="mb-3 min-w-0">
      {elapsed != null && (
        <div className="text-muted-foreground mb-3 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-3 text-xs">
          <div className="bg-border h-px flex-1" />
          <span className="shrink-0 text-center tabular-nums">任务耗时 {formatDuration(Math.max(0, elapsed))}</span>
          <div className="bg-border h-px flex-1" />
        </div>
      )}

      <div className="border-border/80 min-w-0 border-l">
        <div className="relative pb-3 pl-5">
          <span
            className={`bg-background absolute top-1 left-0 flex h-3 w-3 items-center justify-center rounded-full ${
              active ? "text-primary" : "text-emerald-500"
            }`}
          >
            {active ? <CircleDashed className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </span>
          <button
            type="button"
            className="flex w-full max-w-full min-w-0 items-center gap-1 overflow-hidden text-left text-sm font-medium disabled:cursor-default"
            onClick={() => setThinkingOpen((open) => !open)}
            disabled={!message.reasoningContent}
          >
            <Brain className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">{active ? "正在思考" : "已完成思考"}</span>
            {!thinkingOpen && reasoningPreview ? (
              <span className="text-muted-foreground min-w-0 truncate">· {reasoningPreview}</span>
            ) : null}
            {thinkingOpen ? (
              <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            )}
          </button>
          {thinkingOpen && message.reasoningContent ? (
            <div className="text-muted-foreground mt-2 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
              {message.reasoningContent}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
