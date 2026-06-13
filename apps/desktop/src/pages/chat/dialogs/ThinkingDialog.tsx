import { useTranslation } from "react-i18next";
import { Copy, Brain } from "lucide-react";
import { Button, cn, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@neo-tavern/ui";
import { toast } from "@/utils/toast";
import { dialogMax80vh, dialogScrollContent, iconSm } from "./shared";

export function ThinkingDialog({
  open,
  onOpenChange,
  reasoningContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reasoningContent: string | undefined;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-2xl", dialogMax80vh)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            {t("thinkingDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className={dialogScrollContent}>
          <pre className="text-muted-foreground bg-muted/40 rounded-lg p-4 font-mono text-xs whitespace-pre-wrap">
            {reasoningContent || t("thinkingDialog.noData")}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(reasoningContent || "");
              toast("success", t("toast.copied"));
            }}
          >
            <Copy className={iconSm} />
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
