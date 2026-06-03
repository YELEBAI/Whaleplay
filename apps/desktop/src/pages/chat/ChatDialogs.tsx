import React from "react";
import { RotateCcw, Copy, BarChart3, Trash2, Brain } from "lucide-react";
import {
  Button,
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
  const disabled = !draft.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>修改图片提示词</DialogTitle>
          <DialogDescription>保存后会更新这张图片的提示词；也可以直接保存并重新生成。</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder="English image prompt..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onSave} disabled={disabled}>
            保存提示词
          </Button>
          <Button onClick={onSaveAndRegenerate} disabled={disabled}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            保存并重新生成
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Full Prompt</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh]">
          <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
            {previewText || "(no prompt data)"}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(previewText);
              toast("success", "Copied");
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy Prompt
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建存档点</DialogTitle>
          <DialogDescription>保存当前聊天的消息快照。名字可以留空，系统会自动生成。</DialogDescription>
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
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving || !hasCurrentChat}>
            {isSaving ? "Saving..." : "Save"}
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
  isGenerating,
  onRestore,
  onDelete,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savepoints: ChatSavepoint[];
  isLoading: boolean;
  restoringSavepointId: string | null;
  isGenerating: boolean;
  onRestore: (savepoint: ChatSavepoint) => void;
  onDelete: (savepointId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>加载存档</DialogTitle>
          <DialogDescription>加载后会用存档内容替换当前聊天消息。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && savepoints.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">还没有存档点。</p>
          )}
          {!isLoading &&
            savepoints.map((savepoint) => (
              <div key={savepoint.id} className="flex items-center gap-3 rounded-lg border bg-card/60 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{savepoint.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSavepointDate(savepoint.createdAt)} · {savepoint.messageCount} messages
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(savepoint)}
                  disabled={!!restoringSavepointId || isGenerating}
                >
                  {restoringSavepointId === savepoint.id ? "Loading..." : "加载"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(savepoint.id)}
                  disabled={!!restoringSavepointId}
                  title="删除存档"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            Refresh
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Token Usage &amp; Cache Hit
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 rounded-md border bg-background p-1">
          <button
            type="button"
            onClick={() => onTokenUsageViewChange("main")}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              tokenUsageView === "main"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Main API
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
            Secondary API
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh]">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {tokenUsageView === "main"
                ? "No main API usage data yet. Send a message to see stats."
                : "No secondary API usage data yet. It appears after memory compression or image planning uses a secondary model."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-4">
                <div className="min-w-0 bg-accent/50 rounded-lg p-3 text-center" title={totals.prompt.toLocaleString()}>
                  <p className="text-lg font-bold tabular-nums leading-tight truncate">
                    {formatCompactToken(totals.prompt)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Prompt</p>
                </div>
                <div
                  className="min-w-0 bg-accent/50 rounded-lg p-3 text-center"
                  title={totals.completion.toLocaleString()}
                >
                  <p className="text-lg font-bold tabular-nums leading-tight truncate">
                    {formatCompactToken(totals.completion)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Completion</p>
                </div>
                <div
                  className="min-w-0 bg-accent/50 rounded-lg p-3 text-center"
                  title={(totals.prompt + totals.completion).toLocaleString()}
                >
                  <p className="text-lg font-bold tabular-nums leading-tight truncate">
                    {formatCompactToken(totals.prompt + totals.completion)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div
                  className="min-w-0 bg-emerald-500/10 rounded-lg p-3 text-center"
                  title={totals.cacheHit.toLocaleString()}
                >
                  <p className="text-lg font-bold tabular-nums leading-tight truncate text-emerald-600">
                    {formatCompactToken(totals.cacheHit)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Cache Hit</p>
                </div>
                <div className="min-w-0 bg-blue-500/10 rounded-lg p-3 text-center" title={`${totals.cacheRate}%`}>
                  <p className="text-lg font-bold tabular-nums leading-tight truncate text-blue-600">
                    {totals.cacheRate}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Hit Rate</p>
                </div>
                <div
                  className="min-w-0 bg-purple-500/10 rounded-lg p-3 text-center"
                  title={
                    tokenUsageView === "main" ? contextUsageTitle : `${secondaryUsageRecordsCount} secondary API calls`
                  }
                >
                  <p
                    className={`text-lg font-bold tabular-nums leading-tight truncate ${
                      tokenUsageView === "main" ? contextUsageTone : "text-purple-600"
                    }`}
                  >
                    {tokenUsageView === "main" ? contextUsageDisplay : secondaryUsageRecordsCount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {tokenUsageView === "main" ? "1M Context" : "Calls"}
                  </p>
                </div>
                <div
                  className="min-w-0 bg-amber-500/10 rounded-lg p-3 text-center"
                  title={formatCnyExact(totals.costCny)}
                >
                  <p className="text-lg font-bold tabular-nums leading-tight truncate text-amber-600">
                    {formatCnyCost(totals.costCny)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Cost (RMB)</p>
                </div>
              </div>
              {totals.cacheRate === "-" && (
                <p className="text-xs text-muted-foreground mb-2 px-1">
                  ⚠ Cache hit data unavailable — your API may not support prompt caching (Ollama/vLLM most instances do
                  not). Supported by DeepSeek, OpenAI recent models, Anthropic.
                </p>
              )}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2">{tokenUsageView === "main" ? "Round" : "Call"}</th>
                      {tokenUsageView === "secondary" && <th className="text-left p-2">Model</th>}
                      <th className="text-right p-2">Prompt</th>
                      <th className="text-right p-2">Completion</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">🔥 Hit</th>
                      <th className="text-right p-2">📉 Miss</th>
                      <th className="text-right p-2">Rate</th>
                      <th className="text-right p-2">Cost (RMB)</th>
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
                            className="p-2 text-muted-foreground"
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
                            <td className="p-2 text-muted-foreground">{row.model || "-"}</td>
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
            Close
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Message</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Delete this message? If it's a user message followed by an AI reply, the AI reply will also be deleted.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Delete
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            创作过程
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh]">
          <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground bg-muted/40 p-4 rounded-lg">
            {reasoningContent || "(暂无创作过程数据)"}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(reasoningContent || "");
              toast("success", "Copied");
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
