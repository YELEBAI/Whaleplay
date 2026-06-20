import { ArrowLeft, Plus, Import } from "lucide-react";
import { Button } from "@neo-tavern/ui";
import type { RefObject } from "react";

export function Title({
  onBack,
  onNewCharacter,
  onImport,
  onFileChange,
  importing,
  fileInputRef,
  t,
  tc,
}: {
  onBack: () => void;
  onNewCharacter: () => void;
  onImport: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importing: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
  tc: (key: string) => string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <Button size="sm" variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        {tc("actions.back")}
      </Button>
      <h1 className="ml-1 text-xl font-bold">{t("title")}</h1>
      <div className="flex-1" />
      <input ref={fileInputRef} type="file" accept=".json,.png" onChange={onFileChange} className="hidden" />
      <Button size="sm" variant="outline" onClick={onNewCharacter}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t("newCharacter")}
      </Button>
      <Button size="sm" variant="outline" onClick={onImport} disabled={importing}>
        <Import className="mr-1 h-3.5 w-3.5" />
        {t("importCard")}
      </Button>
    </div>
  );
}
