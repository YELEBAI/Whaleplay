import { useState } from "react";
import { Button, Textarea } from "@neo-tavern/ui";
import { Check, X } from "lucide-react";

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
    <div className="w-full rounded-lg border bg-card p-3 shadow-sm">
      <Textarea
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[260px] max-h-[60vh] resize-y overflow-y-auto leading-relaxed"
        style={{ fontSize: `${fontSize}px` }}
        autoFocus
      />
      <div className="mt-2 flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !draft.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? "Saving..." : "Save (Ctrl+Enter)"}
        </Button>
      </div>
    </div>
  );
}
