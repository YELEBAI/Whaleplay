import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Brain,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Dice5,
  GitBranch,
  HeartPulse,
  ShieldCheck,
  Skull,
  SmilePlus,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { cn, StatusMeter } from "@neo-tavern/ui";
import type { AgenticGameState, DiceRollResult } from "@/features/agentic-play/agentic-play";
import { resolveAgenticStatusMeters, type ResolvedAgenticStatusMeter } from "@/features/agentic-play/status-assets";
import type { BranchSummary } from "./hooks/useBranchNavigation";

export interface ChatRightPanelProps {
  messagesCount: number;
  usageMessagesCount: number;
  totalPrompt: number;
  totalCompletion: number;
  cacheRate: string;
  contextUsageDisplay: string;
  contextUsagePercent: number;
  contextUsageBarTone: string;
  onTokenDialogOpen: () => void;
  agenticPlayEnabled?: boolean;
  agenticGameState?: AgenticGameState | null;
  isGeneratingCurrentChat?: boolean;
  lastDiceResult?: DiceRollResult | null;
  hasBranches?: boolean;
  branchSummaries?: BranchSummary[];
  onSwitchBranch?: (leafId: string) => void;
}

const labelClass = "text-xs text-muted-foreground";

const OUTCOME_ICONS: Record<string, { Icon: typeof Dice5; color: string; labelKey: string }> = {
  critical_success: { Icon: Trophy, color: "text-amber-400", labelKey: "rightPanel.dice.criticalSuccess" },
  critical_failure: { Icon: Skull, color: "text-red-500", labelKey: "rightPanel.dice.criticalFailure" },
  success: { Icon: ShieldCheck, color: "text-emerald-400", labelKey: "rightPanel.dice.success" },
  failure: { Icon: Dice5, color: "text-red-400", labelKey: "rightPanel.dice.failure" },
  rolled: { Icon: Dice5, color: "text-primary", labelKey: "rightPanel.dice.rolled" },
};

function DiceFace({ value, sides, rolling }: { value: number; sides: number; rolling: boolean }) {
  const maxDigitCount = String(sides).length;
  return (
    <span
      className={`bg-card inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 text-lg font-bold tabular-nums shadow-sm transition-all ${
        rolling
          ? "border-primary/50 text-primary/60 animate-[dice-spin_0.15s_ease-in-out_infinite]"
          : value === 1
            ? "border-red-400 text-red-500"
            : value === sides
              ? "border-amber-400 text-amber-500"
              : "border-muted-foreground/30 text-foreground"
      }`}
      style={{ minWidth: `${Math.max(40, maxDigitCount * 14)}px` }}
    >
      {rolling ? "?" : value}
    </span>
  );
}

function DiceSlotMachine({ result, isGenerating }: { result: DiceRollResult; isGenerating: boolean }) {
  const { t } = useTranslation("chat");
  const { Icon: OutcomeIcon, color: outcomeColor, labelKey } = OUTCOME_ICONS[result.outcome] ?? OUTCOME_ICONS.rolled;
  const outcomeLabel = t(labelKey);

  const parsed = result.dice.match(/^(\d+)d(\d+)$/);
  const count = parsed ? parseInt(parsed[1], 10) : 1;
  const sides = parsed ? parseInt(parsed[2], 10) : 20;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <DiceFace key={i} value={result.rolls[i] ?? 0} sides={sides} rolling={isGenerating && !result.rolls[i]} />
        ))}
      </div>

      <div className="text-center">
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {result.roll}
          {result.modifier !== 0 && (
            <span className="text-muted-foreground text-base">
              {result.modifier > 0 ? "+" : ""}
              {result.modifier}
            </span>
          )}
          <span className="text-muted-foreground text-base"> = {result.total}</span>
        </div>
        {result.difficulty !== undefined && (
          <div className="text-muted-foreground mt-0.5 text-xs">
            {t("rightPanel.dice.dc", { value: result.difficulty })}
            {result.successProbability !== undefined && (
              <span> · {t("rightPanel.dice.successRate", { rate: result.successProbability })}</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-muted/50 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5">
        <OutcomeIcon className={cn("h-4 w-4", outcomeColor)} />
        <span className={cn("text-sm font-semibold", outcomeColor)}>{outcomeLabel}</span>
      </div>

      <p className="text-muted-foreground text-center text-xs leading-relaxed">{result.reason}</p>
    </div>
  );
}

const STATUS_ICONS: Record<ResolvedAgenticStatusMeter["icon"], typeof HeartPulse> = {
  heart: HeartPulse,
  sparkles: Sparkles,
  zap: Zap,
  smile: SmilePlus,
  star: Star,
  brain: BrainCircuit,
  alert: AlertTriangle,
};

function StatusAssetIcon({ name }: { name: ResolvedAgenticStatusMeter["icon"] }) {
  const Icon = STATUS_ICONS[name] ?? Sparkles;
  return <Icon className="h-3.5 w-3.5" />;
}

export function ChatRightPanel({
  messagesCount,
  usageMessagesCount,
  totalPrompt,
  totalCompletion,
  cacheRate,
  contextUsageDisplay,
  contextUsagePercent,
  contextUsageBarTone,
  onTokenDialogOpen,
  agenticPlayEnabled = false,
  agenticGameState,
  isGeneratingCurrentChat = false,
  lastDiceResult,
  hasBranches = false,
  branchSummaries = [],
  onSwitchBranch,
}: ChatRightPanelProps) {
  const { t } = useTranslation("chat");
  const hasUsage = usageMessagesCount > 0;
  const statusMeters = agenticPlayEnabled ? resolveAgenticStatusMeters(agenticGameState) : [];
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [view, setView] = useState<"stats" | "branches">("stats");
  const effectiveView = hasBranches ? view : "stats";

  return (
    <aside className="bg-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        {effectiveView === "branches" ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <GitBranch className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("rightPanel.branches.title")}</span>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
                onClick={() => setView("stats")}
                title={t("rightPanel.branches.backToStats")}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>

            {branchSummaries.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("rightPanel.branches.empty")}</p>
            ) : (
              <div className="space-y-2">
                {branchSummaries.map((branch, index) => (
                  <button
                    key={branch.leafId}
                    type="button"
                    className={cn(
                      "bg-background/45 hover:bg-accent/70 w-full rounded-lg border p-3 text-left transition-colors",
                      branch.isActive && "border-primary bg-primary/5",
                    )}
                    onClick={() => onSwitchBranch?.(branch.leafId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <GitBranch className="text-primary h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-sm font-medium">
                          {t("rightPanel.branches.branchName", { index: index + 1 })}
                        </span>
                      </div>
                      {branch.isActive && (
                        <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                          {t("rightPanel.branches.current")}
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-2 text-xs">
                      <span>{t("rightPanel.branches.messageCount", { count: branch.messageCount })}</span>
                      {branch.forkMessageIndex && (
                        <span className="bg-muted ml-2 inline-flex rounded px-1.5 py-0.5">
                          {t("rightPanel.branches.forkAfterMessage", { index: branch.forkMessageIndex })}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="line-clamp-2 text-xs leading-relaxed">{branch.lastMessagePreview}</p>
                      <p className="text-muted-foreground line-clamp-1 text-[11px]">
                        {t("rightPanel.branches.forkPoint", { preview: branch.forkPreview })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="bg-background/45 rounded-lg border p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setOverviewCollapsed((value) => !value)}
                aria-expanded={!overviewCollapsed}
                title={overviewCollapsed ? t("rightPanel.overview.expand") : t("rightPanel.overview.collapse")}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("rightPanel.overview.title")}</span>
                </span>
                <span className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors">
                  {overviewCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </span>
              </button>

              {!overviewCollapsed && (
                <div className="mt-3 space-y-2">
                  {hasBranches ? (
                    <button
                      type="button"
                      className="bg-card/60 hover:bg-accent group relative w-full rounded-md border p-3 text-left transition-colors"
                      onClick={() => setView("branches")}
                    >
                      <div className="pr-24">
                        <div className={labelClass}>{t("rightPanel.overview.messages")}</div>
                        <div className="mt-1 text-sm font-medium">
                          {t("rightPanel.overview.messageCount", { count: messagesCount })}
                        </div>
                      </div>
                      <div className="text-primary absolute top-3 right-3 flex items-center gap-1 text-xs">
                        <GitBranch className="h-3 w-3" />
                        {t("rightPanel.overview.viewBranches")}
                      </div>
                    </button>
                  ) : (
                    <div className="bg-card/60 rounded-md border p-3">
                      <div className={labelClass}>{t("rightPanel.overview.messages")}</div>
                      <div className="mt-1 text-sm font-medium">
                        {t("rightPanel.overview.messageCount", { count: messagesCount })}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onTokenDialogOpen}
                    className="bg-card/60 hover:bg-accent w-full rounded-md border p-3 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className={labelClass}>{t("rightPanel.overview.tokenUsage")}</div>
                      <span className="text-primary text-xs">{t("rightPanel.overview.viewDetails")}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {hasUsage
                        ? t("rightPanel.overview.tokenStats", {
                            prompt: totalPrompt,
                            completion: totalCompletion,
                            rate: cacheRate,
                          })
                        : t("rightPanel.overview.noStats")}
                    </div>
                    {hasUsage && (
                      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className={cn("h-full rounded-full transition-[width]", contextUsageBarTone)}
                          style={{ width: `${contextUsagePercent}%` }}
                        />
                      </div>
                    )}
                  </button>
                  {hasUsage && (
                    <div className="bg-card/60 rounded-md border p-3">
                      <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
                        <span>{t("rightPanel.overview.context")}</span>
                        <span>{contextUsageDisplay}</span>
                      </div>
                      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                        <span
                          className={cn("block h-full rounded-full transition-[width]", contextUsageBarTone)}
                          style={{ width: `${contextUsagePercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {agenticPlayEnabled && (
              <section className="mt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Brain className="h-4 w-4" />
                  {t("rightPanel.agentic.sceneStatus")}
                </div>
                <div className="space-y-2">
                  {statusMeters.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-muted-foreground px-1 text-xs font-semibold">
                        {t("rightPanel.agentic.dynamicVariables")}
                      </div>
                      {statusMeters.slice(0, 8).map((meter) => (
                        <StatusMeter
                          key={meter.id}
                          compact
                          label={meter.label}
                          value={meter.value}
                          max={meter.max}
                          min={meter.min}
                          tone={meter.tone}
                          icon={<StatusAssetIcon name={meter.icon} />}
                          description={meter.description}
                          valueLabel={meter.valueLabel}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <section className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Dice5 className="h-4 w-4" />
                    {t("rightPanel.agentic.judgment")}
                  </div>
                  <div className="bg-background rounded-md border p-4">
                    {lastDiceResult ? (
                      <DiceSlotMachine result={lastDiceResult} isGenerating={isGeneratingCurrentChat} />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="bg-card relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border">
                          <Dice5
                            className={`text-primary h-6 w-6 ${
                              isGeneratingCurrentChat ? "animate-spin" : "animate-pulse"
                            }`}
                          />
                          <span className="border-primary/20 absolute inset-1 rounded-md border" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {isGeneratingCurrentChat
                              ? t("rightPanel.agentic.judging")
                              : t("rightPanel.agentic.waitingJudgment")}
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                            {isGeneratingCurrentChat
                              ? t("rightPanel.agentic.judgingHint")
                              : t("rightPanel.agentic.waitingJudgmentHint")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
