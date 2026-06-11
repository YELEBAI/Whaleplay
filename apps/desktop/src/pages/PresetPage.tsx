import { useEffect, useState, useRef, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Edit,
  ArrowLeft,
  Upload,
  Download,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  LibraryBig,
} from "lucide-react";
import {
  Button,
  cn,
  Input,
  Textarea,
  Label,
  ScrollArea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@neo-tavern/ui";
import { usePresetStore } from "@/features/preset/preset.store";
import { EXTRA_PRESET_ITEM_TEMPLATES } from "@/features/preset/preset.templates";
import type { Preset, PresetItem } from "@neo-tavern/shared";
import { getStorageItem } from "@/db/storage";
import { invoke } from "@tauri-apps/api/core";
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

export function PresetPage() {
  const { t } = useTranslation("preset");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("toast");

  const navigate = useNavigate();
  const store = usePresetStore();

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
  const [templateId, setTemplateId] = useState(EXTRA_PRESET_ITEM_TEMPLATES[0]?.id ?? "");

  useEffect(() => {
    store.loadPresets();
  }, [store.loadPresets]);

  useEffect(() => {
    let cancelled = false;
    const refreshSecret = () => {
      getStorageItem("neotavern_secret_unlocked").then((value) => {
        if (!cancelled) setSecretUnlocked(value === "1");
      });
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
  }, [store.presets]);

  const selected = store.presets.find((p) => p.id === selectedId) ?? null;

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

  const handleItemPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>, itemId: string) => {
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
  }, [selected, secretUnlocked, store]);

  const handleExport = async () => {
    if (!selected) return;
    try {
      const json = await store.exportPreset(selected.id);
      const filename = presetExportFilename(selected.name);
      try {
        const savedPath = await invoke<string | null>("save_text_file", {
          defaultFilename: filename,
          content: json,
        });
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

  const selectedTemplate =
    EXTRA_PRESET_ITEM_TEMPLATES.find((template) => template.id === templateId) ?? EXTRA_PRESET_ITEM_TEMPLATES[0];

  const handleAddTemplateItem = async () => {
    if (!selected || !selectedTemplate) return;
    if (selected.items.some((item) => item.content === selectedTemplate.content)) {
      toast("info", tt("presetAlreadyAdded", { name: selectedTemplate.name }));
      return;
    }

    const nextOrder = Math.max(0, ...selected.items.map((item) => item.injectionOrder)) + 10;
    try {
      await store.addItem(selected.id, {
        name: selectedTemplate.name,
        enabled: true,
        role: selectedTemplate.role,
        content: selectedTemplate.content,
        injectionOrder: nextOrder,
      });
      toast("success", tt("presetItemAdded", { name: selectedTemplate.name }));
    } catch {
      toast("error", store.error || tt("presetFailed"));
    }
  };

  const sortedItems = selected ? sortPresetItems(selected.items).filter((i) => !i.hidden || secretUnlocked) : [];

  return (
    <div className="flex h-full">
      <div className="w-60 border-r p-4 flex flex-col gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </button>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("title")}</h2>
        <Button variant="outline" size="sm" onClick={handleCreate} className="justify-start text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("newPreset")}
        </Button>
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-0.5">
            {store.presets.length === 0 && !store.loading && (
              <p className="text-xs text-muted-foreground p-2">{t("noPresets")}</p>
            )}
            {store.presets.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={cn("text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-1", selectedId === p.id ? "bg-accent text-foreground font-medium" : "hover:bg-accent/50 text-muted-foreground hover:text-foreground")}
              >
                <span className="truncate">{p.name}</span>
                {store.activePresetId === p.id && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <p>{t("selectOrCreate")}</p>
              <Button variant="outline" size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1" />
                New Preset
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b px-6 py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={editName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                    className="border-0 border-b rounded-none px-0 h-auto text-2xl font-bold focus-visible:ring-0"
                    placeholder="Preset name"
                  />
                  <Textarea
                    value={editDesc}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.target.value)}
                    className="border-0 border-b rounded-none px-0 min-h-[40px] resize-none text-sm text-muted-foreground focus-visible:ring-0"
                    placeholder={t("descPlaceholder")}
                    rows={1}
                  />
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={handleSaveMeta}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={store.activePresetId === selected.id ? "default" : "outline"}
                    onClick={handleActivate}
                  >
                    {store.activePresetId === selected.id ? t("active") : t("activate")}
                  </Button>
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

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-md border bg-muted/10 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="extra-preset-entry" className="flex items-center gap-1.5">
                        <LibraryBig className="h-3.5 w-3.5" />
                        {t("extraPresetEntry")}
                      </Label>
                      <select
                        id="extra-preset-entry"
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {EXTRA_PRESET_ITEM_TEMPLATES.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selectedTemplate?.description}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAddTemplateItem} disabled={!selectedTemplate}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t("addSelected")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/10 p-3">
                  <div className="flex h-full items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{t("items", { count: sortedItems.length })}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("itemsEnabled", { count: sortedItems.filter((i) => i.enabled).length })}
                      </p>
                    </div>
                    <Button size="sm" onClick={openNewItem} className="shrink-0">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t("blankCard")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {sortedItems.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  <p>{t("noItems")}</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-5xl">
                  {sortedItems.map((item, index) => (
                    <Card
                      key={item.id}
                      ref={(node) => {
                        if (node) itemRefs.current.set(item.id, node);
                        else itemRefs.current.delete(item.id);
                      }}
                      className={cn("relative transition-all", !item.enabled && "opacity-50", draggedItemId === item.id && "opacity-40", dragOverItemId === item.id && draggedItemId !== item.id && "ring-1 ring-primary/40 bg-accent/20")}
                    >
                      {dragOverItemId === item.id && draggedItemId !== item.id && (
                        <div
                          className={cn("pointer-events-none absolute left-3 right-3 z-10 h-0.5 rounded-full bg-primary", dropPlacement === "before" ? "top-0" : "bottom-0")}
                        />
                      )}
                      <CardHeader className="p-3 pb-0">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) =>
                              handleItemPointerDown(e, item.id)
                            }
                            className="mt-0.5 flex h-7 w-5 shrink-0 touch-none select-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground cursor-grab active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.enabled}
                            onClick={() => handleToggleItem(item)}
                            className={cn("mt-0.5 shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer", item.enabled ? "bg-primary" : "bg-muted-foreground/30")}
                            title={item.enabled ? "Disable" : "Enable"}
                          >
                            <span
                              className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", item.enabled ? "translate-x-[18px]" : "translate-x-[4px]")}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-sm truncate">{item.name}</CardTitle>
                              <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground shrink-0">
                                {item.role}
                              </span>
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground shrink-0">
                                Prompt #{index + 1}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleMoveItem(item.id, -1)}
                              disabled={index === 0}
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleMoveItem(item.id, 1)}
                              disabled={index === sortedItems.length - 1}
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditItem(item)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteItemTarget(item)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{item.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              Cancel
            </Button>
            <Button onClick={handleSaveItem} disabled={!itemName.trim()}>
              {editingItem ? tc("actions.save") : tc("actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePreset.title")}</DialogTitle>
            <DialogDescription>{t("deletePreset.description", { name: deleteTarget?.name })}</DialogDescription>
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

      <Dialog open={!!deleteItemTarget} onOpenChange={() => setDeleteItemTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteCard.title")}</DialogTitle>
            <DialogDescription>{t("deleteCard.description", { name: deleteItemTarget?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteItem}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {importFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{importFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("importDialog.clickToSelect")}</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
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
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing ? t("importDialog.importing") : t("importDialog.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
