import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@neo-tavern/ui";
import type { Character } from "@neo-tavern/shared";
import { CharacterAvatarTile } from "@/components";
import { CharacterListItem } from "@/pages/character/CharacterListItem";
import type { ViewMode } from "./types";

export function GridOrList({
  chars,
  viewMode,
  selectedId,
  onCharacterClick,
  onCharacterDoubleClick,
  onContextMenu,
  onMenuButton,
}: {
  chars: Character[];
  viewMode: ViewMode;
  selectedId: string | null;
  onCharacterClick: (char: Character) => void;
  onCharacterDoubleClick: (char: Character) => void;
  onContextMenu: (event: React.MouseEvent, char: Character) => void;
  onMenuButton: (event: React.MouseEvent<HTMLButtonElement>, char: Character) => void;
}) {
  const { t } = useTranslation("character");

  // List mode
  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-2">
        {chars.map((char) => (
          <CharacterListItem
            key={char.id}
            character={char}
            selected={selectedId === char.id}
            onClick={() => onCharacterClick(char)}
            onDoubleClick={() => onCharacterDoubleClick(char)}
            onContextMenu={(event) => onContextMenu(event, char)}
          />
        ))}
      </div>
    );
  }

  // Grid Mode
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-8">
      {chars.map((char) => (
        <CharacterAvatarTile
          key={char.id}
          character={char}
          selected={selectedId === char.id}
          onClick={() => onCharacterClick(char)}
          onDoubleClick={() => onCharacterDoubleClick(char)}
          onContextMenu={(event) => onContextMenu(event, char)}
          footerAction={
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-6 w-8 rounded-md"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => onMenuButton(event, char)}
              title={t("characterMenu")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
      ))}
    </div>
  );
}
