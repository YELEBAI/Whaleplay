import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChatStore } from "@/features/chat/chat.store";
import type { Chat, Message } from "@neo-tavern/shared";
import { buildBranchSummaries, useBranchNavigation } from "./useBranchNavigation";

const chat: Chat = {
  id: "chat-1",
  characterId: "character-1",
  title: "Test chat",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function makeMessage(overrides: Partial<Message> & { id: string; content: string }): Message {
  return {
    chatId: "chat-1",
    parentId: null,
    role: "user",
    createdAt: `2024-01-01T00:00:0${overrides.id.length}.000Z`,
    ...overrides,
  };
}

afterEach(() => {
  useChatStore.setState({
    currentChat: null,
    messages: [],
    messagesHydrated: true,
    activeLeafId: null,
  });
});

describe("buildBranchSummaries", () => {
  it("returns no branch summaries for a linear conversation", () => {
    const messages = [
      makeMessage({ id: "m1", content: "Hello" }),
      makeMessage({ id: "m2", role: "assistant", parentId: "m1", content: "Hi" }),
    ];

    expect(buildBranchSummaries(messages, null)).toEqual([]);
  });

  it("builds summaries for leaf branches and marks the active branch", () => {
    const messages = [
      makeMessage({ id: "root", content: "Question" }),
      makeMessage({ id: "a1", role: "assistant", parentId: "root", content: "Answer A" }),
      makeMessage({ id: "b1", role: "assistant", parentId: "root", content: "Answer B" }),
    ];

    const summaries = buildBranchSummaries(messages, "b1");

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.leafId)).toEqual(["a1", "b1"]);
    expect(summaries.find((summary) => summary.leafId === "b1")?.isActive).toBe(true);
    expect(summaries[0].forkPreview).toBe("Question");
    expect(summaries[0].forkMessageIndex).toBe(1);
  });

  it("ignores hidden messages in counts and previews", () => {
    const messages = [
      makeMessage({ id: "root", content: "Question" }),
      makeMessage({ id: "a1", role: "assistant", parentId: "root", content: "Answer A" }),
      makeMessage({ id: "hidden", parentId: "root", hidden: true, content: "Hidden action" }),
      makeMessage({ id: "b1", role: "assistant", parentId: "hidden", content: "Answer B" }),
    ];

    const summaries = buildBranchSummaries(messages, "b1");
    const branch = summaries.find((summary) => summary.leafId === "b1");

    expect(branch?.messageCount).toBe(2);
    expect(branch?.forkMessageIndex).toBe(1);
    expect(branch?.lastMessagePreview).toBe("Answer B");
  });
});

describe("useBranchNavigation", () => {
  it("returns visible messages from the default active path", () => {
    useChatStore.setState({
      currentChat: chat,
      messages: [
        makeMessage({ id: "m1", content: "Hello" }),
        makeMessage({ id: "m2", role: "assistant", parentId: "m1", content: "Hi" }),
      ],
      messagesHydrated: true,
      activeLeafId: null,
    });

    const { result } = renderHook(() => useBranchNavigation("chat-1"));

    expect(result.current.hasBranches).toBe(false);
    expect(result.current.visibleMessages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("switches visible messages when the active branch changes", () => {
    useChatStore.setState({
      currentChat: chat,
      messages: [
        makeMessage({ id: "root", content: "Question" }),
        makeMessage({ id: "a1", role: "assistant", parentId: "root", content: "Answer A" }),
        makeMessage({ id: "b1", role: "assistant", parentId: "root", content: "Answer B" }),
      ],
      messagesHydrated: true,
      activeLeafId: "a1",
    });

    const { result, rerender } = renderHook(() => useBranchNavigation("chat-1"));
    expect(result.current.visibleMessages.map((message) => message.id)).toEqual(["root", "a1"]);

    result.current.switchBranch("b1");
    rerender();

    expect(result.current.hasBranches).toBe(true);
    expect(result.current.visibleMessages.map((message) => message.id)).toEqual(["root", "b1"]);
  });
});
