import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@neo-tavern/shared";
import { useSettingsStore } from "@/features/settings/settings.store";
import { buildMemoryPromptPlan } from "./memory-planner";

const repositoryMocks = vi.hoisted(() => ({
  getMemory: vi.fn(),
  upsertMemory: vi.fn(),
  createSecondaryUsage: vi.fn(),
  getModelConfig: vi.fn(),
}));

vi.mock("@/db/repositories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/repositories")>();
  return {
    ...actual,
    chatMemoryRepository: {
      ...actual.chatMemoryRepository,
      get: repositoryMocks.getMemory,
      upsert: repositoryMocks.upsertMemory,
    },
    secondaryApiUsageRepository: {
      ...actual.secondaryApiUsageRepository,
      create: repositoryMocks.createSecondaryUsage,
    },
    settingsRepository: {
      ...actual.settingsRepository,
      getModelConfig: repositoryMocks.getModelConfig,
    },
  };
});

function createMessage(id: string, role: Message["role"], content: string): Message {
  return {
    id,
    chatId: "chat-1",
    parentId: null,
    role,
    content,
    createdAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
  };
}

describe("memory planner", () => {
  beforeEach(() => {
    repositoryMocks.getMemory.mockReset();
    repositoryMocks.upsertMemory.mockReset();
    repositoryMocks.createSecondaryUsage.mockReset();
    repositoryMocks.getModelConfig.mockReset();
    repositoryMocks.getMemory.mockResolvedValue(null);
    useSettingsStore.setState({
      lightweightMemoryEnabled: true,
      promptRecentTurns: 1,
      memorySummaryMaxChars: 1200,
      memoryCompressorConfigId: null,
    });
  });

  it("returns the original history when lightweight memory is disabled", async () => {
    useSettingsStore.setState({ lightweightMemoryEnabled: false });
    const historyMessages = [createMessage("m1", "user", "hello"), createMessage("m2", "assistant", "hi")];

    const plan = await buildMemoryPromptPlan({
      historyMessages,
      targetChatId: "chat-1",
      stripMessages: vi.fn((messages) => messages),
    });

    expect(plan).toEqual({ recentMessages: historyMessages, memoryBlock: null });
    expect(repositoryMocks.getMemory).not.toHaveBeenCalled();
  });

  it("creates a local memory segment and keeps only recent turns in prompt history", async () => {
    const historyMessages = [
      createMessage("m1", "user", "开局设定"),
      createMessage("m2", "assistant", "旧剧情回复"),
      createMessage("m3", "user", "最近输入"),
      createMessage("m4", "assistant", "最近回复"),
    ];
    const stripMessages = vi.fn((messages: Message[]) =>
      messages.map((message) =>
        message.role === "assistant" ? { ...message, content: `stripped:${message.content}` } : message,
      ),
    );

    const plan = await buildMemoryPromptPlan({
      historyMessages,
      targetChatId: "chat-1",
      stripMessages,
    });

    expect(plan.recentMessages.map((message) => message.id)).toEqual(["m3", "m4"]);
    expect(plan.memoryBlock).toEqual(expect.objectContaining({ id: "chat-memory-summary", source: "memory" }));
    expect(plan.memoryBlock?.content).toContain("开局设定");
    expect(plan.memoryBlock?.content).toContain("stripped:旧剧情回复");
    expect(stripMessages).toHaveBeenCalledWith(historyMessages.slice(0, 2));
    expect(repositoryMocks.upsertMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        sourceMessageCount: 2,
        compressionMode: "local",
        memorySummaryMaxChars: 1200,
      }),
    );
  });
});
