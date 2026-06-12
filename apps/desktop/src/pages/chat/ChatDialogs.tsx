import React from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Copy, BarChart3, Trash2, Brain, GitBranch } from "lucide-react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Textarea,
} from "@neo-tavern/ui";
import type { ChatSavepoint, SecondaryApiUsageSource } from "@/db/repositories";
import { createDefaultSavepointName } from "@/db/repositories";
import type { MessageUsage } from "@neo-tavern/shared";
import type { TokenUsageView } from "@/pages/chat/types";
import { formatSavepointDate, formatCompactToken } from "@/pages/chat/utils";
import { formatCnyCost, formatCnyExact } from "@/features/billing/deepseek-billing";
import { toast } from "@/utils/toast";

// ── Shared classNames ────────────────────────────────
const iconSm = "h-3.5 w-3.5 mr-1";
const dialogMax80vh = "max-h-[80vh]";
const dialogScrollContent = "overflow-y-auto max-h-[60vh]";

// ── TokenDialog shared types ─────────────────────────

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

// ── 1. ImagePromptDialog ─────────────────────────────

export function ImagePromptDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onCancel,
  onSave,
  onSaveAndRegenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAndRegenerate: () => void;
}) {
  const { t } = useTranslation("chat");
  const disabled = !draft.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("imagePromptDialog.title")}</DialogTitle>
          <DialogDescription>{t("imagePromptDialog.description")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={t("imagePromptDialog.placeholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="outline" onClick={onSave} disabled={disabled}>
            {t("imagePromptDialog.savePrompt")}
          </Button>
          <Button onClick={onSaveAndRegenerate} disabled={disabled}>
            <RotateCcw className={iconSm} />
            {t("imagePromptDialog.saveAndRegenerate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 2. PromptDialog ──────────────────────────────────

export function PromptDialog({
  open,
  onOpenChange,
  previewText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewText: string;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-3xl", dialogMax80vh)}>
        <DialogHeader>
          <DialogTitle>{t("promptDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className={dialogScrollContent}>
          <pre className="text-muted-foreground font-mono text-xs whitespace-pre-wrap">
            {previewText || t("promptDialog.noData")}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(previewText);
              toast("success", t("toast.copied"));
            }}
          >
            <Copy className={iconSm} />
            {t("promptDialog.copyPrompt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 3. SaveDialog ────────────────────────────────────

export function SaveDialog({
  open,
  onOpenChange,
  savepointName,
  onSavepointNameChange,
  onCancel,
  onSave,
  isSaving,
  hasCurrentChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savepointName: string;
  onSavepointNameChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  hasCurrentChat: boolean;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("savepointDialog.title")}</DialogTitle>
          <DialogDescription>{t("savepointDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={savepointName}
            onChange={(e) => onSavepointNameChange(e.target.value)}
            placeholder={createDefaultSavepointName()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={isSaving || !hasCurrentChat}>
            {isSaving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 4. LoadDialog ────────────────────────────────────

export function LoadDialog({
  open,
  onOpenChange,
  savepoints,
  isLoading,
  restoringSavepointId,
  importingSavepointId,
  isGenerating,
  onRestore,
  onImportAsBranch,
  onDelete,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savepoints: ChatSavepoint[];
  isLoading: boolean;
  restoringSavepointId: string | null;
  importingSavepointId?: string | null;
  isGenerating: boolean;
  onRestore: (savepoint: ChatSavepoint) => void;
  onImportAsBranch?: (savepoint: ChatSavepoint) => void;
  onDelete: (savepointId: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("loadDialog.title")}</DialogTitle>
          <DialogDescription>{t("loadDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {isLoading && <p className="text-muted-foreground py-6 text-center text-sm">{t("loadDialog.loading")}</p>}
          {!isLoading && savepoints.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">{t("loadDialog.noSavepoints")}</p>
          )}
          {!isLoading &&
            savepoints.map((savepoint) => (
              <div key={savepoint.id} className="bg-card/60 flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{savepoint.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatSavepointDate(savepoint.createdAt)} ·{" "}
                    {t("loadDialog.messages", { count: savepoint.messageCount })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(savepoint)}
                    disabled={!!restoringSavepointId || !!importingSavepointId || isGenerating}
                  >
                    {restoringSavepointId === savepoint.id ? t("loadDialog.loading") : t("loadDialog.load")}
                  </Button>
                  {onImportAsBranch && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onImportAsBranch(savepoint)}
                      disabled={!!restoringSavepointId || !!importingSavepointId || isGenerating}
                    >
                      <GitBranch className={iconSm} />
                      {importingSavepointId === savepoint.id
                        ? t("loadDialog.importing")
                        : t("loadDialog.importAsBranch")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                    onClick={() => onDelete(savepoint.id)}
                    disabled={!!restoringSavepointId || !!importingSavepointId}
                    title={t("loadDialog.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            {t("loadDialog.refresh")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 5. TokenDialog ───────────────────────────────────

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
  const { t } = useTranslation("chat");

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
                    tokenUsageView === "main" ? contextUsageTitle : `${secondaryUsageRecordsCount} secondary API calls`
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
                    {formatCnyCost(totals.costCny)}
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
                            {formatCnyCost(cost)}
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
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 6. DeleteMessageDialog ───────────────────────────

export function DeleteMessageDialog({
  open,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteMessage.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("deleteMessage.description")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {t("deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 7. ThinkingDialog ────────────────────────────────

export function ThinkingDialog({
  open,
  onOpenChange,
  reasoningContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reasoningContent: string | undefined;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-2xl", dialogMax80vh)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            {t("thinkingDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className={dialogScrollContent}>
          <pre className="text-muted-foreground bg-muted/40 rounded-lg p-4 font-mono text-xs whitespace-pre-wrap">
            {reasoningContent || t("thinkingDialog.noData")}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(reasoningContent || "");
              toast("success", t("toast.copied"));
            }}
          >
            <Copy className={iconSm} />
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 8. RegenerateDialog ───────────────────────────────

export type RegenerateMode = "replace" | "fork";

export function RegenerateDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: RegenerateMode) => void;
}) {
  const { t } = useTranslation("chat");
  const [mode, setMode] = React.useState<RegenerateMode>("fork");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("regenerateDialog.title")}</DialogTitle>
          <DialogDescription>{t("regenerateDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              mode === "fork" ? "border-primary bg-primary/5" : "hover:bg-accent"
            }`}
          >
            <input
              type="radio"
              name="regenerateMode"
              className="mt-0.5"
              checked={mode === "fork"}
              onChange={() => setMode("fork")}
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <GitBranch className="text-primary h-4 w-4" />
                {t("regenerateDialog.fork.label")}
              </span>
              <p className="text-muted-foreground mt-0.5 text-xs">{t("regenerateDialog.fork.description")}</p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              mode === "replace" ? "border-primary bg-primary/5" : "hover:bg-accent"
            }`}
          >
            <input
              type="radio"
              name="regenerateMode"
              className="mt-0.5"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <RotateCcw className="h-4 w-4" />
                {t("regenerateDialog.replace.label")}
              </span>
              <p className="text-muted-foreground mt-0.5 text-xs">{t("regenerateDialog.replace.description")}</p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => onConfirm(mode)}>
            {mode === "fork" ? (
              <>
                <GitBranch className={iconSm} />
                {t("regenerateDialog.forkAndRegenerate")}
              </>
            ) : (
              <>
                <RotateCcw className={iconSm} />
                {t("regenerateDialog.replaceRegenerate")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
