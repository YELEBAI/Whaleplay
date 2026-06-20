import { Edit, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";

export function CreateDialog({
  open,
  onOpenChange,
  onTraditional,
  onBuilder,
  t,
  tc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTraditional: () => void;
  onBuilder: () => void;
  t: (key: string) => string;
  tc: (key: string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onTraditional}
            className="bg-card hover:bg-accent rounded-md border p-4 text-left transition-colors"
          >
            <div className="flex items-center gap-2 font-medium">
              <Edit className="h-4 w-4" />
              {t("create.traditional")}
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{t("create.traditionalDesc")}</p>
          </button>
          <button
            type="button"
            onClick={onBuilder}
            className="bg-card hover:bg-accent rounded-md border p-4 text-left transition-colors"
          >
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              {t("create.builder")}
            </div>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{t("create.builderDesc")}</p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
