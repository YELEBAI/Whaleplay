import type { ReactNode, MouseEvent } from "react";
import type { Character } from "@neo-tavern/shared";
import { cn } from "@neo-tavern/ui";

interface CharacterAvatarTileProps {
  character: Character;
  selected?: boolean;
  actions?: ReactNode;
  footerAction?: ReactNode;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function CharacterAvatarTile({
  character,
  selected = false,
  actions,
  footerAction,
  onClick,
  onContextMenu,
}: CharacterAvatarTileProps) {
  return (
    <div className="group relative w-28 shrink-0">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className="block w-full text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        title={character.name}
      >
        <div
          className={cn(
            "mx-auto flex h-24 w-24 items-center justify-center rounded-lg border bg-transparent p-1.5 transition-colors",
            selected
              ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]"
              : "border-border/60 hover:border-primary/45",
          )}
        >
          {character.avatar ? (
            <img src={character.avatar} alt={character.name} className="h-full w-full rounded-md object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-md border border-border/30 bg-accent/25">
              <span className="text-2xl font-bold text-muted-foreground">{character.name.charAt(0)}</span>
            </div>
          )}
        </div>
        <span
          className={cn(
            "mt-2 block truncate text-xs font-medium leading-5",
            selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {character.name}
        </span>
      </button>
      {footerAction && <div className="absolute right-3 top-2">{footerAction}</div>}
      {actions && (
        <div className="absolute right-3 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
