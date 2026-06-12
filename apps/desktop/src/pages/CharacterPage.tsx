import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Plus, Trash2, Edit, ArrowLeft, Upload, MoreHorizontal, Sparkles } from "lucide-react";
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
  DialogDescription,
} from "@neo-tavern/ui";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { generateId } from "@neo-tavern/shared";
import type { CreateCharacterInput, Character, RegexPreset, RegexRule, Worldbook } from "@neo-tavern/shared";
import { settingsRepository, worldbookRepository } from "@/db/repositories";
import { parseJsonCharacterCard, parsePngCharacterCard, type ParsedCharacterCard } from "@/utils/parse-character-card";
import { CharacterAvatarTile } from "@/components";
import { toast } from "@/utils/toast";

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  firstMessage: "",
  exampleDialogues: "",
};

type CharacterMenu = {
  x: number;
  y: number;
  character: Character;
};

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }

  return btoa(binary);
}

function pngAvatarDataUrl(buffer: ArrayBuffer) {
  return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
}

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
  const [detailOpen, setDetailOpen] = useState(false);
  const [characterMenu, setCharacterMenu] = useState<CharacterMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedId && !editingId && !creating && characters.length > 0) {
      setSelectedId(characters[0].id);
      hasAutoSelectedRef.current = true;
    }
  }, [characters, selectedId, editingId, creating]);

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

  const selected = characters.find((c) => c.id === selectedId) ?? null;

  const closeDetail = () => {
    setDetailOpen(false);
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
  };

  const openDetails = (char: Character) => {
    setCharacterMenu(null);
    setSelectedId(char.id);
    setEditingId(null);
    setCreating(false);
    setDetailOpen(true);
  };

  const openCharacterMenu = (event: React.MouseEvent, char: Character) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(char.id);
    setCharacterMenu({ x: event.clientX, y: event.clientY, character: char });
  };

  const openCharacterMenuFromButton = (event: React.MouseEvent<HTMLButtonElement>, char: Character) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedId(char.id);
    setCharacterMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
      character: char,
    });
  };

  const openBuilderPage = (charId?: string | null) => {
    navigate(charId ? `/character-builder?characterId=${encodeURIComponent(charId)}` : "/character-builder");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const isPng = file.name.toLowerCase().endsWith(".png");
      let card: ParsedCharacterCard | null;
      let avatar: string | undefined;

      if (isPng) {
        const buf = await file.arrayBuffer();
        card = parsePngCharacterCard(buf);
        if (card) avatar = pngAvatarDataUrl(buf);
      } else {
        const text = await file.text();
        card = parseJsonCharacterCard(text);
      }

      if (!card) {
        toast("error", tt("importParseFailed"));
        return;
      }

      const charName = card.name || file.name.replace(/\.(json|png)$/i, "");
      const now = new Date().toISOString();

      const char = await createCharacter({
        name: charName,
        avatar,
        description: card.description,
        personality: card.personality,
        scenario: card.scenario,
        firstMessage: card.firstMessage,
        exampleDialogues: card.exampleDialogues,
      });

      const importedParts: string[] = ["Character"];
      if (avatar) importedParts.push("avatar");

      if (card.regexScripts.length > 0) {
        const regexRules: RegexRule[] = [];
        for (const s of card.regexScripts) {
          if (s.disabled) continue;
          if (!s.findRegex) continue;
          const m = s.findRegex.match(/^\/(.+)\/([a-z]*)$/);
          if (!m) continue;
          const isDisplay = s.markdownOnly && !s.promptOnly;
          if (!isDisplay) continue;
          regexRules.push({
            id: generateId(),
            presetId: "",
            name: s.scriptName || "Imported Rule",
            pattern: m[1],
            displayTemplate: "",
            stripFromPrompt: true,
            enabled: true,
            createdAt: now,
          });
        }
        if (regexRules.length > 0) {
          const presetId = generateId();
          for (const r of regexRules) r.presetId = presetId;
          const preset: RegexPreset = {
            id: presetId,
            name: charName + " Regex",
            description: "Auto-imported with " + charName,
            rules: regexRules,
            isGlobal: false,
            createdAt: now,
            updatedAt: now,
          };
          const existingPresets = useSettingsStore.getState().regexPresets;
          await settingsRepository.saveRegexRules([...existingPresets, preset]);
          useSettingsStore.getState().loadRegexRules();
          await updateCharacter(char.id, { regexPresetId: presetId });
          useSettingsStore.getState().setActiveRegexPreset(presetId);
          importedParts.push(regexRules.length + " regex rules");
        }
      }

      if (card.worldbookEntries.length > 0) {
        const wbName = card.worldbookName || charName + " Lorebook";
        const wb: Worldbook = {
          id: generateId(),
          name: wbName,
          description: "Imported with " + charName,
          entries: card.worldbookEntries.map((e) => ({
            id: generateId(),
            worldbookId: "",
            title: e.title,
            keys: e.keys,
            content: e.content,
            priority: e.priority,
            type: e.always ? ("always" as const) : ("trigger" as const),
            triggerMode: e.triggerMode,
            enabled: e.enabled,
            createdAt: now,
            updatedAt: now,
          })),
          createdAt: now,
          updatedAt: now,
        };
        for (const entry of wb.entries) entry.worldbookId = wb.id;
        const existingWbs = useWorldbookStore.getState().worldbooks;
        await worldbookRepository.save([...existingWbs, wb]);
        useWorldbookStore.getState().loadWorldbooks();
        await updateCharacter(char.id, { worldbookId: wb.id });
        useWorldbookStore.getState().setActiveWorldbook(wb.id);
        importedParts.push(wb.entries.length + " worldbook entries");
      }

      toast("success", tt("characterImported", { name: charName, parts: importedParts.join(", ") }));
      setCreating(false);
      setEditingId(null);
      setSelectedId(char.id);
      setDetailOpen(true);
    } catch {
      toast("error", tt("importFailed"));
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
        setEditingId(null);
        setSelectedId(editingId);
      } else {
        const created = await createCharacter(form);
        setSelectedId(created.id);
        setEditingId(null);
      }
      setCreating(false);
      setDetailOpen(true);
      setForm(emptyForm);
    } catch {
      // ignored
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
      setDetailOpen(true);
    } else {
      setForm(emptyForm);
      setEditingId(null);
      setSelectedId(null);
      setCreating(true);
      setDetailOpen(true);
    }
  };

  const handleSelect = (char: Character) => {
    if (detailOpen && (editingId || creating)) return;
    setSelectedId(char.id);
  };

  const handleCancel = () => {
    if (creating) {
      closeDetail();
      if (!selectedId && characters.length > 0) setSelectedId(characters[0].id);
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.regexPresetId) {
        const presets = useSettingsStore.getState().regexPresets.filter((p) => p.id !== deleteTarget.regexPresetId);
        await settingsRepository.saveRegexRules(presets);
        useSettingsStore.getState().loadRegexRules();
      }
      if (deleteTarget.worldbookId) {
        const wbs = useWorldbookStore.getState().worldbooks.filter((w) => w.id !== deleteTarget.worldbookId);
        await worldbookRepository.save(wbs);
        useWorldbookStore.getState().loadWorldbooks();
      }
      await deleteCharacter(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      if (selected?.id === deleteTarget.id || creating || editingId === deleteTarget.id) closeDetail();
      if (editingId === deleteTarget.id) {
        setEditingId(null);
        setCreating(false);
        setForm(emptyForm);
      }
      toast("info", tt("characterDeleted", { name: deleteTarget.name }));
    } catch {
      // ignored
    }
  };

  const updateField = (field: keyof CreateCharacterInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasContent = (text: string | undefined) => text && text.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".json,.png" onChange={handleImportFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => openBuilderPage()}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Whale Builder
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleStartEdit()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("newCharacter")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title={t("importCard")}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-lg p-3 text-sm">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              {t("dismiss")}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-8">
          {loading && <p className="text-muted-foreground p-2 text-sm">{t("loading")}</p>}
          {!loading && characters.length === 0 && (
            <div className="text-muted-foreground text-sm">
              <p className="mb-3">{t("noCharacters")}</p>
              <Button variant="outline" size="sm" onClick={() => handleStartEdit()}>
                <Plus className="mr-1 h-4 w-4" />
                {t("newCharacter")}
              </Button>
            </div>
          )}
          {characters.map((char) => (
            <CharacterAvatarTile
              key={char.id}
              character={char}
              selected={selectedId === char.id}
              onClick={() => handleSelect(char)}
              onContextMenu={(event) => openCharacterMenu(event, char)}
              footerAction={
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-6 w-8 rounded-md"
                  onClick={(event: React.MouseEvent<HTMLButtonElement>) => openCharacterMenuFromButton(event, char)}
                  title={t("characterMenu")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            />
          ))}
        </div>
      </div>

      {characterMenu && (
        <div
          className="bg-popover text-popover-foreground fixed z-50 min-w-36 overflow-hidden rounded-md border p-1 text-sm shadow-lg"
          style={{
            left: Math.min(characterMenu.x, window.innerWidth - 160),
            top: Math.min(characterMenu.y, window.innerHeight - 80),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="hover:bg-accent w-full rounded px-3 py-2 text-left"
            onClick={() => openDetails(characterMenu.character)}
          >
            {t("contextMenu.details")}
          </button>
        </div>
      )}

      <Dialog
        open={detailOpen}
        onOpenChange={(open: boolean) => {
          if (open) setDetailOpen(true);
          else closeDetail();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {creating || editingId !== null ? (
            <>
              <DialogHeader>
                <DialogTitle>{editingId ? t("dialog.editCharacter") : t("dialog.newCharacter")}</DialogTitle>
                <DialogDescription className="sr-only">{t("dialog.editCharacter")}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div>
                  <Label htmlFor="char-name">{t("form.name")}</Label>
                  <Input
                    id="char-name"
                    value={form.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField("name", e.target.value)}
                    placeholder={t("form.namePlaceholder")}
                  />
                </div>
                <div>
                  <Label htmlFor="char-desc">{t("form.description")}</Label>
                  <Textarea
                    id="char-desc"
                    value={form.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField("description", e.target.value)}
                    placeholder={t("form.descriptionPlaceholder")}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="char-personality">{t("form.personality")}</Label>
                  <Textarea
                    id="char-personality"
                    value={form.personality}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField("personality", e.target.value)}
                    placeholder={t("form.personalityPlaceholder")}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="char-scenario">{t("form.scenario")}</Label>
                  <Textarea
                    id="char-scenario"
                    value={form.scenario}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField("scenario", e.target.value)}
                    placeholder={t("form.scenarioPlaceholder")}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="char-firstmsg">{t("form.firstMessage")}</Label>
                  <Textarea
                    id="char-firstmsg"
                    value={form.firstMessage}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      updateField("firstMessage", e.target.value)
                    }
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
                      updateField("exampleDialogues", e.target.value)
                    }
                    placeholder={t("form.exampleDialoguesPlaceholder")}
                    rows={4}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                  {tc("actions.cancel")}
                </Button>
                <Button onClick={handleSubmit} disabled={!form.name.trim() || loading}>
                  {editingId ? tc("actions.save") : tc("actions.create")}
                </Button>
              </DialogFooter>
            </>
          ) : selected ? (
            <>
              <div className="flex items-start justify-between gap-4 pr-6">
                <DialogHeader>
                  <DialogTitle>{selected.name}</DialogTitle>
                  <DialogDescription className="sr-only">Character details.</DialogDescription>
                </DialogHeader>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openBuilderPage(selected.id)}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {t("whaleBuilder")}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(selected)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {tc("actions.delete")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={closeDetail}>
                    {tc("actions.back")}
                  </Button>
                  <Button size="sm" onClick={() => handleStartEdit(selected)}>
                    <Edit className="mr-1 h-3.5 w-3.5" />
                    {tc("actions.edit")}
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  {selected.avatar ? (
                    <img
                      src={selected.avatar}
                      alt={selected.name}
                      className="border-border/50 h-16 w-16 rounded-xl border object-cover shadow-sm"
                    />
                  ) : (
                    <div className="bg-accent/60 border-border/50 flex h-16 w-16 items-center justify-center rounded-xl border shadow-sm">
                      <span className="text-muted-foreground text-2xl font-bold select-none">
                        {selected.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
                </div>

                {hasContent(selected.description) && (
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      {t("sections.description")}
                    </h3>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.description}</p>
                  </div>
                )}

                {hasContent(selected.personality) && (
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      {t("sections.personality")}
                    </h3>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.personality}</p>
                  </div>
                )}

                {hasContent(selected.scenario) && (
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      {t("sections.scenario")}
                    </h3>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.scenario}</p>
                  </div>
                )}

                {hasContent(selected.firstMessage) && (
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      {t("sections.firstMessage")}
                    </h3>
                    <div className="bg-accent/50 border-border/50 rounded-lg border p-4">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap italic">{selected.firstMessage}</p>
                    </div>
                  </div>
                )}

                {hasContent(selected.exampleDialogues) && (
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      {t("sections.exampleDialogues")}
                    </h3>
                    <div className="bg-muted/40 border-border/30 rounded-lg border p-4">
                      <p className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                        {selected.exampleDialogues}
                      </p>
                    </div>
                  </div>
                )}

                {!hasContent(selected.description) &&
                  !hasContent(selected.personality) &&
                  !hasContent(selected.scenario) &&
                  !hasContent(selected.firstMessage) &&
                  !hasContent(selected.exampleDialogues) && (
                    <div className="text-muted-foreground py-8 text-center text-sm">
                      <p>{t("dialog.noDetails")}</p>
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground py-8 text-center text-sm">{t("dialog.noCharacterSelected")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.title")}</DialogTitle>
            <DialogDescription>{t("delete.description", { name: deleteTarget?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {tc("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
