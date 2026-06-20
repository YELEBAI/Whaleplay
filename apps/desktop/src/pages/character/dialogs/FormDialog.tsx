import {
  Button,
  Input,
  Textarea,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@neo-tavern/ui";
import type { CreateCharacterInput } from "@neo-tavern/shared";

export function CharFormDialog({
  open,
  form,
  editingId,
  loading,
  onUpdateField,
  onSubmit,
  onCancel,
  t,
  tc,
}: {
  open: boolean;
  form: CreateCharacterInput;
  editingId: string | null;
  loading: boolean;
  onUpdateField: (field: keyof CreateCharacterInput, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  t: (key: string) => string;
  tc: (key: string) => string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="bg-background sticky pb-2">
          <DialogTitle>{editingId ? t("dialog.editCharacter") : t("dialog.newCharacter")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="char-name">{t("form.name")}</Label>
            <Input
              id="char-name"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateField("name", e.target.value)}
              placeholder={t("form.namePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="char-desc">{t("form.description")}</Label>
            <Textarea
              id="char-desc"
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateField("description", e.target.value)}
              placeholder={t("form.descriptionPlaceholder")}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="char-personality">{t("form.personality")}</Label>
            <Textarea
              id="char-personality"
              value={form.personality}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateField("personality", e.target.value)}
              placeholder={t("form.personalityPlaceholder")}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="char-scenario">{t("form.scenario")}</Label>
            <Textarea
              id="char-scenario"
              value={form.scenario}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateField("scenario", e.target.value)}
              placeholder={t("form.scenarioPlaceholder")}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="char-firstmsg">{t("form.firstMessage")}</Label>
            <Textarea
              id="char-firstmsg"
              value={form.firstMessage}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateField("firstMessage", e.target.value)}
              placeholder={t("form.firstMessagePlaceholder")}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="char-examples">{t("form.exampleDialogues")}</Label>
            <Textarea
              id="char-examples"
              value={form.exampleDialogues ?? ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateField("exampleDialogues", e.target.value)
              }
              placeholder={t("form.exampleDialoguesPlaceholder")}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {tc("actions.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={!form.name.trim() || loading}>
            {editingId ? tc("actions.save") : tc("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
