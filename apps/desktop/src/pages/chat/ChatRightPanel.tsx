import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Dice5,
  GitBranch,
  HeartPulse,
  MessageCircle,
  Plus,
  ShieldCheck,
  Skull,
  SmilePlus,
  Sparkles,
  Star,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import { StatusMeter } from "@neo-tavern/ui";
import type { AgenticGameState, DiceRollResult } from "@/features/agentic-play/agentic-play";
import { resolveAgenticStatusMeters, type ResolvedAgenticStatusMeter } from "@/features/agentic-play/status-assets";
import type { Message, MessageAgenticOption } from "@neo-tavern/shared";

// ── Component ─────────────────────────────────────────

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
  // Branch tree props
  allMessages?: Message[];
  forkParentIds?: Set<string>;
  activeLeafId?: string | null;
  onSwitchBranch?: (leafId: string) => void;
  onCreateBranch?: (parentId: string) => void;
  onExploreAgenticOption?: (option: MessageAgenticOption, parentMessageId: string) => void;
}

// ── Shared classNames ────────────────────────────────

const labelClass = "text-xs text-muted-foreground";

// ── Dice Slot Machine ───────────────────────────────

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
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 bg-card text-lg font-bold tabular-nums shadow-sm transition-all ${
        rolling
          ? "animate-[dice-spin_0.15s_ease-in-out_infinite] border-primary/50 text-primary/60"
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
      {/* Dice reels */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <DiceFace key={i} value={result.rolls[i] ?? 0} sides={sides} rolling={isGenerating && !result.rolls[i]} />
        ))}
      </div>

      {/* Total */}
      <div className="text-center">
        <div className="text-2xl font-bold tabular-nums tracking-tight">
          {result.roll}
          {result.modifier !== 0 && (
            <span className="text-base text-muted-foreground">
              {result.modifier > 0 ? "+" : ""}
              {result.modifier}
            </span>
          )}
          <span className="text-base text-muted-foreground"> = {result.total}</span>
        </div>
        {result.difficulty !== undefined && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t("rightPanel.dice.dc", { value: result.difficulty })}
            {result.successProbability !== undefined && (
              <span> · {t("rightPanel.dice.successRate", { rate: result.successProbability })}</span>
            )}
          </div>
        )}
      </div>

      {/* Outcome */}
      <div className={`flex items-center justify-center gap-1.5 rounded-md bg-muted/50 px-3 py-1.5`}>
        <OutcomeIcon className={`h-4 w-4 ${outcomeColor}`} />
        <span className={`text-sm font-semibold ${outcomeColor}`}>{outcomeLabel}</span>
      </div>

      {/* Reason */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">{result.reason}</p>
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
  allMessages,
  forkParentIds,
  activeLeafId,
  onSwitchBranch,
  onCreateBranch,
  onExploreAgenticOption,
}: ChatRightPanelProps) {
  const { t } = useTranslation("chat");
  const hasUsage = usageMessagesCount > 0;
  const statusMeters = agenticPlayEnabled ? resolveAgenticStatusMeters(agenticGameState) : [];
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<"stats" | "tree">("stats");
  const hasBranchTree = allMessages && allMessages.length > 0 && forkParentIds && forkParentIds.size > 0;

  // ── Tree data ──
  const childrenMap = useMemo(() => {
    if (!allMessages) return new Map<string | null, Message[]>();
    const map = new Map<string | null, Message[]>();
    for (const m of allMessages) {
      const key = m.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [allMessages]);

  const activePathIds = useMemo(() => {
    const ids = new Set<string>();
    if (!allMessages || !activeLeafId) return ids;
    const idMap = new Map(allMessages.map((m) => [m.id, m]));
    let current: Message | undefined = idMap.get(activeLeafId);
    while (current) {
      ids.add(current.id);
      current = current.parentId ? idMap.get(current.parentId) : undefined;
    }
    return ids;
  }, [allMessages, activeLeafId]);

  const rootMessages = useMemo(() => {
    if (!allMessages) return [];
    return childrenMap.get(null) ?? [];
  }, [allMessages, childrenMap]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Tree node renderer ──
  const renderTreeNode = (message: Message, depth: number): React.ReactNode => {
    const children = childrenMap.get(message.id) ?? [];
    const hasChildren = children.length > 0;
    const isFork = children.length >= 2;
    const isExpanded = expandedNodes.has(message.id) || depth < 2; // auto-expand shallow nodes
    const isOnActivePath = activePathIds.has(message.id);
    const preview =
      message.content.slice(0, 60).replace(/\n/g, " ") ||
      (message.role === "assistant" ? t("rightPanel.tree.thinking") : t("rightPanel.tree.empty"));

    // Find untaken agentic options (available but never chosen)
    const untakenOptions: MessageAgenticOption[] = [];
    if (agenticPlayEnabled && message.agenticOptions && message.agenticOptions.length > 0 && onExploreAgenticOption) {
      const takenLabels = new Set(
        children
          .filter((c) => c.role === "user" && c.hidden)
          .map((c) =>
            typeof c.metadata?.agenticAction === "object" && c.metadata.agenticAction
              ? (c.metadata.agenticAction as Record<string, unknown>).label
              : undefined,
          )
          .filter(Boolean) as string[],
      );
      for (const opt of message.agenticOptions) {
        if (!takenLabels.has(opt.label)) {
          untakenOptions.push(opt);
        }
      }
    }

    return (
      <div key={message.id}>
        <div
          className={`flex items-center gap-1 py-0.5 text-xs hover:bg-accent/50 rounded ${
            isOnActivePath ? "bg-accent/30" : ""
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: 4 }}
        >
          {/* Expand chevron */}
          {hasChildren ? (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => toggleExpand(message.id)}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Role icon */}
          {message.role === "user" ? (
            <User className="h-3 w-3 shrink-0 text-blue-400" />
          ) : (
            <MessageCircle className="h-3 w-3 shrink-0 text-emerald-400" />
          )}

          {/* Content preview + switch action */}
          <button
            type="button"
            className={`min-w-0 truncate text-left ${isOnActivePath ? "font-medium text-primary" : "text-foreground"}`}
            title={message.content.slice(0, 200)}
            onClick={() => onSwitchBranch?.(message.id)}
          >
            {preview}
          </button>

          {/* Fork badge */}
          {isFork && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-400/15 px-1 py-0.5 text-[10px] text-amber-400">
              <GitBranch className="h-2.5 w-2.5" />
              {children.length}
            </span>
          )}

          {/* Create branch button (on any non-leaf node) */}
          {hasChildren && onCreateBranch && (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              style={{ opacity: isFork ? undefined : 0 }}
              title={t("rightPanel.tree.createBranch")}
              onClick={(e) => {
                e.stopPropagation();
                onCreateBranch(message.id);
              }}
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && children.map((child) => renderTreeNode(child, depth + 1))}

        {/* Untaken agentic options (potential branches) */}
        {isExpanded &&
          untakenOptions.length > 0 &&
          untakenOptions.map((opt) => (
            <div
              key={`untaken-${message.id}-${opt.id}`}
              className="flex items-center gap-1 py-0.5 text-xs hover:bg-accent/50 rounded text-muted-foreground cursor-pointer"
              style={{ paddingLeft: `${8 + (depth + 1) * 14}px`, paddingRight: 4 }}
              title={
                opt.difficulty !== undefined
                  ? t("rightPanel.tree.unexploredOptionWithDc", { action: opt.action, difficulty: opt.difficulty })
                  : t("rightPanel.tree.unexploredOption", { action: opt.action })
              }
              onClick={() => onExploreAgenticOption?.(opt, message.id)}
            >
              <span className="w-4 shrink-0" />
              <Dice5 className="h-3 w-3 shrink-0 text-amber-400/60" />
              <span className="min-w-0 truncate italic">{opt.label}</span>
              {opt.difficulty !== undefined && (
                <span className="shrink-0 text-[10px] text-muted-foreground/50">DC{opt.difficulty}</span>
              )}
              <span className="shrink-0 rounded bg-amber-400/10 px-1 py-0.5 text-[10px] text-amber-400/70">
                {t("rightPanel.tree.unexplored")}
              </span>
            </div>
          ))}
      </div>
    );
  };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      {/* Header with toggle */}
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              activeView === "stats" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveView("stats")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {t("rightPanel.tabs.stats")}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              activeView === "tree" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveView("tree")}
            disabled={!hasBranchTree}
          >
            <GitBranch className="h-3.5 w-3.5" />
            {t("rightPanel.tabs.branches")}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        {activeView === "tree" ? (
          <div className="space-y-0.5">
            {rootMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("rightPanel.tree.noBranches")}</p>
            ) : (
              rootMessages.map((msg) => renderTreeNode(msg, 0))
            )}
          </div>
        ) : (
          <>
            <section className="rounded-lg border bg-background/45 p-3">
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  {overviewCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </span>
              </button>

              {!overviewCollapsed && (
                <div className="mt-3 space-y-2">
                  <div className="rounded-md border bg-card/60 p-3">
                    <div className={labelClass}>{t("rightPanel.overview.messages")}</div>
                    <div className="mt-1 text-sm font-medium">
                      {t("rightPanel.overview.messageCount", { count: messagesCount })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onTokenDialogOpen}
                    className="w-full rounded-md border bg-card/60 p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center justify-between">
                      <div className={labelClass}>{t("rightPanel.overview.tokenUsage")}</div>
                      <span className="text-xs text-primary">{t("rightPanel.overview.viewDetails")}</span>
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
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-[width] ${contextUsageBarTone}`}
                          style={{ width: `${contextUsagePercent}%` }}
                        />
                      </div>
                    )}
                  </button>
                  {hasUsage && (
                    <div className="rounded-md border bg-card/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("rightPanel.overview.context")}</span>
                        <span>{contextUsageDisplay}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={`block h-full rounded-full transition-[width] ${contextUsageBarTone}`}
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
                      <div className="px-1 text-xs font-semibold text-muted-foreground">
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
                  <div className="rounded-md border bg-background p-4">
                    {lastDiceResult ? (
                      <DiceSlotMachine result={lastDiceResult} isGenerating={isGeneratingCurrentChat} />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-card">
                          <Dice5
                            className={`h-6 w-6 text-primary ${
                              isGeneratingCurrentChat ? "animate-spin" : "animate-pulse"
                            }`}
                          />
                          <span className="absolute inset-1 rounded-md border border-primary/20" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {isGeneratingCurrentChat
                              ? t("rightPanel.agentic.judging")
                              : t("rightPanel.agentic.waitingJudgment")}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
