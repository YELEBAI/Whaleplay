import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, CheckCircle2, FileText, KeyRound, Plus, Power, Save, Trash2, X } from "lucide-react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Textarea,
} from "@neo-tavern/ui";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import type { WorldbookEntry } from "@neo-tavern/shared";
import { toast } from "@/utils/toast";

function keywordsFrom(keys: string) {
  return keys
    .split(/[,，、\n]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function isLongEntry(entry: WorldbookEntry) {
  return entry.content.length > 420 || entry.content.split("\n").length > 8;
}

function entryModeLabel(entry: WorldbookEntry) {
  if (entry.type === "always") return "Always";
  return entry.triggerMode === "and" ? "Trigger AND" : "Trigger OR";
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card/50 rounded-md border px-3 py-2">
      <div className="text-base leading-none font-semibold">{value}</div>
      <div className="text-muted-foreground mt-1 text-[10px] font-medium tracking-wide uppercase">{label}</div>
    </div>
  );
}

function SwitchButton({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`bg-background inline-block h-4 w-4 rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function WorldbookPage() {
  const { t } = useTranslation("worldbook");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const {
    worldbooks,
    activeWorldbookId,
    loading,
    loadWorldbooks,
    createWorldbook,
    updateWorldbook,
    deleteWorldbook,
    setActiveWorldbook,
    addEntry,
    updateEntry,
    deleteEntry,
    toggleEntry,
  } = useWorldbookStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wbName, setWbName] = useState("");
  const [wbDesc, setWbDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<(typeof worldbooks)[0] | null>(null);

  const [entryTitle, setEntryTitle] = useState("");
  const [entryKeys, setEntryKeys] = useState("");
  const [entrySecondaryKeys, setEntrySecondaryKeys] = useState("");
  const [entryContent, setEntryContent] = useState("");
  const [entryPriority, setEntryPriority] = useState("100");
  const [entryType, setEntryType] = useState<"always" | "trigger">("trigger");
  const [entryTriggerMode, setEntryTriggerMode] = useState<"and" | "or">("or");
  const [entrySelectiveLogic, setEntrySelectiveLogic] = useState<"and" | "or">("or");
  const [entryScanDepth, setEntryScanDepth] = useState("8");
  const [entryCaseSensitive, setEntryCaseSensitive] = useState(false);
  const [entryMatchWholeWords, setEntryMatchWholeWords] = useState(false);
  const [entryUseProbability, setEntryUseProbability] = useState(false);
  const [entryProbability, setEntryProbability] = useState("100");
  const [entryPosition, setEntryPosition] = useState<"beforeHistory" | "afterHistory" | "atDepth">("beforeHistory");
  const [entryDepth, setEntryDepth] = useState("0");
  const [entryRole, setEntryRole] = useState<"system" | "user" | "assistant">("system");
  const [entryEnabled, setEntryEnabled] = useState(true);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    loadWorldbooks();
  }, [loadWorldbooks]);

  const resetEntryForm = () => {
    setEditingEntryId(null);
    setEntryTitle("");
    setEntryKeys("");
    setEntrySecondaryKeys("");
    setEntryContent("");
    setEntryPriority("100");
    setEntryType("trigger");
    setEntryTriggerMode("or");
    setEntrySelectiveLogic("or");
    setEntryScanDepth("8");
    setEntryCaseSensitive(false);
    setEntryMatchWholeWords(false);
    setEntryUseProbability(false);
    setEntryProbability("100");
    setEntryPosition("beforeHistory");
    setEntryDepth("0");
    setEntryRole("system");
    setEntryEnabled(true);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const wb = worldbooks.find((worldbook) => worldbook.id === id);
    if (wb) {
      setWbName(wb.name);
      setWbDesc(wb.description);
    }
    setExpandedEntryIds(new Set());
    resetEntryForm();
  };

  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!selectedId && worldbooks.length > 0) {
      if (hasAutoSelectedRef.current) return;
      hasAutoSelectedRef.current = true;
      handleSelect(worldbooks[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldbooks]);

  const selected = worldbooks.find((worldbook) => worldbook.id === selectedId) ?? null;
  const entries = useMemo(
    () => (selected ? [...selected.entries].sort((a, b) => b.priority - a.priority) : []),
    [selected],
  );
  const selectedEntry = editingEntryId ? entries.find((entry) => entry.id === editingEntryId) : null;
  const stats = useMemo(() => {
    const source = selected?.entries ?? [];
    return {
      total: source.length,
      enabled: source.filter((entry) => entry.enabled).length,
      always: source.filter((entry) => entry.enabled && entry.type === "always").length,
      trigger: source.filter((entry) => entry.enabled && entry.type === "trigger").length,
    };
  }, [selected]);

  const handleCreate = async () => {
    try {
      const wb = await createWorldbook({ name: "New World Book", description: "" });
      setSelectedId(wb.id);
      setWbName(wb.name);
      setWbDesc("");
      setExpandedEntryIds(new Set());
      resetEntryForm();
    } catch {
      toast("error", "Failed");
    }
  };

  const handleSaveMeta = async () => {
    if (!selectedId) return;
    try {
      await updateWorldbook(selectedId, { name: wbName, description: wbDesc });
      toast("success", tt("worldbookSaved"));
    } catch {
      toast("error", "Failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWorldbook(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setWbName("");
        setWbDesc("");
        resetEntryForm();
      }
      setDeleteTarget(null);
      toast("info", `"${deleteTarget.name}" deleted`);
    } catch {
      toast("error", "Failed");
    }
  };

  const handleActivate = async () => {
    if (!selectedId) return;
    const newId = activeWorldbookId === selectedId ? null : selectedId;
    await setActiveWorldbook(newId);
    toast("info", newId ? `Activated "${selected?.name}"` : "Deactivated");
  };

  const startEditEntry = (entry: WorldbookEntry) => {
    setEditingEntryId(entry.id);
    setEntryTitle(entry.title);
    setEntryKeys(entry.keys);
    setEntrySecondaryKeys(entry.secondaryKeys ?? "");
    setEntryContent(entry.content);
    setEntryPriority(String(entry.priority));
    setEntryType(entry.type);
    setEntryTriggerMode(entry.triggerMode);
    setEntrySelectiveLogic(entry.selectiveLogic ?? "or");
    setEntryScanDepth(String(entry.scanDepth ?? 8));
    setEntryCaseSensitive(entry.caseSensitive ?? false);
    setEntryMatchWholeWords(entry.matchWholeWords ?? false);
    setEntryUseProbability(entry.useProbability ?? false);
    setEntryProbability(String(entry.probability ?? 100));
    setEntryPosition(entry.position ?? "beforeHistory");
    setEntryDepth(String(entry.depth ?? 0));
    setEntryRole(entry.role ?? "system");
    setEntryEnabled(entry.enabled);
  };

  const handleEntryCardKeyDown = (event: KeyboardEvent<HTMLElement>, entry: WorldbookEntry) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startEditEntry(entry);
  };

  const handleSaveEntry = async () => {
    if (!selectedId || !entryTitle.trim()) {
      toast("error", "Title required");
      return;
    }

    const parsedPriority = Number.parseInt(entryPriority, 10);
    const parsedScanDepth = Number.parseInt(entryScanDepth, 10);
    const parsedProbability = Number.parseInt(entryProbability, 10);
    const parsedDepth = Number.parseInt(entryDepth, 10);
    const data = {
      title: entryTitle.trim(),
      keys: entryKeys,
      secondaryKeys: entrySecondaryKeys,
      content: entryContent,
      priority: Number.isFinite(parsedPriority) ? parsedPriority : 100,
      type: entryType,
      triggerMode: entryTriggerMode,
      selectiveLogic: entrySelectiveLogic,
      scanDepth: Number.isFinite(parsedScanDepth) ? Math.max(0, parsedScanDepth) : 8,
      caseSensitive: entryCaseSensitive,
      matchWholeWords: entryMatchWholeWords,
      useProbability: entryUseProbability,
      probability: Number.isFinite(parsedProbability) ? Math.min(100, Math.max(0, parsedProbability)) : 100,
      position: entryPosition,
      depth: Number.isFinite(parsedDepth) ? Math.max(0, parsedDepth) : 0,
      role: entryRole,
      enabled: entryEnabled,
    };

    try {
      if (editingEntryId) {
        await updateEntry(selectedId, editingEntryId, data);
        toast("success", `"${entryTitle}" updated`);
      } else {
        await addEntry(selectedId, data);
        toast("success", `"${entryTitle}" added`);
      }
      resetEntryForm();
    } catch {
      toast("error", "Failed");
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!selectedId) return;
    const entry = entries.find((candidate) => candidate.id === entryId);
    deleteEntry(selectedId, entryId);
    if (editingEntryId === entryId) resetEntryForm();
    toast("info", `"${entry?.title || "Entry"}" deleted`);
  };

  const handleToggleEntry = (entryId: string) => {
    if (!selectedId) return;
    toggleEntry(selectedId, entryId);
  };

  const toggleEntryExpanded = (entryId: string) => {
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  return (
    <div className="bg-background flex h-full min-h-0 overflow-hidden">
      <aside className="bg-card/30 flex w-60 shrink-0 flex-col overflow-hidden border-r">
        <div className="flex shrink-0 flex-col gap-3 border-b p-4">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </button>
          <div>
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">{t("title")}</h2>
            <p className="text-muted-foreground mt-1 text-xs">{t("booksAvailable", { count: worldbooks.length })}</p>
          </div>
        </div>

        <ScrollArea type="always" className="min-h-0 flex-1">
          <div className="space-y-2 p-3 pr-8">
            {loading && (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t("loading")}</p>
            )}
            {!loading && worldbooks.length === 0 && (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t("noBooks")}</p>
            )}
            {worldbooks.map((worldbook) => {
              const isSelected = selectedId === worldbook.id;
              const enabledCount = worldbook.entries.filter((entry) => entry.enabled).length;

              return (
                <button
                  key={worldbook.id}
                  type="button"
                  onClick={() => handleSelect(worldbook.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-accent text-foreground"
                      : "border-border/70 bg-background/30 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm leading-5 font-semibold wrap-break-word">{worldbook.name}</span>
                    {activeWorldbookId === worldbook.id && (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5 wrap-break-word">
                    {worldbook.description || t("noDescription")}
                  </p>
                  <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[10px] font-medium tracking-wide uppercase">
                    <span>{t("entries", { count: worldbook.entries.length })}</span>
                    <span>
                      {enabledCount} {t("enabledOn")}
                    </span>
                  </div>
                </button>
              );
            })}
            <Button variant="outline" size="sm" onClick={handleCreate} className="w-full justify-center text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("newBook")}
            </Button>
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center">
            <div className="space-y-3 text-center">
              <BookOpen className="mx-auto h-10 w-10 opacity-30" />
              <p className="text-sm">{t("selectOrCreate")}</p>
              <Button variant="outline" size="sm" onClick={handleCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("newBook")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium">
                    <BookOpen className="h-3.5 w-3.5" />
                    World book
                  </div>
                  <Input
                    value={wbName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setWbName(event.target.value)}
                    className="h-auto border-0 border-b bg-transparent px-0 pb-1 text-2xl font-bold shadow-none focus-visible:ring-0"
                    placeholder={t("bookNamePlaceholder")}
                  />
                  <Input
                    value={wbDesc}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setWbDesc(event.target.value)}
                    className="text-muted-foreground mt-2 h-auto border-0 border-b bg-transparent px-0 pb-1 text-sm shadow-none focus-visible:ring-0"
                    placeholder={t("descPlaceholder")}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleSaveMeta}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {tc("actions.save")}
                  </Button>
                  <Button
                    size="sm"
                    variant={activeWorldbookId === selectedId ? "default" : "outline"}
                    onClick={handleActivate}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {activeWorldbookId === selectedId ? t("active") : t("activate")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive h-8 w-8"
                    onClick={() => setDeleteTarget(selected)}
                    title={t("deleteBook")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid w-full max-w-xl grid-cols-4 gap-2">
                <CountPill label={t("stats.entries")} value={stats.total} />
                <CountPill label={t("stats.enabled")} value={stats.enabled} />
                <CountPill label={t("stats.always")} value={stats.always} />
                <CountPill label={t("stats.trigger")} value={stats.trigger} />
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] overflow-hidden">
              <section className="flex min-w-0 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t("entriesSection.title")}</h3>
                    <p className="text-muted-foreground text-xs">{t("entriesSection.description")}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={resetEntryForm}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("entriesSection.newEntry")}
                  </Button>
                </div>

                <ScrollArea type="always" className="min-h-0 flex-1">
                  <div className="space-y-3 p-5 pr-7">
                    {entries.length === 0 && (
                      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                        <FileText className="mx-auto mb-2 h-7 w-7 opacity-35" />
                        No entries yet
                      </div>
                    )}
                    {entries.map((entry) => {
                      const keywords = keywordsFrom(entry.keys);
                      const isExpanded = expandedEntryIds.has(entry.id);
                      const isLong = isLongEntry(entry);
                      const isEditing = editingEntryId === entry.id;

                      return (
                        <article
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => startEditEntry(entry)}
                          onKeyDown={(event) => handleEntryCardKeyDown(event, entry)}
                          className={`bg-card/40 rounded-lg border p-4 transition-colors ${
                            isEditing ? "border-primary/50 bg-accent/35" : "border-border/80 hover:bg-accent/25"
                          } ${entry.enabled ? "" : "opacity-55"} focus-visible:ring-ring cursor-pointer focus-visible:ring-1 focus-visible:outline-none`}
                        >
                          <div className="flex items-start gap-3">
                            <SwitchButton
                              checked={entry.enabled}
                              onClick={() => handleToggleEntry(entry.id)}
                              label={`${entry.enabled ? "Disable" : "Enable"} ${entry.title}`}
                            />
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="min-w-0 truncate text-sm font-semibold">
                                  {entry.title || "Untitled entry"}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    entry.type === "always"
                                      ? "bg-sky-500/10 text-sky-500"
                                      : entry.triggerMode === "and"
                                        ? "bg-blue-500/10 text-blue-500"
                                        : "bg-emerald-500/10 text-emerald-500"
                                  }`}
                                >
                                  {entryModeLabel(entry)}
                                </span>
                                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                                  P{entry.priority}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {keywords.length === 0 ? (
                                  <span className="text-muted-foreground inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[10px]">
                                    <KeyRound className="mr-1 h-3 w-3" />
                                    No keywords
                                  </span>
                                ) : (
                                  <>
                                    {keywords.slice(0, 8).map((keyword, keywordIndex) => (
                                      <span
                                        key={`${keyword}-${keywordIndex}`}
                                        className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px]"
                                      >
                                        {keyword}
                                      </span>
                                    ))}
                                    {keywords.length > 8 && (
                                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px]">
                                        +{keywords.length - 8}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="text-muted-foreground flex flex-wrap gap-1.5 text-[10px]">
                                <span className="rounded-full border px-2 py-0.5">scan {entry.scanDepth ?? 8}</span>
                                <span className="rounded-full border px-2 py-0.5">
                                  {entry.position ?? "beforeHistory"}
                                </span>
                                <span className="rounded-full border px-2 py-0.5">{entry.role ?? "system"}</span>
                                {(entry.secondaryKeys ?? "").trim() && (
                                  <span className="rounded-full border px-2 py-0.5">
                                    secondary {entry.selectiveLogic ?? "or"}
                                  </span>
                                )}
                                {entry.matchWholeWords && (
                                  <span className="rounded-full border px-2 py-0.5">whole word</span>
                                )}
                                {entry.caseSensitive && <span className="rounded-full border px-2 py-0.5">case</span>}
                                {entry.useProbability && (
                                  <span className="rounded-full border px-2 py-0.5">{entry.probability ?? 100}%</span>
                                )}
                              </div>

                              <div
                                className={`bg-background/60 text-muted-foreground relative rounded-md border px-3 py-2 text-xs leading-6 ${
                                  isLong ? (isExpanded ? "max-h-80 overflow-y-auto" : "max-h-36 overflow-hidden") : ""
                                }`}
                              >
                                <div className="wrap-break-word whitespace-pre-wrap">
                                  {entry.content || "No content"}
                                </div>
                                {isLong && !isExpanded && (
                                  <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent" />
                                )}
                              </div>

                              {isLong && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleEntryExpanded(entry.id);
                                  }}
                                  className="text-primary text-xs font-medium hover:underline"
                                >
                                  {isExpanded ? "Collapse content" : "Expand content"}
                                </button>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive h-8 w-8"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteEntry(entry.id);
                                }}
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </ScrollArea>
              </section>

              <aside className="bg-card/25 flex min-h-0 flex-col overflow-hidden border-l">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {editingEntryId ? t("entryForm.editEntry") : t("entryForm.newEntry")}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {selectedEntry
                        ? t("entryForm.editHint", { title: selectedEntry.title })
                        : t("entryForm.createHint")}
                    </p>
                  </div>
                  {editingEntryId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={resetEntryForm}
                      title={t("entryForm.cancelEdit")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <ScrollArea type="always" className="min-h-0 flex-1">
                  <div className="space-y-4 p-4 pr-6">
                    <label className="block space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t("entryForm.title")}</span>
                      <Input
                        value={entryTitle}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryTitle(event.target.value)}
                        placeholder={t("entryForm.titlePlaceholder")}
                      />
                    </label>

                    <div className="space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t("entryForm.injectionType")}</span>
                      <div className="bg-background grid grid-cols-2 rounded-md border p-1">
                        <button
                          type="button"
                          onClick={() => setEntryType("always")}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                            entryType === "always"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {t("entryForm.always")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryType("trigger")}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                            entryType === "trigger"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {t("entryForm.trigger")}
                        </button>
                      </div>
                    </div>

                    {entryType === "trigger" && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">{t("entryForm.triggerMode")}</span>
                        <div className="bg-background grid grid-cols-2 rounded-md border p-1">
                          <button
                            type="button"
                            onClick={() => setEntryTriggerMode("and")}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                              entryTriggerMode === "and"
                                ? "bg-blue-500 text-white"
                                : "text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            {t("entryForm.andAll")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEntryTriggerMode("or")}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                              entryTriggerMode === "or"
                                ? "bg-emerald-500 text-white"
                                : "text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            {t("entryForm.orAny")}
                          </button>
                        </div>
                      </div>
                    )}

                    <label className="block space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t("entryForm.keywords")}</span>
                      <Input
                        value={entryKeys}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryKeys(event.target.value)}
                        placeholder={t("entryForm.keywordsPlaceholder")}
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t("entryForm.secondaryKeys")}</span>
                      <Input
                        value={entrySecondaryKeys}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setEntrySecondaryKeys(event.target.value)}
                        placeholder="Optional Tavern selective keys"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">Scan depth</span>
                        <Input
                          value={entryScanDepth}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryScanDepth(event.target.value)}
                          type="number"
                          min="0"
                          placeholder="8"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">Probability</span>
                        <Input
                          value={entryProbability}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryProbability(event.target.value)}
                          type="number"
                          min="0"
                          max="100"
                          disabled={!entryUseProbability}
                          placeholder={t("entryForm.priorityPlaceholder")}
                        />
                      </label>
                    </div>

                    <div className="bg-background/50 grid grid-cols-2 gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">Case sensitive</span>
                        <SwitchButton
                          checked={entryCaseSensitive}
                          onClick={() => setEntryCaseSensitive(!entryCaseSensitive)}
                          label="Toggle case sensitive"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">Whole words</span>
                        <SwitchButton
                          checked={entryMatchWholeWords}
                          onClick={() => setEntryMatchWholeWords(!entryMatchWholeWords)}
                          label="Toggle whole word matching"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">Use probability</span>
                        <SwitchButton
                          checked={entryUseProbability}
                          onClick={() => setEntryUseProbability(!entryUseProbability)}
                          label="Toggle probability"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-xs">Secondary logic</span>
                        <div className="bg-background grid grid-cols-2 rounded-md border p-1">
                          {(["or", "and"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setEntrySelectiveLogic(mode)}
                              className={cn(
                                "rounded px-2 py-1 text-xs font-medium",
                                entrySelectiveLogic === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {mode.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">Position</span>
                        <select
                          value={entryPosition}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setEntryPosition(event.target.value as typeof entryPosition)
                          }
                          className="border-input bg-background h-9 w-full rounded-md border px-2 text-xs"
                        >
                          <option value="beforeHistory">Before history</option>
                          <option value="afterHistory">After history</option>
                          <option value="atDepth">At depth</option>
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">Depth</span>
                        <Input
                          value={entryDepth}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryDepth(event.target.value)}
                          type="number"
                          min="0"
                          disabled={entryPosition !== "atDepth"}
                          placeholder="0"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">Role</span>
                        <select
                          value={entryRole}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setEntryRole(event.target.value as typeof entryRole)
                          }
                          className="border-input bg-background h-9 w-full rounded-md border px-2 text-xs"
                        >
                          <option value="system">System</option>
                          <option value="user">User</option>
                          <option value="assistant">Assistant</option>
                        </select>
                      </label>
                    </div>

                    <label className="block space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t("entryForm.content")}</span>
                      <Textarea
                        value={entryContent}
                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEntryContent(event.target.value)}
                        placeholder={t("entryForm.contentPlaceholder")}
                        className="min-h-[260px] resize-none text-sm leading-6"
                      />
                    </label>

                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-muted-foreground text-xs font-medium">{t("entryForm.priority")}</span>
                        <Input
                          value={entryPriority}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setEntryPriority(event.target.value)}
                          type="number"
                          placeholder={t("entryForm.priorityPlaceholder")}
                        />
                      </label>
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground block text-xs font-medium">
                          {t("entryForm.enabled")}
                        </span>
                        <div className="flex h-9 items-center">
                          <SwitchButton
                            checked={entryEnabled}
                            onClick={() => setEntryEnabled(!entryEnabled)}
                            label="Toggle entry enabled"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="flex shrink-0 items-center justify-between gap-2 border-t p-4">
                  <Button onClick={handleSaveEntry} className="flex-1">
                    {editingEntryId ? t("entryForm.updateEntry") : t("entryForm.addEntry")}
                  </Button>
                  {editingEntryId && (
                    <Button variant="outline" onClick={resetEntryForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete World Book</DialogTitle>
            <DialogDescription>Delete "{deleteTarget?.name}" and all entries? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
