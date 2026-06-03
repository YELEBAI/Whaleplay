import { Send, ChevronDown, ChevronUp, Pencil, X, Save, FolderOpen, StopCircle } from "lucide-react";
import { Button, Textarea } from "@neo-tavern/ui";
import type { PendingSendItem } from "./types";

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
}: ChatInputAreaProps) {
  return (
    <>
      {displayError && (
        <div className="px-4 py-2 mx-4 mb-2 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span className="truncate">{displayError}</span>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onDismissError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t bg-card p-4">
        <div className="mx-auto w-full min-w-0 max-w-4xl space-y-2">
          {pendingSendCount > 0 && hasChat && (
            <div className="bg-primary/5 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">待发送 {pendingSendCount}</span>
              </div>
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                {pendingSendQueue
                  .map((item, index) => ({ ...item, index }))
                  .filter((item) => item.chatId === currentChatId)
                  .map((item) => (
                    <div
                      key={`${item.chatId}-${item.index}`}
                      className="flex items-start gap-2 rounded-md border bg-background/85 px-2 py-1.5"
                    >
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                        {item.label ?? item.content}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        title="取消待发送"
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
              <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border bg-background/70 px-2">
                <span className="text-[10px] text-muted-foreground leading-none">A</span>
                <input
                  type="range"
                  min="12"
                  max="22"
                  value={fontSize}
                  onInput={(e) => onFontSizeChange(Number(e.currentTarget.value))}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                  className="h-1 w-12 accent-primary cursor-pointer"
                  title={`Font size: ${fontSize}px`}
                />
                <span className="text-[13px] font-bold text-muted-foreground leading-none">A</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={onTogglePreview}
                className="h-10 w-10 shrink-0"
                title="Preview prompt"
              >
                {previewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onContinue}
                disabled={!hasChat || messagesLength === 0}
                className="h-10 w-10 shrink-0"
                title="隐藏发送续写请求"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onSave}
                disabled={!hasChat || isGenerating}
                className="h-10 w-10 shrink-0"
                title="创建当前聊天存档"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onLoad}
                disabled={!hasChat || isGenerating}
                className="h-10 w-10 shrink-0"
                title="加载聊天存档"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex min-w-0 items-end gap-2 rounded-lg border bg-background p-2">
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
                title={isSending ? "Add to pending send" : "Send"}
                className="h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
              {isSending && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onAbort}
                  title="Stop generating"
                  className="h-10 w-10 shrink-0"
                >
                  <StopCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="border-t p-4 bg-background">
          <div className="max-w-3xl mx-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono max-h-64 overflow-auto leading-relaxed bg-muted/20 rounded-md p-3">
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
                <span className="text-muted-foreground">Type a message to see prompt preview</span>
              )}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
