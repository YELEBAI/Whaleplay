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

export function DeleteDialog({
  target,
  onClose,
  onDelete,
  t,
  tc,
}: {
  target: Character | null;
  onClose: () => void;
  onDelete: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  tc: (key: string) => string;
}) {
  return (
    <Dialog open={!!target} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("delete.title")}</DialogTitle>
          <DialogDescription>{t("delete.description", { name: target?.name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {tc("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
