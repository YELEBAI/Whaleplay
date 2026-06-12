import { describe, it, expect } from "vitest";
import { fingerprintMessage, diffTreesById, diffTreesByContent } from "../tree-diff";
import type { Message } from "@neo-tavern/shared";

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    chatId: "chat-1",
    parentId: null,
    role: "user",
    content: "Hello",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("fingerprintMessage", () => {
  it("includes chatId, role, and first 300 chars of content", () => {
    const msg = makeMsg({
      id: "m1",
      chatId: "chat-abc",
      role: "assistant",
      content: "This is a test message.",
    });
    const fp = fingerprintMessage(msg);
    expect(fp).toBe("chat-abc:assistant:This is a test message.");
  });

  it("trims whitespace from content", () => {
    const msg = makeMsg({
      id: "m1",
      chatId: "chat-1",
      role: "user",
      content: "   padded content   ",
    });
    const fp = fingerprintMessage(msg);
    expect(fp).toBe("chat-1:user:padded content");
  });

  it("truncates content to 300 chars", () => {
    const longContent = "A".repeat(500);
    const msg = makeMsg({
      id: "m1",
      chatId: "chat-1",
      role: "user",
      content: longContent,
    });
    const fp = fingerprintMessage(msg);
    expect(fp.length).toBeLessThanOrEqual("chat-1:user:".length + 300);
    expect(fp).toBe(`chat-1:user:${"A".repeat(300)}`);
  });

  it("produces different fingerprints for different roles", () => {
    const msgUser = makeMsg({ id: "m1", role: "user", content: "Same text" });
    const msgAsst = makeMsg({ id: "m2", role: "assistant", content: "Same text" });
    expect(fingerprintMessage(msgUser)).not.toBe(fingerprintMessage(msgAsst));
  });

  it("produces different fingerprints for different chatIds", () => {
    const msgA = makeMsg({ id: "m1", chatId: "chat-a", content: "Same text" });
    const msgB = makeMsg({ id: "m2", chatId: "chat-b", content: "Same text" });
    expect(fingerprintMessage(msgA)).not.toBe(fingerprintMessage(msgB));
  });
});

describe("diffTreesById", () => {
  it("identifies shared messages by ID", () => {
    const a = [makeMsg({ id: "1", content: "Hello" })];
    const b = [makeMsg({ id: "1", content: "Hello" })];
    const result = diffTreesById(a, b);
    expect(result.shared).toHaveLength(1);
    expect(result.shared[0].id).toBe("1");
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
  });

  it("identifies messages only in tree A", () => {
    const a = [makeMsg({ id: "1", content: "A only" }), makeMsg({ id: "2", content: "Shared" })];
    const b = [makeMsg({ id: "2", content: "Shared" })];
    const result = diffTreesById(a, b);
    expect(result.shared).toHaveLength(1);
    expect(result.onlyInA).toHaveLength(1);
    expect(result.onlyInA[0].id).toBe("1");
    expect(result.onlyInB).toHaveLength(0);
  });

  it("identifies messages only in tree B", () => {
    const a = [makeMsg({ id: "1", content: "Shared" })];
    const b = [makeMsg({ id: "1", content: "Shared" }), makeMsg({ id: "2", content: "B only" })];
    const result = diffTreesById(a, b);
    expect(result.shared).toHaveLength(1);
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(1);
    expect(result.onlyInB[0].id).toBe("2");
  });

  it("detects divergence points when B has children under shared parent", () => {
    const a = [makeMsg({ id: "root", content: "Root" }), makeMsg({ id: "1", content: "A child", parentId: "root" })];
    const b = [makeMsg({ id: "root", content: "Root" }), makeMsg({ id: "2", content: "B child", parentId: "root" })];
    const result = diffTreesById(a, b);
    expect(result.divergencePoints).toContain("root");
  });

  it("does not report divergence when parent is also only in B", () => {
    const a = [makeMsg({ id: "1", content: "A root" })];
    const b = [makeMsg({ id: "2", content: "B root" }), makeMsg({ id: "3", content: "B child", parentId: "2" })];
    const result = diffTreesById(a, b);
    expect(result.divergencePoints).toHaveLength(0);
  });

  it("handles empty trees", () => {
    const result = diffTreesById([], []);
    expect(result.shared).toHaveLength(0);
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
    expect(result.divergencePoints).toHaveLength(0);
  });

  it("handles completely disjoint trees", () => {
    const a = [makeMsg({ id: "1", content: "A1" }), makeMsg({ id: "2", content: "A2" })];
    const b = [makeMsg({ id: "3", content: "B1" }), makeMsg({ id: "4", content: "B2" })];
    const result = diffTreesById(a, b);
    expect(result.shared).toHaveLength(0);
    expect(result.onlyInA).toHaveLength(2);
    expect(result.onlyInB).toHaveLength(2);
    expect(result.divergencePoints).toHaveLength(0);
  });
});

describe("diffTreesByContent", () => {
  it("matches messages with identical content", () => {
    const current = [makeMsg({ id: "old-1", content: "Hello world" })];
    const incoming = [makeMsg({ id: "new-1", content: "Hello world" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(1);
    expect(result.shared[0].id).toBe("old-1");
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
  });

  it("matches messages with content prefix match (first 300 chars)", () => {
    const body = "A".repeat(500);
    const current = [makeMsg({ id: "old-1", content: body })];
    const incoming = [makeMsg({ id: "new-1", content: body })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(1);
  });

  it("identifies incoming messages with no content match as onlyInB", () => {
    const current = [makeMsg({ id: "old-1", content: "Existing" })];
    const incoming = [makeMsg({ id: "new-1", content: "New message" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(0);
    expect(result.onlyInA).toHaveLength(1);
    expect(result.onlyInB).toHaveLength(1);
  });

  it("identifies current messages not matched as onlyInA", () => {
    const current = [makeMsg({ id: "old-1", content: "Matched" }), makeMsg({ id: "old-2", content: "Unmatched" })];
    const incoming = [makeMsg({ id: "new-1", content: "Matched" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(1);
    expect(result.onlyInA).toHaveLength(1);
    expect(result.onlyInA[0].id).toBe("old-2");
    expect(result.onlyInB).toHaveLength(0);
  });

  it("handles multiple messages with the same fingerprint", () => {
    const current = [makeMsg({ id: "old-1", content: "Repeat" }), makeMsg({ id: "old-2", content: "Repeat" })];
    const incoming = [makeMsg({ id: "new-1", content: "Repeat" }), makeMsg({ id: "new-2", content: "Repeat" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(2);
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
  });

  it("handles more incoming than current for same fingerprint", () => {
    const current = [makeMsg({ id: "old-1", content: "Repeat" })];
    const incoming = [makeMsg({ id: "new-1", content: "Repeat" }), makeMsg({ id: "new-2", content: "Repeat" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(1);
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(1);
  });

  it("detects divergence when incoming-only messages have parent in shared", () => {
    const current = [
      makeMsg({ id: "root", content: "Root" }),
      makeMsg({ id: "a1", content: "A child", parentId: "root" }),
    ];
    const incoming = [
      makeMsg({ id: "root", content: "Root" }),
      makeMsg({ id: "b1", content: "B child", parentId: "root" }),
    ];
    const result = diffTreesByContent(current, incoming);
    expect(result.divergencePoints).toContain("root");
  });

  it("handles empty trees", () => {
    const result = diffTreesByContent([], []);
    expect(result.shared).toHaveLength(0);
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
    expect(result.divergencePoints).toHaveLength(0);
  });

  it("handles completely disjoint trees with no overlap", () => {
    const current = [makeMsg({ id: "1", content: "Alpha" }), makeMsg({ id: "2", content: "Beta" })];
    const incoming = [makeMsg({ id: "3", content: "Gamma" }), makeMsg({ id: "4", content: "Delta" })];
    const result = diffTreesByContent(current, incoming);
    expect(result.shared).toHaveLength(0);
    expect(result.onlyInA).toHaveLength(2);
    expect(result.onlyInB).toHaveLength(2);
    expect(result.divergencePoints).toHaveLength(0);
  });

  it("matches by role and content concurrently", () => {
    const current = [
      makeMsg({ id: "1", role: "user", content: "Hello" }),
      makeMsg({ id: "2", role: "assistant", content: "Hello" }),
    ];
    const incoming = [makeMsg({ id: "3", role: "user", content: "Hello" })];
    const result = diffTreesByContent(current, incoming);
    // Only the user message should match
    expect(result.shared).toHaveLength(1);
    expect(result.shared[0].id).toBe("1");
    expect(result.onlyInA).toHaveLength(1);
    expect(result.onlyInA[0].id).toBe("2");
    expect(result.onlyInB).toHaveLength(0);
  });
});
