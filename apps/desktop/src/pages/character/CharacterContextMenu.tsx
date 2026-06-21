import { MessageSquare, List, Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Character } from "@neo-tavern/shared";
import type { CharacterMenu } from "./types";

interface CharacterContextMenuProps {
  menu: CharacterMenu;
  onChat: (character: Character) => void;
  onDetails: (character: Character) => void;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
  onClose: () => void;
}

export function CharacterContextMenu({
  menu,
  onChat,
  onDetails,
  onEdit,
  onDelete,
  onClose,
}: CharacterContextMenuProps) {
  const { t } = useTranslation("character");
  const { t: tc } = useTranslation("common");

  return (
    <div
      className="bg-popover text-popover-foreground fixed z-50 min-w-36 overflow-hidden rounded-md border p-1 text-sm shadow-lg"
      style={{ left: Math.min(menu.x, window.innerWidth - 160), top: Math.min(menu.y, window.innerHeight - 200) }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="hover:bg-accent flex w-full items-center gap-2 rounded px-3 py-2 text-left"
        onClick={() => {
          onClose();
          onChat(menu.character);
        }}
      >
        <MessageSquare className="h-4 w-4" />
        {t("contextMenu.chat")}
      </button>
      <button
        type="button"
        className="hover:bg-accent flex w-full items-center gap-2 rounded px-3 py-2 text-left"
        onClick={() => {
          onClose();
          onDetails(menu.character);
        }}
      >
        <List className="h-4 w-4" />
        {t("contextMenu.details")}
      </button>
      <button
        type="button"
        className="hover:bg-accent flex w-full items-center gap-2 rounded px-3 py-2 text-left"
        onClick={() => {
          onClose();
          onEdit(menu.character);
        }}
      >
        <Edit className="h-4 w-4" />
        {tc("actions.edit")}
      </button>
      <hr />
      <button
        type="button"
        className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded px-3 py-2 text-left"
        onClick={() => {
          onClose();
          onDelete(menu.character);
        }}
      >
        <Trash2 className="h-4 w-4" />
        {tc("actions.delete")}
      </button>
    </div>
  );
}
