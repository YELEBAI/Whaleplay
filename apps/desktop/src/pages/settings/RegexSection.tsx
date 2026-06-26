import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, Globe } from "lucide-react";
import {
  Button,
  Input,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  SwitchButton,
  cn,
} from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import { toast } from "@/utils/toast";
import type { RegexSectionProps } from "./types";

export function RegexSection({ t }: RegexSectionProps) {
  // ── Store reads ──────────────────────────────────────
  const regexPresets = useSettingsStore((s) => s.regexPresets);
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId);
  const loadRegexRules = useSettingsStore((s) => s.loadRegexRules);

  useEffect(() => {
    loadRegexRules();
  }, [loadRegexRules]);
  const createRegexPreset = useSettingsStore((s) => s.createRegexPreset);
  const updateRegexPreset = useSettingsStore((s) => s.updateRegexPreset);
  const deleteRegexPresetFromStore = useSettingsStore((s) => s.deleteRegexPreset);
  const setActiveRegexPreset = useSettingsStore((s) => s.setActiveRegexPreset);
  const addRegexRule = useSettingsStore((s) => s.addRegexRule);
  const updateRegexRuleFromStore = useSettingsStore((s) => s.updateRegexRule);
  const deleteRegexRuleFromStore = useSettingsStore((s) => s.deleteRegexRule);
  const toggleRegexRule = useSettingsStore((s) => s.toggleRegexRule);

  // ── Local state ──────────────────────────────────────
  const [selectedRegexPresetId, setSelectedRegexPresetId] = useState<string | null>(null);
  const [regexPresetName, setRegexPresetName] = useState("");
  const [regexPresetDesc, setRegexPresetDesc] = useState("");
  const [regexDeleteTarget, setRegexDeleteTarget] = useState<(typeof regexPresets)[0] | null>(null);

  const [regexName, setRegexName] = useState("");
  const [regexPattern, setRegexPattern] = useState("");
  const [regexTemplate, setRegexTemplate] = useState("");
  const [regexStrip, setRegexStrip] = useState(true);
  const [regexEnabled, setRegexEnabled] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────
  const selectedRegexPreset = regexPresets.find((p) => p.id === selectedRegexPresetId) ?? null;
  const selectedRules = selectedRegexPreset ? [...selectedRegexPreset.rules] : [];

  // ── Handlers ─────────────────────────────────────────

  const handleSelectRegexPreset = (id: string) => {
    setSelectedRegexPresetId(id);
    const preset = regexPresets.find((p) => p.id === id);
    if (preset) {
      setRegexPresetName(preset.name);
      setRegexPresetDesc(preset.description);
    }
    resetRuleForm();
  };

  const handleCreateRegexPreset = async () => {
    try {
      const p = await createRegexPreset({ name: "New Regex Preset", description: "" });
      setSelectedRegexPresetId(p.id);
    } catch {
      toast("error", "Failed to create preset");
    }
  };

  const handleSaveRegexPresetMeta = async () => {
    if (!selectedRegexPresetId) return;
    try {
      await updateRegexPreset(selectedRegexPresetId, { name: regexPresetName, description: regexPresetDesc });
      toast("success", "Saved");
    } catch {
      toast("error", "Failed to save");
    }
  };

  const handleDeleteRegexPreset = async () => {
    if (!regexDeleteTarget) return;
    try {
      await deleteRegexPresetFromStore(regexDeleteTarget.id);
      if (selectedRegexPresetId === regexDeleteTarget.id) {
        setSelectedRegexPresetId(null);
        setRegexPresetName("");
        setRegexPresetDesc("");
      }
      setRegexDeleteTarget(null);
      toast("info", `Deleted "${regexDeleteTarget.name}"`);
    } catch {
      toast("error", "Failed to delete");
    }
  };

  const handleActivateRegexPreset = async () => {
    if (!selectedRegexPresetId) return;
    const newId = activeRegexPresetId === selectedRegexPresetId ? null : selectedRegexPresetId;
    await setActiveRegexPreset(newId);
    toast("info", newId ? `Activated "${selectedRegexPreset?.name}"` : "Deactivated");
  };

  const handleToggleGlobalRegex = async () => {
    if (!selectedRegexPresetId || !selectedRegexPreset) return;
    await updateRegexPreset(selectedRegexPresetId, { isGlobal: !selectedRegexPreset.isGlobal });
    toast("info", selectedRegexPreset.isGlobal ? "Removed global flag" : "Set as global regex");
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRegexName("");
    setRegexPattern("");
    setRegexTemplate("");
    setRegexStrip(true);
    setRegexEnabled(true);
  };

  const startEditRule = (rule: {
    id: string;
    name: string;
    pattern: string;
    displayTemplate: string;
    stripFromPrompt: boolean;
    enabled: boolean;
  }) => {
    setEditingRuleId(rule.id);
    setRegexName(rule.name);
    setRegexPattern(rule.pattern);
    setRegexTemplate(rule.displayTemplate);
    setRegexStrip(rule.stripFromPrompt);
    setRegexEnabled(rule.enabled);
  };

  const handleSaveRule = () => {
    if (!selectedRegexPresetId || !regexName.trim() || !regexPattern.trim()) {
      toast("error", "Name and Pattern are required");
      return;
    }
    try {
      new RegExp(regexPattern, "gs");
    } catch {
      toast("error", "Invalid regex pattern");
      return;
    }
    try {
      if (editingRuleId) {
        updateRegexRuleFromStore(selectedRegexPresetId, editingRuleId, {
          name: regexName.trim(),
          pattern: regexPattern.trim(),
          displayTemplate: regexTemplate,
          stripFromPrompt: regexStrip,
          enabled: regexEnabled,
        });
        toast("success", `"${regexName}" updated`);
      } else {
        addRegexRule(selectedRegexPresetId, {
          name: regexName.trim(),
          pattern: regexPattern.trim(),
          displayTemplate: regexTemplate,
          stripFromPrompt: regexStrip,
          enabled: regexEnabled,
        });
        toast("success", `"${regexName}" added`);
      }
      resetRuleForm();
    } catch {
      toast("error", "Failed");
    }
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!selectedRegexPresetId) return;
    const rule = selectedRules.find((r) => r.id === ruleId);
    deleteRegexRuleFromStore(selectedRegexPresetId, ruleId);
    if (editingRuleId === ruleId) resetRuleForm();
    toast("info", `"${rule?.name || "Rule"}" deleted`);
  };

  const handleToggleRule = (ruleId: string) => {
    if (!selectedRegexPresetId) return;
    toggleRegexRule(selectedRegexPresetId, ruleId);
  };

  // ── JSX ──────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-full">
      {/* ── Left sidebar: preset list ── */}
      <div className="flex w-52 flex-col gap-2 border-r p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t("regex.presets")}</h2>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCreateRegexPreset}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="flex flex-col gap-0.5">
            {regexPresets.length === 0 && <p className="text-muted-foreground p-2 text-xs">{t("regex.noPresets")}</p>}
            {regexPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectRegexPreset(p.id)}
                className={cn(
                  "flex items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-sm transition-colors",
                  selectedRegexPresetId === p.id
                    ? "bg-accent text-foreground font-medium"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate text-xs">{p.name}</span>
                {activeRegexPresetId === p.id && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedRegexPreset ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            <div className="space-y-2 text-center">
              <p>{t("regex.selectOrCreate")}</p>
              <Button variant="outline" size="sm" onClick={handleCreateRegexPreset}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("regex.newPreset")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Preset meta header ── */}
            <div className="shrink-0 border-b p-4 pb-2">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={regexPresetName}
                    onChange={(e) => setRegexPresetName(e.target.value)}
                    className="h-auto rounded-none border-0 border-b px-0 text-lg font-bold focus-visible:ring-0"
                    placeholder={t("regex.namePlaceholder")}
                  />
                  <Input
                    value={regexPresetDesc}
                    onChange={(e) => setRegexPresetDesc(e.target.value)}
                    className="text-muted-foreground h-auto rounded-none border-0 border-b px-0 text-xs focus-visible:ring-0"
                    placeholder={t("regex.descPlaceholder")}
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={handleSaveRegexPresetMeta}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedRegexPreset?.isGlobal ? "default" : "outline"}
                    onClick={handleToggleGlobalRegex}
                    title={t("regex.toggleGlobal")}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={activeRegexPresetId === selectedRegexPresetId ? "default" : "outline"}
                    onClick={handleActivateRegexPreset}
                  >
                    {activeRegexPresetId === selectedRegexPresetId ? "Active" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setRegexDeleteTarget(selectedRegexPreset)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Rule form ── */}
            <div className="shrink-0 border-b p-4">
              <h3 className="mb-3 text-sm font-semibold">{editingRuleId ? t("regex.editRule") : t("regex.addRule")}</h3>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Input
                  value={regexName}
                  onChange={(e) => setRegexName(e.target.value)}
                  placeholder={t("regex.ruleNamePlaceholder")}
                  className="text-xs"
                />
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <SwitchButton
                      size="xs"
                      checked={regexEnabled}
                      onClick={() => setRegexEnabled(!regexEnabled)}
                      label={t("regex.toggle")}
                    />
                    <span className="text-[10px]">{t("regex.on")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <SwitchButton
                      size="xs"
                      checked={regexStrip}
                      onClick={() => setRegexStrip(!regexStrip)}
                      label={t("regex.strip")}
                    />
                    <span className="text-[10px]">{t("regex.strip")}</span>
                  </label>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Input
                  value={regexPattern}
                  onChange={(e) => setRegexPattern(e.target.value)}
                  placeholder={t("regex.patternPlaceholder")}
                  className="font-mono text-[10px]"
                />
                <Input
                  value={regexTemplate}
                  onChange={(e) => setRegexTemplate(e.target.value)}
                  placeholder={t("regex.templatePlaceholder")}
                  className="font-mono text-[10px]"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveRule}>
                  {editingRuleId ? "Update" : "Add"} Rule
                </Button>
                {editingRuleId && (
                  <Button size="sm" variant="outline" onClick={resetRuleForm}>
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-[10px]"
                  onClick={() => {
                    resetRuleForm();
                    setRegexName("Summary");
                    setRegexPattern("<summary>([\\s\\S]*?)<\\/summary>");
                    setRegexTemplate("$1");
                    setRegexStrip(true);
                    setRegexEnabled(true);
                  }}
                >
                  Quick: Summary
                </Button>
              </div>
            </div>

            {/* ── Rule list ── */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-1.5">
                {selectedRules.length === 0 && (
                  <p className="text-muted-foreground p-2 text-xs">{t("regex.noRules")}</p>
                )}
                {selectedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg p-2",
                      !rule.enabled ? "opacity-40" : "hover:bg-accent/50",
                    )}
                  >
                    <SwitchButton
                      size="xs"
                      checked={rule.enabled}
                      onClick={() => handleToggleRule(rule.id)}
                      label={t("regex.toggle")}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">{rule.name}</span>
                        {rule.stripFromPrompt && (
                          <span className="bg-muted shrink-0 rounded px-1 py-0.5 font-mono text-[8px]">strip</span>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">{rule.pattern}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditRule(rule)}>
                      <span className="text-[10px]">✎</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive h-6 w-6"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!regexDeleteTarget} onOpenChange={() => setRegexDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Regex Preset</DialogTitle>
            <DialogDescription>
              Delete "{regexDeleteTarget?.name}" and all its rules? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegexDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRegexPreset}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
