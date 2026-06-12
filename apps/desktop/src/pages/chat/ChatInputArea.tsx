import { Send, ChevronDown, ChevronUp, Pencil, X, Save, FolderOpen, StopCircle } from "lucide-react";
import { Button, Textarea, cn } from "@neo-tavern/ui";
import { useTranslation } from "react-i18next";
import type { PendingSendItem } from "./types";
// ── Static JSX fragments ────────────────────────────
const SmallA = <span className="text-muted-foreground text-[10px] leading-none">A</span>;
const LargeA = <span className="text-muted-foreground text-[13px] leading-none font-bold">A</span>;
const SepBar = <span className="bg-border mx-1 h-6 w-px" />;

// ── Repeated className constants ─────────────────────
const btnIconCls = "h-10 w-10 shrink-0";
const iconCls = "h-4 w-4";

export interface ChatInputAreaProps {
  displayError: string | null;
  onDismissError: () => void;
  pendingSendCount: number;
  hasChat: boolean;
  pendingSendQueue: PendingSendItem[];
  currentChatId: string | undefined;
  onCancelPending: (queueIndex: number) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onContinue: () => void;
  messagesLength: number;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  onSend: () => void;
  isSending: boolean;
  onAbort: () => void;
  onSave: () => void;
  onLoad: () => void;
  isGenerating: boolean;
  previewText: string;
  wide?: boolean;
}

export function ChatInputArea({
  displayError,
  onDismissError,
  pendingSendCount,
  hasChat,
  pendingSendQueue,
  currentChatId,
  onCancelPending,
  fontSize,
  onFontSizeChange,
  previewOpen,
  onTogglePreview,
  onContinue,
  messagesLength,
  input,
  onInputChange,
  onKeyDown,
  placeholder,
  onSend,
  isSending,
  onAbort,
  onSave,
  onLoad,
  isGenerating,
  previewText,
  wide = false,
}: ChatInputAreaProps) {
  const { t } = useTranslation("chat");

  const contentWidthClass = wide ? "max-w-6xl" : "max-w-4xl";
  const previewWidthClass = wide ? "max-w-5xl" : "max-w-3xl";

  return (
    <>
      {displayError && (
        <div className="bg-destructive/10 text-destructive mx-4 mb-2 flex items-center justify-between rounded-lg px-4 py-2 text-sm">
          <span className="truncate">{displayError}</span>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={onDismissError}>
              {t("dismiss")}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card shrink-0 border-t p-4">
        <div className={cn("mx-auto w-full min-w-0 space-y-2", contentWidthClass)}>
          {pendingSendCount > 0 && hasChat && (
            <div className="bg-primary/5 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium">
                  {t("pendingSend", { count: pendingSendCount })}
                </span>
              </div>
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                {pendingSendQueue
                  .map((item, index) => ({ ...item, index }))
                  .filter((item) => item.chatId === currentChatId)
                  .map((item) => (
                    <div
                      key={`${item.chatId}-${item.index}`}
                      className="bg-background/85 flex items-start gap-2 rounded-md border px-2 py-1.5"
                    >
                      <p className="text-foreground min-w-0 flex-1 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                        {item.label ?? item.content}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0"
                        title={t("cancelPending")}
                        onClick={() => onCancelPending(item.index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="bg-background/75 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="bg-background/70 flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-2">
                {SmallA}
                <input
                  type="range"
                  min="12"
                  max="22"
                  value={fontSize}
                  onInput={(e) => onFontSizeChange(Number(e.currentTarget.value))}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                  className="accent-primary h-1 w-12 cursor-pointer"
                  title={t("fontSize", { size: fontSize })}
                />
                {LargeA}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={onTogglePreview}
                className={btnIconCls}
                title={t("previewPrompt")}
              >
                {previewOpen ? <ChevronDown className={iconCls} /> : <ChevronUp className={iconCls} />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onContinue}
                disabled={!hasChat || messagesLength === 0}
                className={btnIconCls}
                title={t("continue")}
              >
                <Pencil className={iconCls} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onSave}
                disabled={!hasChat || isGenerating}
                className={btnIconCls}
                title={t("savepointTitle")}
              >
                <Save className={iconCls} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onLoad}
                disabled={!hasChat || isGenerating}
                className={btnIconCls}
                title={t("loadTitle")}
              >
                <FolderOpen className={iconCls} />
              </Button>
              {SepBar}
            </div>
            <div className="bg-background flex min-w-0 items-end gap-2 rounded-lg border p-2">
              <Textarea
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={!hasChat}
                rows={3}
                className="min-h-[60px] min-w-0 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                onClick={onSend}
                disabled={!input.trim() || !hasChat}
                size="icon"
                title={t(isSending ? "sendQueuedTitle" : "sendTitle")}
                className={btnIconCls}
              >
                <Send className={iconCls} />
              </Button>
              {isSending && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onAbort}
                  title={t("stopTitle")}
                  className="h-10 w-10 shrink-0"
                >
                  <StopCircle className={iconCls} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="bg-background border-t p-4">
          <div className={cn(previewWidthClass, "mx-auto")}>
            <pre className="bg-muted/20 max-h-64 overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {previewText ? (
                previewText.split("\n").map((line, i) => {
                  if (line.startsWith("system:"))
                    return (
                      <div key={i} className="text-blue-400">
                        {line}
                      </div>
                    );
                  if (line.startsWith("user:"))
                    return (
                      <div key={i} className="text-emerald-400">
                        {line}
                      </div>
                    );
                  if (line.startsWith("assistant:"))
                    return (
                      <div key={i} className="text-purple-400">
                        {line}
                      </div>
                    );
                  return (
                    <div key={i} className="text-muted-foreground">
                      {line}
                    </div>
                  );
                })
              ) : (
                <span className="text-muted-foreground">{t("noPromptPreview")}</span>
              )}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
