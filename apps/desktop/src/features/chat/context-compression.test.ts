import { afterEach, describe, expect, it } from "vitest";
import type { Message } from "@neo-tavern/shared";
import { hashMessages } from "./memory";
import { buildStoredContextCompressionPromptPlan } from "./context-compression";

const CHAT_MEMORY_STORAGE_KEY = "data:chat-memories";

function message(role: Message["role"], content: string, index: number, roundIndex?: number): Message {
  return {
    id: `msg-${index}`,
    chatId: "chat-1",
    parentId: index > 0 ? `msg-${index - 1}` : null,
    role,
    content,
    roundIndex,
    createdAt: new Date(index).toISOString(),
  };
}

describe("buildStoredContextCompressionPromptPlan", () => {
  afterEach(() => {
    localStorage.removeItem(CHAT_MEMORY_STORAGE_KEY);
  });

  it("puts cached compression back into chat history instead of a context block", async () => {
    const messages = Array.from({ length: 7 }).flatMap((_, index) => [
      message("user", `user ${index + 1}`, index * 2),
      message("assistant", `assistant ${index + 1}`, index * 2 + 1, index + 1),
    ]);
    const compressedSource = messages.slice(0, 4);
    const summary = "【压缩上下文】前两轮剧情摘要。";

    localStorage.setItem(
      CHAT_MEMORY_STORAGE_KEY,
      JSON.stringify([
        {
          chatId: "chat-1",
          summary,
          sourceHash: hashMessages(compressedSource),
          sourceMessageCount: compressedSource.length,
          updatedAt: "2026-06-19T00:00:00.000Z",
        },
      ]),
    );

    const plan = await buildStoredContextCompressionPromptPlan("chat-1", messages);

    expect(plan.memoryBlock).toBeNull();
    expect(plan.compressedMessageCount).toBe(4);
    expect(plan.recentMessages[0]).toMatchObject({
      id: "context-compression-summary-chat-1",
      role: "system",
      content: summary,
      hidden: true,
    });
    expect(plan.recentMessages.slice(1).map((item) => item.content)).toEqual([
      "user 3",
      "assistant 3",
      "user 4",
      "assistant 4",
      "user 5",
      "assistant 5",
      "user 6",
      "assistant 6",
      "user 7",
      "assistant 7",
    ]);
  });
});
