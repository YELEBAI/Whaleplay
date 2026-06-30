import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuiltPrompt, Character, GenerateChunk, ModelConfig } from "@neo-tavern/shared";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";
import {
  generateAgenticAssistantWithRetry,
  generateAssistantWithRetry,
  generateNormalAssistantWithRetry,
} from "./generation-runner";

const providerMocks = vi.hoisted(() => ({
  createModelProvider: vi.fn(),
}));

const agenticMocks = vi.hoisted(() => ({
  generateAgenticPlayTurn: vi.fn(),
}));

vi.mock("@neo-tavern/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neo-tavern/core")>();
  return {
    ...actual,
    createModelProvider: providerMocks.createModelProvider,
  };
});

vi.mock("@/features/agentic-play/agentic-play", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/agentic-play/agentic-play")>();
  return {
    ...actual,
    generateAgenticPlayTurn: agenticMocks.generateAgenticPlayTurn,
  };
});

function createModelConfig(patch: Partial<ModelConfig> = {}): ModelConfig {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "model-1",
    provider: "openai-compatible",
    name: "Test Model",
    baseUrl: "https://example.test",
    apiKey: "test-key",
    model: "test-model",
    temperature: 0.7,
    maxTokens: 1024,
    streamingEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function createBuiltPrompt(): BuiltPrompt {
  return {
    messages: [{ role: "user", content: "Hello" }],
    previewText: "## user\nHello",
    tokenEstimate: 4,
    includedContextBlocks: [],
  };
}

function createCharacter(): Character {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "char-1",
    name: "Mira",
    description: "A careful archivist.",
    personality: "Curious",
    scenario: "In a quiet archive.",
    firstMessage: "Welcome to the archive.",
    createdAt: now,
    updatedAt: now,
  };
}

function createGameState(): AgenticGameState {
  return {
    mode: "narrative_dice",
    player: {},
    location: "Archive",
    quest: {},
    npcs: [],
    inventory: [],
    flags: {},
    scene: {},
    log: [],
  };
}

function createEffects() {
  return {
    patchMessage: vi.fn(async () => {}),
    deleteMessage: vi.fn(async () => {}),
    setStreamingMessageId: vi.fn(),
    setGenerationPhase: vi.fn(),
    onAgenticPlayStateUpdated: vi.fn(),
  };
}

async function* streamChunks(chunks: GenerateChunk[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("generation runner", () => {
  beforeEach(() => {
    providerMocks.createModelProvider.mockReset();
    agenticMocks.generateAgenticPlayTurn.mockReset();
  });

  it("routes reasoning deltas into visible content when reasoning capture is disabled", async () => {
    providerMocks.createModelProvider.mockReturnValue({
      streamGenerate: () => streamChunks([{ reasoningContentDelta: "Visible narration." }]),
    });
    const effects = createEffects();

    const content = await generateNormalAssistantWithRetry({
      chatId: "chat-1",
      assistantId: "assistant-1",
      built: createBuiltPrompt(),
      modelConfig: createModelConfig({ reasoningEffort: undefined }),
      controller: new AbortController(),
      effects,
    });

    expect(content).toBe("Visible narration.");
    expect(effects.patchMessage).toHaveBeenCalledWith(
      "assistant-1",
      expect.objectContaining({
        content: "Visible narration.",
        reasoningContent: undefined,
      }),
      { persist: false },
    );
    expect(effects.patchMessage).toHaveBeenLastCalledWith(
      "assistant-1",
      expect.objectContaining({
        content: "Visible narration.",
        reasoningContent: undefined,
      }),
    );
  });

  it("uses non-stream reasoning content as visible content when reasoning capture is disabled", async () => {
    providerMocks.createModelProvider.mockReturnValue({
      generate: vi.fn(async () => ({
        content: "",
        reasoningContent: "Visible non-stream narration.",
      })),
    });
    const effects = createEffects();

    const content = await generateNormalAssistantWithRetry({
      chatId: "chat-1",
      assistantId: "assistant-1",
      built: createBuiltPrompt(),
      modelConfig: createModelConfig({ streamingEnabled: false, reasoningEffort: undefined }),
      controller: new AbortController(),
      effects,
    });

    expect(content).toBe("Visible non-stream narration.");
    expect(effects.patchMessage).toHaveBeenLastCalledWith(
      "assistant-1",
      expect.objectContaining({
        content: "Visible non-stream narration.",
        reasoningContent: undefined,
      }),
    );
  });

  it("aborts streaming when the output inspector rejects accumulated content", async () => {
    providerMocks.createModelProvider.mockReturnValue({
      streamGenerate: () => streamChunks([{ contentDelta: "loop" }]),
    });
    const controller = new AbortController();

    await expect(
      generateNormalAssistantWithRetry({
        chatId: "chat-1",
        assistantId: "assistant-1",
        built: createBuiltPrompt(),
        modelConfig: createModelConfig(),
        controller,
        generationHooks: {
          inspectOutput: () => ({ pass: false, reason: "重复输出", terminate: true }),
        },
        effects: createEffects(),
      }),
    ).rejects.toMatchObject({ name: "FloodGuardAbortError" });

    expect(controller.signal.aborted).toBe(true);
  });

  it("keeps agentic reasoning deltas visible when reasoning capture is disabled", async () => {
    providerMocks.createModelProvider.mockReturnValue({});
    agenticMocks.generateAgenticPlayTurn.mockImplementation(async (options) => {
      await options.onReasoningDelta("Scene text.");
      return {
        content: "Scene text.",
        reasoningContent: "",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        agenticOptions: [],
        gameState: createGameState(),
      };
    });
    const effects = createEffects();

    const content = await generateAgenticAssistantWithRetry({
      chatId: "chat-1",
      assistantId: "assistant-1",
      built: createBuiltPrompt(),
      modelConfig: createModelConfig({ reasoningEffort: undefined }),
      character: createCharacter(),
      initialGameState: createGameState(),
      controller: new AbortController(),
      effects,
    });

    expect(content).toBe("Scene text.");
    expect(effects.patchMessage).toHaveBeenCalledWith(
      "assistant-1",
      expect.objectContaining({
        content: "Scene text.",
        reasoningContent: undefined,
      }),
      { persist: false },
    );
  });

  it("uses the normal generation path when no agentic params are provided", async () => {
    const generate = vi.fn(async () => ({
      content: "Normal reply.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }));
    providerMocks.createModelProvider.mockReturnValue({ generate });

    const content = await generateAssistantWithRetry({
      chatId: "chat-1",
      assistantId: "assistant-1",
      built: createBuiltPrompt(),
      modelConfig: createModelConfig({ streamingEnabled: false }),
      controller: new AbortController(),
      effects: createEffects(),
    });

    expect(content).toBe("Normal reply.");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(agenticMocks.generateAgenticPlayTurn).not.toHaveBeenCalled();
  });

  it("uses the agentic generation path when agentic params are provided", async () => {
    providerMocks.createModelProvider.mockReturnValue({});
    agenticMocks.generateAgenticPlayTurn.mockResolvedValue({
      content: "Agentic reply.",
      reasoningContent: "",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      agenticOptions: [],
      gameState: createGameState(),
    });

    const content = await generateAssistantWithRetry({
      chatId: "chat-1",
      assistantId: "assistant-1",
      built: createBuiltPrompt(),
      modelConfig: createModelConfig(),
      controller: new AbortController(),
      effects: createEffects(),
      agentic: {
        character: createCharacter(),
        initialGameState: createGameState(),
      },
    });

    expect(content).toBe("Agentic reply.");
    expect(agenticMocks.generateAgenticPlayTurn).toHaveBeenCalledTimes(1);
  });
});
