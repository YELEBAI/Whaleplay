import { ArrowLeft, Brain } from "lucide-react";
import { Avatar } from "@/pages/chat/utils";
import type { Character } from "@neo-tavern/shared";

interface ChatSidebarProps {
  character: Character | undefined;
  agenticPlayEnabled: boolean;
  onBack: () => void;
}

export function ChatSidebar({ character, agenticPlayEnabled, onBack }: ChatSidebarProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b p-3">
        <button
          onClick={onBack}
          className="flex w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {character ? (
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={character.name} src={character.avatar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{character.name}</p>
                <p className="text-xs text-muted-foreground">
                  {agenticPlayEnabled ? "实验模式" : "普通模式"}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 py-3">
            <details className="group mb-3" open>
              <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors">
                Description
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {character.description || "-"}
              </p>
            </details>

            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors">
                Personality
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {character.personality || "-"}
              </p>
            </details>

            {agenticPlayEnabled && (
              <div className="mt-4 rounded-md border bg-background p-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Brain className="h-3.5 w-3.5" />
                  Agentic
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  使用专用主持人提示词模块，不读取普通 preset 组。
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Select a character</p>
        </div>
      )}
    </aside>
  );
}
