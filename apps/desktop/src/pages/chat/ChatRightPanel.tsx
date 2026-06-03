import { BarChart3, Brain, Dice5 } from "lucide-react";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";

// ── Pure helpers ──────────────────────────────────────

function displayStateValue(value: unknown, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join("、") : fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatPlayerCondition(player: Record<string, unknown> | undefined) {
  if (!player) return "状态未初始化";
  const hp = player.hp;
  const maxHp = player.max_hp;
  const traits = Array.isArray(player.traits) ? player.traits.map((item) => String(item)).filter(Boolean) : [];
  const parts = [
    hp !== undefined && hp !== null ? `HP ${hp}${maxHp !== undefined && maxHp !== null ? `/${maxHp}` : ""}` : null,
    traits.length ? traits.join("、") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "状态平稳";
}

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
}: ChatRightPanelProps) {
  const hasUsage = usageMessagesCount > 0;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b p-4">
        <h2 className="font-semibold">会话状态</h2>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4" />
            运行概览
          </div>
          <div className="space-y-2">
            <div className="rounded-md border bg-background p-3">
              <div className="text-xs text-muted-foreground">消息</div>
              <div className="mt-1 text-sm font-medium">{messagesCount} messages</div>
            </div>
            <button
              type="button"
              onClick={onTokenDialogOpen}
              className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Token 用量</div>
                <span className="text-xs text-primary">查看详细 →</span>
              </div>
              <div className="mt-1 text-sm font-medium">
                {hasUsage ? `P:${totalPrompt} C:${totalCompletion} | cache ${cacheRate}%` : "暂无统计"}
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
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Context</span>
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
        </section>

        {agenticPlayEnabled && (
          <section className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Brain className="h-4 w-4" />
              场景状态
            </div>
            <div className="space-y-2">
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">玩家</div>
                <div className="mt-1 break-words text-sm font-medium">
                  {displayStateValue(agenticGameState?.player?.name, "玩家")}
                </div>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">所在地点</div>
                <div className="mt-1 break-words text-sm font-medium">
                  {agenticGameState?.location || "未初始化"}
                </div>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">玩家状态</div>
                <div className="mt-1 break-words text-sm">
                  {formatPlayerCondition(agenticGameState?.player as Record<string, unknown> | undefined)}
                </div>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">当前局势</div>
                <div className="mt-1 break-words text-sm">
                  {displayStateValue(agenticGameState?.scene?.active_conflict, "暂无冲突")}
                </div>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">目标</div>
                <div className="mt-1 break-words text-sm">
                  {agenticGameState?.quest
                    ? String(agenticGameState.quest.current_objective ?? agenticGameState.quest.main ?? "-")
                    : "-"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">时间</div>
                  <div className="mt-1 break-words text-sm">
                    {displayStateValue(agenticGameState?.scene?.time, "unknown")}
                  </div>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">危险等级</div>
                  <div className="mt-1 text-sm">
                    {displayStateValue(agenticGameState?.scene?.danger_level, "-")}
                  </div>
                </div>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground">物品 / Flags</div>
                <div className="mt-1 text-sm">
                  {(agenticGameState?.inventory?.length ?? 0)} items ·{" "}
                  {agenticGameState ? Object.keys(agenticGameState.flags).length : 0} flags
                </div>
              </div>
            </div>

            <section className="mt-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Dice5 className="h-4 w-4" />
                判定
              </div>
              <div className="rounded-md border bg-background p-4">
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
                      {isGeneratingCurrentChat ? "判定进行中" : "等待行动判定"}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {isGeneratingCurrentChat
                        ? "主持人正在判断风险、调用骰子或整理结果。"
                        : "玩家选择行动后，风险动作会触发骰子判定。"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </section>
        )}
      </div>
    </aside>
  );
}
