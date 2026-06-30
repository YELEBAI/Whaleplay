import { describe, expect, it, vi } from "vitest";
import { createContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { HEALTHY_MODE_BLOCKED_PLACEHOLDER } from "@/features/content-policy/healthy-mode";
import { finalizeAssistantTurn, FLOOD_GUARD_STOP_MESSAGE, handleTurnError } from "./turn-finalizer";

describe("turn finalizer", () => {
  it("runs completion effects and clears an empty streaming draft", async () => {
    const patchMessage = vi.fn();
    const removeEmptyStreamingDraft = vi.fn(async () => {});
    const runAutoImageGeneration = vi.fn();
    const notifyComplete = vi.fn();

    const status = await finalizeAssistantTurn({
      chatId: "chat-1",
      assistantId: "assistant-1",
      characterName: "角色",
      finalContent: "正常回复。",
      contentPolicy: createContentPolicySnapshot("normal"),
      isCurrent: () => true,
      isGenerationActive: () => true,
      patchMessage,
      removeEmptyStreamingDraft,
      setChatError: vi.fn(),
      runAutoImageGeneration,
      notifyComplete,
    });

    expect(status).toBe("completed");
    expect(patchMessage).not.toHaveBeenCalled();
    expect(notifyComplete).toHaveBeenCalledWith("角色");
    expect(runAutoImageGeneration).toHaveBeenCalledTimes(1);
    expect(removeEmptyStreamingDraft).toHaveBeenCalledWith("assistant-1");
  });

  it("blocks explicit healthy-mode output before image generation", async () => {
    const patchMessage = vi.fn(async () => {});
    const setChatError = vi.fn();
    const removeEmptyStreamingDraft = vi.fn(async () => {});
    const runAutoImageGeneration = vi.fn();
    const notifyComplete = vi.fn();

    const status = await finalizeAssistantTurn({
      chatId: "chat-1",
      assistantId: "assistant-1",
      finalContent: "她的阴蒂被轻轻触碰",
      contentPolicy: createContentPolicySnapshot("healthy"),
      isCurrent: () => true,
      isGenerationActive: () => true,
      patchMessage,
      removeEmptyStreamingDraft,
      setChatError,
      runAutoImageGeneration,
      notifyComplete,
    });

    expect(status).toBe("blocked");
    expect(patchMessage).toHaveBeenCalledWith("assistant-1", {
      content: HEALTHY_MODE_BLOCKED_PLACEHOLDER,
      reasoningContent: undefined,
    });
    expect(setChatError).toHaveBeenCalledWith("chat-1", "健康模式：检测到不当内容，回复已被拦截。");
    expect(notifyComplete).toHaveBeenCalled();
    expect(runAutoImageGeneration).not.toHaveBeenCalled();
    expect(removeEmptyStreamingDraft).toHaveBeenCalledWith("assistant-1");
  });

  it("only clears the draft for stale or aborted turns", async () => {
    const removeEmptyStreamingDraft = vi.fn(async () => {});
    const status = await finalizeAssistantTurn({
      chatId: "chat-1",
      assistantId: "assistant-1",
      finalContent: "Late reply.",
      contentPolicy: createContentPolicySnapshot("normal"),
      isCurrent: () => false,
      isGenerationActive: () => true,
      patchMessage: vi.fn(),
      removeEmptyStreamingDraft,
      setChatError: vi.fn(),
      runAutoImageGeneration: vi.fn(),
      notifyComplete: vi.fn(),
    });

    expect(status).toBe("stale");
    expect(removeEmptyStreamingDraft).toHaveBeenCalledWith("assistant-1");
  });

  it("maps turn errors to user-facing chat errors", () => {
    const setChatError = vi.fn();
    const floodError = new Error("");
    floodError.name = "FloodGuardAbortError";

    handleTurnError({
      chatId: "chat-1",
      error: floodError,
      isCurrent: () => true,
      aborted: false,
      fallbackMessage: "Fallback",
      setChatError,
    });
    expect(setChatError).toHaveBeenLastCalledWith("chat-1", FLOOD_GUARD_STOP_MESSAGE);

    const abortError = new Error("stop");
    abortError.name = "AbortError";
    handleTurnError({
      chatId: "chat-1",
      error: abortError,
      isCurrent: () => true,
      aborted: false,
      fallbackMessage: "Fallback",
      setChatError,
    });
    expect(setChatError).toHaveBeenLastCalledWith("chat-1", "Generation stopped");

    handleTurnError({
      chatId: "chat-1",
      error: new Error("Provider failed"),
      isCurrent: () => true,
      aborted: false,
      fallbackMessage: "Fallback",
      setChatError,
    });
    expect(setChatError).toHaveBeenLastCalledWith("chat-1", "Provider failed");
  });
});
