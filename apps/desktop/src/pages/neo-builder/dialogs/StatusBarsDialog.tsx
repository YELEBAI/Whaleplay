import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { NeoStatusBarConfig } from "../types";

interface StatusBarsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusBars: NeoStatusBarConfig | null;
}

export function StatusBarsDialog({ open, onOpenChange, statusBars }: StatusBarsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>状态栏</DialogTitle>
          <DialogDescription>Agentic Play 新会话会用这份配置初始化右侧动态状态栏。</DialogDescription>
        </DialogHeader>
        {statusBars?.bars.length ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              {statusBars.bars.map((bar) => (
                <section key={bar.id} className="bg-background rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold break-words">{bar.label}</h3>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {bar.assetId} · {bar.id}
                      </p>
                    </div>
                    <span className="bg-muted shrink-0 rounded px-2 py-1 text-xs">
                      {bar.value ?? "-"} / {bar.max}
                    </span>
                  </div>
                  {bar.description ? (
                    <p className="text-muted-foreground mt-3 text-xs wrap-break-word whitespace-pre-wrap">
                      {bar.description}
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
            <pre className="bg-muted/30 max-h-[38vh] overflow-auto rounded-md border p-4 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
              {JSON.stringify(statusBars, null, 2)}
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
