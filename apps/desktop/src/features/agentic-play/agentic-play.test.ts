import { describe, expect, it, vi } from "vitest";
import type { BuiltPrompt, Character, ModelConfig, ModelProvider } from "@neo-tavern/shared";
import {
  createAgenticPlayContextBlock,
  createInitialAgenticGameState,
  generateAgenticPlayTurn,
  rollDice,
} from "./agentic-play";
import { extractAgenticOptions } from "./agentic-options";

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

  it("extracts visible agentic choices into actions", () => {
    const parsed = extractAgenticOptions([
      "### 场景",
      "露娜停在书架旁。",
      "",
      "### 你可以选择",
      "1. 询问禁书的下落（成功率：72%）",
      "2. 检查桌上的索引卡（成功率：85%）",
      "3. 偷偷绕到柜台后方（成功率：38%）",
      "4. 等露娜主动解释（成功率：90%）",
      "5. 直接说明你的来意（成功率：65%）",
      "玩家也可以输入自定义行动。",
    ].join("\n"));

    expect(parsed.content).toContain("露娜停在书架旁。");
    expect(parsed.content).not.toContain("询问禁书");
    expect(parsed.options).toHaveLength(5);
    expect(parsed.options[0]).toMatchObject({ action: "询问禁书的下落", probability: 72 });
  });
});
