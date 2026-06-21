import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderSessions } from "./builder-session.store";
import type { BuilderMessage } from "@/pages/neo-builder/types";
import type { NeoBuilderTurnResult } from "@/features/character/neo-character-builder";

const mocks = vi.hoisted(() => ({
  runTurn: vi.fn(),
}));

vi.mock("@/features/settings/settings.store", () => ({
  useSettingsStore: {
    getState: () => ({ modelConfig: { provider: "test" } }),
  },
}));

vi.mock("@/features/character/neo-character-builder", () => ({
  runNeoCharacterBuilderTurn: mocks.runTurn,
}));

function makeMessage(id: string): BuilderMessage {
  return {
    id,
    role: "assistant",
    content: `message ${id}`,
  };
}

describe("BuilderSessionStore snapshots", () => {
  beforeEach(() => mocks.runTurn.mockReset());

  it("returns a stable snapshot reference until the session changes", () => {
    const sessionId = `snapshot-stability-${Date.now()}`;

    const first = builderSessions.getSnapshot(sessionId);
    const second = builderSessions.getSnapshot(sessionId);

    expect(second).toBe(first);

    builderSessions.setMessages(sessionId, [makeMessage("one")]);
    const afterSet = builderSessions.getSnapshot(sessionId);

    expect(afterSet).not.toBe(first);
    expect(builderSessions.getSnapshot(sessionId)).toBe(afterSet);

    builderSessions.restore(sessionId, [makeMessage("restored")]);
    const afterRestore = builderSessions.getSnapshot(sessionId);

    expect(afterRestore).not.toBe(afterSet);
    expect(builderSessions.getSnapshot(sessionId)).toBe(afterRestore);
  });

  it("restores a completed result without treating it as a new turn", () => {
    const sessionId = `snapshot-result-${Date.now()}`;
    const result = { content: "done" } as NeoBuilderTurnResult;

    builderSessions.restore(sessionId, [makeMessage("restored")], result);
    const snapshot = builderSessions.getSnapshot(sessionId);

    expect(snapshot.lastResult).toBe(result);
    expect(snapshot.resultVersion).toBe(0);
  });

  it("publishes a completed background result through the session snapshot", async () => {
    const sessionId = `background-result-${Date.now()}`;
    const result = { content: "done" } as unknown as NeoBuilderTurnResult;
    mocks.runTurn.mockResolvedValueOnce(result);

    await expect(
      builderSessions.sendMessage(sessionId, "build a character", false, {
        draft: null,
        worldbookDraft: null,
        creationPlan: null,
        personalityPalette: null,
        mvu: null,
        statusBars: null,
      }),
    ).resolves.toBe(result);

    const snapshot = builderSessions.getSnapshot(sessionId);
    expect(snapshot.running).toBe(false);
    expect(snapshot.lastResult).toBe(result);
    expect(snapshot.resultVersion).toBe(1);
  });

  it("marks a pending message stopped after an explicit abort", async () => {
    const sessionId = `background-abort-${Date.now()}`;
    mocks.runTurn.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
    );

    const task = builderSessions.sendMessage(sessionId, "build a character", false, {
      draft: null,
      worldbookDraft: null,
      creationPlan: null,
      personalityPalette: null,
      mvu: null,
      statusBars: null,
    });
    await vi.waitFor(() => expect(builderSessions.getSnapshot(sessionId).running).toBe(true));

    builderSessions.abort(sessionId);
    await expect(task).resolves.toBeNull();

    const snapshot = builderSessions.getSnapshot(sessionId);
    expect(snapshot.running).toBe(false);
    expect(snapshot.messages.at(-1)).toMatchObject({ pending: false, content: "生成已停止。" });
  });
});
