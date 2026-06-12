import { describe, it, expect } from "vitest";
import { buildChatPrompt, estimateTokens, trimMessagesByTokens } from "../prompt-builder";
import type { Character, Message } from "@neo-tavern/shared";

const mockCharacter: Character = {
  id: "char-1",
  name: "Alice",
  description: "A friendly AI assistant",
  personality: "Helpful and cheerful",
  scenario: "Chatting with a user",
  firstMessage: "Hello! How can I help you today?",
  exampleDialogues: "User: Hi\nAlice: Hello there!",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const mockMessages: Message[] = [
  {
    id: "msg-1",
    chatId: "chat-1",
    role: "user",
    content: "Hi there",
    createdAt: "2024-01-01T00:01:00Z",
  },
  {
    id: "msg-2",
    chatId: "chat-1",
    role: "assistant",
    content: "Hello! Nice to meet you.",
    createdAt: "2024-01-01T00:01:30Z",
  },
];

describe("buildChatPrompt", () => {
  it("should return a BuiltPrompt with messages array", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: "How are you?",
    });

    expect(result).toBeDefined();
    expect(result.messages).toBeInstanceOf(Array);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("should include system rules as first message", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Hello",
    });

    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toContain("扮演");
  });

  it("should include character information in system messages", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
    });

    const systemMessages = result.messages.filter((m) => m.role === "system");
    const systemContent = systemMessages.map((m) => m.content).join(" ");

    expect(systemContent).toContain("Alice");
    expect(systemContent).toContain("A friendly AI assistant");
    expect(systemContent).toContain("Helpful and cheerful");
    expect(systemContent).toContain("Chatting with a user");
  });

  it("should include example dialogues when provided", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
    });

    const systemContent = result.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join(" ");

    expect(systemContent).toContain("Example Dialogues");
  });

  it("should not include example dialogues section when empty", () => {
    const charWithoutExamples: Character = {
      ...mockCharacter,
      exampleDialogues: undefined,
    };

    const result = buildChatPrompt({
      character: charWithoutExamples,
      recentMessages: [],
      userInput: "Test",
    });

    const systemContent = result.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join(" ");

    expect(systemContent).not.toContain("Example Dialogues");
  });

  it("should include recent messages", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: "How are you?",
    });

    const historyMessage = result.messages.find(
      (m) => m.role === "system" && m.content.includes('<extra_preset_entry name="chat history">'),
    );

    expect(historyMessage).toBeDefined();
    expect(historyMessage!.content).toContain("### 1. user");
    expect(historyMessage!.content).toContain("Hi there");
    expect(historyMessage!.content).toContain("### 2. assistant");
    expect(historyMessage!.content).toContain("Hello! Nice to meet you.");
  });

  it("should include user input as last message", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "My test message",
    });

    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toContain("My test message");
  });

  it("should generate preview text", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
    });

    expect(result.previewText).toBeDefined();
    expect(result.previewText.length).toBeGreaterThan(0);
    expect(result.previewText).toContain("## system");
    expect(result.previewText).toContain("## user");
  });

  it("should estimate token count", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: "Hello",
    });

    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokenEstimate)).toBe(true);
  });

  it("should include context blocks sorted by priority", () => {
    const contextBlocks = [
      { id: "cb-1", source: "memory" as const, title: "Memory 1", content: "Low priority", priority: 1 },
      { id: "cb-2", source: "worldbook" as const, title: "Worldbook 1", content: "High priority", priority: 10 },
    ];

    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
      contextBlocks,
    });

    const memoryMessage = result.messages.find((m) => m.content.includes("[memory]"));
    const worldbookMessage = result.messages.find((m) => m.content.includes('<extra_preset_entry name="前置世界书">'));

    expect(memoryMessage).toBeDefined();
    expect(memoryMessage!.content).toContain("Low priority");
    expect(worldbookMessage).toBeDefined();
    expect(worldbookMessage!.content).toContain("### Worldbook 1");
    expect(worldbookMessage!.content).toContain("High priority");
    expect(result.includedContextBlocks).toEqual([
      { id: "cb-2", source: "worldbook", title: "Worldbook 1", content: "High priority", priority: 10 },
      { id: "cb-1", source: "memory", title: "Memory 1", content: "Low priority", priority: 1 },
    ]);
  });

  it("should inject experimental directory entries for worldbook and chat history", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: "Test",
      contextBlocks: [
        {
          id: "wb-always",
          source: "worldbook",
          title: "Static Lore",
          content: "Always lore",
          priority: 5,
          position: "beforeHistory",
        },
        {
          id: "wb-trigger",
          source: "worldbook",
          title: "Recalled Lore",
          content: "Keyword lore",
          priority: 10,
          position: "afterHistory",
        },
      ],
    });

    const preview = result.previewText;
    const staticIndex = preview.indexOf('<extra_preset_entry name="前置世界书">');
    const historyIndex = preview.indexOf('<extra_preset_entry name="chat history">');
    const recalledIndex = preview.indexOf('<extra_preset_entry name="召回世界书">');
    const inputIndex = preview.lastIndexOf("## user\nTest");

    expect(staticIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeGreaterThan(staticIndex);
    expect(recalledIndex).toBeGreaterThan(historyIndex);
    expect(inputIndex).toBeGreaterThan(recalledIndex);
    expect(preview).toContain("### Static Lore\nAlways lore");
    expect(preview).toContain("### Recalled Lore\nKeyword lore");
  });

  it("should replace runtime extra preset slots without duplicating default directory entries", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: "Test",
      presetItems: [
        { role: "system", content: '<extra_preset_slot name="前置世界书" />', injectionOrder: 10 },
        { role: "system", content: '<extra_preset_slot name="chat history" />', injectionOrder: 20 },
        { role: "system", content: '<extra_preset_slot name="召回世界书" />', injectionOrder: 30 },
      ],
      contextBlocks: [
        {
          id: "wb-always",
          source: "worldbook",
          title: "Static Lore",
          content: "Always lore",
          priority: 5,
          position: "beforeHistory",
        },
        {
          id: "wb-trigger",
          source: "worldbook",
          title: "Recalled Lore",
          content: "Keyword lore",
          priority: 10,
          position: "afterHistory",
        },
      ],
    });

    const preview = result.previewText;
    expect(preview).not.toContain("<extra_preset_slot");
    expect(preview.match(/<extra_preset_entry name="前置世界书">/g)).toHaveLength(1);
    expect(preview.match(/<extra_preset_entry name="chat history">/g)).toHaveLength(1);
    expect(preview.match(/<extra_preset_entry name="召回世界书">/g)).toHaveLength(1);
    expect(preview.indexOf('<extra_preset_entry name="前置世界书">')).toBeLessThan(
      preview.indexOf('<extra_preset_entry name="chat history">'),
    );
    expect(preview.indexOf('<extra_preset_entry name="chat history">')).toBeLessThan(
      preview.indexOf('<extra_preset_entry name="召回世界书">'),
    );
  });

  it("should include user persona when provided", () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
      userPersona: "A curious explorer",
    });

    const personaMessage = result.messages.find((m) => m.role === "system" && m.content.includes("User Persona"));
    expect(personaMessage).toBeDefined();
    expect(personaMessage!.content).toContain("A curious explorer");
  });

  it("should use custom system rules when provided", () => {
    const customRules = "Custom roleplay rules here.";

    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
      systemRules: customRules,
    });

    expect(result.messages[0].content).toContain(customRules);
  });

  it('should replace character placeholders inside preset items', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
      presetItems: [
        { role: 'system', content: '当前角色：{{char}} / {{character}} / <char> / <character>', injectionOrder: 10 },
      ],
    })

    const presetMessage = result.messages.find((m) => m.content.includes('当前角色'))
    expect(presetMessage?.content).toContain('当前角色：Alice / Alice / Alice / Alice')
  })

  it('should merge preset items into one message by injection order', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: "Test",
      presetItems: [
        { role: "system", content: "Third preset card", injectionOrder: 30 },
        { role: "user", content: "Second preset card", injectionOrder: 20 },
        { role: "system", content: "First preset card", injectionOrder: 10 },
      ],
    });

    const presetMessages = result.messages.filter((m) => m.content.includes("First preset card"));
    expect(presetMessages).toHaveLength(1);
    expect(presetMessages[0].role).toBe("system");

    const content = presetMessages[0].content;
    const firstIndex = content.indexOf("First preset card");
    const secondIndex = content.indexOf("Second preset card");
    const thirdIndex = content.indexOf("Third preset card");

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
    expect(result.previewText).toContain("## system\nFirst preset card\n\nSecond preset card\n\nThird preset card");
    expect(result.previewText).not.toContain("## user\nSecond preset card");
  });
});

describe("estimateTokens", () => {
  it("should return 0 for empty messages", () => {
    const result = estimateTokens([]);
    expect(result).toBe(0);
  });

  it("should estimate approximately 1 token per 4 characters", () => {
    const messages = [{ role: "user" as const, content: "12345678" }];
    expect(estimateTokens(messages)).toBe(2);
  });

  it("should round up", () => {
    const messages = [{ role: "user" as const, content: "123456789" }];
    expect(estimateTokens(messages)).toBe(3);
  });
});

describe("trimMessagesByTokens", () => {
  it("should return all messages when maxTokens is 0 or negative", () => {
    const messages = [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi there" },
    ];
    expect(trimMessagesByTokens(messages, 0)).toEqual(messages);
    expect(trimMessagesByTokens(messages, -1)).toEqual(messages);
  });

  it("should return empty array for empty input", () => {
    expect(trimMessagesByTokens([], 100)).toEqual([]);
  });

  it("should keep all messages when under token budget", () => {
    const messages = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ];
    const result = trimMessagesByTokens(messages, 100);
    expect(result).toEqual(messages);
  });

  it("should trim older messages when over token budget", () => {
    const messages = [
      { role: "user", content: "A".repeat(400) },
      { role: "assistant", content: "B".repeat(400) },
      { role: "user", content: "C".repeat(400) },
    ];
    // Each message is ~100 tokens (400/4). Budget of 250 keeps ~2 messages.
    const result = trimMessagesByTokens(messages, 250);
    expect(result.length).toBe(2);
    expect(result[0].content).toBe("B".repeat(400));
    expect(result[1].content).toBe("C".repeat(400));
  });

  it("should keep at least one message", () => {
    const messages = [{ role: "user", content: "Hello there, how are you?" }];
    const result = trimMessagesByTokens(messages, 1);
    expect(result.length).toBe(1);
  });

  it("should preserve message order (most recent last)", () => {
    const messages = [
      { role: "user", content: "First" },
      { role: "assistant", content: "Second" },
      { role: "user", content: "Third" },
      { role: "assistant", content: "Fourth" },
    ];
    // Each message is ~2 tokens (5-6 chars / 4). Budget of 5 keeps ~2 messages.
    const result = trimMessagesByTokens(messages, 5);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("Third");
    expect(result[1].role).toBe("assistant");
    expect(result[1].content).toBe("Fourth");
  });
});
