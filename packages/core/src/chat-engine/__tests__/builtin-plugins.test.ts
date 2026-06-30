import { describe, expect, it } from "vitest";
import { createFloodGuardPlugin } from "../builtin-plugins";
import { ChatPluginRegistry } from "../plugin-registry";

describe("built-in chat plugins", () => {
  it("creates a flood guard plugin that can stop repeated output through the registry", () => {
    const registry = new ChatPluginRegistry();
    registry.register(
      createFloodGuardPlugin({
        config: { minContentChars: 40 },
      }),
    );

    const hooks = registry.composeHooks({
      chatId: "chat-1",
      character: {
        id: "char-1",
        name: "Luna",
        description: "",
        personality: "",
        scenario: "",
        firstMessage: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      messages: [],
      userInput: "hello",
      modelConfig: {
        id: "model-1",
        provider: "openai-compatible",
        name: "Test",
        baseUrl: "https://example.com/v1",
        apiKey: "key",
        model: "test-model",
        temperature: 0.7,
        maxTokens: 1000,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      personaName: "Player",
      activeRegexRules: [],
      worldbookEntries: [],
      memoryBlock: null,
    });

    const sentence = "她只是站在那里，静静地望着雨。";
    const result = hooks.inspectOutput?.(Array(10).fill(sentence).join("\n"));

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        terminate: true,
      }),
    );
  });
});
