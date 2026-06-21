import { X, MessageCircle, Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ScrollArea } from "@neo-tavern/ui";
import type { Character } from "@neo-tavern/shared";

export function InfoPanel({
  character,
  onClose,
  onChat,
  onEdit,
  onDelete,
  hasContent,
}: {
  character: Character;
  onClose: () => void;
  onChat: (character: Character) => void;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
  hasContent: (text: string | undefined) => boolean;
}) {
  const { t } = useTranslation("character");
  const { t: tc } = useTranslation("common");

  const sections = [
    {
      key: "description",
      title: t("sections.description"),
      content: character.description,
      render: (content: string) => <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>,
    },
    {
      key: "personality",
      title: t("sections.personality"),
      content: character.personality,
      render: (content: string) => <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>,
    },
    {
      key: "scenario",
      title: t("sections.scenario"),
      content: character.scenario,
      render: (content: string) => <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>,
    },
    {
      key: "firstMessage",
      title: t("sections.firstMessage"),
      content: character.firstMessage,
      render: (content: string) => (
        <div className="bg-accent/50 border-border/50 rounded-lg border p-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap italic">{content}</p>
        </div>
      ),
    },
    {
      key: "exampleDialogues",
      title: t("sections.exampleDialogues"),
      content: character.exampleDialogues,
      render: (content: string) => (
        <div className="bg-muted/40 border-border/30 rounded-lg border p-3">
          <p className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      ),
    },
  ].filter((section) => hasContent(section.content));

  if (sections.length === 0) {
    return <div className="text-muted-foreground py-6 text-center text-sm">{t("dialog.noDetails")}</div>;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="shrink-0 space-y-2 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("sidebar.title")}</h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => onChat(character)}>
            <MessageCircle className="mr-1 h-3 w-3" />
            {t("sidebar.startChat")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(character)}>
            <Edit className="mr-1 h-3 w-3" />
            {tc("actions.edit")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(character)}>
            <Trash2 className="mr-1 h-3 w-3" />
            {tc("actions.delete")}
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <div className="flex items-center gap-3">
            {character.avatar ? (
              <img
                src={character.avatar}
                alt={character.name}
                className="border-border/50 h-16 w-16 rounded-xl border object-cover shadow-sm"
              />
            ) : (
              <div className="bg-accent/60 border-border/50 flex h-16 w-16 items-center justify-center rounded-xl border shadow-sm">
                <span className="text-muted-foreground text-2xl font-bold select-none">{character.name.charAt(0)}</span>
              </div>
            )}
            <h3 className="text-xl font-bold">{character.name}</h3>
          </div>

          {sections.map((section, index) => (
            <div key={section.key}>
              <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">
                {section.title}
              </h4>
              {section.render(section.content!)}
              {index < sections.length - 1 && <hr className="my-4" />}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
