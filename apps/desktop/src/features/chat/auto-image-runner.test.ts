import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelConfig } from "@neo-tavern/shared";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "@/features/image-generation/image-generation";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useChatStore } from "./chat.store";
import { runAutoImageGeneration } from "./auto-image-runner";

const imageGenerationMocks = vi.hoisted(() => ({
  generateComfyImage: vi.fn(),
  planImageMarkersWithModel: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  createSecondaryUsage: vi.fn(),
}));

vi.mock("@/features/image-generation/image-generation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/image-generation/image-generation")>();
  return {
    ...actual,
    generateComfyImage: imageGenerationMocks.generateComfyImage,
    planImageMarkersWithModel: imageGenerationMocks.planImageMarkersWithModel,
  };
});

vi.mock("@/db/repositories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/repositories")>();
  return {
    ...actual,
    secondaryApiUsageRepository: {
      ...actual.secondaryApiUsageRepository,
      create: repositoryMocks.createSecondaryUsage,
    },
  };
});

function createModelConfig(): ModelConfig {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "planner-1",
    provider: "openai-compatible",
    name: "Planner",
    baseUrl: "https://example.test",
    apiKey: "key",
    model: "planner-model",
    temperature: 0.2,
    maxTokens: 1024,
    createdAt: now,
    updatedAt: now,
  };
}

function enableAutoImageGeneration(patch: Partial<typeof DEFAULT_IMAGE_GENERATION_SETTINGS> = {}) {
  useSettingsStore.setState({
    imageGeneration: {
      ...DEFAULT_IMAGE_GENERATION_SETTINGS,
      enabled: true,
      mode: "auto",
      comfyWorkflowJson: '{"1":{"class_type":"SaveImage","inputs":{}}}',
      maxImages: 2,
      ...patch,
    },
  });
}

describe("auto image runner", () => {
  beforeEach(() => {
    imageGenerationMocks.generateComfyImage.mockReset();
    imageGenerationMocks.planImageMarkersWithModel.mockReset();
    repositoryMocks.createSecondaryUsage.mockReset();
    useChatStore.setState({ messages: [] });
    enableAutoImageGeneration();
  });

  it("creates generating placeholders and completes image markers already in content", async () => {
    imageGenerationMocks.generateComfyImage.mockResolvedValue("data:image/png;base64,done");
    const patchMessage = vi.fn(async (messageId, patch) => {
      const existing = useChatStore.getState().messages.find((message) => message.id === messageId);
      if (existing) {
        useChatStore.setState({
          messages: useChatStore
            .getState()
            .messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
        });
      }
    });
    useChatStore.setState({
      messages: [
        {
          id: "assistant-1",
          chatId: "chat-1",
          parentId: null,
          role: "assistant",
          content: "[image]a silver key[/image]",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await runAutoImageGeneration({
      chatId: "chat-1",
      assistantId: "assistant-1",
      content: "[image]a silver key[/image]",
      patchMessage,
      setChatError: vi.fn(),
      resolvePlannerConfig: vi.fn(),
      getWorldbookReferences: vi.fn(),
    });

    expect(imageGenerationMocks.generateComfyImage).toHaveBeenCalledWith(
      "a silver key",
      expect.objectContaining({ mode: "auto" }),
      expect.any(AbortSignal),
    );
    expect(patchMessage).toHaveBeenCalledWith(
      "assistant-1",
      expect.objectContaining({
        images: [expect.objectContaining({ prompt: "a silver key", status: "generating" })],
      }),
    );
    expect(patchMessage).toHaveBeenLastCalledWith(
      "assistant-1",
      expect.objectContaining({
        images: [expect.objectContaining({ prompt: "a silver key", status: "done" })],
      }),
    );
  });

  it("uses the planner when no image markers exist and records planner usage", async () => {
    enableAutoImageGeneration({ plannerConfigId: "planner-1" });
    const plannerConfig = createModelConfig();
    imageGenerationMocks.planImageMarkersWithModel.mockResolvedValue({
      content: "Scene text.\n[image]archive at dusk[/image]",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    imageGenerationMocks.generateComfyImage.mockResolvedValue("data:image/png;base64,planned");
    const patchMessage = vi.fn(async () => {});
    const getWorldbookReferences = vi.fn(async () => [{ title: "Archive", content: "Closes at dusk." }]);

    await runAutoImageGeneration({
      chatId: "chat-1",
      assistantId: "assistant-1",
      content: "Scene text.",
      patchMessage,
      setChatError: vi.fn(),
      resolvePlannerConfig: vi.fn(async () => plannerConfig),
      getWorldbookReferences,
    });

    expect(getWorldbookReferences).toHaveBeenCalledWith("Scene text.");
    expect(imageGenerationMocks.planImageMarkersWithModel).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Scene text.",
        plannerConfig,
        worldbookReferences: [{ title: "Archive", content: "Closes at dusk." }],
      }),
    );
    expect(patchMessage).toHaveBeenCalledWith("assistant-1", {
      content: "Scene text.\n[image]archive at dusk[/image]",
    });
    expect(repositoryMocks.createSecondaryUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        source: "image-planner",
        modelConfigId: "planner-1",
      }),
    );
  });
});
