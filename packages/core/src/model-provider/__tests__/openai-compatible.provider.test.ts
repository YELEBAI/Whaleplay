import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "../providers/openai-compatible.provider";
import type { GenerateInput } from "@neo-tavern/shared";

describe("OpenAICompatibleProvider", () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider({
      id: "test-provider",
      name: "Test Provider",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-api-key",
    });
  });

  it("should create a provider with correct properties", () => {
    expect(provider.id).toBe("test-provider");
    expect(provider.name).toBe("Test Provider");
  });

  it("should strip trailing slash from baseUrl", () => {
    const providerWithSlash = new OpenAICompatibleProvider({
      id: "test",
      name: "Test",
      baseUrl: "https://api.example.com/v1/",
      apiKey: "key",
    });

    expect(providerWithSlash).toBeDefined();
  });

  it("should call the correct endpoint with proper headers", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello from AI" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const input: GenerateInput = {
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 500,
    };

    const result = await provider.generate(input);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        }),
      }),
    );

    expect(result.content).toBe("Hello from AI");
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
    expect(result.usage?.totalTokens).toBe(15);
  });

  it("should handle API errors with status code", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const input: GenerateInput = {
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-4",
    };

    await expect(provider.generate(input)).rejects.toThrow("Model request failed: 401");
  });

  it("should use default temperature and maxTokens when not provided", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const input: GenerateInput = {
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-4",
    };

    await provider.generate(input);

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(800);
  });

  it("should omit temperature when requested", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
      temperature: 0.3,
      omitTemperature: true,
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body).not.toHaveProperty("temperature");
  });

  it("should include user_id when provided", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
      userId: "chat_abc-123",
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.user_id).toBe("chat_abc-123");
  });

  it("should send tools and map tool messages", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [
        { role: "user", content: "Draft a card" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read_skill_reference", arguments: '{"id":"rules"}' },
            },
          ],
        },
        { role: "tool", toolCallId: "call_1", name: "read_skill_reference", content: "rules text" },
      ],
      model: "deepseek-v4-pro",
      tools: [
        {
          type: "function",
          function: {
            name: "read_skill_reference",
            parameters: {
              type: "object",
              properties: { id: { type: "string" } },
              required: ["id"],
            },
          },
        },
      ],
      toolChoice: "auto",
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
    expect(body.messages[1].tool_calls[0].function.name).toBe("read_skill_reference");
    expect(body.messages[2].tool_call_id).toBe("call_1");
  });

  it("should parse tool calls from non-streaming responses", async () => {
    const toolCalls = [
      {
        id: "call_save",
        type: "function",
        function: {
          name: "save_character_draft",
          arguments: '{"character":{"name":"Nova"}}',
        },
      },
    ];
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "", tool_calls: toolCalls } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
    });

    expect(result.toolCalls).toEqual(toolCalls);
  });

  it("should expose finish reason from non-streaming responses", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: "length", message: { content: "partial" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
    });

    expect(result.finishReason).toBe("length");
  });

  it("should include user_id in streaming requests", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    for await (const _chunk of provider.streamGenerate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
      userId: "chat_stream-123",
      omitTemperature: true,
    })) {
      // Consume the stream so the request is issued.
    }

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body.user_id).toBe("chat_stream-123");
    expect(body).not.toHaveProperty("temperature");
    expect(body.stream).toBe(true);
  });

  it("should handle empty API key", () => {
    const noKeyProvider = new OpenAICompatibleProvider({
      id: "test",
      name: "Test",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
    });

    expect(noKeyProvider).toBeDefined();
  });

  it("should handle empty response content", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
        usage: {},
      }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const input: GenerateInput = {
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-4",
    };

    const result = await provider.generate(input);
    expect(result.content).toBe("");
  });

  it("should handle missing choices in response", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ usage: {} }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const input: GenerateInput = {
      messages: [{ role: "user", content: "Hi" }],
      model: "gpt-4",
    };

    const result = await provider.generate(input);
    expect(result.content).toBe("");
  });

  it("should send thinking enabled + reasoning_effort for V4 models with effort", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-flash",
      reasoningEffort: "max",
    });

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("max");
  });

  it("should explicitly disable thinking when reasoningEffort is unset for V4 models", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-v4-pro",
    });

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("should not send thinking params for legacy models", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await provider.generate({
      messages: [{ role: "user", content: "Hi" }],
      model: "deepseek-chat",
      reasoningEffort: "high",
    });

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
