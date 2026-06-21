import { describe, expect, it, vi } from "vitest";
import { getBackend } from "@/platform";
import { messageRepository } from "../message.repository";

describe("message SQLite import", () => {
  it("reads the canonical data namespace and retains it after a successful import", async () => {
    const raw = JSON.stringify([
      {
        id: "message-1",
        chatId: "chat-1",
        parentId: null,
        role: "user",
        content: "hello",
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    ]);
    localStorage.setItem("data:messages", raw);
    const backend = getBackend();
    vi.mocked(backend.db.initMessages).mockResolvedValueOnce(undefined);
    vi.mocked(backend.db.listMessages).mockResolvedValueOnce([]);

    await messageRepository.listByChatId("chat-1");

    expect(backend.db.initMessages).toHaveBeenCalledWith(raw);
    expect(localStorage.getItem("data:messages")).toBe(raw);
  });
});
