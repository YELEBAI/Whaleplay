import { useTranslation } from "react-i18next";
import type { Message } from "@neo-tavern/shared";
import type { SecondaryApiUsageRecord } from "@/db/repositories";
import type { TokenDialogRow, TokenDialogTotals } from "../dialogs/TokenDialog";
import type { TokenUsageView } from "../types";
import { DEEPSEEK_CONTEXT_LIMIT } from "../utils";

interface UseChatCostParams {
  messages: Message[];
  secondaryUsageRecords: SecondaryApiUsageRecord[];
  tokenUsageView: TokenUsageView;
}

export type { TokenDialogRow, TokenDialogTotals };

/**
 * Aggregates per-message usage and secondary API records into the shapes the
 * TokenDialog and the right-side cost panel render. Pure derived state — no
 * side effects, safe to call unconditionally.
 *
 * Extracted verbatim from ChatPage (Phase 1 UI split).
 */
export function useChatCost({ messages, secondaryUsageRecords, tokenUsageView }: UseChatCostParams) {
  const { t } = useTranslation("chat");
  // React Compiler auto-memoises these derived values.
  const usageMessages = messages.filter((m) => m.role === "assistant" && m.usage);
  const totalPrompt = usageMessages.reduce((s, m) => s + (m.usage?.promptTokens || 0), 0);
  const totalCompletion = usageMessages.reduce((s, m) => s + (m.usage?.completionTokens || 0), 0);
  const totalCacheHit = usageMessages.reduce((s, m) => s + (m.usage?.cacheHitTokens || 0), 0);
  const totalCostCny = usageMessages.reduce((s, m) => s + (m.usage?.costCny || 0), 0);
  const hasMainCost = usageMessages.some((m) => typeof m.usage?.costCny === "number");

  const secondaryPrompt = secondaryUsageRecords.reduce((s, r) => s + (r.usage.promptTokens || 0), 0);
  const secondaryCompletion = secondaryUsageRecords.reduce((s, r) => s + (r.usage.completionTokens || 0), 0);
  const secondaryCacheHit = secondaryUsageRecords.reduce((s, r) => s + (r.usage.cacheHitTokens || 0), 0);
  const secondaryCostCny = secondaryUsageRecords.reduce((s, r) => s + (r.usage.costCny || 0), 0);
  const hasSecondaryCost = secondaryUsageRecords.some((r) => typeof r.usage.costCny === "number");

  const cacheRate = totalPrompt > 0 ? ((totalCacheHit / totalPrompt) * 100).toFixed(1) : "-";
  const secondaryCacheRate = secondaryPrompt > 0 ? ((secondaryCacheHit / secondaryPrompt) * 100).toFixed(1) : "-";

  const tokenDialogRows: TokenDialogRow[] =
    tokenUsageView === "main"
      ? usageMessages.map((message, index) => ({
          id: message.id,
          index: index + 1,
          label: `#${message.usage?.debugRound ?? index + 1}`,
          model: undefined,
          source: undefined,
          usage: message.usage!,
          debugTrigger: message.usage?.debugTrigger,
          debugBaseTrigger: message.usage?.debugBaseTrigger,
          debugAttempt: message.usage?.debugAttempt,
          debugPromptFilename: message.usage?.debugPromptFilename,
          debugPromptPath: message.usage?.debugPromptPath,
        }))
      : secondaryUsageRecords.map((record, index) => ({
          id: record.id,
          index: index + 1,
          label: record.label,
          model: record.model,
          source: record.source,
          usage: record.usage,
          debugTrigger: undefined,
          debugBaseTrigger: undefined,
          debugAttempt: undefined,
          debugPromptFilename: undefined,
          debugPromptPath: undefined,
        }));

  const tokenDialogTotals: TokenDialogTotals =
    tokenUsageView === "main"
      ? {
          prompt: totalPrompt,
          completion: totalCompletion,
          cacheHit: totalCacheHit,
          cacheRate,
          costCny: hasMainCost ? totalCostCny : undefined,
        }
      : {
          prompt: secondaryPrompt,
          completion: secondaryCompletion,
          cacheHit: secondaryCacheHit,
          cacheRate: secondaryCacheRate,
          costCny: hasSecondaryCost ? secondaryCostCny : undefined,
        };

  const latestUsage = usageMessages[usageMessages.length - 1]?.usage;
  const currentContextTokens = latestUsage
    ? latestUsage.totalTokens || (latestUsage.promptTokens || 0) + (latestUsage.completionTokens || 0)
    : 0;
  const contextUsageRate =
    currentContextTokens > 0 ? ((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100).toFixed(1) : "-";
  const contextUsageDisplay = contextUsageRate === "-" ? "-" : `${contextUsageRate}%`;
  const contextUsageTone =
    currentContextTokens >= 900_000
      ? "text-orange-500"
      : currentContextTokens >= 750_000
        ? "text-yellow-500"
        : "text-emerald-500";
  const contextUsageBarTone =
    currentContextTokens >= 900_000
      ? "bg-orange-500"
      : currentContextTokens >= 750_000
        ? "bg-yellow-500"
        : "bg-emerald-500";
  const contextUsagePercent =
    currentContextTokens > 0 ? Math.min((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100, 100) : 0;
  const contextUsageTitle =
    currentContextTokens > 0
      ? t("contextUsage.title", {
          current: currentContextTokens.toLocaleString(),
          limit: DEEPSEEK_CONTEXT_LIMIT.toLocaleString(),
        })
      : t("contextUsage.noData");

  return {
    usageMessages,
    totalPrompt,
    totalCompletion,
    cacheRate,
    tokenDialogRows,
    tokenDialogTotals,
    contextUsageDisplay,
    contextUsagePercent,
    contextUsageBarTone,
    contextUsageTitle,
    contextUsageTone,
  };
}
