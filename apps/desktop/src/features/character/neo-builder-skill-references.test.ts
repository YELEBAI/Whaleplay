import { describe, expect, it } from "vitest";
import {
  NEO_BUILDER_REFERENCE_TEXTS,
  listNeoBuilderSkillReferences,
  readNeoBuilderSkillReference,
} from "./neo-builder-skill-references";

describe("Whale Builder skill references", () => {
  it("loads the workflow from the extracted SKILL.md file", () => {
    const workflow = readNeoBuilderSkillReference("workflow");

    expect(workflow?.id).toBe("SKILL.md");
    expect(workflow?.content).toContain("# Whale Play 角色卡与世界书编写");
    expect(workflow?.content).toContain("references/requirements.md");
  });

  it("keeps aliases and legacy text export working", () => {
    const palette = readNeoBuilderSkillReference("personality-palette");
    const searchResults = listNeoBuilderSkillReferences("worldbook");

    expect(palette?.id).toBe("references/contents-creation/character/personality-palette.md");
    expect(NEO_BUILDER_REFERENCE_TEXTS["neo-workflow"]).toBe(NEO_BUILDER_REFERENCE_TEXTS["SKILL.md"]);
    expect(searchResults.some((reference) => reference.id === "references/contents-creation/worldbook.md")).toBe(true);
  });
});
