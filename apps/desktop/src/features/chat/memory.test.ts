import { describe, expect, it } from "vitest";
import type { Message } from "@neo-tavern/shared";
import { splitMessagesByRecentAssistantTurns } from "./memory";

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

describe("splitMessagesByRecentAssistantTurns", () => {
  it("keeps the most recent five assistant-anchored turns", () => {
    const messages = Array.from({ length: 7 }).flatMap((_, index) => [
      message("user", `user ${index + 1}`, index * 2),
      message("assistant", `assistant ${index + 1}`, index * 2 + 1),
    ]);

    const result = splitMessagesByRecentAssistantTurns(messages, 5);

    expect(result.memoryMessages.map((item) => item.content)).toEqual(["user 1", "assistant 1", "user 2", "assistant 2"]);
    expect(result.recentMessages.map((item) => item.content)).toEqual([
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

  it("does not split when there are five or fewer assistant replies", () => {
    const messages = Array.from({ length: 5 }).flatMap((_, index) => [
      message("user", `user ${index + 1}`, index * 2),
      message("assistant", `assistant ${index + 1}`, index * 2 + 1),
    ]);

    const result = splitMessagesByRecentAssistantTurns(messages, 5);

    expect(result.memoryMessages).toEqual([]);
    expect(result.recentMessages).toEqual(messages);
  });

  it("uses persisted roundIndex when assistant messages have stable indexes", () => {
    const messages = Array.from({ length: 8 }).flatMap((_, index) => [
      message("user", `user ${index + 1}`, index * 2),
      message("assistant", `assistant ${index + 1}`, index * 2 + 1, index + 10),
    ]);

    const result = splitMessagesByRecentAssistantTurns(messages, 5);

    expect(result.memoryMessages.map((item) => item.content)).toEqual([
      "user 1",
      "assistant 1",
      "user 2",
      "assistant 2",
      "user 3",
      "assistant 3",
    ]);
    expect(result.recentMessages.map((item) => item.content)).toEqual([
      "user 4",
      "assistant 4",
      "user 5",
      "assistant 5",
      "user 6",
      "assistant 6",
      "user 7",
      "assistant 7",
      "user 8",
      "assistant 8",
    ]);
  });
});
