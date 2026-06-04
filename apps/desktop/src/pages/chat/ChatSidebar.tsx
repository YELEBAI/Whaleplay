import { ArrowLeft, MessageSquare } from "lucide-react";
import { Avatar } from "@/pages/chat/utils";
import type { Character, Chat } from "@neo-tavern/shared";

interface ChatSidebarProps {
  chats: Chat[];
  characters: Character[];
  currentChatId?: string;
  onBack: () => void;
  onSelectChat: (chatId: string) => void;
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

export function ChatSidebar({ chats, characters, currentChatId, onBack, onSelectChat }: ChatSidebarProps) {
  return (
    <aside className="app-sidebar-gradient flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
      <div className="shrink-0 border-b p-3">
        <button
          onClick={onBack}
          className="flex w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase text-muted-foreground">
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
                      : "border-transparent hover:border-border hover:bg-accent/50"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={chatCharacter?.name ?? title} src={chatCharacter?.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{title}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
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
            <p className="px-1 py-2 text-xs text-muted-foreground">暂无会话记录</p>
          )}
        </div>
      </div>
    </aside>
  );
}
