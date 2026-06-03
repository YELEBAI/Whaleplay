import type {
  BuiltPrompt,
  Character,
  ContextBlock,
  GenerateChunk,
  GenerateInput,
  GenerateMessage,
  GenerateResult,
  GenerateToolCall,
  GenerateToolDefinition,
  MessageUsage,
  ModelConfig,
  ModelProvider,
} from "@neo-tavern/shared";
import { shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";

type JsonObject = Record<string, unknown>;

type AgenticPresetItem = { role: "system" | "user"; content: string; injectionOrder: number };

export interface AgenticGameState {
  mode: "narrative_dice";
  player: JsonObject;
  location: string;
  quest: JsonObject;
  npcs: unknown[];
  inventory: unknown[];
  flags: JsonObject;
  scene: JsonObject;
  log: string[];
}

export const AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8;

export const AGENTIC_PLAY_OPENING_PROMPT = [
  "【Agentic Play 开局断点】",
  "请读取上文中的角色 first message / 开场消息、角色卡、世界书和当前状态。",
  "不要替玩家行动，不要掷骰，不要直接推进到行动结果。",
  "请把开场停在第一个需要玩家选择的断点，并根据开场文字给出恰好 5 个可选行动。",
  "每个选项都必须给出基于当前文本判断的成功率，格式包含“成功率：xx%”。",
  "如果某个选项几乎必然成功，也要给出 95% 或 100%；如果风险极高，可以低至 5%。",
  "最后补一句：玩家也可以输入自定义行动。",
].join("\n");

export const AGENTIC_PLAY_TOOL_DEFINITIONS: GenerateToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "roll_dice",
      description: "Roll real dice for uncertain RPG actions, checks, combat, luck, persuasion, stealth, or search.",
      parameters: {
        type: "object",
        properties: {
          dice: {
            type: "string",
            description: 'Dice expression such as "1d20", "2d6", or "3d10".',
          },
          modifier: {
            type: "integer",
            description: "Optional modifier added to the roll.",
            default: 0,
          },
          difficulty: {
            type: "integer",
            description: "Optional target difficulty / DC.",
          },
          success_probability: {
            type: "integer",
            description:
              "Estimated success probability from 5 to 95 before the roll. For 1d20 rolls, the tool converts it to a DC when difficulty is omitted.",
          },
          reason: {
            type: "string",
            description: "Why this roll is needed.",
          },
        },
        required: ["dice", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_game_state",
      description: "Patch the structured game state after the current turn changes location, inventory, quests, NPCs, or flags.",
      parameters: {
        type: "object",
        properties: {
          state_patch: {
            type: "object",
            description: "A JSON patch-like object. Objects are deep-merged; arrays and primitives replace existing values.",
          },
          reason: {
            type: "string",
            description: "Short reason for this state update.",
          },
        },
        required: ["state_patch", "reason"],
      },
    },
  },
];

export function createInitialAgenticGameState(character: Character): AgenticGameState {
  return {
    mode: "narrative_dice",
    player: {
      name: "玩家",
      hp: null,
      max_hp: null,
      traits: [],
      skills: {},
    },
    location: "起始场景",
    quest: {
      main: `${character.name} 的互动剧情`,
      current_objective: "了解当前处境，并选择下一步行动。",
      completed_objectives: [],
    },
    npcs: [
      {
        name: character.name,
        role: "core character",
        attitude: "in character",
      },
    ],
    inventory: [],
    flags: {},
    scene: {
      time: "unknown",
      danger_level: "low",
      active_conflict: "opening scene",
    },
    log: [],
  };
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeJson(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch;
  const next: JsonObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = isRecord(value) && isRecord(next[key]) ? mergeJson(next[key], value) : value;
  }
  return next;
}

export function normalizeAgenticGameState(value: unknown, character: Character): AgenticGameState {
  const fallback = createInitialAgenticGameState(character);
  if (!isRecord(value)) return fallback;
  return {
    ...fallback,
    ...value,
    mode: "narrative_dice",
    player: isRecord(value.player) ? value.player : fallback.player,
    location: typeof value.location === "string" && value.location.trim() ? value.location : fallback.location,
    quest: isRecord(value.quest) ? value.quest : fallback.quest,
    npcs: Array.isArray(value.npcs) ? value.npcs : fallback.npcs,
    inventory: Array.isArray(value.inventory) ? value.inventory : fallback.inventory,
    flags: isRecord(value.flags) ? value.flags : fallback.flags,
    scene: isRecord(value.scene) ? value.scene : fallback.scene,
    log: Array.isArray(value.log) ? value.log.filter((item) => typeof item === "string").slice(-20) : fallback.log,
  };
}

export function buildAgenticPlaySystemRules(characterName: string) {
  return [
    "你是 Whale Play 的 Agentic Play 游戏主持人，不是普通单角色聊天机器人。",
    `所选角色「${characterName}」是当前剧情的核心角色、重要 NPC 或场景锚点；请保持其角色卡设定和世界书设定一致。`,
    "你的职责是主持互动剧情、扮演必要 NPC、描述场景、判断行动风险、给出成功率、调用骰子工具、解释后果、维护状态，并在选择断点给出行动选项。",
    "",
    "核心原则：",
    "1. 不替玩家决定内心想法、感受或最终行动。",
    "2. 玩家输入优先于系统选项；选项只是建议。",
    "3. 如果开局或当前剧情来到需要玩家决定的断点，停止继续推进，给出恰好 5 个编号行动选项。",
    "4. 每个行动选项必须根据当前文本、角色能力、环境和世界书估计成功率，并写成“成功率：xx%”。",
    "5. 普通、无风险、必然成功的动作不需要掷骰，但仍要说明为什么几乎必然成功。",
    "6. 玩家选择选项或输入自定义行动后，如果行动有风险、不确定、对抗、战斗、潜行、调查、搜索、说服、欺骗、魔法或运气成分，必须先估计成功率，再调用 roll_dice。",
    "7. 调用 roll_dice 时优先使用 1d20，并传入 success_probability；掷骰结果必须真实来自工具，禁止编造骰点。",
    "8. 需要改变位置、物品、任务、NPC 关系、线索、危险等级或世界 flag 时，先调用 update_game_state 再输出最终回合。",
    "9. 失败也要推动剧情，给出代价、麻烦、线索或新选择，不要让故事停死。",
    "10. 保持世界书、角色卡、当前状态和最近历史连续，不随意重置。",
    "",
    "断点规则：",
    "- 当你判断下一步必须由玩家选择时，只写到断点，不替玩家越过断点。",
    "- 断点回复必须包含恰好 5 个编号选项，每个选项都带成功率。",
    "- 每个选项必须独占一行，格式固定为：1. 行动描述（成功率：xx%）。",
    "- 选项之后可以补一句“也可以输入自定义行动”，但这句话不算第 6 个选项。",
    "- 开局根据 first message 生成选项时，不要调用 roll_dice。",
    "- 玩家自定义行动时，先在文本中说明你判定的成功率，再根据该概率调用 roll_dice。",
    "",
    "最终可见回复必须使用 Markdown，并尽量包含：",
    "### 场景",
    "### 行动解析",
    "### 成功率",
    "### 判定（如本回合需要）",
    "### 结果",
    "### 状态更新",
    "### 你可以选择",
    "",
    "行动选项要求：恰好 5 个，至少一个低风险选项、一个推进剧情选项、一个高风险高回报选项；每个选项都必须带成功率。",
    "不要输出内部 JSON，不要解释工具调用过程。",
  ].join("\n");
}

function formatAgenticModule(name: string, content: string) {
  return [`<agentic_module name="${name}">`, content.trim(), "</agentic_module>"].join("\n");
}

export function buildAgenticPlayPresetItems(characterName: string): AgenticPresetItem[] {
  return [
    {
      role: "system",
      injectionOrder: 0,
      content: formatAgenticModule("core_rules", buildAgenticPlaySystemRules(characterName)),
    },
    {
      role: "system",
      injectionOrder: 10,
      content: formatAgenticModule(
        "writing_style",
        [
          "文风模块：",
          "- 叙述要有清晰场景感，但避免长篇铺陈。",
          "- 先写玩家能感知到的事实，再写风险、机会和后果。",
          "- 对话保持角色卡语气；旁白保持主持人视角，不抢走玩家主体性。",
          "- 成功率说明要自然嵌入，不要变成纯表格机器口吻。",
        ].join("\n"),
      ),
    },
    {
      role: "system",
      injectionOrder: 20,
      content: formatAgenticModule(
        "specific_rules",
        [
          "特定规则模块：",
          "- 断点必须给出恰好 5 个选项，每个选项包含成功率。",
          "- 自定义行动必须先估计成功率，再根据风险决定是否 roll_dice。",
          "- 如果选项不是风险行动，仍给成功率，但不需要掷骰。",
          "- 状态变化必须通过 update_game_state 落地。",
        ].join("\n"),
      ),
    },
    {
      role: "system",
      injectionOrder: 30,
      content: formatAgenticModule(
        "host_style",
        [
          "主持人风格模块：",
          "- 公正、敏锐、会制造选择压力，但不惩罚玩家的创造力。",
          "- 失败要产生新局面，不要只是说“不行”。",
          "- 让核心角色保持鲜明存在感，同时允许世界和其他 NPC 被调度。",
          "- 每次断点都应该让玩家感觉选择会改变局势。",
        ].join("\n"),
      ),
    },
  ];
}

export function createAgenticPlayContextBlock(gameState: AgenticGameState): ContextBlock {
  return {
    id: "agentic-play-state",
    source: "agentic",
    title: "Agentic Play Current State",
    content: [
      "下面是当前互动剧情的结构化状态。请以它为准承接剧情，并在状态变化时调用 update_game_state。",
      "",
      JSON.stringify(gameState, null, 2),
    ].join("\n"),
    priority: 20_000,
    role: "system",
    position: "afterHistory",
  };
}

function parseInteger(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseProbability(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = parseInteger(value, Number.NaN);
  if (!Number.isFinite(parsed)) return undefined;
  return clampNumber(parsed, 5, 95);
}

function parseDiceExpression(value: unknown) {
  const expression = String(value ?? "1d20").trim().toLowerCase();
  const match = expression.match(/^(\d*)d(\d+)$/);
  if (!match) throw new Error(`Invalid dice expression: ${expression}`);
  const count = Math.max(1, Math.min(20, parseInteger(match[1] || "1", 1)));
  const sides = Math.max(2, Math.min(1000, parseInteger(match[2], 20)));
  return { expression: `${count}d${sides}`, count, sides };
}

export function rollDice(args: JsonObject) {
  const { expression, count, sides } = parseDiceExpression(args.dice);
  const modifier = parseInteger(args.modifier, 0);
  const requestedProbability = parseProbability(args.success_probability);
  const providedDifficulty =
    args.difficulty === undefined || args.difficulty === null || args.difficulty === ""
      ? undefined
      : parseInteger(args.difficulty, 0);
  const probabilityDifficulty =
    providedDifficulty === undefined && requestedProbability !== undefined && expression === "1d20"
      ? 21 + modifier - Math.max(1, Math.min(20, Math.round(requestedProbability / 5)))
      : undefined;
  const difficulty = providedDifficulty ?? probabilityDifficulty;
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const roll = rolls.reduce((sum, value) => sum + value, 0);
  const total = roll + modifier;
  let outcome = "rolled";
  const successProbability =
    requestedProbability ??
    (difficulty !== undefined && expression === "1d20"
      ? clampNumber((21 - clampNumber(difficulty - modifier, 1, 21)) * 5, 0, 100)
      : undefined);

  if (expression === "1d20" && rolls[0] === 20) outcome = "critical_success";
  else if (expression === "1d20" && rolls[0] === 1) outcome = "critical_failure";
  else if (difficulty !== undefined) outcome = total >= difficulty ? "success" : "failure";

  return {
    dice: expression,
    rolls,
    roll,
    modifier,
    total,
    difficulty,
    successProbability,
    outcome,
    reason: String(args.reason ?? "Unspecified check"),
  };
}

function parseToolArguments(raw: string): JsonObject {
  try {
    const parsed = JSON.parse(raw || "{}");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addUsage(a?: MessageUsage, b?: MessageUsage): MessageUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: (a.promptTokens ?? 0) + (b.promptTokens ?? 0),
    completionTokens: (a.completionTokens ?? 0) + (b.completionTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    cacheHitTokens: (a.cacheHitTokens ?? 0) + (b.cacheHitTokens ?? 0),
    cacheMissTokens: (a.cacheMissTokens ?? 0) + (b.cacheMissTokens ?? 0),
  };
}

function appendReasoning(a: string, b?: string) {
  return [a, b].filter((value) => value?.trim()).join("\n\n");
}

type ToolCallPart = {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

function appendToolCallDelta(parts: Map<number, ToolCallPart>, delta: NonNullable<GenerateChunk["toolCallDeltas"]>[number]) {
  const index = typeof delta.index === "number" ? delta.index : parts.size;
  const current: ToolCallPart = parts.get(index) ?? { type: "function", function: { arguments: "" } };
  const nextFunction = {
    name: delta.function?.name ?? current.function?.name,
    arguments: `${current.function?.arguments ?? ""}${delta.function?.arguments ?? ""}`,
  };
  parts.set(index, {
    ...current,
    id: delta.id ?? current.id,
    type: delta.type ?? current.type,
    function: nextFunction,
  });
}

async function generateAgenticStep(
  provider: ModelProvider,
  input: GenerateInput,
  callbacks: {
    onContentDelta?: (delta: string) => void | Promise<void>;
    onReasoningDelta?: (delta: string) => void | Promise<void>;
  } = {},
): Promise<GenerateResult> {
  if (!provider.streamGenerate) return provider.generate(input);

  let content = "";
  let reasoningContent = "";
  let finishReason: string | undefined;
  let usage: MessageUsage | undefined;
  const raw: unknown[] = [];
  const toolParts = new Map<number, ToolCallPart>();

  for await (const chunk of provider.streamGenerate(input)) {
    if (chunk.raw) raw.push(chunk.raw);
    if (chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.contentDelta) {
      content += chunk.contentDelta;
      await callbacks.onContentDelta?.(chunk.contentDelta);
    }
    if (chunk.reasoningContentDelta) {
      reasoningContent += chunk.reasoningContentDelta;
      await callbacks.onReasoningDelta?.(chunk.reasoningContentDelta);
    }
    for (const delta of chunk.toolCallDeltas ?? []) {
      appendToolCallDelta(toolParts, delta);
    }
    usage = addUsage(usage, chunk.usage);
  }

  const toolCalls: GenerateToolCall[] = [...toolParts.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([index, part]): GenerateToolCall => ({
        id: part.id || `tool_call_${index}`,
        type: "function",
        function: {
          name: part.function?.name || "",
          arguments: part.function?.arguments || "",
        },
      }),
    )
    .filter((call) => call.function.name);

  return {
    content,
    reasoningContent: reasoningContent || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason,
    usage,
    raw,
  };
}

function executeTool(call: GenerateToolCall, state: AgenticGameState, character: Character) {
  const args = parseToolArguments(call.function.arguments);

  if (call.function.name === "roll_dice") {
    return {
      nextState: state,
      result: rollDice(args),
    };
  }

  if (call.function.name === "update_game_state") {
    const patch = isRecord(args.state_patch) ? args.state_patch : {};
    const merged = mergeJson(state, patch);
    const nextState = normalizeAgenticGameState(merged, character);
    const reason = String(args.reason ?? "State updated.");
    return {
      nextState,
      result: {
        ok: true,
        reason,
        updated_state: nextState,
      },
    };
  }

  return {
    nextState: state,
    result: {
      ok: false,
      error: `Unknown tool: ${call.function.name}`,
    },
  };
}

export interface GenerateAgenticPlayTurnOptions {
  provider: ModelProvider;
  modelConfig: ModelConfig;
  builtPrompt: BuiltPrompt;
  character: Character;
  gameState: AgenticGameState;
  userId?: string;
  signal?: AbortSignal;
  onToolRound?: (toolName: string) => void;
  onFinalRound?: () => void;
  onContentDelta?: (delta: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string) => void | Promise<void>;
  onContentReset?: () => void | Promise<void>;
}

export async function generateAgenticPlayTurn(options: GenerateAgenticPlayTurnOptions): Promise<{
  content: string;
  reasoningContent?: string;
  usage?: MessageUsage;
  gameState: AgenticGameState;
  finishReason?: string;
}> {
  let messages: GenerateMessage[] = [...options.builtPrompt.messages];
  let gameState = normalizeAgenticGameState(options.gameState, options.character);
  let usage: MessageUsage | undefined;
  let reasoningContent = "";
  let finishReason: string | undefined;

  const baseGenerateInput = {
    model: options.modelConfig.model,
    omitTemperature: shouldOmitTemperatureForModel(options.modelConfig),
    temperature: options.modelConfig.temperature,
    maxTokens: options.modelConfig.maxTokens,
    reasoningEffort: options.modelConfig.reasoningEffort || undefined,
    userId: options.userId,
    signal: options.signal,
  };

  for (let round = 0; round < AGENTIC_PLAY_MAX_TOOL_ROUNDS; round++) {
    let streamedContent = false;
    const result: GenerateResult = await generateAgenticStep(options.provider, {
      ...baseGenerateInput,
      messages,
      tools: AGENTIC_PLAY_TOOL_DEFINITIONS,
      toolChoice: "auto",
    }, {
      onContentDelta: (delta) => {
        streamedContent = true;
        return options.onContentDelta?.(delta);
      },
      onReasoningDelta: options.onReasoningDelta,
    });

    usage = addUsage(usage, result.usage);
    reasoningContent = appendReasoning(reasoningContent, result.reasoningContent);
    finishReason = result.finishReason;

    if (result.toolCalls?.length) {
      if (streamedContent) await options.onContentReset?.();
      messages.push({
        role: "assistant",
        content: result.content || "",
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        options.onToolRound?.(call.function.name);
        const executed = executeTool(call, gameState, options.character);
        gameState = executed.nextState;
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.function.name,
          content: JSON.stringify(executed.result),
        });
      }
      continue;
    }

    options.onFinalRound?.();
    return {
      content: result.content,
      reasoningContent: reasoningContent || undefined,
      usage,
      gameState,
      finishReason,
    };
  }

  options.onFinalRound?.();
  const finalResult = await generateAgenticStep(options.provider, {
    ...baseGenerateInput,
    messages: [
      ...messages,
      {
        role: "system",
        content: "工具回合已经结束。请根据已经得到的工具结果，直接输出本回合的可见 Markdown 回复，不要再调用工具。",
      },
    ],
  }, {
    onContentDelta: options.onContentDelta,
    onReasoningDelta: options.onReasoningDelta,
  });

  usage = addUsage(usage, finalResult.usage);
  reasoningContent = appendReasoning(reasoningContent, finalResult.reasoningContent);

  return {
    content: finalResult.content,
    reasoningContent: reasoningContent || undefined,
    usage,
    gameState,
    finishReason: finalResult.finishReason,
  };
}
