import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "@neo-tavern/ui";
import type { BuilderMessage } from "./types";
import type { NeoCreationPlan } from "@/features/character/neo-character-builder";
import { formatCnyCost } from "@/features/billing/deepseek-billing";
import { formatElapsed, getPlanStatusLabel, ToolTimeline } from "./utils";

export function BuilderActivityTimeline({ message }: { message: BuilderMessage }) {
  const active = !!message.pending;
  const [now, setNow] = useState(() => Date.now());
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    if (!active || !message.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, message.startedAt]);

  const hasThinking = active || !!message.reasoningContent;
  const hasTools = !!message.toolEvents?.length;
  const hasActivity = hasThinking || hasTools;
  if (!hasActivity) return null;

  const elapsed = message.startedAt ? formatElapsed((message.completedAt ?? now) - message.startedAt) : null;
  const reasoningLines = (message.reasoningContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const reasoningPreview = reasoningLines.length ? reasoningLines[reasoningLines.length - 1] : "";

  return (
    <div className="mb-3 min-w-0">
      {elapsed && (
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-center tabular-nums">任务耗时 {elapsed}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className="min-w-0 border-l border-border/80">
        {hasThinking && (
          <div className="relative pb-3 pl-5">
            <span
              className={`absolute left-[-6px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ${
                active ? "text-primary" : "text-emerald-500"
              }`}
            >
              {active ? (
                <CircleDashed className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </span>
            <button
              type="button"
              className="flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden text-left text-sm font-medium disabled:cursor-default"
              onClick={() => setThinkingOpen((open) => !open)}
              disabled={!message.reasoningContent}
            >
              <Brain className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">{active ? "正在思考" : "已完成思考"}</span>
              {active && !thinkingOpen && reasoningPreview ? (
                <span className="min-w-0 truncate text-muted-foreground">· {reasoningPreview}</span>
              ) : null}
              {thinkingOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
            {thinkingOpen && message.reasoningContent ? (
              <div className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-muted-foreground">
                {message.reasoningContent}
              </div>
            ) : null}
          </div>
        )}

        <ToolTimeline events={message.toolEvents} />
      </div>
    </div>
  );
}

export function BuilderBackgroundMonitor({
  plan,
  running,
}: {
  plan: NeoCreationPlan | null;
  running: boolean;
}) {
  const entries = plan?.entries ?? [];
  const completed = entries.filter((entry) => entry.status === "done" || entry.status === "skipped").length;
  const currentEntry = entries.find((entry) => entry.status === "in_progress") ?? entries.find((entry) => entry.status === "planned");
  const percent = entries.length ? Math.round((completed / entries.length) * 100) : 0;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {running ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            <span>{running ? "已转入后台创作" : "后台创作已完成"}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            条目正文不在聊天区刷屏；请看右侧创作规划条目实时进度。
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {completed}/{entries.length || 0}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      {currentEntry ? (
        <div className="mt-3 rounded-md border bg-background/70 p-3 text-xs">
          <div className="text-muted-foreground">{running ? "当前条目" : "最后状态"}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                currentEntry.status === "done"
                  ? "bg-emerald-500"
                  : currentEntry.status === "in_progress"
                    ? "bg-primary"
                    : currentEntry.status === "skipped"
                      ? "bg-amber-500"
                      : "bg-muted-foreground/40"
              }`}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{currentEntry.name}</span>
            <span className="shrink-0 text-muted-foreground">{getPlanStatusLabel(currentEntry.status)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BuilderChatMessage({ message, creationPlan }: { message: BuilderMessage; creationPlan: NeoCreationPlan | null }) {
  const { t } = useTranslation("neo-builder");
  const isUser = message.role === "user";
  return (
    <div className={cn("flex min-w-0 gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn("min-w-0 overflow-hidden", isUser ? "max-w-[min(82%,48rem)] rounded-lg border bg-primary p-4 text-primary-foreground" : "w-full max-w-4xl py-1")}
      >
        {!isUser && <BuilderActivityTimeline message={message} />}

        {!isUser && message.backgroundCreation ? (
          <BuilderBackgroundMonitor plan={creationPlan} running={!!message.pending} />
        ) : message.content ? (
          <div className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
            {message.content}
          </div>
        ) : null}

        {message.usage && (
          <div className="mt-3 text-xs text-muted-foreground">
            {message.usage.totalTokens ? `${message.usage.totalTokens.toLocaleString()} tokens` : t("chat.tokensDash")}
            {message.usage.costCny ? ` · ${formatCnyCost(message.usage.costCny)}` : ""}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
