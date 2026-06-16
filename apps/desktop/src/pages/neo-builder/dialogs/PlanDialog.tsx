import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { NeoCreationPlan } from "../types";
import { formatCharacterUpdatedAt } from "../utils";

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creationPlan: NeoCreationPlan | null;
  t: TFunction;
}

export function PlanDialog({ open, onOpenChange, creationPlan, t }: PlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.creationPlan.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.creationPlan.description")}</DialogDescription>
        </DialogHeader>
        {creationPlan ? (
          <div className="space-y-4 text-sm">
            <div className="bg-background text-muted-foreground grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-3">
              <span>项目：{creationPlan.project.name}</span>
              <span>条目：{creationPlan.entries.length}</span>
              <span>更新：{formatCharacterUpdatedAt(creationPlan.updatedAt)}</span>
            </div>
            <pre className="bg-muted/30 max-h-[58vh] overflow-auto rounded-md border p-4 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
              {creationPlan.yaml}
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
