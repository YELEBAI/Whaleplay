import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuiltPrompt, Character, Message, ModelConfig } from "@neo-tavern/shared";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";
import { createContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { runAssistantTurn } from "./assistant-turn-runner";

const runnerMocks = vi.hoisted(() => ({
  assembleChatContext: vi.fn(),
  generateAssistantWithRetry: vi.fn(),
  finalizeAssistantTurn: vi.fn(),
  handleTurnError: vi.fn(),
}));

vi.mock("./context-assembler", () => ({
  assembleChatContext: runnerMocks.assembleChatContext,
}));

vi.mock("./generation-runner", () => ({
  generateAssistantWithRetry: runnerMocks.generateAssistantWithRetry,
  getNextDebugRound: (messages: Message[]) =>
    messages.filter((message) => message.role === "assistant" && message.usage).length + 1,
}));

vi.mock("./turn-finalizer", () => ({
  finalizeAssistantTurn: runnerMocks.finalizeAssistantTurn,
  handleTurnError: runnerMocks.handleTurnError,
}));

const now = "2026-01-01T00:00:00.000Z";

function createBuiltPrompt(): BuiltPrompt {
  return {
    messages: [{ role: "user", content: "Hello" }],
    previewText: "## user\nHello",
    tokenEstimate: 4,
    includedContextBlocks: [],
  };
}

function createModelConfig(): ModelConfig {
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
  };
}

function createCharacter(): Character {
  return {
    id: "char-1",
    name: "Mira",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    createdAt: now,
    updatedAt: now,
  };
}

function createMessage(patch: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    chatId: "chat-1",
    parentId: null,
    role: "user",
    content: "Hello",
    createdAt: now,
    ...patch,
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
    addMessage: vi.fn(async () =>
      createMessage({
        id: "assistant-1",
        parentId: "user-1",
        role: "assistant",
        content: "",
      }),
    ),
    patchMessage: vi.fn(async () => {}),
    deleteMessage: vi.fn(async () => {}),
    setStreamingMessageId: vi.fn(),
    setGenerationPhase: vi.fn(),
    onAgenticPlayStateUpdated: vi.fn(),
  };
}

function createParams(patch: Partial<Parameters<typeof runAssistantTurn>[0]> = {}) {
  const controller = new AbortController();
  return {
    chatId: "chat-1",
    character: createCharacter(),
    userInput: "Hello",
    promptMessages: [
      createMessage({ id: "user-1", role: "user", content: "Hello" }),
      createMessage({
        id: "assistant-old",
        role: "assistant",
        content: "Earlier reply",
        usage: { totalTokens: 3 },
      }),
    ],
    assistantParentId: "user-1",
    contentPolicy: createContentPolicySnapshot("normal"),
    agenticPlayEnabled: false,
    controller,
    isCurrent: () => true,
    fallbackMessage: "Failed to send message",
    debugBaseTrigger: "send" as const,
    hiddenUserMessage: false,
    isDebugEnabled: () => true,
    getMemoryPromptPlan: vi.fn(async (historyMessages: Message[]) => ({
      recentMessages: historyMessages,
      memoryBlock: null,
    })),
    getWorldbookContextBlocks: vi.fn(async () => []),
    stripMessages: (messages: Message[]) => messages,
    effects: createEffects(),
    onPromptBuilt: vi.fn(),
    removeEmptyStreamingDraft: vi.fn(async () => {}),
    setChatError: vi.fn(),
    runAutoImageGeneration: vi.fn(),
    ...patch,
  };
}

describe("assistant turn runner", () => {
  beforeEach(() => {
    runnerMocks.assembleChatContext.mockReset();
    runnerMocks.generateAssistantWithRetry.mockReset();
    runnerMocks.finalizeAssistantTurn.mockReset();
    runnerMocks.handleTurnError.mockReset();

    runnerMocks.assembleChatContext.mockResolvedValue({
      built: createBuiltPrompt(),
      modelConfig: createModelConfig(),
      contextTokens: 128,
      agenticRecord: null,
      generationHooks: {},
      historyMessages: [],
    });
    runnerMocks.generateAssistantWithRetry.mockResolvedValue("Final reply.");
    runnerMocks.finalizeAssistantTurn.mockImplementation(async (params) => {
      params.runAutoImageGeneration();
      return "completed";
    });
  });

  it("runs the shared assistant lifecycle and builds debug context", async () => {
    const params = createParams({ hiddenUserMessage: true });

    const result = await runAssistantTurn(params);

    expect(result).toEqual({
      assistantId: "assistant-1",
      finalContent: "Final reply.",
      status: "completed",
    });
    expect(params.effects.addMessage).toHaveBeenCalledWith({
      chatId: "chat-1",
      parentId: "user-1",
      role: "assistant",
      content: "",
    });
    expect(params.effects.setStreamingMessageId).toHaveBeenCalledWith("chat-1", "assistant-1");
    expect(params.onPromptBuilt).toHaveBeenCalledWith(createBuiltPrompt());
    expect(runnerMocks.generateAssistantWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: "assistant-1",
        debugContext: expect.objectContaining({
          baseTrigger: "send",
          hiddenUserMessage: true,
          round: 2,
        }),
      }),
    );
    expect(params.runAutoImageGeneration).toHaveBeenCalledWith({
      chatId: "chat-1",
      assistantId: "assistant-1",
      content: "Final reply.",
    });
  });

  it("passes agentic generation params when context assembly returns game state", async () => {
    const gameState = createGameState();
    runnerMocks.assembleChatContext.mockResolvedValueOnce({
      built: createBuiltPrompt(),
      modelConfig: createModelConfig(),
      contextTokens: 128,
      agenticRecord: { gameState },
      generationHooks: {},
      historyMessages: [],
    });

    await runAssistantTurn(createParams({ agenticPlayEnabled: true }));

    expect(runnerMocks.generateAssistantWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        agentic: {
          character: expect.objectContaining({ id: "char-1" }),
          initialGameState: gameState,
        },
      }),
    );
  });

  it("cleans up the assistant draft and reports errors", async () => {
    const error = new Error("Generation failed");
    runnerMocks.generateAssistantWithRetry.mockRejectedValueOnce(error);
    const params = createParams({ fallbackMessage: "Failed to regenerate" });

    const result = await runAssistantTurn(params);

    expect(result).toEqual({
      assistantId: "assistant-1",
      finalContent: null,
      status: "error",
    });
    expect(params.removeEmptyStreamingDraft).toHaveBeenCalledWith("assistant-1");
    expect(runnerMocks.finalizeAssistantTurn).not.toHaveBeenCalled();
    expect(runnerMocks.handleTurnError).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        error,
        fallbackMessage: "Failed to regenerate",
      }),
    );
  });
});
