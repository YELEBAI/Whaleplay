import { useTranslation } from "react-i18next";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@neo-tavern/ui";

export function DeleteMessageDialog({
  open,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["chat", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteMessage.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("deleteMessage.description")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {t("common:actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
