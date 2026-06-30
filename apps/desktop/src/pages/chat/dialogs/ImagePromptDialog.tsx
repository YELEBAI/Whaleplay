import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
} from "@neo-tavern/ui";
import { iconSm } from "./shared";

export function ImagePromptDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onCancel,
  onSave,
  onSaveAndRegenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAndRegenerate: () => void;
}) {
  const { t } = useTranslation(["chat", "common"]);
  const disabled = !draft.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("imagePromptDialog.title")}</DialogTitle>
          <DialogDescription>{t("imagePromptDialog.description")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={t("imagePromptDialog.placeholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="outline" onClick={onSave} disabled={disabled}>
            {t("imagePromptDialog.savePrompt")}
          </Button>
          <Button onClick={onSaveAndRegenerate} disabled={disabled}>
            <RotateCcw className={iconSm} />
            {t("imagePromptDialog.saveAndRegenerate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
