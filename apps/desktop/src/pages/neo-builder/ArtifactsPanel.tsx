import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import type { TFunction } from "i18next";
import { Button } from "@neo-tavern/ui";
import type { CreateCharacterInput } from "@neo-tavern/shared";
import type {
  NeoCreationPlan,
  NeoCreationPlanEntry,
  NeoPersonalityPalette,
  NeoBuilderEvaluationReport,
  NeoStatusBarConfig,
} from "@/features/character/neo-character-builder";
import type { ArtifactView, WorldbookDraft } from "./types";

// ── Types ────────────────────────────────────────────

export interface ArtifactsPanelProps {
  creationPlan: NeoCreationPlan | null;
  personalityPalette: NeoPersonalityPalette | null;
  evaluationReport: NeoBuilderEvaluationReport | null;
  draft: CreateCharacterInput | null;
  worldbookDraft: WorldbookDraft | null;
  statusBars: NeoStatusBarConfig | null;
  setArtifactView: (view: ArtifactView) => void;
  steps: { label: string; done: boolean; active: boolean; optional?: boolean }[];
  savedCharacterId: string | null;
  saving: boolean;
  running: boolean;
  onSave: () => void;
  onExport: () => void;
  onEvaluate: () => void;
  t: TFunction<"neo-builder">;
}

// ── Helpers ──────────────────────────────────────────

function getPlanStatusLabel(status: NeoCreationPlanEntry["status"]): string {
  switch (status) {
    case "done":
      return "done";
    case "in_progress":
      return "running";
    case "skipped":
      return "skipped";
    default:
      return "planned";
  }
}

// ── Component ────────────────────────────────────────

/**
 * Right sidebar panel for the NeoBuilder page. Displays workflow steps,
 * plan entry progress, artifact cards (character, worldbook, palette,
 * evaluation), and save/export/evaluate actions.
 */
export function ArtifactsPanel({
  creationPlan,
  personalityPalette,
  evaluationReport,
  draft,
  worldbookDraft,
  statusBars,
  setArtifactView,
  steps,
  savedCharacterId,
  saving,
  running,
  onSave,
  onExport,
  onEvaluate,
  t,
}: ArtifactsPanelProps) {
  const planEntries = creationPlan?.entries ?? [];
  const completedPlanEntries = planEntries.filter(
    (entry) => entry.status === "done" || entry.status === "skipped",
  ).length;

  return (
    <aside className="bg-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
      <div className="shrink-0 border-b p-4">
        <h2 className="font-semibold">{t("sidebar.progressAndArtifacts")}</h2>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            {t("sidebar.progress")}
          </div>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.label}
                className={`bg-background flex items-center gap-3 rounded-md border p-3 ${
                  step.active ? "border-primary/60 bg-primary/5" : ""
                }`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.done
                      ? "bg-emerald-500 text-white"
                      : step.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : step.active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{step.label}</div>
                  {step.optional && !step.done ? (
                    <div className="text-muted-foreground text-xs">{t("sidebar.optional")}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {planEntries.length ? (
            <div className="bg-background mt-3 rounded-md border p-3">
              <div className="text-muted-foreground mb-2 flex items-center justify-between gap-3 text-xs">
                <span>{t("planEntries.title")}</span>
                <span>
                  {completedPlanEntries}/{planEntries.length}
                </span>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {planEntries.map((entry) => (
                  <div key={entry.id} className="flex min-w-0 items-center gap-2 text-xs">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        entry.status === "done"
                          ? "bg-emerald-500"
                          : entry.status === "in_progress"
                            ? "bg-primary"
                            : entry.status === "skipped"
                              ? "bg-amber-500"
                              : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="text-muted-foreground shrink-0">{getPlanStatusLabel(entry.status)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            {t("sidebar.artifacts")}
          </div>
          <div className="space-y-3">
            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    {t("artifacts.plan.title")}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {creationPlan
                      ? t("artifacts.plan.entries", { count: creationPlan.entries.length })
                      : t("status.generated")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setArtifactView("plan")} disabled={!creationPlan}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t("view")}
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4" />
                    状态栏
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {statusBars?.bars.length ? `${statusBars.bars.length} 个初始状态` : t("status.generated")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setArtifactView("statusBars")}
                  disabled={!statusBars?.bars.length}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t("view")}
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" />
                    {t("artifacts.palette.title")}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {personalityPalette
                      ? t("artifacts.palette.summary", {
                          base: personalityPalette.base || t("artifacts.palette.noBase"),
                          count: personalityPalette.derivatives.length,
                        })
                      : t("status.generated")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setArtifactView("palette")}
                  disabled={!personalityPalette}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t("view")}
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    {t("artifacts.character.title")}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {draft ? draft.name : t("status.generated")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setArtifactView("character")} disabled={!draft}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t("view")}
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4" />
                    {t("artifacts.worldbook.title")}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {worldbookDraft?.entries.length
                      ? t("artifacts.worldbook.entries", { count: worldbookDraft.entries.length })
                      : t("status.generated")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setArtifactView("worldbook")}
                  disabled={!worldbookDraft?.entries.length}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t("view")}
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("artifacts.evaluation.title")}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {evaluationReport
                      ? t("artifacts.evaluation.issues", { count: evaluationReport.issues.length })
                      : t("status.evaluated")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setArtifactView("evaluation")}
                    disabled={!evaluationReport}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    {t("view")}
                  </Button>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onEvaluate}
              disabled={running || saving || (!draft && !creationPlan)}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("evaluate")}
            </Button>

            <Button className="w-full" onClick={onSave} disabled={!draft?.name.trim() || running || saving}>
              <Save className="mr-1 h-4 w-4" />
              {saving ? t("save.saving") : savedCharacterId ? t("save.update") : t("save.create")}
            </Button>

            <Button variant="outline" className="w-full" onClick={onExport} disabled={!draft?.name.trim() || running}>
              <Download className="mr-1 h-4 w-4" />
              {t("export.toFolder")}
            </Button>
          </div>
        </section>
      </div>
    </aside>
  );
}
