/**
 * Character card packaging — write Skill-compatible output to a local folder.
 */
import { getBackend } from "@/platform";
import type { NeoPersonalityPalette, NeoMvuConfig, NeoCreationPlan, NeoStatusBarConfig } from "./types";

export interface CharacterCardPack {
  project: {
    name: string;
    worldbookName?: string;
    form: "charactercard" | "worldbook";
    mvu: boolean;
    avatar?: string;
  };
  character: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    firstMessage: string;
    exampleDialogues?: string;
    tags?: string[];
    statusBars?: NeoStatusBarConfig;
  };
  personalityPalette?: NeoPersonalityPalette;
  worldbook?: {
    name?: string;
    description?: string;
    entries: Array<{
      title: string;
      keys: string;
      content: string;
      priority: number;
      type: "always" | "trigger";
      position: string;
      triggerMode: string;
      role: string;
      enabled: boolean;
      entryPath?: string;
      entryTypeName?: string;
    }>;
  };
  mvu?: NeoMvuConfig;
  statusBars?: NeoStatusBarConfig;
  creationPlan?: NeoCreationPlan;
}

/**
 * Prompt the user to choose a folder, then write the full card pack as a set of files.
 */
export async function exportPackToFolder(pack: CharacterCardPack): Promise<string | null> {
  const folder = await getBackend().file.pickFolder();
  if (!folder) return null;

  const files: Array<{ relativePath: string; content: string }> = [];

  // ── Project metadata ──
  files.push({
    relativePath: "project.json",
    content: JSON.stringify(
      {
        name: pack.project.name,
        worldbookName: pack.project.worldbookName,
        form: pack.project.form,
        mvu: pack.project.mvu,
        statusBars: !!pack.statusBars?.bars.length,
      },
      null,
      2,
    ),
  });

  // ── Character card ──
  files.push({
    relativePath: "character.json",
    content: JSON.stringify(pack.character, null, 2),
  });

  // ── Personality palette ──
  if (pack.personalityPalette) {
    files.push({
      relativePath: "personality-palette.json",
      content: JSON.stringify(pack.personalityPalette, null, 2),
    });
  }

  // ── Worldbook entries ──
  if (pack.worldbook?.entries.length) {
    for (const entry of pack.worldbook.entries) {
      const relativePath = entry.entryPath
        ? entry.entryPath
        : `worldbook/${entry.title.replace(/[/\\?%*:|"<>]/g, "_")}.json`;
      files.push({
        relativePath,
        content: JSON.stringify(entry, null, 2),
      });
    }
    if (pack.worldbook.name || pack.worldbook.description) {
      files.push({
        relativePath: "worldbook/_meta.json",
        content: JSON.stringify({ name: pack.worldbook.name, description: pack.worldbook.description }, null, 2),
      });
    }
  }

  // ── MVU ──
  if (pack.mvu) {
    files.push({
      relativePath: "mvu/schema.ts",
      content: pack.mvu.schemaTs,
    });
    if (pack.mvu.initvarYaml) {
      files.push({
        relativePath: "mvu/initvar.yaml",
        content: pack.mvu.initvarYaml,
      });
    }
    if (pack.mvu.updateRulesYaml) {
      files.push({
        relativePath: "mvu/变量更新规则.yaml",
        content: pack.mvu.updateRulesYaml,
      });
    }
  }

  // ── Agentic Play status bars ──
  if (pack.statusBars?.bars.length) {
    files.push({
      relativePath: "agentic/status-bars.json",
      content: JSON.stringify(pack.statusBars, null, 2),
    });
  }

  // ── Creation plan ──
  if (pack.creationPlan) {
    files.push({
      relativePath: "创作规划.yaml",
      content: pack.creationPlan.yaml || JSON.stringify(pack.creationPlan, null, 2),
    });
  }

  // Write all files
  for (const file of files) {
    const fullPath = `${folder.replace(/\\+$/, "")}\\${file.relativePath.replace(/\//g, "\\")}`;
    await getBackend().file.writeFileToPath(fullPath, file.content);
  }

  return folder;
}
