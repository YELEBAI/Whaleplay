import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { exportPackToFolder, type CharacterCardPack } from "@/features/character/neo-character-builder";
import { toast } from "@/utils/toast";

import type {
  CreateCharacterInput,
  WorldbookDraft,
  NeoStatusBarConfig,
  NeoPersonalityPalette,
  NeoCreationPlan,
  NeoMvuConfig,
  NeoBuilderTurnResult,
} from "../types";

interface UseBuilderExportOptions {
  draft: CreateCharacterInput | null;
  worldbookDraft: WorldbookDraft | null;
  statusBars: NeoStatusBarConfig | null;
  personalityPalette: NeoPersonalityPalette | null;
  creationPlan: NeoCreationPlan | null;
  mvu: NeoMvuConfig | null;
  lastResult: NeoBuilderTurnResult | null;
}

export function useBuilderExport(opts: UseBuilderExportOptions) {
  const { draft, worldbookDraft, statusBars, personalityPalette, creationPlan, mvu, lastResult } = opts;
  const { t } = useTranslation("neo-builder");

  const handleExport = useCallback(async () => {
    if (!draft?.name.trim()) return;
    const pack: CharacterCardPack = {
      project: {
        name: draft.name,
        worldbookName: worldbookDraft?.name,
        form: "charactercard",
        mvu: !!mvu,
      },
      character: {
        name: draft.name,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        firstMessage: draft.firstMessage,
        exampleDialogues: draft.exampleDialogues,
        tags: draft.tags,
        statusBars: statusBars ?? draft.statusBars,
      },
      personalityPalette: personalityPalette ?? undefined,
      worldbook: worldbookDraft?.entries.length
        ? {
            name: worldbookDraft.name,
            description: worldbookDraft.description,
            entries: worldbookDraft.entries.map((e) => ({
              ...e,
              position: e.position ?? (e.type === "always" ? "beforeHistory" : "afterHistory"),
              role: e.role ?? "system",
            })),
          }
        : undefined,
      mvu: mvu ?? lastResult?.mvu ?? undefined,
      statusBars: statusBars ?? draft.statusBars ?? undefined,
      creationPlan: creationPlan ?? undefined,
    };

    try {
      const folder = await exportPackToFolder(pack);
      if (folder) toast("success", t("export.success", { folder }));
    } catch (err) {
      toast("error", (err as Error).message || t("export.failed"));
    }
  }, [draft, worldbookDraft, statusBars, personalityPalette, creationPlan, mvu, lastResult, t]);

  return { handleExport };
}
