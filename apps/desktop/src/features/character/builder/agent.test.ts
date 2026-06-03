import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModelConfig, ModelProvider } from "@neo-tavern/shared";
import { buildNeoCharacterDraft, runNeoCharacterBuilderTurn } from "./agent";

const mocks = vi.hoisted(() => ({
  provider: null as ModelProvider | null,
}));

vi.mock("@neo-tavern/core", () => ({
  createModelProvider: vi.fn(() => mocks.provider),
}));

vi.mock("@/features/billing/deepseek-billing", () => ({
  withDeepSeekUsageCost: (usage: unknown) => usage,
}));

vi.mock("@/features/settings/model-capabilities", () => ({
  getChatScopedDeepSeekUserId: () => "builder-test-user",
  shouldOmitTemperatureForModel: () => false,
}));

const modelConfig: ModelConfig = {
  id: "model-1",
  provider: "openai-compatible",
  name: "Test model",
  baseUrl: "https://example.com/v1",
  apiKey: "key",
  model: "test-model",
  temperature: 0.7,
  maxTokens: 1000,
  streamingEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createValidDraft(name = "灯塔管理员") {
  return {
    character: {
      name,
      description: "海边灯塔的年轻管理员，总在暴风雨前检查铜铃。",
      personality: "谨慎、温和。\n\n性格调色盘：底色：责任感\n主色调：谨慎\n谨慎衍生1：说话前会确认门窗。\n谨慎衍生2：遇到危险先规划退路。",
      scenario: "暴风雨将至，用户来到灯塔门前。",
      firstMessage: "铜铃在风里轻响，她抬头看向门口：你来得正是时候。",
      exampleDialogues: "用户: 这里安全吗？\n灯塔管理员: 如果灯还亮着，就还有办法。",
      tags: ["mystery"],
    },
    personalityPalette: {
      base: "责任感",
      main: ["谨慎"],
      accents: ["温和"],
      derivatives: [{ color: "谨慎", items: ["说话前会确认门窗。", "遇到危险先规划退路。"] }],
    },
  };
}

describe("Whale Builder agent", () => {
  beforeEach(() => {
    mocks.provider = null;
  });

  it("uses tool output as visible content when stopping for user choices", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "我先问一个方向。",
        toolCalls: [
          {
            id: "choice-1",
            type: "function",
            function: {
              name: "ask_user_options",
              arguments: JSON.stringify({
                question: "你想让角色的核心冲突落在哪里？",
                options: [
                  { label: "家族责任", value: "围绕家族责任推进。" },
                  { label: "失踪事件", value: "围绕失踪事件推进。" },
                ],
              }),
            },
          },
        ],
      }),
    };
    mocks.provider = provider;

    const result = await runNeoCharacterBuilderTurn({
      conversation: [{ role: "user", content: "做一个悬疑角色。" }],
      modelConfig,
    });

    expect(result.content).toBe("你想让角色的核心冲突落在哪里？");
    expect(result.choices).toHaveLength(2);
  });

  it("passes abort signals into chat provider calls", async () => {
    const controller = new AbortController();
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({ content: "我已经处理完这一轮。" }),
    };
    mocks.provider = provider;

    await runNeoCharacterBuilderTurn({
      conversation: [{ role: "user", content: "先看看。" }],
      modelConfig,
      signal: controller.signal,
    });

    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("continues one-shot plain text until a draft is saved", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi
        .fn()
        .mockResolvedValueOnce({ content: "我会先整理规则，然后保存草稿。" })
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "save-1",
              type: "function",
              function: {
                name: "save_character_draft",
                arguments: JSON.stringify(createValidDraft()),
              },
            },
          ],
        }),
    };
    mocks.provider = provider;

    const result = await buildNeoCharacterDraft({
      concept: "灯塔悬疑角色",
      modelConfig,
    });

    expect(result.character.name).toBe("灯塔管理员");
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("keeps existing character fallback fields in one-shot tool execution", async () => {
    const existingCharacter = createValidDraft("旧名字").character;
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [
          {
            id: "save-1",
            type: "function",
            function: {
              name: "save_character_draft",
              arguments: JSON.stringify({ character: { name: "新名字" } }),
            },
          },
        ],
      }),
    };
    mocks.provider = provider;

    const result = await buildNeoCharacterDraft({
      concept: "只改名字",
      existingCharacter,
      modelConfig,
    });

    expect(result.character.name).toBe("新名字");
    expect(result.character.description).toBe(existingCharacter.description);
    expect(result.character.firstMessage).toBe(existingCharacter.firstMessage);
  });

  it("throws instead of returning an empty one-shot draft", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({ content: "还在准备。" }),
    };
    mocks.provider = provider;

    await expect(
      buildNeoCharacterDraft({
        concept: "模糊想法",
        modelConfig,
      }),
    ).rejects.toThrow("AI 没有保存可用");
    expect(provider.generate).toHaveBeenCalledTimes(12);
  });
});
