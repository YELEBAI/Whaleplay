import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { CreateCharacterInput } from "../types";

interface CharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: CreateCharacterInput | null;
  t: TFunction;
}

export function CharacterDialog({ open, onOpenChange, draft, t }: CharacterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft?.name || t("dialogs.characterCard.defaultTitle")}</DialogTitle>
          <DialogDescription>{t("dialogs.characterCard.description")}</DialogDescription>
        </DialogHeader>
        {draft ? (
          <div className="space-y-5 text-sm">
            {draft.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {draft.tags.map((tag) => (
                  <span key={tag} className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Description</h3>
              <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.description || "-"}</p>
            </section>
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Personality</h3>
              <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.personality || "-"}</p>
            </section>
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Scenario</h3>
              <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.scenario || "-"}</p>
            </section>
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">First Message</h3>
              <p className="bg-muted/30 rounded-md border p-3 leading-relaxed wrap-break-word whitespace-pre-wrap">
                {draft.firstMessage || "-"}
              </p>
            </section>
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Example Dialogues</h3>
              <p className="bg-background rounded-md border p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
                {draft.exampleDialogues || "-"}
              </p>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
