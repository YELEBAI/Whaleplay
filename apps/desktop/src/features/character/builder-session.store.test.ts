import { describe, expect, it } from "vitest";
import { builderSessions } from "./builder-session.store";
import type { BuilderMessage } from "@/pages/neo-builder/types";

function makeMessage(id: string): BuilderMessage {
  return {
    id,
    role: "assistant",
    content: `message ${id}`,
  };
}

describe("BuilderSessionStore snapshots", () => {
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
});
