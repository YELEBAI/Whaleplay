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
} from "@neo-tavern/ui";
import { iconSm } from "./shared";

export function RegenerateDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("regenerateDialog.title")}</DialogTitle>
          <DialogDescription>{t("regenerateDialog.description")}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm}>
            <RotateCcw className={iconSm} />
            {t("regenerateDialog.replaceRegenerate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
