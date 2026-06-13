import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button, cn, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@neo-tavern/ui";
import { toast } from "@/utils/toast";
import { dialogMax80vh, dialogScrollContent, iconSm } from "./shared";

export function PromptDialog({
  open,
  onOpenChange,
  previewText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewText: string;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-3xl", dialogMax80vh)}>
        <DialogHeader>
          <DialogTitle>{t("promptDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className={dialogScrollContent}>
          <pre className="text-muted-foreground font-mono text-xs whitespace-pre-wrap">
            {previewText || t("promptDialog.noData")}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(previewText);
              toast("success", t("toast.copied"));
            }}
          >
            <Copy className={iconSm} />
            {t("promptDialog.copyPrompt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
