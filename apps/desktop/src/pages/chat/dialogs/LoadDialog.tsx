import { useTranslation } from "react-i18next";
import { GitBranch, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";
import type { ChatSavepoint } from "@/db/repositories";
import { formatSavepointDate } from "../utils";
import { iconSm } from "./shared";

export function LoadDialog({
  open,
  onOpenChange,
  savepoints,
  isLoading,
  restoringSavepointId,
  importingSavepointId,
  isGenerating,
  onRestore,
  onImportAsBranch,
  onDelete,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savepoints: ChatSavepoint[];
  isLoading: boolean;
  restoringSavepointId: string | null;
  importingSavepointId?: string | null;
  isGenerating: boolean;
  onRestore: (savepoint: ChatSavepoint) => void;
  onImportAsBranch?: (savepoint: ChatSavepoint) => void;
  onDelete: (savepointId: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation(["chat", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("loadDialog.title")}</DialogTitle>
          <DialogDescription>{t("loadDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {isLoading && <p className="text-muted-foreground py-6 text-center text-sm">{t("loadDialog.loading")}</p>}
          {!isLoading && savepoints.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">{t("loadDialog.noSavepoints")}</p>
          )}
          {!isLoading &&
            savepoints.map((savepoint) => (
              <div key={savepoint.id} className="bg-card/60 flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{savepoint.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatSavepointDate(savepoint.createdAt)} ·{" "}
                    {t("loadDialog.messages", { count: savepoint.messageCount })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(savepoint)}
                    disabled={!!restoringSavepointId || !!importingSavepointId || isGenerating}
                  >
                    {restoringSavepointId === savepoint.id ? t("loadDialog.loading") : t("loadDialog.load")}
                  </Button>
                  {onImportAsBranch && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onImportAsBranch(savepoint)}
                      disabled={!!restoringSavepointId || !!importingSavepointId || isGenerating}
                    >
                      <GitBranch className={iconSm} />
                      {importingSavepointId === savepoint.id
                        ? t("loadDialog.importing")
                        : t("loadDialog.importAsBranch")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                    onClick={() => onDelete(savepoint.id)}
                    disabled={!!restoringSavepointId || !!importingSavepointId}
                    title={t("loadDialog.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.close")}
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            {t("loadDialog.refresh")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
