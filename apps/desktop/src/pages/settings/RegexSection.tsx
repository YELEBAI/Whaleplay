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
    <div className="flex h-full -m-6">
      {/* ── Left sidebar: preset list ── */}
      <div className="w-52 border-r p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("regex.presets")}</h2>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCreateRegexPreset}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-0.5">
            {regexPresets.length === 0 && <p className="text-xs text-muted-foreground p-2">{t("regex.noPresets")}</p>}
            {regexPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectRegexPreset(p.id)}
                className={cn("text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-1", selectedRegexPresetId === p.id ? "bg-accent text-foreground font-medium" : "hover:bg-accent/50 text-muted-foreground hover:text-foreground")}
              >
                <span className="truncate text-xs">{p.name}</span>
                {activeRegexPresetId === p.id && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedRegexPreset ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <p>{t("regex.selectOrCreate")}</p>
              <Button variant="outline" size="sm" onClick={handleCreateRegexPreset}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("regex.newPreset")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Preset meta header ── */}
            <div className="p-4 pb-2 shrink-0 border-b">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={regexPresetName}
                    onChange={(e) => setRegexPresetName(e.target.value)}
                    className="border-0 border-b rounded-none px-0 h-auto text-lg font-bold focus-visible:ring-0"
                    placeholder={t("regex.namePlaceholder")}
                  />
                  <Input
                    value={regexPresetDesc}
                    onChange={(e) => setRegexPresetDesc(e.target.value)}
                    className="border-0 border-b rounded-none px-0 h-auto text-xs text-muted-foreground focus-visible:ring-0"
                    placeholder={t("regex.descPlaceholder")}
                  />
                </div>
                <div className="flex gap-1 shrink-0">
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
            <div className="p-4 shrink-0 border-b">
              <h3 className="text-sm font-semibold mb-3">{editingRuleId ? t("regex.editRule") : t("regex.addRule")}</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Input
                  value={regexName}
                  onChange={(e) => setRegexName(e.target.value)}
                  placeholder={t("regex.ruleNamePlaceholder")}
                  className="text-xs"
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={regexEnabled}
                      onClick={() => setRegexEnabled(!regexEnabled)}
                      className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", regexEnabled ? "bg-primary" : "bg-muted-foreground/30")}
                    >
                      <span
                        className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", regexEnabled ? "translate-x-[14px]" : "translate-x-[2px]")}
                      />
                    </button>
                    <span className="text-[10px]">{t("regex.on")}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={regexStrip}
                      onClick={() => setRegexStrip(!regexStrip)}
                      className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", regexStrip ? "bg-primary" : "bg-muted-foreground/30")}
                    >
                      <span
                        className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", regexStrip ? "translate-x-[14px]" : "translate-x-[2px]")}
                      />
                    </button>
                    <span className="text-[10px]">{t("regex.strip")}</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
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
                  <p className="text-xs text-muted-foreground p-2">{t("regex.noRules")}</p>
                )}
                {selectedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={cn("flex items-center gap-2 p-2 rounded-lg", !rule.enabled ? "opacity-40" : "hover:bg-accent/50")}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => handleToggleRule(rule.id)}
                      className={cn("shrink-0 relative inline-flex h-4 w-7 items-center rounded-full transition-colors", rule.enabled ? "bg-primary" : "bg-muted-foreground/30")}
                    >
                      <span
                        className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", rule.enabled ? "translate-x-[14px]" : "translate-x-[2px]")}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{rule.name}</span>
                        {rule.stripFromPrompt && (
                          <span className="text-[8px] bg-muted px-1 py-0.5 rounded font-mono shrink-0">strip</span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{rule.pattern}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditRule(rule)}>
                      <span className="text-[10px]">✎</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
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
