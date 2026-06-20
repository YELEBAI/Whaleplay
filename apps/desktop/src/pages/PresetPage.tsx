import { useEffect, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Upload,
  Download,
  CheckCircle2,
  LibraryBig,
  ArrowDown,
  ArrowUp,
  Edit,
  GripVertical,
} from "lucide-react";
import {
  Button,
  cn,
  Input,
  Textarea,
  Label,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";
import { usePresetStore } from "@/features/preset/preset.store";
import { AGENTIC_PLAY_PRESET_ID, ensureAgenticPlayPreset } from "@/features/agentic-play/agentic-preset";
import { forwardRef } from "react";
import type { Preset, PresetItem } from "@neo-tavern/shared";
import { sessionSync } from "@/db/kv";
import { getBackend } from "@/platform";
import { toast } from "@/utils/toast";

function sortPresetItems(items: PresetItem[]) {
  return [...items].sort(
    (a, b) => a.injectionOrder - b.injectionOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

function presetExportFilename(name: string) {
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").replace(/^_+|_+$/g, "");
  return `${safeName || "preset"}.json`;
}

function downloadPresetJson(json: string, filename: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getPresetItemContentPreview(content: string) {
  const preview = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  return preview.length > 240 ? `${preview.slice(0, 240).trimEnd()}...` : preview;
}

// ---------- local sub-components ----------

const EmptyPresetState = ({ t, onNew }: { t: (key: string) => string; onNew: () => void }) => (
  <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
    <div className="space-y-2 text-center">
      <p>{t("selectOrCreate")}</p>
      <Button variant="outline" size="sm" onClick={onNew}>
        <Plus className="mr-1 h-4 w-4" />
        {t("newPreset")}
      </Button>
    </div>
  </div>
);

const PresetItemCard = forwardRef<
  HTMLDivElement,
  {
    item: PresetItem;
    index: number;
    draggedItemId: string | null;
    dragOverItemId: string | null;
    dropPlacement: "before" | "after";
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>, itemId: string) => void;
    onToggle: (item: PresetItem) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    onEdit: (item: PresetItem) => void;
    onDelete: (item: PresetItem) => void;
    t: (key: string) => string;
    itemCount: number;
  }
>((props, ref) => {
  const {
    item,
    index,
    draggedItemId,
    dragOverItemId,
    dropPlacement,
    onPointerDown,
    onToggle,
    onMoveUp,
    onMoveDown,
    onEdit,
    onDelete,
    t,
    itemCount,
  } = props;

  const isDragging = draggedItemId === item.id;
  const contentPreview = getPresetItemContentPreview(item.content);

  return (
    <>
      {dragOverItemId === item.id && dropPlacement === "before" && <div className="bg-primary/20 h-0.5 rounded" />}
      <div
        ref={ref}
        className={cn(
          "bg-card flex items-center gap-2 rounded-lg border p-3 transition-opacity",
          isDragging && "opacity-50",
        )}
      >
        <button
          onPointerDown={(e) => onPointerDown(e, item.id)}
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", !item.enabled && "text-muted-foreground line-through")}>
              {item.name}
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                item.role === "system" ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500",
              )}
            >
              {t(`itemRoles.${item.role}`)}
            </span>
            {item.hidden && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                {t("hidden")}
              </span>
            )}
          </div>
          {contentPreview && (
            <p
              className={cn(
                "text-muted-foreground/90 bg-muted/20 mt-1 line-clamp-1 max-w-4xl rounded px-2 py-0.5 text-xs leading-5 break-words",
                !item.enabled && "opacity-70",
              )}
              title={contentPreview}
            >
              {contentPreview}
            </p>
          )}
        </div>

        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onToggle(item)}>
          {item.enabled ? t("disable") : t("enable")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-1" disabled={index === 0} onClick={() => onMoveUp(item.id)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1"
          disabled={index === itemCount - 1}
          onClick={() => onMoveDown(item.id)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(item)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive h-7 px-2"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {dragOverItemId === item.id && dropPlacement === "after" && <div className="bg-primary/20 h-0.5 rounded" />}
    </>
  );
});

function ItemListSection(props: {
  sortedItems: PresetItem[];
  draggedItemId: string | null;
  dragOverItemId: string | null;
  dropPlacement: "before" | "after";
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>, itemId: string) => void;
  onToggle: (item: PresetItem) => void;
  onMoveItem: (itemId: string, direction: -1 | 1) => Promise<void>;
  onEdit: (item: PresetItem) => void;
  onDelete: (item: PresetItem) => void;
  itemRefs: React.RefObject<Map<string, HTMLDivElement>>;
  t: (key: string) => string;
}) {
  const {
    sortedItems,
    draggedItemId,
    dragOverItemId,
    dropPlacement,
    onPointerDown,
    onToggle,
    onMoveItem,
    onEdit,
    onDelete,
    itemRefs,
    t,
  } = props;

  if (sortedItems.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        <p>{t("noItems")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-2">
      {sortedItems.map((item, index) => (
        <PresetItemCard
          key={item.id}
          ref={(node: HTMLDivElement | null) => {
            if (node) itemRefs.current.set(item.id, node);
            else itemRefs.current.delete(item.id);
          }}
          item={item}
          index={index}
          draggedItemId={draggedItemId}
          dragOverItemId={dragOverItemId}
          dropPlacement={dropPlacement}
          onPointerDown={onPointerDown}
          onToggle={onToggle}
          onMoveUp={(id) => onMoveItem(id, -1)}
          onMoveDown={(id) => onMoveItem(id, 1)}
          onEdit={onEdit}
          onDelete={onDelete}
          t={t}
          itemCount={sortedItems.length}
        />
      ))}
    </div>
  );
}

function ExternalPresetPicker(props: {
  sourceItemKey: string;
  setSourceItemKey: (key: string) => void;
  externalPresetItemOptions: Array<{ key: string; preset: Preset; item: PresetItem }>;
  selectedSourceItem: { key: string; preset: Preset; item: PresetItem } | null;
  onAdd: () => void;
  presets: Preset[];
  selectedId: string | null;
  t: (key: string) => string;
}) {
  const {
    sourceItemKey,
    setSourceItemKey,
    externalPresetItemOptions,
    selectedSourceItem,
    onAdd,
    presets,
    selectedId,
    t,
  } = props;

  return (
    <div className="bg-muted/10 rounded-md border p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <Label htmlFor="extra-preset-entry" className="flex items-center gap-1.5">
            <LibraryBig className="h-3.5 w-3.5" />
            {t("extraPresetEntry")}
          </Label>
          <select
            id="extra-preset-entry"
            value={sourceItemKey}
            onChange={(e) => setSourceItemKey(e.target.value)}
            className="border-input focus-visible:ring-ring mt-1 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
          >
            {externalPresetItemOptions.length === 0 ? (
              <option value="">{t("extraPresetEmpty")}</option>
            ) : (
              presets
                .filter((preset) => preset.id !== selectedId)
                .map((preset) => {
                  const options = externalPresetItemOptions.filter((option) => option.preset.id === preset.id);
                  if (options.length === 0) return null;
                  return (
                    <optgroup key={preset.id} label={preset.name}>
                      {options.map(({ key, item }) => (
                        <option key={key} value={key}>
                          {item.name}
                          {item.enabled ? "" : ` \u00b7 ${t("disabled")}`}
                        </option>
                      ))}
                    </optgroup>
                  );
                })
            )}
          </select>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{selectedSourceItem?.item.name}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} disabled={!selectedSourceItem}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("addSelected")}
        </Button>
      </div>
    </div>
  );
}

function PresetDialogs(props: {
  itemDialogOpen: boolean;
  setItemDialogOpen: (v: boolean) => void;
  editingItem: PresetItem | null;
  itemName: string;
  setItemName: (v: string) => void;
  itemRole: "system" | "user";
  setItemRole: (v: "system" | "user") => void;
  itemContent: string;
  setItemContent: (v: string) => void;
  itemOrder: number;
  setItemOrder: (v: number) => void;
  deleteTarget: Preset | null;
  setDeleteTarget: (v: Preset | null) => void;
  deleteItemTarget: PresetItem | null;
  setDeleteItemTarget: (v: PresetItem | null) => void;
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  importFile: File | null;
  setImportFile: (v: File | null) => void;
  importing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSaveItem: () => void;
  onDeletePreset: () => void;
  onDeleteItem: () => void;
  onImport: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  tc: (key: string) => string;
}) {
  const {
    itemDialogOpen,
    setItemDialogOpen,
    editingItem,
    itemName,
    setItemName,
    itemRole,
    setItemRole,
    itemContent,
    setItemContent,
    itemOrder,
    setItemOrder,
    deleteTarget,
    setDeleteTarget,
    deleteItemTarget,
    setDeleteItemTarget,
    importOpen,
    setImportOpen,
    importFile,
    setImportFile,
    importing,
    fileInputRef,
    onSaveItem,
    onDeletePreset,
    onDeleteItem,
    onImport,
    onFileChange,
    t,
    tc,
  } = props;

  return (
    <>
      {/* Item editor dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editCard") : t("newCard")}</DialogTitle>
            <DialogDescription>{t("cardDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("cardDialog.name")}</Label>
              <Input
                value={itemName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItemName(e.target.value)}
                placeholder={t("cardDialog.namePlaceholder")}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>{t("cardDialog.role")}</Label>
                <select
                  value={itemRole}
                  onChange={(e) => setItemRole(e.target.value as "system" | "user")}
                  className="border-input focus-visible:ring-ring h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                >
                  <option value="system">{t("itemRoles.system")}</option>
                  <option value="user">{t("itemRoles.user")}</option>
                </select>
              </div>
              <div>
                <Label>{t("cardDialog.order")}</Label>
                <Input
                  type="number"
                  value={itemOrder}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItemOrder(parseInt(e.target.value) || 0)}
                  className="w-20"
                />
              </div>
            </div>
            <div>
              <Label>{t("cardDialog.content")}</Label>
              <Textarea
                value={itemContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setItemContent(e.target.value)}
                placeholder={t("cardDialog.contentPlaceholder")}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button onClick={onSaveItem} disabled={!itemName.trim()}>
              {editingItem ? tc("actions.save") : tc("actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete preset dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePreset.title")}</DialogTitle>
            <DialogDescription>{t("deletePreset.description", { name: deleteTarget?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={onDeletePreset}>
              {tc("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete item dialog */}
      <Dialog open={!!deleteItemTarget} onOpenChange={() => setDeleteItemTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteCard.title")}</DialogTitle>
            <DialogDescription>{t("deleteCard.description", { name: deleteItemTarget?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemTarget(null)}>
              {tc("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={onDeleteItem}>
              {tc("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(v: boolean) => {
          setImportOpen(v);
          if (!v) setImportFile(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("importDialog.title")}</DialogTitle>
            <DialogDescription>{t("importDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="hover:border-primary/50 hover:bg-accent/50 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {importFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{importFile.name}</p>
                  <p className="text-muted-foreground text-xs">{(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="text-muted-foreground mx-auto h-8 w-8" />
                  <p className="text-muted-foreground text-sm">{t("importDialog.clickToSelect")}</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".json" onChange={onFileChange} className="hidden" />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportOpen(false);
                setImportFile(null);
              }}
            >
              {tc("actions.cancel")}
            </Button>
            <Button onClick={onImport} disabled={!importFile || importing}>
              {importing ? t("importDialog.importing") : t("importDialog.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- main page component ----------

export function PresetPage() {
  const { t } = useTranslation("preset");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("toast");

  const navigate = useNavigate();
  const store = usePresetStore();
  const loadPresets = store.loadPresets;

  const [secretUnlocked, setSecretUnlocked] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PresetItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemRole, setItemRole] = useState<"system" | "user">("system");
  const [itemContent, setItemContent] = useState("");
  const [itemOrder, setItemOrder] = useState(100);
  const [deleteItemTarget, setDeleteItemTarget] = useState<PresetItem | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<"before" | "after">("before");
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceItemKey, setSourceItemKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    ensureAgenticPlayPreset()
      .catch(() => null)
      .finally(() => {
        if (!cancelled) void loadPresets();
      });
    return () => {
      cancelled = true;
    };
  }, [loadPresets]);

  useEffect(() => {
    let cancelled = false;
    const refreshSecret = () => {
      if (!cancelled) setSecretUnlocked(sessionSync.get("secret-unlocked") === "1");
    };
    refreshSecret();
    window.addEventListener("neotavern-secret-changed", refreshSecret);
    return () => {
      cancelled = true;
      window.removeEventListener("neotavern-secret-changed", refreshSecret);
    };
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const preset = store.presets.find((p) => p.id === id);
    if (preset) {
      setEditName(preset.name);
      setEditDesc(preset.description);
    }
  };

  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!selectedId && store.presets.length > 0) {
      if (hasAutoSelectedRef.current) return;
      hasAutoSelectedRef.current = true;
      handleSelect(store.presets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.presets]);

  const selected = store.presets.find((p) => p.id === selectedId) ?? null;
  const isAgenticPresetSelected = selected?.id === AGENTIC_PLAY_PRESET_ID;

  const handleCreate = async () => {
    try {
      const p = await store.createPreset({ name: "New Preset", description: "" });
      setSelectedId(p.id);
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleSaveMeta = async () => {
    if (!selected) return;
    try {
      await store.updatePreset(selected.id, { name: editName, description: editDesc });
      toast("success", tt("presetUpdated"));
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await store.deletePreset(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      toast("info", tt("presetDeleted", { name: deleteTarget.name }));
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleActivate = async () => {
    if (!selected) return;
    const newId = store.activePresetId === selected.id ? null : selected.id;
    await store.setActivePreset(newId);
    toast("info", newId ? tt("presetActivated", { name: selected.name }) : tt("presetDeactivated"));
  };

  const openNewItem = () => {
    const orderedItems = selected ? sortPresetItems(selected.items) : [];
    const lastOrder = orderedItems[orderedItems.length - 1]?.injectionOrder ?? 0;
    setEditingItem(null);
    setItemName("");
    setItemRole("system");
    setItemContent("");
    setItemOrder(lastOrder + 10);
    setItemDialogOpen(true);
  };

  const openEditItem = (item: PresetItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemRole(item.role);
    setItemContent(item.content);
    setItemOrder(item.injectionOrder);
    setItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!selected || !itemName.trim()) return;
    try {
      if (editingItem) {
        await store.updateItem(selected.id, editingItem.id, {
          name: itemName.trim(),
          role: itemRole,
          content: itemContent,
          injectionOrder: itemOrder,
        });
        toast("success", tt("presetItemUpdated", { name: itemName }));
      } else {
        await store.addItem(selected.id, {
          name: itemName.trim(),
          enabled: true,
          role: itemRole,
          content: itemContent,
          injectionOrder: itemOrder,
        });
        toast("success", tt("presetItemAdded", { name: itemName }));
      }
      setItemDialogOpen(false);
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleDeleteItem = async () => {
    if (!selected || !deleteItemTarget) return;
    try {
      await store.deleteItem(selected.id, deleteItemTarget.id);
      setDeleteItemTarget(null);
      toast("info", tt("presetItemDeleted", { name: deleteItemTarget.name }));
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleToggleItem = async (item: PresetItem) => {
    if (!selected) return;
    await store.toggleItem(selected.id, item.id);
  };

  const handleMoveItem = async (itemId: string, direction: -1 | 1) => {
    if (!selected) return;
    const orderedItems = sortPresetItems(selected.items);
    const visibleItems = orderedItems.filter((i) => !i.hidden || secretUnlocked);
    const visibleIndex = visibleItems.findIndex((i) => i.id === itemId);
    const targetVisible = visibleItems[visibleIndex + direction];
    if (!targetVisible) return;

    const nextItems = [...orderedItems];
    const fromIndex = nextItems.findIndex((i) => i.id === itemId);
    const toIndex = nextItems.findIndex((i) => i.id === targetVisible.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    await store.reorderItems(
      selected.id,
      nextItems.map((i) => i.id),
    );
  };

  const handleItemPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, itemId: string) => {
    if (!selected || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const presetId = selected.id;
    const orderedItems = sortPresetItems(selected.items);
    const visibleItems = orderedItems.filter((i) => !i.hidden || secretUnlocked);

    const getDropTarget = (clientY: number) => {
      if (visibleItems.length === 0) return null;

      for (const item of visibleItems) {
        const el = itemRefs.current.get(item.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return {
            itemId: item.id,
            placement: clientY > rect.top + rect.height / 2 ? ("after" as const) : ("before" as const),
          };
        }
      }

      const first = itemRefs.current.get(visibleItems[0].id);
      const last = itemRefs.current.get(visibleItems[visibleItems.length - 1].id);
      if (first && clientY < first.getBoundingClientRect().top) {
        return { itemId: visibleItems[0].id, placement: "before" as const };
      }
      if (last && clientY > last.getBoundingClientRect().bottom) {
        return { itemId: visibleItems[visibleItems.length - 1].id, placement: "after" as const };
      }

      return null;
    };

    const previousUserSelect = document.body.style.userSelect;

    // eslint-disable-next-line react-hooks/immutability -- drag-and-drop body lock
    document.body.style.userSelect = "none";
    setDraggedItemId(itemId);
    setDragOverItemId(itemId);
    setDropPlacement("before");

    const handlePointerMove = (event: PointerEvent) => {
      const target = getDropTarget(event.clientY);
      if (!target) return;
      setDragOverItemId(target.itemId);
      setDropPlacement(target.placement);
    };

    const finishDrag = async (event: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      document.body.style.userSelect = previousUserSelect;

      const target = getDropTarget(event.clientY);
      setDraggedItemId(null);
      setDragOverItemId(null);
      if (!target || target.itemId === itemId) return;

      const sourceItem = orderedItems.find((item) => item.id === itemId);
      if (!sourceItem) return;

      const nextItems = orderedItems.filter((item) => item.id !== itemId);
      const targetIndex = nextItems.findIndex((item) => item.id === target.itemId);
      if (targetIndex < 0) return;

      nextItems.splice(target.placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceItem);
      await store.reorderItems(
        presetId,
        nextItems.map((item) => item.id),
      );
    };

    const cancelDrag = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      document.body.style.userSelect = previousUserSelect;
      setDraggedItemId(null);
      setDragOverItemId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
  };

  const handleExport = async () => {
    if (!selected) return;
    try {
      const json = await store.exportPreset(selected.id);
      const filename = presetExportFilename(selected.name);
      try {
        const savedPath = await getBackend().file.saveTextFile(filename, json);
        if (!savedPath) {
          toast("info", "Export cancelled");
          return;
        }
        toast("success", tt("presetExportedTo", { path: savedPath }));
      } catch {
        downloadPresetJson(json, filename);
        toast("success", tt("presetExported"));
      }
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const preset = await store.importPreset(text);
      setSelectedId(preset.id);
      setImportOpen(false);
      setImportFile(null);
      toast("success", tt("presetImported", { name: preset.name, count: preset.items.length }));
    } catch {
      toast("error", tt("presetImportFailed"));
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImportFile(file);
  };

  const externalPresetItemOptions = (() => {
    if (!selected) return [];
    return store.presets
      .filter((preset) => preset.id !== selected.id)
      .flatMap((preset) =>
        sortPresetItems(preset.items)
          .filter((item) => !item.hidden || secretUnlocked)
          .map((item) => ({
            key: `${preset.id}:${item.id}`,
            preset,
            item,
          })),
      );
  })();

  const selectedSourceItem =
    externalPresetItemOptions.find((option) => option.key === sourceItemKey) ?? externalPresetItemOptions[0] ?? null;

  const handleAddExternalPresetItem = async () => {
    if (!selected || !selectedSourceItem) return;
    const sourceItem = selectedSourceItem.item;
    if (selected.items.some((item) => item.content === sourceItem.content)) {
      toast("info", tt("presetAlreadyAdded", { name: sourceItem.name }));
      return;
    }

    const nextOrder = Math.max(0, ...selected.items.map((item) => item.injectionOrder)) + 10;
    try {
      await store.addItem(selected.id, {
        name: sourceItem.name,
        enabled: true,
        hidden: sourceItem.hidden,
        role: sourceItem.role,
        content: sourceItem.content,
        injectionOrder: nextOrder,
      });
      toast("success", tt("presetItemAdded", { name: sourceItem.name }));
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const sortedItems = selected ? sortPresetItems(selected.items).filter((i) => !i.hidden || secretUnlocked) : [];

  return (
    <div className="flex h-full">
      {/* ---- left sidebar ---- */}
      <div className="flex w-60 flex-col gap-3 border-r p-4">
        <button
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </button>
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">{t("title")}</h2>
        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="flex flex-col gap-0.5">
            {store.presets.length === 0 && !store.loading && (
              <p className="text-muted-foreground p-2 text-xs">{t("noPresets")}</p>
            )}
            {store.presets.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={cn(
                  "flex items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-sm transition-colors",
                  selectedId === p.id
                    ? "bg-accent text-foreground font-medium"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {p.id === AGENTIC_PLAY_PRESET_ID && (
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                      Agentic
                    </span>
                  )}
                  {store.activePresetId === p.id && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                </span>
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={handleCreate} className="mt-1 w-full justify-center text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("newPreset")}
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* ---- main content ---- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <EmptyPresetState t={t} onNew={handleCreate} />
        ) : (
          <>
            {/* metadata header */}
            <div className="shrink-0 border-b px-6 py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={editName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                    className="h-auto rounded-none border-0 border-b px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
                    placeholder={t("namePlaceholder")}
                  />
                  <Textarea
                    value={editDesc}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.target.value)}
                    className="text-muted-foreground min-h-[40px] resize-none rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:ring-0"
                    placeholder={t("descPlaceholder")}
                    rows={1}
                  />
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={handleSaveMeta}>
                    {t("save")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {isAgenticPresetSelected ? (
                    <Button size="sm" variant="outline" disabled>
                      {t("agenticPreset.autoUsed")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={store.activePresetId === selected.id ? "default" : "outline"}
                      onClick={handleActivate}
                    >
                      {store.activePresetId === selected.id ? t("active") : t("activate")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {isAgenticPresetSelected && (
                <div className="border-primary/20 bg-primary/5 text-muted-foreground mt-3 rounded-md border px-3 py-2 text-xs">
                  {t("agenticPreset.hint")}
                </div>
              )}

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <ExternalPresetPicker
                  sourceItemKey={sourceItemKey}
                  setSourceItemKey={setSourceItemKey}
                  externalPresetItemOptions={externalPresetItemOptions}
                  selectedSourceItem={selectedSourceItem}
                  onAdd={handleAddExternalPresetItem}
                  presets={store.presets}
                  selectedId={selectedId}
                  t={t}
                />

                <div className="bg-muted/10 rounded-md border p-3">
                  <div className="flex h-full items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{t("items", { count: sortedItems.length })}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("itemsEnabled", { count: sortedItems.filter((i) => i.enabled).length })}
                      </p>
                    </div>
                    <Button size="sm" onClick={openNewItem} className="shrink-0">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("blankCard")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* item list */}
            <div className="flex-1 overflow-y-auto p-6">
              <ItemListSection
                sortedItems={sortedItems}
                draggedItemId={draggedItemId}
                dragOverItemId={dragOverItemId}
                dropPlacement={dropPlacement}
                onPointerDown={handleItemPointerDown}
                onToggle={handleToggleItem}
                onMoveItem={handleMoveItem}
                onEdit={openEditItem}
                onDelete={setDeleteItemTarget}
                itemRefs={itemRefs}
                t={t}
              />
            </div>
          </>
        )}
      </div>

      {/* ---- dialogs ---- */}
      <PresetDialogs
        itemDialogOpen={itemDialogOpen}
        setItemDialogOpen={setItemDialogOpen}
        editingItem={editingItem}
        itemName={itemName}
        setItemName={setItemName}
        itemRole={itemRole}
        setItemRole={setItemRole}
        itemContent={itemContent}
        setItemContent={setItemContent}
        itemOrder={itemOrder}
        setItemOrder={setItemOrder}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleteItemTarget={deleteItemTarget}
        setDeleteItemTarget={setDeleteItemTarget}
        importOpen={importOpen}
        setImportOpen={setImportOpen}
        importFile={importFile}
        setImportFile={setImportFile}
        importing={importing}
        fileInputRef={fileInputRef}
        onSaveItem={handleSaveItem}
        onDeletePreset={handleDelete}
        onDeleteItem={handleDeleteItem}
        onImport={handleImport}
        onFileChange={handleFileChange}
        t={t}
        tc={tc}
      />
    </div>
  );
}
