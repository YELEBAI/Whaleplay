import { useTranslation } from "react-i18next";
import { FileText, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@neo-tavern/ui";
import type { BuilderWorkspaceRecord } from "./types";
import { getWorkspaceRecordStatus, formatCharacterUpdatedAt } from "./utils";

export function BuilderWorkspaceList({
  records,
  activeWorkspaceId,
  disabled,
  onNew,
  onSelect,
  onDelete,
}: {
  records: BuilderWorkspaceRecord[];
  activeWorkspaceId: string;
  disabled: boolean;
  onNew: () => void;
  onSelect: (record: BuilderWorkspaceRecord) => void;
  onDelete: (record: BuilderWorkspaceRecord) => void;
}) {
  const { t } = useTranslation("neo-builder");
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {t("workspace.title")}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          className="mb-2 flex w-full min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted/60"
          onClick={onNew}
          disabled={disabled}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{t("workspace.newWorkspace")}</span>
        </button>

        <div className="space-y-1">
          {records.map((record) => (
            <div
              key={record.id}
              className={`flex min-w-0 items-stretch rounded-md border ${
                activeWorkspaceId === record.id ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/60"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2 text-left"
                onClick={() => onSelect(record)}
                disabled={disabled}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">{record.title}</span>
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className={cn("shrink-0", record.savedCharacterId ? "text-emerald-500" : record.draft?.name?.trim() ? "text-amber-500" : "text-muted-foreground")}>
                    {getWorkspaceRecordStatus(record)}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatCharacterUpdatedAt(record.updatedAt)}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onDelete(record)}
                disabled={disabled}
                title={t("workspace.delete")}
                aria-label={t("workspace.deleteAria", { title: record.title })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {!records.length ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{t("workspace.empty")}</div>
        ) : null}
      </div>
    </aside>
  );
}
