import { Send, ChevronDown, ChevronUp, Pencil, Save, FolderOpen, StopCircle, X } from "lucide-react";
import { Button, Input } from "@neo-tavern/ui";
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
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
  onSend: () => void;
  isSending: boolean;
  isGenerating: boolean;
  onSave: () => void;
  onLoad: () => void;
  onAbort: () => void;
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
  isGenerating,
  onSave,
  onLoad,
  onAbort,
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

      <div className="border-t bg-background/95 p-3">
        <div className="max-w-4xl mx-auto space-y-2 2xl:-translate-x-[6.25rem]">
          {pendingSendCount > 0 && hasChat && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
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

          <div className="rounded-lg border bg-card/70 p-2 shadow-sm">
            <div className="grid grid-cols-[minmax(0,12rem)_minmax(20rem,1fr)_minmax(0,12rem)] items-center gap-2">
              {/* 左侧工具栏 */}
              <div className="flex min-w-0 items-center justify-end gap-2">
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
              </div>
              {/* 输入框 */}
              <Input
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={!hasChat}
                className="h-10 min-w-0 w-full"
              />
              {/* 右侧按钮 */}
              <div className="flex min-w-0 items-center justify-start gap-1.5">
                <Button
                  onClick={onSend}
                  disabled={!input.trim() || !hasChat}
                  size="icon"
                  title={isSending ? "Add to pending send" : "Send"}
                  className="h-10 w-10 shrink-0"
                >
                  <Send className="h-4 w-4" />
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
      </div>
    </>
  );
}
