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
        className="focus-visible:ring-ring block w-full text-center focus-visible:ring-1 focus-visible:outline-none"
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
            <div className="border-border/30 bg-accent/25 flex h-full w-full items-center justify-center rounded-md border">
              <span className="text-muted-foreground text-2xl font-bold">{character.name.charAt(0)}</span>
            </div>
          )}
        </div>
        <span
          className={cn(
            "mt-2 block truncate text-xs leading-5 font-medium",
            selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {character.name}
        </span>
      </button>
      {footerAction && <div className="absolute top-2 right-3">{footerAction}</div>}
      {actions && (
        <div className="absolute top-2 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
