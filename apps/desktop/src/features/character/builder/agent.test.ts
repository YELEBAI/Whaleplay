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
      personality:
        "谨慎、温和。\n\n性格调色盘：底色：责任感\n主色调：谨慎\n谨慎衍生1：说话前会确认门窗。\n谨慎衍生2：遇到危险先规划退路。",
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
    expect(result.questions).toHaveLength(1);
  });

  it("returns a batched question bundle for one creation stage", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [
          {
            id: "choice-batch-1",
            type: "function",
            function: {
              name: "ask_user_options",
              arguments: JSON.stringify({
                questions: [
                  {
                    question: "角色性别与年龄段？",
                    options: [
                      { label: "青年男性", value: "青年男性，街头出身。" },
                      { label: "青年女性", value: "青年女性，格斗风格灵活。" },
                    ],
                  },
                  {
                    question: "开局身份底色？",
                    options: [
                      { label: "无名英雄", value: "以无名英雄身份开局。" },
                      { label: "落魄继承人", value: "以落魄继承人身份开局。" },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
    mocks.provider = provider;

    const result = await runNeoCharacterBuilderTurn({
      conversation: [{ role: "user", content: "做一个热血冒险角色。" }],
      modelConfig,
    });

    expect(result.content).toContain("我需要先一次性确认这组问题");
    expect(result.content).toContain("1. 角色性别与年龄段？");
    expect(result.content).toContain("2. 开局身份底色？");
    expect(result.questions).toHaveLength(2);
    expect(result.questions?.[0]?.choices).toHaveLength(2);
  });

  it("keeps creation plan details visible before asking for confirmation", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [
          {
            id: "plan-1",
            type: "function",
            function: {
              name: "present_creation_plan",
              arguments: JSON.stringify({
                summary: "先做热血成长向角色，并配套世界书条目。",
                characterPlan: "主角从普通人逐步卷入冒险。",
                personalityPalette: {
                  base: "责任感",
                  main: ["热血"],
                  accents: ["谨慎"],
                },
                worldPlan: "保留起始城市、组织与冲突规则。",
                entryPlan: [{ title: "起始城市", type: "world", purpose: "承载开局地点" }],
              }),
            },
          },
        ],
      }),
    };
    mocks.provider = provider;

    const result = await runNeoCharacterBuilderTurn({
      conversation: [{ role: "user", content: "做一张冒险角色卡。" }],
      modelConfig,
    });

    expect(result.content).toContain("我先把创作规划对齐一下：");
    expect(result.content).toContain("先做热血成长向角色");
    expect(result.content).toContain("世界书条目：");
    expect(result.content.trim().endsWith("这个规划可以继续吗？")).toBe(true);
    expect(result.choices).toHaveLength(3);
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

  it("keeps status bar artifacts in saved Builder drafts", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [
          {
            id: "save-status-bars",
            type: "function",
            function: {
              name: "save_character_draft",
              arguments: JSON.stringify({
                ...createValidDraft("蓝灯术士"),
                statusBars: {
                  version: 1,
                  bars: [
                    {
                      id: "mana",
                      assetId: "mana",
                      label: "法术位",
                      value: 3,
                      max: 6,
                      valueLabel: "3/6",
                      mvuPath: "主角.状态条.魔法",
                    },
                  ],
                },
              }),
            },
          },
        ],
      }),
    };
    mocks.provider = provider;

    const result = await runNeoCharacterBuilderTurn({
      conversation: [{ role: "user", content: "做一个带法术位状态栏的角色。" }],
      modelConfig,
    });

    expect(result.statusBars?.bars).toHaveLength(1);
    expect(result.statusBars?.bars[0]).toMatchObject({
      id: "mana",
      assetId: "mana",
      label: "法术位",
      value: 3,
      max: 6,
    });
    expect(result.draft?.character.statusBars?.bars[0]?.mvuPath).toBe("主角.状态条.魔法");
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
