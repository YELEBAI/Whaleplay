import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Character, ContextBlock, Message, ModelConfig, PresetItem } from "@neo-tavern/shared";
import { NSFW_ITEM_KIND, createContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { useSettingsStore } from "@/features/settings/settings.store";
import { assembleChatContext, buildPolicyPresetItems } from "./context-assembler";

const repositoryMocks = vi.hoisted(() => ({
  activePresetId: null as string | null,
  preset: null as { items: PresetItem[] } | null,
  agenticRecord: null as unknown,
  getActivePresetId: vi.fn(),
  getById: vi.fn(),
  getOrCreate: vi.fn(),
}));

const agenticPresetMocks = vi.hoisted(() => ({
  getAgenticPlayPresetItems: vi.fn(),
}));

vi.mock("@/db/repositories", () => ({
  presetRepository: {
    getActivePresetId: repositoryMocks.getActivePresetId,
    getById: repositoryMocks.getById,
  },
  agenticPlayStateRepository: {
    getOrCreate: repositoryMocks.getOrCreate,
  },
}));

vi.mock("@/features/agentic-play/agentic-preset", () => ({
  getAgenticPlayPresetItems: agenticPresetMocks.getAgenticPlayPresetItems,
}));

const initialSettings = useSettingsStore.getState();

function createModelConfig(): ModelConfig {
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

function createMessage(id: string, role: Message["role"], content: string): Message {
  return {
    id,
    chatId: "chat-1",
    parentId: null,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createPresetItem(patch: Partial<PresetItem>): PresetItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: patch.id ?? "item-1",
    presetId: "preset-1",
    name: patch.name ?? "Preset item",
    enabled: patch.enabled ?? true,
    role: patch.role ?? "system",
    content: patch.content ?? "Preset content",
    injectionOrder: patch.injectionOrder ?? 100,
    builtinKind: patch.builtinKind,
    createdAt: now,
    updatedAt: now,
  };
}

function createMemoryBlock(): ContextBlock {
  return {
    id: "memory-1",
    source: "memory",
    title: "Memory",
    content: "Remember the silver key.",
    priority: 50,
    role: "system",
    position: "beforeHistory",
  };
}

function createWorldbookBlock(): ContextBlock {
  return {
    id: "worldbook-1",
    source: "worldbook",
    title: "Archive",
    content: "The archive closes at dusk.",
    priority: 40,
    role: "system",
    position: "beforeHistory",
  };
}

function createAgenticRecord() {
  return {
    chatId: "chat-1",
    characterId: "char-1",
    enabled: true,
    gameState: {
      mode: "narrative_dice" as const,
      player: { name: "Player" },
      location: "Archive",
      quest: {},
      npcs: [],
      inventory: [],
      flags: {},
      scene: {},
      log: ["Entered the archive."],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("context assembler", () => {
  beforeEach(() => {
    useSettingsStore.setState(initialSettings, true);
    useSettingsStore.setState({
      contextTokens: 2048,
      personaName: "Tester",
      modelConfig: createModelConfig(),
    });

    repositoryMocks.activePresetId = null;
    repositoryMocks.preset = null;
    repositoryMocks.agenticRecord = null;
    repositoryMocks.getActivePresetId.mockReset();
    repositoryMocks.getActivePresetId.mockImplementation(async () => repositoryMocks.activePresetId);
    repositoryMocks.getById.mockReset();
    repositoryMocks.getById.mockImplementation(async () => repositoryMocks.preset);
    repositoryMocks.getOrCreate.mockReset();
    repositoryMocks.getOrCreate.mockImplementation(async () => repositoryMocks.agenticRecord);
    agenticPresetMocks.getAgenticPlayPresetItems.mockReset();
    agenticPresetMocks.getAgenticPlayPresetItems.mockResolvedValue([
      { role: "system", content: "Agentic preset rules", injectionOrder: 10 },
    ]);
  });

  it("filters disabled and built-in NSFW preset items when policy requires it", () => {
    const items = [
      createPresetItem({ id: "safe", name: "Safe", content: "Safe style", enabled: true }),
      createPresetItem({ id: "disabled", name: "Disabled", content: "Disabled style", enabled: false }),
      createPresetItem({
        id: "nsfw",
        name: "NSFW",
        content: "NSFW style",
        enabled: true,
        builtinKind: NSFW_ITEM_KIND,
      }),
    ];

    const result = buildPolicyPresetItems(items, createContentPolicySnapshot("normal"));

    expect(result).toEqual([{ role: "system", content: "Safe style", injectionOrder: 100 }]);
  });

  it("assembles preset, memory, worldbook, healthy prompt, persona, and model config", async () => {
    repositoryMocks.activePresetId = "preset-1";
    repositoryMocks.preset = {
      items: [createPresetItem({ content: "Preset system card for {{user}}", injectionOrder: 20 })],
    };
    const memoryBlock = createMemoryBlock();
    const worldbookBlock = createWorldbookBlock();
    const promptMessages = [
      createMessage("u1", "user", "What did I find?"),
      createMessage("a1", "assistant", "You found a map."),
      createMessage("u2", "user", "Open the hidden drawer."),
    ];
    const getMemoryPromptPlan = vi.fn(async (historyMessages: Message[]) => ({
      recentMessages: historyMessages,
      memoryBlock,
    }));
    const getWorldbookContextBlocks = vi.fn(async () => [worldbookBlock]);
    const stripMessages = vi.fn((messages: Message[]) => messages);

    const result = await assembleChatContext({
      chatId: "chat-1",
      character: createCharacter(),
      userInput: "Open the hidden drawer.",
      promptMessages,
      contentPolicy: createContentPolicySnapshot("healthy"),
      agenticPlayEnabled: false,
      getMemoryPromptPlan,
      getWorldbookContextBlocks,
      stripMessages,
    });

    expect(result.contextTokens).toBe(2048);
    expect(result.modelConfig.id).toBe("model-1");
    expect(result.agenticRecord).toBeNull();
    expect(getMemoryPromptPlan).toHaveBeenCalledWith(promptMessages.slice(0, -1), "chat-1", undefined);
    expect(getWorldbookContextBlocks).toHaveBeenCalledWith("Open the hidden drawer.", promptMessages);
    expect(result.built.previewText).toContain("Preset system card for Tester");
    expect(result.built.previewText).toContain("Remember the silver key.");
    expect(result.built.previewText).toContain("健康模式已启用");
    expect(result.built.includedContextBlocks.map((block) => block.id)).toEqual([
      "healthy-mode-safety",
      "memory-1",
      "worldbook-1",
    ]);
  });

  it("uses the agentic preset and state block when agentic play is enabled", async () => {
    repositoryMocks.activePresetId = "preset-1";
    repositoryMocks.preset = {
      items: [createPresetItem({ content: "Normal preset card", injectionOrder: 20 })],
    };
    repositoryMocks.agenticRecord = createAgenticRecord();

    const result = await assembleChatContext({
      chatId: "chat-1",
      character: createCharacter(),
      userInput: "Start",
      promptMessages: [createMessage("u1", "user", "Start")],
      contentPolicy: createContentPolicySnapshot("normal"),
      agenticPlayEnabled: true,
      getMemoryPromptPlan: vi.fn(async (historyMessages: Message[]) => ({
        recentMessages: historyMessages,
        memoryBlock: null,
      })),
      getWorldbookContextBlocks: vi.fn(async () => []),
      stripMessages: (messages) => messages,
    });

    expect(repositoryMocks.getOrCreate).toHaveBeenCalledWith("chat-1", expect.objectContaining({ id: "char-1" }), true);
    expect(agenticPresetMocks.getAgenticPlayPresetItems).toHaveBeenCalled();
    expect(result.agenticRecord).toBe(repositoryMocks.agenticRecord);
    expect(result.built.previewText).toContain("Agentic preset rules");
    expect(result.built.previewText).not.toContain("Normal preset card");
    expect(result.built.includedContextBlocks.some((block) => block.source === "agentic")).toBe(true);
  });

  it("throws when no active model config is available", async () => {
    useSettingsStore.setState({ modelConfig: null });

    await expect(
      assembleChatContext({
        chatId: "chat-1",
        character: createCharacter(),
        userInput: "Hello",
        promptMessages: [createMessage("u1", "user", "Hello")],
        contentPolicy: createContentPolicySnapshot("normal"),
        agenticPlayEnabled: false,
        getMemoryPromptPlan: vi.fn(async (historyMessages: Message[]) => ({
          recentMessages: historyMessages,
          memoryBlock: null,
        })),
        getWorldbookContextBlocks: vi.fn(async () => []),
        stripMessages: (messages) => messages,
      }),
    ).rejects.toThrow("Model not configured");
  });
});
