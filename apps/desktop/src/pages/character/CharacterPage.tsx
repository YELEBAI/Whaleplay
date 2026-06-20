import { useEffect, useState, useRef, useMemo, useCallback, startTransition } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ScrollArea, Button } from "@neo-tavern/ui";
import { Plus } from "lucide-react";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import type { CreateCharacterInput, Character } from "@neo-tavern/shared";
import { agenticPlayStateRepository, settingsRepository, worldbookRepository } from "@/db/repositories";
import { useChatStore } from "@/features/chat/chat.store";
import { parseJsonCharacterCard, parsePngCharacterCard, type ParsedCharacterCard } from "@/utils/parse-character-card";
import { toast } from "@/utils/toast";
import { prefs } from "@/db/kv";
import { prefKeys } from "@/db/storage/keys";
import type { ViewMode, CharacterMenu, SearchMatches } from "./types";
import {
  readCachedSidebarCharId,
  writeCachedSidebarCharId,
  clearCachedSidebarCharId,
  pngAvatarDataUrl,
  getErrorMessage,
  buildImportedRegexPreset,
  buildImportedWorldbook,
  rollbackImportedResources,
} from "./utils";
import { Title } from "./CharacterTitle";
import { SearchBar } from "./CharacterSearchBar";
import { InfoPanel } from "./CharacterInfoPanel";
import { CharacterContextMenu } from "./CharacterContextMenu";
import { GridOrList } from "./CharacterGridOrList";
import { CreateDialog, CreateModeDialog, CharFormDialog, DeleteDialog } from "./dialogs";

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  firstMessage: "",
  exampleDialogues: "",
};

export function CharacterPage() {
  const { t } = useTranslation("character");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const { characters, loading, error, loadCharacters, createCharacter, updateCharacter, deleteCharacter, clearError } =
    useCharacterStore();
  const [form, setForm] = useState<CreateCharacterInput>(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [characterMenu, setCharacterMenu] = useState<CharacterMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [importing, setImporting] = useState(false);
  const [modeTarget, setModeTarget] = useState<Character | null>(null);
  const [creatingMode, setCreatingMode] = useState<"normal" | "agentic" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New state for refactored UI
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [sidebarChar, setSidebarChar] = useState<Character | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const { chats, createOrGetChat } = useChatStore();

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const mode = await prefs.getJson<ViewMode>(prefKeys.characterViewMode);
      const expanded = await prefs.getJson<boolean>(prefKeys.characterSearchExpanded);
      setViewMode(mode.status === "valid" ? (mode.value === "list" ? "list" : "grid") : "grid");
      setSearchExpanded(expanded.status === "valid" ? expanded.value : false);
      setPrefsLoaded(true);
    })();
  }, []);

  // Auto-expand search when characters > 20 (only on initial load)
  useEffect(() => {
    if (prefsLoaded && !searchExpanded && characters.length > 20) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchExpanded(true);
      void prefs.setJson(prefKeys.characterSearchExpanded, true);
    }
  }, [prefsLoaded, characters.length, searchExpanded]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (!characterMenu) return;

    const close = () => setCharacterMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [characterMenu]);

  // Persist view mode preference
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    void prefs.setJson(prefKeys.characterViewMode, mode);
  }, []);

  // Persist search expanded preference
  const handleSearchToggle = useCallback(() => {
    setSearchExpanded((prev) => {
      const next = !prev;
      void prefs.setJson(prefKeys.characterSearchExpanded, next);
      if (!next) setSearchQuery("");
      return next;
    });
  }, []);

  // Search filtering - simplified to single loop with priority matching
  const searchMatches = useMemo<SearchMatches | null>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;

    const nameMatches: Character[] = [];
    const descMatches: Character[] = [];
    const personalityMatches: Character[] = [];

    // Single loop with priority matching
    for (const char of characters) {
      if (char.name.toLowerCase().includes(query)) {
        nameMatches.push(char);
      } else if (char.description?.toLowerCase().includes(query)) {
        descMatches.push(char);
      } else if (char.personality?.toLowerCase().includes(query)) {
        personalityMatches.push(char);
      }
    }

    return { nameMatches, descMatches, personalityMatches };
  }, [characters, searchQuery]);

  const hasSearchResults =
    searchMatches !== null &&
    (searchMatches.nameMatches.length > 0 ||
      searchMatches.descMatches.length > 0 ||
      searchMatches.personalityMatches.length > 0);

  const closeSidebar = () => {
    setSidebarChar(null);
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
    clearCachedSidebarCharId();
  };

  const openSidebar = (char: Character) => {
    setCharacterMenu(null);
    setSelectedId(char.id);
    setEditingId(null);
    setCreating(false);
    setSidebarChar(char);
    writeCachedSidebarCharId(char.id);
  };

  // Restore sidebar from session on mount
  useEffect(() => {
    if (!prefsLoaded) return;
    const cachedCharId = readCachedSidebarCharId();
    if (cachedCharId) {
      const char = characters.find((c) => c.id === cachedCharId);
      if (char) {
        startTransition(() => {
          setSelectedId(char.id);
          setSidebarChar(char);
          setEditingId(null);
          setCreating(false);
        });
      }
    }
  }, [prefsLoaded, characters]);

  const openCharacterMenu = (event: React.MouseEvent, character: Character) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(character.id);
    setCharacterMenu({ x: event.clientX, y: event.clientY, character });
  };

  const openCharacterMenuFromButton = (event: React.MouseEvent<HTMLButtonElement>, character: Character) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedId(character.id);
    setCharacterMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
      character,
    });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const rollback = async (resources: { regexPresetId?: string; worldbookId?: string }) => {
      await rollbackImportedResources(resources);
    };

    const isPng = file.type === "image/png";
    let avatar: string | undefined;
    let card: ParsedCharacterCard | null;

    try {
      const buf = await file.arrayBuffer();
      if (isPng) {
        card = await parsePngCharacterCard(buf);
        if (card) avatar = await pngAvatarDataUrl(buf);
      } else {
        const text = new TextDecoder().decode(buf);
        card = parseJsonCharacterCard(text);
      }
    } catch (err) {
      toast("error", `解析角色卡失败：${getErrorMessage(err)}`);
      setImporting(false);
      event.target.value = "";
      return;
    }

    if (!card) {
      toast("error", "未能从文件中解析出角色数据");
      event.target.value = "";
      return;
    }

    const charName = card.name || file.name.replace(/\.(json|png)$/i, "");
    const now = new Date().toISOString();
    const regexPreset = buildImportedRegexPreset(card, charName, now);
    const worldbook = buildImportedWorldbook(card, charName, now);

    const existingPresets = useSettingsStore.getState().regexPresets;
    const regexPresetId = regexPreset ? regexPreset.id : undefined;

    const existingWorldbooks = useWorldbookStore.getState().worldbooks;
    const worldbookId = worldbook ? worldbook.id : undefined;

    try {
      if (regexPreset) {
        await settingsRepository.saveRegexRules([...existingPresets, regexPreset]);
        await useSettingsStore.getState().loadRegexRules();
      }
      if (worldbook) {
        await worldbookRepository.save([...existingWorldbooks, worldbook]);
        await useWorldbookStore.getState().loadWorldbooks();
      }

      const characterInput: CreateCharacterInput = {
        name: charName,
        description: card.description || "",
        personality: card.personality || "",
        scenario: card.scenario || "",
        firstMessage: card.firstMessage || "",
        exampleDialogues: card.exampleDialogues || "",
      };

      await createCharacter({
        ...characterInput,
        avatar,
        regexPresetId,
        worldbookId,
      });

      const importedParts: string[] = ["Character"];
      if (avatar) importedParts.push("avatar");
      if (regexPreset) importedParts.push(regexPreset.rules.length + " regex rules");
      if (worldbook) importedParts.push(worldbook.entries.length + " worldbook entries");

      toast("success", `Imported: ${importedParts.join(", ")}`);
    } catch (err) {
      await rollback({ regexPresetId, worldbookId });
      toast("error", `Import failed: ${getErrorMessage(err)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;

    try {
      if (editingId) {
        await updateCharacter(editingId, form);
        toast("success", `已更新角色：${form.name}`);
      } else {
        const created = await createCharacter(form);
        toast("success", `已创建角色：${created.name}`);
      }
      handleCancel();
    } catch (err) {
      toast("error", getErrorMessage(err));
    }
  };

  const handleStartEdit = (char?: Character) => {
    if (char) {
      setForm({
        name: char.name,
        description: char.description,
        personality: char.personality,
        scenario: char.scenario,
        firstMessage: char.firstMessage,
        exampleDialogues: char.exampleDialogues ?? "",
      });
      setEditingId(char.id);
      setSelectedId(char.id);
      setCreating(false);
    } else {
      setForm(emptyForm);
      setEditingId(null);
      setSelectedId(null);
      setCreating(true);
    }
  };

  // Single click: open sidebar with character details
  const handleCharacterClick = (char: Character) => {
    openSidebar(char);
  };

  // Double click: start chat
  const handleCharacterDoubleClick = (char: Character) => {
    const existingChat = chats.find((c) => c.characterId === char.id);
    if (existingChat) {
      navigate(`/chat/${existingChat.id}`);
    } else {
      setModeTarget(char);
    }
  };

  const handleCreateChatWithMode = async (mode: "normal" | "agentic") => {
    if (!modeTarget) return;
    setCreatingMode(mode);
    try {
      const chat = await createOrGetChat({ characterId: modeTarget.id, title: modeTarget.name });
      await agenticPlayStateRepository.setEnabled(chat.id, modeTarget, mode === "agentic");
      setModeTarget(null);
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      toast("error", (err as Error).message || tt("createChatFailed"));
    } finally {
      setCreatingMode(null);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteCharacter(target.id);

      let cleanupError: string | null = null;
      if (target.regexPresetId) {
        const presets = useSettingsStore.getState().regexPresets.filter((p) => p.id !== target.regexPresetId);
        try {
          await settingsRepository.saveRegexRules(presets);
          await useSettingsStore.getState().loadRegexRules();
        } catch (err) {
          cleanupError = getErrorMessage(err);
        }
      }
      if (target.worldbookId) {
        const wbs = useWorldbookStore.getState().worldbooks.filter((w) => w.id !== target.worldbookId);
        try {
          await worldbookRepository.save(wbs);
          await useWorldbookStore.getState().loadWorldbooks();
        } catch (err) {
          cleanupError = getErrorMessage(err);
        }
      }
      setDeleteTarget(null);
      if (selectedId === target.id) setSelectedId(null);
      if (sidebarChar?.id === target.id) closeSidebar();
      if (editingId === target.id) {
        setEditingId(null);
        setCreating(false);
        setForm(emptyForm);
      }
      toast(
        "info",
        cleanupError
          ? `${tt("characterDeleted", { name: target.name })}，但关联资源清理失败：${cleanupError}`
          : tt("characterDeleted", { name: target.name }),
      );
    } catch (err) {
      toast("error", `删除角色失败：${getErrorMessage(err)}`);
    }
  };

  const updateField = (field: keyof CreateCharacterInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasContent = (text: string | undefined): boolean => !!text && text.trim().length > 0;

  // Keep sidebarChar in sync with character store updates
  useEffect(() => {
    if (sidebarChar) {
      const updated = characters.find((c) => c.id === sidebarChar.id);
      if (updated && updated !== sidebarChar) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSidebarChar(updated);
      }
    }
  }, [characters, sidebarChar]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <Title
        onBack={() => navigate("/")}
        onNewCharacter={() => setCreateDialogOpen(true)}
        onImport={() => fileInputRef.current?.click()}
        onFileChange={handleImportFile}
        importing={importing}
        fileInputRef={fileInputRef}
        t={t}
        tc={tc}
      />

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Left: content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Search bar + view toggle */}
          <SearchBar
            searchExpanded={searchExpanded}
            searchQuery={searchQuery}
            viewMode={viewMode}
            onSearchToggle={handleSearchToggle}
            onSearchChange={setSearchQuery}
            onViewModeChange={handleViewModeChange}
            t={t}
          />

          {/* Character grid/list (scrollable) */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {error && (
                <div className="bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-lg p-3 text-sm">
                  <span>{error}</span>
                  <Button variant="ghost" size="sm" onClick={clearError}>
                    {t("dismiss")}
                  </Button>
                </div>
              )}

              {loading && characters.length === 0 && (
                <p className="text-muted-foreground p-2 text-sm">{t("loading")}</p>
              )}

              {!loading && characters.length === 0 && (
                <div className="text-muted-foreground text-sm">
                  <p className="mb-3">{t("noCharacters")}</p>
                  <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t("newCharacter")}
                  </Button>
                </div>
              )}

              {/* Search results: three sections */}
              {searchMatches !== null && !hasSearchResults && (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("search.noResults")}</p>
              )}

              {searchMatches !== null && hasSearchResults && (
                <div className="space-y-6">
                  {searchMatches.nameMatches.length > 0 && (
                    <div>
                      <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                        {t("search.nameMatch")} ({searchMatches.nameMatches.length})
                      </h3>
                      <GridOrList
                        chars={searchMatches.nameMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                        t={t}
                      />
                    </div>
                  )}
                  {searchMatches.descMatches.length > 0 && (
                    <div>
                      <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                        {t("search.descMatch")} ({searchMatches.descMatches.length})
                      </h3>
                      <GridOrList
                        chars={searchMatches.descMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                        t={t}
                      />
                    </div>
                  )}
                  {searchMatches.personalityMatches.length > 0 && (
                    <div>
                      <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                        {t("search.personalityMatch")} ({searchMatches.personalityMatches.length})
                      </h3>
                      <GridOrList
                        chars={searchMatches.personalityMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                        t={t}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Normal view (no search) */}
              {searchMatches === null && characters.length > 0 && (
                <GridOrList
                  chars={characters}
                  viewMode={viewMode}
                  selectedId={selectedId}
                  onCharacterClick={handleCharacterClick}
                  onCharacterDoubleClick={handleCharacterDoubleClick}
                  onContextMenu={openCharacterMenu}
                  onMenuButton={openCharacterMenuFromButton}
                  t={t}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: detail sidebar */}
        <aside
          className={`shrink-0 border-l transition-[width] duration-200 ${sidebarChar ? "w-1/4" : "w-0"} overflow-hidden`}
        >
          {sidebarChar && (
            <InfoPanel
              character={sidebarChar}
              onClose={closeSidebar}
              onChat={handleCharacterDoubleClick}
              onEdit={handleStartEdit}
              onDelete={setDeleteTarget}
              hasContent={hasContent}
              t={t}
              tc={tc}
            />
          )}
        </aside>
      </div>

      {/* Context menu */}
      {characterMenu && (
        <CharacterContextMenu
          menu={characterMenu}
          onChat={handleCharacterDoubleClick}
          onDetails={openSidebar}
          onEdit={handleStartEdit}
          onDelete={setDeleteTarget}
          onClose={() => setCharacterMenu(null)}
          t={t}
          tc={tc}
        />
      )}

      {/* Edit form dialog */}
      <CharFormDialog
        open={editingId !== null || creating}
        form={form}
        editingId={editingId}
        loading={loading}
        onUpdateField={updateField}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        t={t}
        tc={tc}
      />

      {/* Delete confirmation dialog */}
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={handleDelete} t={t} tc={tc} />

      {/* Chat mode selection dialog */}
      <CreateModeDialog
        target={modeTarget}
        creatingMode={creatingMode}
        onSelectMode={handleCreateChatWithMode}
        onCancel={() => setModeTarget(null)}
        t={t}
        tc={tc}
      />

      {/* Create character mode dialog */}
      <CreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onTraditional={() => {
          setCreateDialogOpen(false);
          handleStartEdit();
        }}
        onBuilder={() => {
          setCreateDialogOpen(false);
          navigate("/character-builder");
        }}
        t={t}
        tc={tc}
      />
    </div>
  );
}
