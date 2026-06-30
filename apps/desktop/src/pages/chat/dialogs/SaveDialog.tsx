import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@neo-tavern/ui";
import { createDefaultSavepointName } from "@/db/repositories";

export function SaveDialog({
  open,
  onOpenChange,
  savepointName,
  onSavepointNameChange,
  onCancel,
  onSave,
  isSaving,
  hasCurrentChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savepointName: string;
  onSavepointNameChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  hasCurrentChat: boolean;
}) {
  const { t } = useTranslation(["chat", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("savepointDialog.title")}</DialogTitle>
          <DialogDescription>{t("savepointDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={savepointName}
            onChange={(e) => onSavepointNameChange(e.target.value)}
            placeholder={createDefaultSavepointName()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={onSave} disabled={isSaving || !hasCurrentChat}>
            {isSaving ? t("common:actions.saving") : t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
