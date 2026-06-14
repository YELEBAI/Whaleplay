import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { NeoBuilderEvaluationReport } from "../types";

interface EvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluationReport: NeoBuilderEvaluationReport | null;
  t: TFunction;
}

export function EvaluationDialog({ open, onOpenChange, evaluationReport, t }: EvaluationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.evaluation.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.evaluation.description")}</DialogDescription>
        </DialogHeader>
        {evaluationReport ? (
          <div className="space-y-4 text-sm">
            <section className="bg-background rounded-md border p-4">
              <h3 className="mb-2 text-sm font-semibold">摘要</h3>
              <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{evaluationReport.summary}</p>
              {typeof evaluationReport.score === "number" ? (
                <p className="text-muted-foreground mt-2 text-xs">Score {evaluationReport.score}/100</p>
              ) : null}
            </section>
            <section className="bg-background rounded-md border p-4">
              <h3 className="mb-2 text-sm font-semibold">问题</h3>
              {evaluationReport.issues.length ? (
                <div className="space-y-2">
                  {evaluationReport.issues.map((issue, index) => (
                    <div key={`${issue.target}-${index}`} className="bg-muted/20 rounded-md border p-3">
                      <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span>{issue.severity}</span>
                        <span>{issue.target}</span>
                      </div>
                      <p className="wrap-break-word whitespace-pre-wrap">{issue.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">暂无问题</p>
              )}
            </section>
            <section className="bg-background rounded-md border p-4">
              <h3 className="mb-2 text-sm font-semibold">修改建议</h3>
              <div className="space-y-2">
                {evaluationReport.suggestions.map((item, index) => (
                  <p key={`${item}-${index}`} className="wrap-break-word whitespace-pre-wrap">
                    {index + 1}. {item}
                  </p>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
