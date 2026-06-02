import { ArrowLeft } from "lucide-react";
import type { Character } from "@neo-tavern/shared";

interface ChatSidebarProps {
  character: Character | undefined;
  onBack: () => void;
  t: (key: string) => string;
}

export function ChatSidebar({ character, onBack, t }: ChatSidebarProps) {
  return (
    <div className="w-60 border-r p-4 flex flex-col gap-3 overflow-y-auto shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </button>
      {character && (
        <>
          <h2 className="text-lg font-semibold truncate">{character.name}</h2>
          <p className="text-xs text-muted-foreground">{character.description}</p>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">{t("personality")}</p>
            <p>{character.personality}</p>
          </div>
        </>
      )}
    </div>
  );
}
