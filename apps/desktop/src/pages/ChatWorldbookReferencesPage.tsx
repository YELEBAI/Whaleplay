import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, CheckCircle2, FileText, Save, Search, Settings2, X } from "lucide-react";
import { Button, Input, ScrollArea, cn } from "@neo-tavern/ui";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import type { WorldbookEntry } from "@neo-tavern/shared";
import { toast } from "@/utils/toast";

function keywordsFrom(keys: string) {
  return keys
    .split(/[,，、\n]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function entrySearchText(entry: WorldbookEntry) {
  return [entry.title, entry.keys, entry.secondaryKeys, entry.content, entry.type, entry.triggerMode]
    .filter(Boolean)
    .join("\n");
}

function matchesEntrySearch(entry: WorldbookEntry, query: string) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const target = normalizeSearchText(entrySearchText(entry));
  return terms.every((term) => target.includes(term));
}

export function ChatWorldbookReferencesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("chat-worldbook");

  const chats = useChatStore((state) => state.chats);
  const currentChat = useChatStore((state) => state.currentChat);
  const chatLoading = useChatStore((state) => state.loading);
  const loadChats = useChatStore((state) => state.loadChats);
  const updateChatWorldbookReferences = useChatStore((state) => state.updateChatWorldbookReferences);

  const characters = useCharacterStore((state) => state.characters);
  const loadCharacters = useCharacterStore((state) => state.loadCharacters);

  const worldbooks = useWorldbookStore((state) => state.worldbooks);
  const activeWorldbookId = useWorldbookStore((state) => state.activeWorldbookId);
  const worldbookLoading = useWorldbookStore((state) => state.loading);
  const loadWorldbooks = useWorldbookStore((state) => state.loadWorldbooks);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadChats();
    loadCharacters();
    loadWorldbooks();
  }, [loadCharacters, loadChats, loadWorldbooks]);

  const chat = useMemo(() => {
    if (!id) return null;
    return chats.find((candidate) => candidate.id === id) ?? (currentChat?.id === id ? currentChat : null);
  }, [chats, currentChat, id]);

  const character = chat ? characters.find((candidate) => candidate.id === chat.characterId) : undefined;
  const sourceWorldbookId = character?.worldbookId || activeWorldbookId || null;
  const sourceWorldbook = sourceWorldbookId
    ? (worldbooks.find((worldbook) => worldbook.id === sourceWorldbookId) ?? null)
    : null;
  const entries = useMemo(
    () => (sourceWorldbook ? [...sourceWorldbook.entries].sort((a, b) => b.priority - a.priority) : []),
    [sourceWorldbook],
  );
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesEntrySearch(entry, search)),
    [entries, search],
  );
  const savedReferenceKey = (chat?.worldbookReferenceEntryIds ?? []).join("\u0000");
  const selectedCount = entries.filter((entry) => selectedIds.has(entry.id)).length;

  useEffect(() => {
    if (!chat) return;
    setSelectedIds(new Set(chat.worldbookReferenceEntryIds ?? []));
    setDirty(false);
  }, [chat, savedReferenceKey]);

  const toggleEntry = (entryId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
    setDirty(true);
  };

  const selectFilteredEntries = () => {
    if (filteredEntries.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const entry of filteredEntries) next.add(entry.id);
      return next;
    });
    setDirty(true);
  };

  const clearFilteredEntries = () => {
    if (filteredEntries.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const entry of filteredEntries) next.delete(entry.id);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!chat) return;
    setSaving(true);
    try {
      const orderedIds = entries.filter((entry) => selectedIds.has(entry.id)).map((entry) => entry.id);
      await updateChatWorldbookReferences(chat.id, orderedIds);
      setSelectedIds(new Set(orderedIds));
      setDirty(false);
      toast("success", t("saved"));
    } catch (err) {
      toast("error", (err as Error).message || t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const isLoading = chatLoading || worldbookLoading;

  if (!chat && !isLoading) {
    return (
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("back")}
          </Button>
        </header>
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">{t("chatNotFound")}</div>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <BookOpen className="text-primary h-5 w-5 shrink-0" />
              <h1 className="min-w-0 truncate text-2xl font-bold">{t("title")}</h1>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {chat ? t("subtitle", { title: chat.title }) : t("loading")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/worldbook")}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              {t("manageWorldbook")}
            </Button>
            <Button onClick={handleSave} disabled={!chat || !dirty || saving}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        <aside className="bg-card/30 min-h-0 border-r p-5">
          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t("chat")}</p>
              <p className="mt-1 truncate text-sm font-semibold">{chat?.title ?? t("loading")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t("character")}</p>
              <p className="mt-1 truncate text-sm font-semibold">{character?.name ?? t("unknownCharacter")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t("worldbook")}</p>
              <p className="mt-1 text-sm font-semibold wrap-break-word">{sourceWorldbook?.name ?? t("noWorldbook")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border px-3 py-2">
                <div className="text-lg leading-none font-semibold">{entries.length}</div>
                <div className="text-muted-foreground mt-1 text-[10px] font-medium tracking-wide uppercase">
                  {t("entries")}
                </div>
              </div>
              <div className="rounded-md border px-3 py-2">
                <div className="text-lg leading-none font-semibold">{selectedCount}</div>
                <div className="text-muted-foreground mt-1 text-[10px] font-medium tracking-wide uppercase">
                  {t("selected")}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pr-9 pl-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm transition-colors"
                  title={t("clearSearch")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectFilteredEntries}
                disabled={filteredEntries.length === 0}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t("selectVisible")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilteredEntries}
                disabled={filteredEntries.length === 0}
              >
                <X className="mr-1.5 h-4 w-4" />
                {t("clearVisible")}
              </Button>
            </div>
          </div>

          <ScrollArea type="always" className="min-h-0 flex-1">
            <div className="space-y-3 p-5 pr-8">
              {isLoading && (
                <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                  {t("loading")}
                </div>
              )}
              {!isLoading && !sourceWorldbook && (
                <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                  <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-35" />
                  {t("noWorldbookState")}
                </div>
              )}
              {!isLoading && sourceWorldbook && entries.length === 0 && (
                <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-35" />
                  {t("noEntriesState")}
                </div>
              )}
              {!isLoading && entries.length > 0 && filteredEntries.length === 0 && (
                <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                  <Search className="mx-auto mb-2 h-8 w-8 opacity-35" />
                  {t("noMatches")}
                </div>
              )}
              {filteredEntries.map((entry) => {
                const checked = selectedIds.has(entry.id);
                const keywords = keywordsFrom(entry.keys);
                return (
                  <label
                    key={entry.id}
                    className={cn(
                      "bg-card/40 hover:bg-accent/25 block cursor-pointer rounded-lg border p-4 transition-colors",
                      checked && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEntry(entry.id)}
                        className="accent-primary mt-1 h-4 w-4 shrink-0"
                        aria-label={entry.title}
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold">
                            {entry.title || t("untitledEntry")}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              entry.type === "always"
                                ? "bg-sky-500/10 text-sky-500"
                                : entry.triggerMode === "and"
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-emerald-500/10 text-emerald-500",
                            )}
                          >
                            {entry.type === "always"
                              ? t("mode.always")
                              : entry.triggerMode === "and"
                                ? t("mode.triggerAnd")
                                : t("mode.triggerOr")}
                          </span>
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                            P{entry.priority}
                          </span>
                          {!entry.enabled && (
                            <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[10px] font-medium">
                              {t("disabled")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.length === 0 ? (
                            <span className="text-muted-foreground inline-flex rounded-full border border-dashed px-2 py-0.5 text-[10px]">
                              {t("noKeywords")}
                            </span>
                          ) : (
                            <>
                              {keywords.slice(0, 10).map((keyword, index) => (
                                <span
                                  key={`${entry.id}-${keyword}-${index}`}
                                  className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px]"
                                >
                                  {keyword}
                                </span>
                              ))}
                              {keywords.length > 10 && (
                                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px]">
                                  +{keywords.length - 10}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-muted-foreground line-clamp-3 text-xs leading-5 wrap-break-word whitespace-pre-wrap">
                          {entry.content || t("emptyContent")}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
