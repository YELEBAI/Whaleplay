import { describe, expect, it, vi } from "vitest";
import type { BuiltPrompt, Character, ModelConfig, ModelProvider } from "@neo-tavern/shared";
import {
  buildAgenticPlayPresetItems,
  buildAgenticPlaySystemRules,
  createAgenticPlayContextBlock,
  createInitialAgenticGameState,
  generateAgenticPlayTurn,
  rollDice,
} from "./agentic-play";
import { resolveAgenticStatusMeters } from "./status-assets";

const character: Character = {
  id: "char-1",
  name: "Luna",
  description: "A keeper of a strange library.",
  personality: "Calm and curious.",
  scenario: "The player stands in the library entrance.",
  firstMessage: "Welcome.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const modelConfig: ModelConfig = {
  id: "config-1",
  provider: "openai-compatible",
  name: "Test",
  baseUrl: "https://example.com/v1",
  apiKey: "key",
  model: "test-model",
  temperature: 0.7,
  maxTokens: 1000,
  streamingEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const builtPrompt: BuiltPrompt = {
  messages: [
    { role: "system", content: "Agentic Play rules" },
    { role: "user", content: "I sneak into the archive." },
  ],
  previewText: "",
  tokenEstimate: 1,
  includedContextBlocks: [],
};

describe("Agentic Play", () => {
  it("rolls real dice with modifiers and difficulty", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.7);
    const result = rollDice({
      dice: "1d20",
      modifier: 2,
      difficulty: 15,
      reason: "Stealth check",
    });

    expect(result.roll).toBe(15);
    expect(result.total).toBe(17);
    expect(result.outcome).toBe("success");
    random.mockRestore();
  });

  it("converts a stated success probability into a d20 difficulty", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.34);
    const result = rollDice({
      dice: "1d20",
      success_probability: 65,
      reason: "Climbing a slick balcony",
    });

    expect(result.roll).toBe(7);
    expect(result.difficulty).toBe(8);
    expect(result.successProbability).toBe(65);
    expect(result.outcome).toBe("failure");
    random.mockRestore();
  });

  it("creates an agentic context block near the current user turn", () => {
    const state = createInitialAgenticGameState(character);
    const block = createAgenticPlayContextBlock(state);

    expect(block.source).toBe("agentic");
    expect(block.position).toBe("afterHistory");
    expect(block.content).toContain("结构化");
    expect(block.content).toContain("narrative_dice");
  });

  it("keeps NPC speech and option descriptions grounded in visible history", () => {
    const rules = buildAgenticPlaySystemRules("Luna");

    expect(rules).toContain("连续性优先");
    expect(rules).toContain("NPC 直接发言必须可见落地");
    expect(rules).toContain("未选择的选项和选项说明不是历史");
    expect(rules).toContain("禁止写未发生前提");
  });

  it("splits agentic play preset modules into granular cards", () => {
    const items = buildAgenticPlayPresetItems("Luna");

    expect(items.length).toBeGreaterThan(8);
    expect(items.map((item) => item.name)).toContain("核心身份");
    expect(items.map((item) => item.name)).toContain("断点规则");
    expect(items.map((item) => item.name)).toContain("对白 JSON 规则");
    expect(items.some((item) => item.content.includes('<agentic_module name="core_rules">'))).toBe(false);
    expect(items.every((item) => /^<agentic_module name="[^"]+">/.test(item.content))).toBe(true);
  });

  it("initializes status bars from the character card config", () => {
    const state = createInitialAgenticGameState({
      ...character,
      statusBars: {
        version: 1,
        source: "whale-builder",
        bars: [
          {
            id: "luna_affection",
            assetId: "affection",
            label: "Luna好感",
            value: 35,
            max: 100,
            mvuPath: "角色.Luna.好感度",
          },
          {
            id: "mana",
            assetId: "mana",
            label: "法术位",
            value: 3,
            max: 6,
            valueLabel: "3/6",
          },
        ],
      },
    });

    expect(state.player.status_bars).toMatchObject({
      luna_affection: { assetId: "affection", value: 35, max: 100 },
      mana: { assetId: "mana", value: 3, max: 6, valueLabel: "3/6" },
    });

    const meters = resolveAgenticStatusMeters(state);
    expect(meters.map((meter) => meter.id)).toContain("affection");
    expect(meters.find((meter) => meter.id === "affection")).toMatchObject({ label: "Luna好感", value: 35 });
  });

  it("resolves local status UI assets from legacy and status_bars variables", () => {
    const state = createInitialAgenticGameState(character);
    state.player.hp = 42;
    state.player.max_hp = 80;
    state.player.status_bars = {
      affection: { value: 36, max: 100, label: "Luna好感" },
      experience: { value: 15, max: 100, label: "经验" },
    };

    const meters = resolveAgenticStatusMeters(state);

    expect(meters.map((meter) => meter.id)).toEqual(["health", "affection", "experience"]);
    expect(meters[0]).toMatchObject({ label: "生命", value: 42, max: 80, tone: "health" });
    expect(meters[1]).toMatchObject({ label: "Luna好感", value: 36, tone: "affection" });
  });

  it("executes dice and state tools before final narration", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "roll-1",
              type: "function",
              function: {
                name: "roll_dice",
                arguments: JSON.stringify({
                  dice: "1d20",
                  modifier: 1,
                  difficulty: 12,
                  reason: "Sneaking into the archive",
                }),
              },
            },
            {
              id: "state-1",
              type: "function",
              function: {
                name: "update_game_state",
                arguments: JSON.stringify({
                  reason: "The player enters the archive.",
                  state_patch: {
                    location: "archive",
                    flags: { archive_entered: true },
                  },
                }),
              },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          content: "### 场景\n你进入了档案室。\n\n### 你可以选择\nA. 查看书架\nB. 自定义行动",
          usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
        }),
    };

    const state = createInitialAgenticGameState(character);
    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: state,
    });

    expect(result.content).toContain("档案室");
    expect(result.gameState.location).toBe("archive");
    expect(result.gameState.flags.archive_entered).toBe(true);
    expect(result.usage?.promptTokens).toBe(18);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("returns structured player options from the agentic option tool", async () => {
    const provider: ModelProvider = {
      id: "fake",
      name: "Fake",
      generate: vi.fn().mockResolvedValue({
        content: "",
        toolCalls: [
          {
            id: "options-1",
            type: "function",
            function: {
              name: "present_player_options",
              arguments: JSON.stringify({
                scene_text: "### 场景\n露娜停在书架旁，等你决定下一步。",
                question: "你想怎么行动？",
                options: [
                  { label: "询问禁书", action: "询问禁书的下落", success_probability: 72, difficulty: 7 },
                  { label: "检查索引", action: "检查桌上的索引卡", success_probability: 85, difficulty: 4 },
                  { label: "绕到柜台后", action: "偷偷绕到柜台后方", success_probability: 38, difficulty: 13 },
                  { label: "等待解释", action: "等露娜主动解释", success_probability: 90, difficulty: 3 },
                  { label: "说明来意", action: "直接说明你的来意", success_probability: 65, difficulty: 8 },
                ],
              }),
            },
          },
        ],
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
    });

    expect(result.content).toBe("### 场景\n露娜停在书架旁，等你决定下一步。");
    expect(result.agenticOptions).toHaveLength(5);
    expect(result.agenticOptions?.[0]).toMatchObject({ action: "询问禁书的下落", probability: 72, difficulty: 7 });
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps visible narration when the option tool stops the same turn", async () => {
    const visibleNarration = [
      '{"type":"dialogue","speaker":"杜尔南","text":"这趟活儿不止是护卫。"}',
      "",
      "杜尔南把杯子推到你面前，指节在吧台上敲了两下。",
    ].join("\n");
    const provider: ModelProvider = {
      id: "fake-visible-options",
      name: "Fake Visible Options",
      generate: vi.fn().mockResolvedValue({
        content: visibleNarration,
        toolCalls: [
          {
            id: "options-visible",
            type: "function",
            function: {
              name: "present_player_options",
              arguments: JSON.stringify({
                scene_text: "杜尔南等你决定下一步。",
                question: "你要怎么做？",
                options: [1, 2, 3, 4, 5].map((index) => ({
                  label: `选择 ${index}`,
                  action: `执行选择 ${index}`,
                  success_probability: 70,
                  difficulty: 7,
                })),
              }),
            },
          },
        ],
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
    });

    expect(result.content).toBe(visibleNarration);
    expect(result.content).not.toBe("杜尔南等你决定下一步。");
    expect(result.agenticOptions).toHaveLength(5);
  });

  it("drops leaked scratchpad content when the option tool returns scene text", async () => {
    const scratchpad = [
      "现在按照规则，我需要直接输出，不要多想。让我组织回复。",
      "",
      "关于写作风格：行为优先，不要情绪标注。",
      "",
      "我需要先调用 update_game_state，然后调用 present_player_options。",
      "",
      "五个选项需要 success_probability 和 difficulty。",
    ].join("\n");
    const provider: ModelProvider = {
      id: "fake-scratchpad-options",
      name: "Fake Scratchpad Options",
      generate: vi.fn().mockResolvedValue({
        content: scratchpad,
        toolCalls: [
          {
            id: "options-scratchpad",
            type: "function",
            function: {
              name: "present_player_options",
              arguments: JSON.stringify({
                scene_text: "杜尔南停在吧台后，等你决定下一步。",
                question: "你要怎么做？",
                options: [1, 2, 3, 4, 5].map((index) => ({
                  label: `选择 ${index}`,
                  action: `执行选择 ${index}`,
                  success_probability: 70,
                  difficulty: 7,
                })),
              }),
            },
          },
        ],
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
    });

    expect(result.content).toBe("杜尔南停在吧台后，等你决定下一步。");
    expect(result.content).not.toContain("让我组织回复");
    expect(result.agenticOptions).toHaveLength(5);
  });

  it("does not stream scratchpad content before a tool stop is resolved", async () => {
    const streamed: string[] = [];
    const provider: ModelProvider = {
      id: "fake-streamed-scratchpad",
      name: "Fake Streamed Scratchpad",
      generate: vi.fn(),
      streamGenerate: vi.fn(async function* () {
        yield { contentDelta: "现在按照规则，我需要先准备五个选项。" };
        yield {
          toolCallDeltas: [
            {
              index: 0,
              id: "options-streamed-scratchpad",
              type: "function" as const,
              function: {
                name: "present_player_options",
                arguments: JSON.stringify({
                  scene_text: "露娜停在书架旁，等你选择。",
                  question: "你要怎么做？",
                  options: [1, 2, 3, 4, 5].map((index) => ({
                    label: `选择 ${index}`,
                    action: `执行选择 ${index}`,
                    success_probability: 70,
                    difficulty: 7,
                  })),
                }),
              },
            },
          ],
        };
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
      onContentDelta: (delta) => {
        streamed.push(delta);
      },
    });

    expect(streamed).toEqual([]);
    expect(result.content).toBe("露娜停在书架旁，等你选择。");
    expect(result.agenticOptions).toHaveLength(5);
  });

  it("repairs an invalid option tool call instead of stopping with too few options", async () => {
    const makeOption = (index: number) => ({
      label: `行动 ${index}`,
      action: `执行行动 ${index}`,
      success_probability: 60 + index,
      difficulty: 9,
    });
    const provider: ModelProvider = {
      id: "fake-repair",
      name: "Fake Repair",
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "bad-options",
              type: "function",
              function: {
                name: "present_player_options",
                arguments: JSON.stringify({
                  scene_text: "露娜停下脚步。",
                  question: "下一步？",
                  options: [makeOption(1), makeOption(2), makeOption(3)],
                }),
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "good-options",
              type: "function",
              function: {
                name: "present_player_options",
                arguments: JSON.stringify({
                  scene_text: "露娜停下脚步。",
                  question: "下一步？",
                  options: [1, 2, 3, 4, 5].map(makeOption),
                }),
              },
            },
          ],
        }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
    });

    expect(result.agenticOptions).toHaveLength(5);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("requires structured options when a turn ends without an option tool", async () => {
    const provider: ModelProvider = {
      id: "fake-required-options",
      name: "Fake Required Options",
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: "### 场景\n露娜看着你，但没有发起选项。",
        })
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            {
              id: "required-options",
              type: "function",
              function: {
                name: "present_player_options",
                arguments: JSON.stringify({
                  scene_text: "### 场景\n露娜看着你，等待你的决定。",
                  question: "你要怎么做？",
                  options: [1, 2, 3, 4, 5].map((index) => ({
                    label: `选择 ${index}`,
                    action: `执行选择 ${index}`,
                    success_probability: 70,
                    difficulty: 7,
                  })),
                }),
              },
            },
          ],
        }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
      requirePlayerOptions: true,
    });

    expect(result.content).toContain("等待你的决定");
    expect(result.agenticOptions).toHaveLength(5);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("streams agentic tool calls and final visible content", async () => {
    let callCount = 0;
    const streamed: string[] = [];
    const provider: ModelProvider = {
      id: "fake-stream",
      name: "Fake Stream",
      generate: vi.fn(),
      streamGenerate: vi.fn(async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield {
            toolCallDeltas: [
              {
                index: 0,
                id: "state-1",
                type: "function" as const,
                function: {
                  name: "update_game_state",
                  arguments: JSON.stringify({
                    reason: "Opening moves to the reading hall.",
                    state_patch: { location: "reading hall" },
                  }),
                },
              },
            ],
            usage: { promptTokens: 6, completionTokens: 2, totalTokens: 8 },
          };
          return;
        }

        yield { contentDelta: "### 场景\n", usage: { promptTokens: 4, completionTokens: 1, totalTokens: 5 } };
        yield { contentDelta: "你抵达阅读厅。\n\n### 你可以选择\n1. 观察书桌（成功率：90%）" };
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
      onContentDelta: (delta) => {
        streamed.push(delta);
      },
    });

    expect(result.content).toContain("阅读厅");
    expect(result.gameState.location).toBe("reading hall");
    expect(streamed.join("")).toBe(result.content);
    expect(provider.streamGenerate).toHaveBeenCalledTimes(2);
  });

  it("does not expose tool-round reasoning when reasoning capture is disabled", async () => {
    const streamed: string[] = [];
    const reasoning: string[] = [];
    const provider: ModelProvider = {
      id: "fake-disabled-tool-reasoning",
      name: "Fake Disabled Tool Reasoning",
      generate: vi.fn(),
      streamGenerate: vi.fn(async function* () {
        yield { reasoningContentDelta: "内部计划：先组织选项。" };
        yield {
          toolCallDeltas: [
            {
              index: 0,
              id: "options-disabled-reasoning",
              type: "function" as const,
              function: {
                name: "present_player_options",
                arguments: JSON.stringify({
                  scene_text: "露娜停在书架旁，等你选择。",
                  question: "你要怎么做？",
                  options: [1, 2, 3, 4, 5].map((index) => ({
                    label: `选择 ${index}`,
                    action: `执行选择 ${index}`,
                    success_probability: 70,
                    difficulty: 7,
                  })),
                }),
              },
            },
          ],
        };
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
      captureReasoning: false,
      onContentDelta: (delta) => {
        streamed.push(delta);
      },
      onReasoningDelta: (delta) => {
        reasoning.push(delta);
      },
    });

    expect(streamed).toEqual([]);
    expect(reasoning).toEqual([]);
    expect(result.reasoningContent).toBeUndefined();
    expect(result.content).toBe("露娜停在书架旁，等你选择。");
  });

  it("falls back final reasoning-channel text to visible content when reasoning capture is disabled", async () => {
    const streamed: string[] = [];
    const reasoning: string[] = [];
    const provider: ModelProvider = {
      id: "fake-disabled-final-reasoning",
      name: "Fake Disabled Final Reasoning",
      generate: vi.fn(),
      streamGenerate: vi.fn(async function* () {
        yield { reasoningContentDelta: "### 场景\n露娜把书递给你。" };
      }),
    };

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt,
      character,
      gameState: createInitialAgenticGameState(character),
      captureReasoning: false,
      onContentDelta: (delta) => {
        streamed.push(delta);
      },
      onReasoningDelta: (delta) => {
        reasoning.push(delta);
      },
    });

    expect(result.content).toBe("### 场景\n露娜把书递给你。");
    expect(result.reasoningContent).toBeUndefined();
    expect(streamed.join("")).toBe(result.content);
    expect(reasoning).toEqual([]);
  });
});
