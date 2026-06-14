import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { WorldbookDraft } from "../types";

interface WorldbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worldbookDraft: WorldbookDraft | null;
  t: TFunction;
}

export function WorldbookDialog({ open, onOpenChange, worldbookDraft, t }: WorldbookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{worldbookDraft?.name || t("dialogs.worldbook.defaultTitle")}</DialogTitle>
          <DialogDescription>{worldbookDraft?.description || t("dialogs.worldbook.description")}</DialogDescription>
        </DialogHeader>
        {worldbookDraft?.entries.length ? (
          <div className="space-y-4">
            {worldbookDraft.entries.map((entry, index) => (
              <section key={`${entry.title}-${index}`} className="bg-background rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-semibold wrap-break-word">{entry.title}</h3>
                  <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                    <span className="bg-muted rounded px-2 py-1">{entry.type}</span>
                    <span className="bg-muted rounded px-2 py-1">{entry.position || "afterHistory"}</span>
                    <span className="bg-muted rounded px-2 py-1">priority {entry.priority}</span>
                    <span className="bg-muted rounded px-2 py-1">{entry.triggerMode}</span>
                  </div>
                </div>
                {entry.keys ? (
                  <p className="text-muted-foreground mt-3 text-xs wrap-break-word">Keys: {entry.keys}</p>
                ) : null}
                {entry.secondaryKeys ? (
                  <p className="text-muted-foreground mt-1 text-xs wrap-break-word">Secondary: {entry.secondaryKeys}</p>
                ) : null}
                <p className="mt-3 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{entry.content}</p>
              </section>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
