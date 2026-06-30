import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { Button, cn, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@neo-tavern/ui";
import type { SecondaryApiUsageSource } from "@/db/repositories";
import type { MessageUsage } from "@neo-tavern/shared";
import { formatCnyCost, formatCnyExact } from "@/features/billing/deepseek-billing";
import type { TokenUsageView } from "../types";
import { formatCompactToken } from "../utils";
import { dialogMax80vh, dialogScrollContent } from "./shared";

const TOKEN_COST_FRACTION_DIGITS = 4;

export interface TokenDialogRow {
  id: string;
  index: number;
  label: string;
  model?: string;
  source?: SecondaryApiUsageSource;
  usage?: MessageUsage;
  debugTrigger?: string;
  debugBaseTrigger?: string;
  debugAttempt?: number;
  debugPromptFilename?: string;
  debugPromptPath?: string;
}

export interface TokenDialogTotals {
  prompt: number;
  completion: number;
  cacheHit: number;
  cacheRate: string;
  costCny?: number;
}

export function TokenDialog({
  open,
  onOpenChange,
  tokenUsageView,
  onTokenUsageViewChange,
  rows,
  totals,
  secondaryUsageRecordsCount,
  contextUsageTitle,
  contextUsageTone,
  contextUsageDisplay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenUsageView: TokenUsageView;
  onTokenUsageViewChange: (view: TokenUsageView) => void;
  rows: TokenDialogRow[];
  totals: TokenDialogTotals;
  secondaryUsageRecordsCount: number;
  contextUsageTitle: string;
  contextUsageTone: string;
  contextUsageDisplay: string;
}) {
  const { t } = useTranslation(["chat", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-3xl", dialogMax80vh)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t("tokenDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="bg-background grid grid-cols-2 rounded-md border p-1">
          <button
            type="button"
            onClick={() => onTokenUsageViewChange("main")}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              tokenUsageView === "main"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("tokenDialog.tabs.main")}
          </button>
          <button
            type="button"
            onClick={() => onTokenUsageViewChange("secondary")}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              tokenUsageView === "secondary"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("tokenDialog.tabs.secondary")}
          </button>
        </div>
        <div className={dialogScrollContent}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {tokenUsageView === "main" ? t("tokenDialog.noDataMain") : t("tokenDialog.noDataSecondary")}
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
                <div className="bg-accent/50 min-w-0 rounded-lg p-3 text-center" title={totals.prompt.toLocaleString()}>
                  <p className="truncate text-lg leading-tight font-bold tabular-nums">
                    {formatCompactToken(totals.prompt)}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.prompt")}</p>
                </div>
                <div
                  className="bg-accent/50 min-w-0 rounded-lg p-3 text-center"
                  title={totals.completion.toLocaleString()}
                >
                  <p className="truncate text-lg leading-tight font-bold tabular-nums">
                    {formatCompactToken(totals.completion)}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.completion")}</p>
                </div>
                <div
                  className="bg-accent/50 min-w-0 rounded-lg p-3 text-center"
                  title={(totals.prompt + totals.completion).toLocaleString()}
                >
                  <p className="truncate text-lg leading-tight font-bold tabular-nums">
                    {formatCompactToken(totals.prompt + totals.completion)}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.total")}</p>
                </div>
                <div
                  className="min-w-0 rounded-lg bg-emerald-500/10 p-3 text-center"
                  title={totals.cacheHit.toLocaleString()}
                >
                  <p className="truncate text-lg leading-tight font-bold text-emerald-600 tabular-nums">
                    {formatCompactToken(totals.cacheHit)}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.cacheHit")}</p>
                </div>
                <div className="min-w-0 rounded-lg bg-blue-500/10 p-3 text-center" title={`${totals.cacheRate}%`}>
                  <p className="truncate text-lg leading-tight font-bold text-blue-600 tabular-nums">
                    {totals.cacheRate}%
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.hitRate")}</p>
                </div>
                <div
                  className="min-w-0 rounded-lg bg-purple-500/10 p-3 text-center"
                  title={
                    tokenUsageView === "main"
                      ? contextUsageTitle
                      : t("tokenDialog.secondaryCallsTitle", { count: secondaryUsageRecordsCount })
                  }
                >
                  <p
                    className={`truncate text-lg leading-tight font-bold tabular-nums ${
                      tokenUsageView === "main" ? contextUsageTone : "text-purple-600"
                    }`}
                  >
                    {tokenUsageView === "main" ? contextUsageDisplay : secondaryUsageRecordsCount.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-[10px]">
                    {tokenUsageView === "main" ? t("tokenDialog.columns.context") : t("tokenDialog.columns.calls")}
                  </p>
                </div>
                <div
                  className="min-w-0 rounded-lg bg-amber-500/10 p-3 text-center"
                  title={formatCnyExact(totals.costCny)}
                >
                  <p className="truncate text-lg leading-tight font-bold text-amber-600 tabular-nums">
                    {formatCnyCost(totals.costCny, { fractionDigits: TOKEN_COST_FRACTION_DIGITS })}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t("tokenDialog.columns.cost")}</p>
                </div>
              </div>
              {totals.cacheRate === "-" && (
                <p className="text-muted-foreground mb-2 px-1 text-xs">{t("tokenDialog.cacheHint")}</p>
              )}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left">
                        {tokenUsageView === "main" ? t("tokenDialog.table.round") : t("tokenDialog.table.call")}
                      </th>
                      {tokenUsageView === "secondary" && (
                        <th className="p-2 text-left">{t("tokenDialog.table.model")}</th>
                      )}
                      <th className="p-2 text-right">{t("tokenDialog.table.prompt")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.completion")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.total")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.hit")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.miss")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.rate")}</th>
                      <th className="p-2 text-right">{t("tokenDialog.table.cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const p = row.usage?.promptTokens || 0;
                      const c = row.usage?.completionTokens || 0;
                      const t = row.usage?.totalTokens || 0;
                      const h = row.usage?.cacheHitTokens || 0;
                      const ms = row.usage?.cacheMissTokens ?? p - h;
                      const r = p > 0 ? ((h / p) * 100).toFixed(1) : "-";
                      const cost = row.usage?.costCny;
                      return (
                        <tr key={row.id} className="border-t">
                          <td
                            className="text-muted-foreground p-2"
                            title={row.debugPromptPath || row.debugPromptFilename || undefined}
                          >
                            <div>{row.label}</div>
                            {tokenUsageView === "main" && row.debugTrigger && (
                              <div className="text-[10px] leading-tight">
                                {row.debugTrigger === "retry" && row.debugBaseTrigger
                                  ? `${row.debugBaseTrigger}->retry`
                                  : row.debugTrigger}
                                {row.debugAttempt && row.debugAttempt > 1 ? ` a${row.debugAttempt}` : ""}
                              </div>
                            )}
                          </td>
                          {tokenUsageView === "secondary" && (
                            <td className="text-muted-foreground p-2">{row.model || "-"}</td>
                          )}
                          <td className="p-2 text-right">{p.toLocaleString()}</td>
                          <td className="p-2 text-right">{c.toLocaleString()}</td>
                          <td className="p-2 text-right">{t.toLocaleString()}</td>
                          <td className="p-2 text-right text-emerald-600">{h > 0 ? h.toLocaleString() : "-"}</td>
                          <td className="p-2 text-right text-orange-500">{ms > 0 ? ms.toLocaleString() : "-"}</td>
                          <td className="p-2 text-right">
                            {r}
                            {r !== "-" ? "%" : ""}
                          </td>
                          <td
                            className="p-2 text-right tabular-nums"
                            title={
                              [row.usage?.costPricingName || row.usage?.costModel, formatCnyExact(cost)]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                          >
                            {formatCnyCost(cost, { fractionDigits: TOKEN_COST_FRACTION_DIGITS })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
