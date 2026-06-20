import { beforeEach, describe, expect, it } from "vitest";
import {
  readBuilderWorkspaceRecords,
  readBuilderWorkspaceSnapshot,
  writeBuilderWorkspaceRecords,
  writeBuilderWorkspaceSnapshot,
} from "./utils";
import type { BuilderWorkspaceRecord, BuilderWorkspaceSnapshot } from "./types";

function snapshot(): BuilderWorkspaceSnapshot {
  return {
    targetId: "__new__",
    messages: [],
    input: "persist me",
    webSearchEnabled: false,
    lastResult: null,
    draft: null,
    worldbookDraft: null,
    creationPlan: null,
    personalityPalette: null,
    evaluationReport: null,
    mvu: null,
    statusBars: null,
    savedCharacterId: null,
    builderSessionId: "session-1",
  };
}

describe("Builder device persistence", () => {
  beforeEach(() => localStorage.clear());

  it("reads a workspace back from the same device key it writes", async () => {
    const value = snapshot();
    await writeBuilderWorkspaceSnapshot(value);
    expect(readBuilderWorkspaceSnapshot()).toMatchObject({ input: "persist me", builderSessionId: "session-1" });
  });

  it("reads workspace records back from the same device key it writes", async () => {
    const record: BuilderWorkspaceRecord = {
      ...snapshot(),
      id: "record-1",
      title: "Draft",
      updatedAt: "2026-06-19T00:00:00.000Z",
    };
    await writeBuilderWorkspaceRecords([record]);
    expect(readBuilderWorkspaceRecords()).toHaveLength(1);
    expect(readBuilderWorkspaceRecords()[0]).toMatchObject({ id: "record-1", input: "persist me" });
  });

  it("reads the scoped device workspace key", () => {
    localStorage.setItem("device:builder-workspace", JSON.stringify(snapshot()));
    expect(readBuilderWorkspaceSnapshot()).toMatchObject({ input: "persist me" });
  });
});
