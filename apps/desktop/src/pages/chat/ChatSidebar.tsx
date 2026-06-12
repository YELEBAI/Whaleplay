import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Avatar } from "@/pages/chat/display";
import type { Character, Chat } from "@neo-tavern/shared";

interface ChatSidebarProps {
  chats: Chat[];
  characters: Character[];
  currentChatId?: string;
  collapsed?: boolean;
  onBack: () => void;
  onSelectChat: (chatId: string) => void;
  onToggleCollapsed?: () => void;
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatSidebar({
  chats,
  characters,
  currentChatId,
  collapsed = false,
  onBack,
  onSelectChat,
  onToggleCollapsed,
}: ChatSidebarProps) {
  if (collapsed) {
    return (
      <aside className="app-sidebar-gradient flex min-h-0 min-w-0 flex-col items-center gap-2 overflow-hidden rounded-lg border px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          title="展开会话记录"
          aria-label="展开会话记录"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="border-border/60 bg-background/35 text-muted-foreground mt-1 flex h-8 w-8 items-center justify-center rounded-md border">
          <MessageSquare className="h-3.5 w-3.5" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="app-sidebar-gradient flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back</span>
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
            title="收纳会话记录"
            aria-label="收纳会话记录"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase">
          <MessageSquare className="h-3.5 w-3.5" />
          会话记录
        </div>
        <div className="space-y-1">
          {chats.length > 0 ? (
            chats.map((chat) => {
              const active = chat.id === currentChatId;
              const chatCharacter = characters.find((item) => item.id === chat.characterId);
              const title = chat.title || chatCharacter?.name || "未命名会话";
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full min-w-0 rounded-md border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "hover:border-border hover:bg-accent/50 border-transparent"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={chatCharacter?.name ?? title} src={chatCharacter?.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{title}</div>
                      <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-xs">
                        <span className="truncate">{chatCharacter?.name ?? "未知角色卡"}</span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">{formatChatTime(chat.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-muted-foreground px-1 py-2 text-xs">暂无会话记录</p>
          )}
        </div>
      </div>
    </aside>
  );
}
