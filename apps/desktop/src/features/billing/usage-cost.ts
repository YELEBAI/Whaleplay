import type { MessageUsage } from "@neo-tavern/shared";
import { useSettingsStore } from "@/features/settings/settings.store";
import { addDailyCostCny, DAILY_COST_WARNING_RATIO } from "./daily-cost";
import { formatCnyCost } from "./deepseek-billing";

function notifyDailyCostWarning(totalCny: number, limitCny: number) {
  const message = `今日 DeepSeek API 消费已达到 ${formatCnyCost(totalCny)} / ${formatCnyCost(limitCny)}，已超过 ${Math.round(DAILY_COST_WARNING_RATIO * 100)}% 预警线。`;
  const toast = typeof window !== "undefined" ? window.__toast : null;
  if (toast) toast("error", message);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.setTimeout(() => window.alert(message), 0);
  }
}

export async function recordUsageCostAndWarn(usage: MessageUsage | undefined) {
  const costCny = usage?.costCny;
  if (typeof costCny !== "number" || !Number.isFinite(costCny) || costCny <= 0) return;
  try {
    const result = await addDailyCostCny(costCny);
    useSettingsStore.setState({ dailyCostSpentCny: result.totalCny });
    if (result.shouldWarn) {
      notifyDailyCostWarning(result.totalCny, result.limitCny);
    }
  } catch {
    // Cost tracking should never interrupt the user-facing request.
  }
}
