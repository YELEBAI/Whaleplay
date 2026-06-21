import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ScrollArea, Button } from "@neo-tavern/ui";
import { Plus } from "lucide-react";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { useChatStore } from "@/features/chat/chat.store";
import { agenticPlayStateRepository, settingsRepository, worldbookRepository } from "@/db/repositories";
import { toast } from "@/utils/toast";
import type { CreateCharacterInput, Character } from "@neo-tavern/shared";
import { getErrorMessage } from "./utils";
import type { CharacterMenu } from "./types";
import { Title } from "./CharacterTitle";
import { SearchBar } from "./CharacterSearchBar";
import { InfoPanel } from "./CharacterInfoPanel";
import { CharacterContextMenu } from "./CharacterContextMenu";
import { GridOrList } from "./CharacterGridOrList";
import { CreateDialog, CreateModeDialog, CharFormDialog, DeleteDialog } from "./dialogs";
import { useCharacterImport } from "./hooks/useCharacterImport";
import { useCharacterSearch } from "./hooks/useCharacterSearch";
import { useCharacterSidebar } from "./hooks/useCharacterSidebar";

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
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const { characters, loading, error, loadCharacters, createCharacter, updateCharacter, deleteCharacter, clearError } =
    useCharacterStore();
  const { chats, createOrGetChat } = useChatStore();

  // ── Form / edit state ──
  const [form, setForm] = useState<CreateCharacterInput>(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Dialog / menu state ──
  const [characterMenu, setCharacterMenu] = useState<CharacterMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [modeTarget, setModeTarget] = useState<Character | null>(null);
  const [creatingMode, setCreatingMode] = useState<"normal" | "agentic" | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Hooks ──
  const {
    searchQuery,
    setSearchQuery,
    searchExpanded,
    viewMode,
    prefsLoaded,
    searchMatches,
    hasSearchResults,
    handleViewModeChange,
    handleSearchToggle,
  } = useCharacterSearch(characters);
  const { sidebarChar, openSidebar, closeSidebar } = useCharacterSidebar(characters, prefsLoaded);
  const { importing, handleImportFile } = useCharacterImport(fileInputRef);

  // Load characters on mount
  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  // Close context menu on outside click / ESC / scroll
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

  // ── Context menu handlers ──
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
    setCharacterMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 6, character });
  };

  // ── Form handlers ──
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

  const handleCancel = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
  };

  // ── Delete handler ──
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

  // ── Character interaction ──
  const handleCharacterClick = (char: Character) => {
    setCharacterMenu(null);
    openSidebar(char);
    setSelectedId(char.id);
    setEditingId(null);
    setCreating(false);
  };

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

  const updateField = (field: keyof CreateCharacterInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasContent = (text: string | undefined): boolean => !!text && text.trim().length > 0;

  // ── Render ──
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

              {/* Search results */}
              {searchMatches !== null && !hasSearchResults && (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("search.noResults")}</p>
              )}
              {searchMatches !== null && hasSearchResults && (
                <div className="space-y-6">
                  {searchMatches.nameMatches.length > 0 && (
                    <SearchResultSection title={t("search.nameMatch")} count={searchMatches.nameMatches.length}>
                      <GridOrList
                        chars={searchMatches.nameMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                      />
                    </SearchResultSection>
                  )}
                  {searchMatches.descMatches.length > 0 && (
                    <SearchResultSection title={t("search.descMatch")} count={searchMatches.descMatches.length}>
                      <GridOrList
                        chars={searchMatches.descMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                      />
                    </SearchResultSection>
                  )}
                  {searchMatches.personalityMatches.length > 0 && (
                    <SearchResultSection
                      title={t("search.personalityMatch")}
                      count={searchMatches.personalityMatches.length}
                    >
                      <GridOrList
                        chars={searchMatches.personalityMatches}
                        viewMode={viewMode}
                        selectedId={selectedId}
                        onCharacterClick={handleCharacterClick}
                        onCharacterDoubleClick={handleCharacterDoubleClick}
                        onContextMenu={openCharacterMenu}
                        onMenuButton={openCharacterMenuFromButton}
                      />
                    </SearchResultSection>
                  )}
                </div>
              )}

              {/* Normal view */}
              {searchMatches === null && characters.length > 0 && (
                <GridOrList
                  chars={characters}
                  viewMode={viewMode}
                  selectedId={selectedId}
                  onCharacterClick={handleCharacterClick}
                  onCharacterDoubleClick={handleCharacterDoubleClick}
                  onContextMenu={openCharacterMenu}
                  onMenuButton={openCharacterMenuFromButton}
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
            />
          )}
        </aside>
      </div>

      {/* Context menu */}
      {characterMenu && (
        <CharacterContextMenu
          menu={characterMenu}
          onChat={handleCharacterDoubleClick}
          onDetails={(char) => {
            setCharacterMenu(null);
            openSidebar(char);
          }}
          onEdit={(char) => {
            setCharacterMenu(null);
            handleStartEdit(char);
          }}
          onDelete={(char) => {
            setCharacterMenu(null);
            setDeleteTarget(char);
          }}
          onClose={() => setCharacterMenu(null)}
        />
      )}

      {/* Dialogs */}
      <CharFormDialog
        open={editingId !== null || creating}
        form={form}
        editingId={editingId}
        loading={loading}
        onUpdateField={updateField}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={handleDelete} />
      <CreateModeDialog
        target={modeTarget}
        creatingMode={creatingMode}
        onSelectMode={handleCreateChatWithMode}
        onCancel={() => setModeTarget(null)}
      />
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
      />
    </div>
  );
}

/** Section heading for search result groups. */
function SearchResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
        {title} ({count})
      </h3>
      {children}
    </div>
  );
}
