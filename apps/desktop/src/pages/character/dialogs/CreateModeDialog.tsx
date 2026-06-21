import { MessageCircle, Dice5 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";
import type { Character } from "@neo-tavern/shared";

export function CreateModeDialog({
  target,
  creatingMode,
  onSelectMode,
  onCancel,
}: {
  target: Character | null;
  creatingMode: "normal" | "agentic" | null;
  onSelectMode: (mode: "normal" | "agentic") => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("character");
  const { t: tc } = useTranslation("common");

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !creatingMode) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modeDialog.title")}</DialogTitle>
          <DialogDescription>{t("modeDialog.description", { name: target?.name })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!!creatingMode}
            onClick={() => onSelectMode("normal")}
            className="bg-card hover:bg-accent rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-2 font-medium">
              <MessageCircle className="h-4 w-4" />
              {t("modeDialog.normal.label")}
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{t("modeDialog.normal.desc")}</p>
          </button>
          <button
            type="button"
            disabled={!!creatingMode}
            onClick={() => onSelectMode("agentic")}
            className="bg-card hover:bg-accent rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-2 font-medium">
              <Dice5 className="h-4 w-4" />
              {t("modeDialog.agentic.label")}
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{t("modeDialog.agentic.desc")}</p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={!!creatingMode}>
            {tc("actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
