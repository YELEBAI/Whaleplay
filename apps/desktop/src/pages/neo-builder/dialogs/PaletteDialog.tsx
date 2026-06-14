import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@neo-tavern/ui";
import type { NeoPersonalityPalette } from "../types";

interface PaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personalityPalette: NeoPersonalityPalette | null;
  t: TFunction;
}

export function PaletteDialog({ open, onOpenChange, personalityPalette, t }: PaletteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.palette.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.palette.description")}</DialogDescription>
        </DialogHeader>
        {personalityPalette ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <section className="bg-background rounded-md border p-3">
                <h3 className="text-muted-foreground text-xs font-semibold">底色</h3>
                <p className="mt-2 wrap-break-word">{personalityPalette.base || "-"}</p>
              </section>
              <section className="bg-background rounded-md border p-3">
                <h3 className="text-muted-foreground text-xs font-semibold">主色调</h3>
                <p className="mt-2 wrap-break-word">{personalityPalette.main.join("、") || "-"}</p>
              </section>
              <section className="bg-background rounded-md border p-3">
                <h3 className="text-muted-foreground text-xs font-semibold">点缀</h3>
                <p className="mt-2 wrap-break-word">{personalityPalette.accents.join("、") || "-"}</p>
              </section>
            </div>
            {personalityPalette.derivatives.map((derivative) => (
              <section key={derivative.color} className="bg-background rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold">{derivative.color}衍生</h3>
                <div className="space-y-2">
                  {derivative.items.map((item, index) => (
                    <p
                      key={`${derivative.color}-${index}`}
                      className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap"
                    >
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </section>
            ))}
            {personalityPalette.futureDerivatives?.length ? (
              <section className="bg-background rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold">未来衍生</h3>
                <div className="space-y-2">
                  {personalityPalette.futureDerivatives.map((item, index) => (
                    <p key={`${item}-${index}`} className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                      {item}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}
            {personalityPalette.compiledText ? (
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Compiled Personality</h3>
                <p className="bg-muted/30 rounded-md border p-3 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                  {personalityPalette.compiledText}
                </p>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
