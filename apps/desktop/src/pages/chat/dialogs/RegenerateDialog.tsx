import React from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, GitBranch } from "lucide-react";
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

export type RegenerateMode = "replace" | "fork";

export function RegenerateDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: RegenerateMode) => void;
}) {
  const { t } = useTranslation("chat");
  const [mode, setMode] = React.useState<RegenerateMode>("fork");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("regenerateDialog.title")}</DialogTitle>
          <DialogDescription>{t("regenerateDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              mode === "fork" ? "border-primary bg-primary/5" : "hover:bg-accent"
            }`}
          >
            <input
              type="radio"
              name="regenerateMode"
              className="mt-0.5"
              checked={mode === "fork"}
              onChange={() => setMode("fork")}
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <GitBranch className="text-primary h-4 w-4" />
                {t("regenerateDialog.fork.label")}
              </span>
              <p className="text-muted-foreground mt-0.5 text-xs">{t("regenerateDialog.fork.description")}</p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              mode === "replace" ? "border-primary bg-primary/5" : "hover:bg-accent"
            }`}
          >
            <input
              type="radio"
              name="regenerateMode"
              className="mt-0.5"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <RotateCcw className="h-4 w-4" />
                {t("regenerateDialog.replace.label")}
              </span>
              <p className="text-muted-foreground mt-0.5 text-xs">{t("regenerateDialog.replace.description")}</p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => onConfirm(mode)}>
            {mode === "fork" ? (
              <>
                <GitBranch className={iconSm} />
                {t("regenerateDialog.forkAndRegenerate")}
              </>
            ) : (
              <>
                <RotateCcw className={iconSm} />
                {t("regenerateDialog.replaceRegenerate")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
