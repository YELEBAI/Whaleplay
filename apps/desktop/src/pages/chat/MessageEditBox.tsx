import { useState } from "react";
import { Button, Textarea } from "@neo-tavern/ui";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MessageEditBox({
  initialContent,
  fontSize,
  onCancel,
  onSave,
}: {
  initialContent: string;
  fontSize: number;
  onCancel: () => void;
  onSave: (content: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [prevInitial, setPrevInitial] = useState(initialContent);

  if (initialContent !== prevInitial) {
    setPrevInitial(initialContent);
    setDraft(initialContent);
  }

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="bg-card w-full rounded-lg border p-3 shadow-sm">
      <Textarea
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className="max-h-[60vh] min-h-[260px] resize-y overflow-y-auto leading-relaxed"
        style={{ fontSize: `${fontSize}px` }}
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" />
          {t("actions.cancel")}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !draft.trim()}>
          <Check className="mr-1 h-3.5 w-3.5" />
          {saving ? t("actions.saving") : t("actions.save")}
        </Button>
      </div>
    </div>
  );
}
