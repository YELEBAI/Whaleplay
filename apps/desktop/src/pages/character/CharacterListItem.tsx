import { useTranslation } from "react-i18next";
import type { Character } from "@neo-tavern/shared";
import { cn } from "@neo-tavern/ui";

interface CharacterListItemProps {
  character: Character;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent, character: Character) => void;
}

// Items in List mode, contain Avatar, Name, Desc
export function CharacterListItem({
  character,
  selected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
}: CharacterListItemProps) {
  const { t } = useTranslation("character");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, character) : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-colors",
        selected
          ? "border-primary/70 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]"
          : "border-border/60 hover:border-primary/45 hover:bg-accent/50",
      )}
    >
      <div className="border-border/50 h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
        {character.avatar ? (
          <img src={character.avatar} alt={character.name} className="h-full w-full object-cover" />
        ) : (
          <div className="bg-accent/60 border-border/30 flex h-full w-full items-center justify-center border">
            <span className="text-muted-foreground text-xl font-bold select-none">{character.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-base font-medium">{character.name}</div>
        {character.description ? (
          <div className="text-muted-foreground mt-0.5 line-clamp-2 text-sm leading-relaxed">
            {character.description}
          </div>
        ) : (
          <div className="text-muted-foreground/50 mt-0.5 text-sm italic">{t("noDescription")}</div>
        )}
      </div>
    </div>
  );
}
