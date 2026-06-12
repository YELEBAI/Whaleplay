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
import { AGENTIC_STATUS_ASSET_PROMPT, createAgenticStatusBarsFromCharacter } from "./status-assets";
export type AgenticActionOption = {
  id: string;
  label: string;
  action: string;
  probability?: number;
  difficulty?: number;
  description?: string;
};

export interface DiceRollResult {
  dice: string;
  rolls: number[];
  roll: number;
  modifier: number;
  total: number;
  difficulty?: number;
  successProbability?: number;
  outcome: string;
  reason: string;
}

type JsonObject = Record<string, unknown>;

export type AgenticPresetItem = {
  name?: string;
  role: "system" | "user";
  content: string;
  injectionOrder: number;
};

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
  "请把开场停在第一个需要玩家选择的断点，并根据开场文字通过 present_player_options 工具给出恰好 5 个可选行动。",
  "每个选项都必须给出基于当前文本判断的成功率和 1d20 成功所需 DC。",
  "如果某个选项几乎必然成功，也要给出 95% 或 100%；如果风险极高，可以低至 5%。",
  "不要把选项直接写进正文；正文只写停在断点前的场景和必要提示。",
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
      name: "present_player_options",
      description:
        "Stop at a player-choice breakpoint and present structured action options for the Whale Play option panel. Use this instead of writing options into visible prose.",
      parameters: {
        type: "object",
        properties: {
          scene_text: {
            type: "string",
            description:
              "Visible narration up to the breakpoint. Do not include numbered options, success-rate option lines, unsupported prior NPC speech, or 'custom action' filler.",
          },
          question: {
            type: "string",
            description: "The short question shown above the option panel.",
          },
          options: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            description: "Exactly five player action options.",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Short option label or full action text shown to the player.",
                },
                action: {
                  type: "string",
                  description: "The exact action instruction to send back when selected.",
                },
                success_probability: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Estimated success probability for this action.",
                },
                difficulty: {
                  type: "integer",
                  minimum: 1,
                  maximum: 20,
                  description:
                    "Required 1d20 total / DC for success. The app rolls real dice against this number when the player selects the option.",
                },
                description: {
                  type: "string",
                  description:
                    "Optional short note explaining risk, cost, or likely consequence. Do not claim an NPC already spoke, warned, agreed, or revealed something unless that fact is visible in chat history.",
                },
              },
              required: ["label", "action", "success_probability", "difficulty"],
            },
          },
        },
        required: ["scene_text", "question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_game_state",
      description:
        "Patch the structured game state only with facts established by visible narration, the player's selected action JSON, or tool results. Do not save internal reasoning, unspoken NPC advice, or unused option ideas.",
      parameters: {
        type: "object",
        properties: {
          state_patch: {
            type: "object",
            description:
              "A JSON patch-like object. Objects are deep-merged; arrays and primitives replace existing values. Every patched fact must be grounded in visible chat history, the current player action, or a tool result.",
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
      status_bars: createAgenticStatusBarsFromCharacter(character),
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
  const rawPlayer = isRecord(value.player) ? value.player : {};
  const player = { ...fallback.player, ...rawPlayer };
  const hasPlayerStatusBars =
    isRecord(player.status_bars) &&
    Object.keys(player.status_bars).some((key) => isRecord((player.status_bars as JsonObject)[key]));
  if (!hasPlayerStatusBars && isRecord(fallback.player.status_bars)) {
    player.status_bars = fallback.player.status_bars;
  }
  return {
    ...fallback,
    ...value,
    mode: "narrative_dice",
    player,
    location: typeof value.location === "string" && value.location.trim() ? value.location : fallback.location,
    quest: isRecord(value.quest) ? value.quest : fallback.quest,
    npcs: Array.isArray(value.npcs) ? value.npcs : fallback.npcs,
    inventory: Array.isArray(value.inventory) ? value.inventory : fallback.inventory,
    flags: isRecord(value.flags) ? value.flags : fallback.flags,
    scene: isRecord(value.scene) ? value.scene : fallback.scene,
    log: Array.isArray(value.log) ? value.log.filter((item) => typeof item === "string").slice(-20) : fallback.log,
  };
}

function buildAgenticPlayCoreRuleSections(characterName: string) {
  return [
    {
      module: "core_identity",
      name: "核心身份",
      content: [
        "你是 Whale Play 的 Agentic Play 游戏主持人，不是普通单角色聊天机器人。",
        `所选角色「${characterName}」是当前剧情的核心角色、重要 NPC 或场景锚点；请保持其角色卡设定和世界书设定一致。`,
        "你的职责是主持互动剧情、扮演必要 NPC、描述场景、判断行动风险、给出成功率、调用骰子工具、解释后果、维护状态，并在选择断点给出行动选项。",
      ].join("\n"),
    },
    {
      module: "core_principles",
      name: "核心原则",
      content: [
        "核心原则：",
        "1. 不替玩家决定内心想法、感受或最终行动。",
        "2. 玩家输入优先于系统选项；选项只是建议。",
        "3. 如果开局或当前剧情来到需要玩家决定的断点，停止继续推进，调用 present_player_options 给出恰好 5 个行动选项。",
        "4. 每个行动选项必须根据当前文本、角色能力、环境和世界书估计成功率，并放入 success_probability，同时放入 difficulty（1d20 总值达到该 DC 即成功）。",
        "5. 普通、无风险、必然成功的动作不需要掷骰，但仍要说明为什么几乎必然成功。",
        "6. 玩家选择结构化选项时，Whale Play 可能已经把真实 roll_dice 结果以 JSON 输入给你；若用户输入包含 dice_result，必须直接使用该结果，禁止重复掷骰。",
        "7. 玩家输入自定义行动后，如果行动有风险、不确定、对抗、战斗、潜行、调查、搜索、说服、欺骗、魔法或运气成分，必须先估计成功率，再调用 roll_dice。",
        "8. 调用 roll_dice 时优先使用 1d20，并传入 success_probability 或 difficulty；掷骰结果必须真实来自工具，禁止编造骰点。",
        "9. 需要改变位置、物品、任务、NPC 关系、线索、危险等级或世界 flag 时，先调用 update_game_state 再输出最终回合。",
        "10. 失败也要推动剧情，给出代价、麻烦、线索或新选择，不要让故事停死。",
        "11. 保持世界书、角色卡、当前状态和最近历史连续，不随意重置。",
        "12. 如果剧情需要血量、魔法、耐力、好感度、经验、理智或危险进度，只写结构化状态变量，不在正文伪造 UI 状态栏。",
        "13. 连续性优先：只有可见聊天历史、当前玩家输入、结构化状态、世界书或工具结果中已经发生的内容，才能写成既成事实。",
        "14. 不要把你的推理、备选方案或未选择的选项描述当成历史事实。",
        "15. NPC 直接发言必须可见落地；如果某 NPC 给出警告、情报、评价或承诺，必须在同一回合输出 dialogue JSON。",
        "16. 如果可见历史中没有该 NPC 的 dialogue JSON，不得写“某某的话”“某某已经开口”“某某告诉过你”“某某刚才说过”这类引用既有发言的句子。",
        "17. 如果状态与可见历史冲突，以最近可见历史和当前玩家行动为准，并用保守表述修正，不继续扩写矛盾事实。",
      ].join("\n"),
    },
    {
      module: "status_assets",
      name: "状态栏素材库",
      content: AGENTIC_STATUS_ASSET_PROMPT,
    },
    {
      module: "continuity_evidence",
      name: "连续性与证据规则",
      content: [
        "连续性与证据规则：",
        "- 失败判定可以引入新麻烦，但新麻烦必须作为当前可见事件发生；不能把尚未写出的 NPC 警告、提示或对话写成已经发生。",
        "- 选项的 action / description 只能写玩家将要采取的行动、风险、成本和可能收益；禁止写未发生前提，例如“杜尔南已经开了口”。",
        "- update_game_state 只记录最终可见回复中已经发生的事实、玩家隐藏 JSON 中的选择和工具结果；不要把思考过程里的设想保存成 flag、任务目标或 NPC 关系。",
        "- 玩家选择结构化选项后，隐藏 JSON 中的 label/action/dice_result 是权威输入；未选择的选项和选项说明不是历史。",
        "- 错误例子：没有可见对白时写“杜尔南的话让悬赏单更重”。",
        '- 正确例子：先输出 {"type":"dialogue","speaker":"杜尔南","text":"这活儿不止老鼠。"}，再在旁白中承接这个新发生的警告。',
      ].join("\n"),
    },
    {
      module: "breakpoint_rules",
      name: "断点规则",
      content: [
        "断点规则：",
        "- 当你判断下一步必须由玩家选择时，只写到断点，不替玩家越过断点。",
        "- 断点必须调用 present_player_options；不要把选项列表直接写进正文。",
        "- present_player_options 的 scene_text 只写场景、风险和断点，不包含编号选项。",
        "- present_player_options 必须传恰好 5 个 options，每个 option 都带 success_probability 和 difficulty。",
        "- 开局根据 first message 生成选项时，不要调用 roll_dice。",
        "- 玩家选择结构化选项后，如果输入中已有 dice_result，只根据结果推进剧情，不要再次 roll_dice。",
        "- 玩家自定义行动时，先在文本中说明你判定的成功率，再根据该概率调用 roll_dice。",
      ].join("\n"),
    },
    {
      module: "dialogue_json_rules",
      name: "对白 JSON 规则",
      content: [
        "对白 JSON 规则：",
        '- 任何玩家或 NPC 的直接台词都单独输出一个 JSON 行：{"type":"dialogue","speaker":"露娜","text":"你好。"}',
        "- text 只写说出口的话，不写动作、表情、语气说明或旁白描述。",
        "- 旁白、场景、行动结果仍使用普通 Markdown，不要包进 dialogue JSON。",
        '- 示例 1：{"type":"dialogue","speaker":"露娜","text":"每一个问题都能在这里找到答案。"}',
        '- 示例 2：{"type":"dialogue","speaker":"玩家","text":"我想看看那本红封皮的书。"}',
        '- 示例 3：{"type":"dialogue","speaker":"守卫","text":"退后，这扇门今晚不会再开。"}',
      ].join("\n"),
    },
    {
      module: "option_json_example",
      name: "选项 JSON 例子",
      content: [
        "选项 JSON 例子（通过 present_player_options 工具传参，不写进正文）：",
        '{"label":"查看门缝","action":"玩家蹲下查看门缝后的动静","success_probability":70,"difficulty":7,"description":"低风险调查，成功可获得屋内线索。"}',
      ].join("\n"),
    },
    {
      module: "visible_reply_format",
      name: "最终可见回复格式",
      content: [
        "最终可见回复必须使用 Markdown，并尽量包含：",
        "### 场景",
        "### 行动解析",
        "### 成功率",
        "### 判定（如本回合需要）",
        "### 结果",
        "### 状态更新",
        "断点问题交给 present_player_options 工具发起，不在正文中列选项。",
      ].join("\n"),
    },
    {
      module: "action_option_requirements",
      name: "行动选项要求",
      content: [
        "行动选项要求：恰好 5 个，至少一个低风险选项、一个推进剧情选项、一个高风险高回报选项；每个选项都必须带成功率和 1d20 DC。",
        "不要输出内部 JSON，不要解释工具调用过程。",
      ].join("\n"),
    },
  ];
}

export function buildAgenticPlaySystemRules(characterName: string) {
  return buildAgenticPlayCoreRuleSections(characterName)
    .map((section) => section.content)
    .join("\n\n");
}

function formatAgenticModule(name: string, content: string) {
  return [`<agentic_module name="${name}">`, content.trim(), "</agentic_module>"].join("\n");
}

export function buildAgenticPlayPresetItems(characterName: string): AgenticPresetItem[] {
  return [
    ...buildAgenticPlayCoreRuleSections(characterName).map(
      (section, index): AgenticPresetItem => ({
        name: section.name,
        role: "system",
        injectionOrder: index * 10,
        content: formatAgenticModule(section.module, section.content),
      }),
    ),
    {
      name: "文风模块",
      role: "system",
      injectionOrder: 90,
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
      name: "特定规则模块",
      role: "system",
      injectionOrder: 100,
      content: formatAgenticModule(
        "specific_rules",
        [
          "特定规则模块：",
          "- 断点必须调用 present_player_options 给出恰好 5 个结构化选项，每个选项包含成功率和 1d20 DC。",
          "- 不要把断点选项写进正文；选项只进入工具参数。",
          "- 用户选择结构化选项时，如果输入中已经包含 dice_result，直接用该结果推进，不要重复 roll_dice。",
          "- 自定义行动必须先估计成功率，再根据风险决定是否 roll_dice。",
          "- 如果选项不是风险行动，仍给成功率，但不需要掷骰。",
          "- 状态变化必须通过 update_game_state 落地。",
        ].join("\n"),
      ),
    },
    {
      name: "主持人风格模块",
      role: "system",
      injectionOrder: 110,
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
      "如果结构化状态与可见聊天历史冲突，以最近可见历史和当前玩家行动为准；不要把没有可见对白证据的 NPC 发言扩写成事实。",
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

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionProbability(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = parseInteger(value, Number.NaN);
  if (!Number.isFinite(parsed)) return undefined;
  return clampNumber(parsed, 0, 100);
}

function difficultyFromProbability(probability: number | undefined, modifier = 0): number | undefined {
  if (probability === undefined) return undefined;
  return clampNumber(21 + modifier - Math.max(1, Math.min(20, Math.round(probability / 5))), 1, 20);
}

function parseOptionDifficulty(value: unknown, probability: number | undefined): number | undefined {
  if (value !== undefined && value !== null && value !== "") {
    const parsed = parseInteger(value, Number.NaN);
    if (Number.isFinite(parsed)) return clampNumber(parsed, 1, 20);
  }
  return difficultyFromProbability(probability);
}

function stripInlineOptionList(content: string) {
  const cleaned = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^#{1,6}\s*(?:你可以选择|可选行动|选项|行动选项)/i.test(trimmed)) return false;
      return !/^(?:[-*]\s*)?(?:选项\s*)?(?:\d+|[A-EＡ-Ｅ])[.)、:：]\s+.*(?:成功率|DC|难度|%|％)/i.test(trimmed);
    })
    .join("\n")
    .trim();
  return cleaned || content.trim();
}

function isAgenticScratchpadParagraph(paragraph: string) {
  const trimmed = paragraph.trim();
  if (!trimmed) return false;

  if (
    /(?:present_player_options|update_game_state|roll_dice|scene_text|success_probability|difficulty|tool_calls?)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /小猫之神|让我组织回复|构建回复|开始行动|状态已经更新|调用工具|工具调用|不要解释工具调用过程|写作风格|行为优先|情绪标注/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /^(?:现在|好的|OK|首先|然后|另外|关于|不过|实际上|我需要|我认为|我觉得|让我|这里)/.test(trimmed) &&
    /(?:规则|回复|dialogue JSON|选项|成功率|断点|状态更新|思考|准备|计算|调用|工具|DC)/i.test(trimmed)
  ) {
    return true;
  }
  if (/^(?:\d+\.|选项\s*\d+)/.test(trimmed) && /(?:成功率|低风险|高风险|推进剧情|DC)/i.test(trimmed)) {
    return true;
  }
  if (/^[-*]\s*(?:location|flags|quest|npcs?|DC|成功率|选项)/i.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeAgenticScratchpad(content: string) {
  const markers = [
    /现在按照规则/,
    /让我组织回复/,
    /构建回复/,
    /planning/i,
    /小猫之神/,
    /present_player_options/i,
    /update_game_state/i,
    /success_probability/i,
    /scene_text/i,
    /我需要.*(?:调用|选项|断点|状态更新)/s,
    /让我.*(?:准备|思考|计算|调用)/s,
  ];
  return markers.filter((pattern) => pattern.test(content)).length >= 2;
}

function sanitizeAgenticVisibleContent(content: string) {
  const stripped = stripInlineOptionList(content).trim();
  if (!stripped) return "";

  const paragraphs = stripped.split(/\n{2,}/);
  const kept = paragraphs.filter((paragraph) => !isAgenticScratchpadParagraph(paragraph));
  const cleaned = kept.join("\n\n").trim();

  if (!cleaned && looksLikeAgenticScratchpad(stripped)) return "";
  if (cleaned && looksLikeAgenticScratchpad(stripped)) return cleaned;
  return stripped;
}

function composeAgenticStopContent(assistantContent: string | undefined, sceneText: string | undefined) {
  const cleanedAssistant = sanitizeAgenticVisibleContent(assistantContent || "");
  const cleanedScene = sanitizeAgenticVisibleContent(sceneText || "");
  return cleanedAssistant || cleanedScene || "你下一步要怎么做？";
}

function normalizePlayerOptions(args: JsonObject): AgenticActionOption[] {
  if (!Array.isArray(args.options)) return [];
  return args.options
    .map((item, index): AgenticActionOption | null => {
      if (!isRecord(item)) return null;
      const label = trimString(item.label) || trimString(item.action) || trimString(item.value);
      const action = trimString(item.action) || trimString(item.value) || label;
      if (!action || /自定义行动|自由行动|自己输入|玩家也可以/.test(action)) return null;
      const probability = parseOptionProbability(item.success_probability ?? item.probability);
      const difficulty = parseOptionDifficulty(item.difficulty ?? item.dc ?? item.target_number, probability);
      if (probability === undefined || difficulty === undefined) return null;
      return {
        id: `agentic-tool-option-${index}-${action.slice(0, 24)}`,
        label: label || action,
        action,
        probability,
        difficulty,
        description: trimString(item.description) || undefined,
      };
    })
    .filter((item): item is AgenticActionOption => !!item)
    .slice(0, 5);
}

function parseDiceExpression(value: unknown) {
  const expression = String(value ?? "1d20")
    .trim()
    .toLowerCase();
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
      ? difficultyFromProbability(requestedProbability, modifier)
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

const AGENTIC_OPTIONS_REPAIR_PROMPT = [
  "上一轮没有正确发起 Whale Play 选项栏。",
  "请不要继续正文，也不要把选项写进正文。",
  "现在必须调用 present_player_options 工具，传入 scene_text、question，以及恰好 5 个 options。",
  "每个 option 必须包含 label、action、success_probability、difficulty；difficulty 是 1d20 总值达到即可成功的 DC。",
  "scene_text 只保留断点前的场景，不包含编号选项。",
  "不要在 scene_text 或 option.description 中引用未在可见历史发生过的 NPC 发言；如果需要 NPC 提供信息，必须先把该 NPC 的 dialogue JSON 写进 scene_text。",
].join("\n");

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

function appendToolCallDelta(
  parts: Map<number, ToolCallPart>,
  delta: NonNullable<GenerateChunk["toolCallDeltas"]>[number],
) {
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

type AgenticToolExecution = {
  nextState: AgenticGameState;
  result: unknown;
  stopForUser?: boolean;
  content?: string;
  agenticOptions?: AgenticActionOption[];
};

function executeTool(call: GenerateToolCall, state: AgenticGameState, character: Character): AgenticToolExecution {
  const args = parseToolArguments(call.function.arguments);

  if (call.function.name === "roll_dice") {
    return {
      nextState: state,
      result: rollDice(args),
    };
  }

  if (call.function.name === "present_player_options") {
    const agenticOptions = normalizePlayerOptions(args);
    const question = trimString(args.question) || "你下一步要怎么做？";
    const sceneText = stripInlineOptionList(trimString(args.scene_text) || trimString(args.content) || question);
    const valid = agenticOptions.length === 5;
    return {
      nextState: state,
      result: {
        ok: valid,
        question,
        options: agenticOptions,
        error: valid
          ? undefined
          : `present_player_options requires exactly 5 valid options after filtering; received ${agenticOptions.length}. Retry with exactly 5 options, each with success_probability and difficulty.`,
      },
      stopForUser: valid,
      content: valid ? sceneText : undefined,
      agenticOptions: valid ? agenticOptions : undefined,
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
  onDiceResult?: (result: DiceRollResult) => void;
  onFinalRound?: () => void;
  onContentDelta?: (delta: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string) => void | Promise<void>;
  onContentReset?: () => void | Promise<void>;
  requirePlayerOptions?: boolean;
}

export async function generateAgenticPlayTurn(options: GenerateAgenticPlayTurnOptions): Promise<{
  content: string;
  agenticOptions?: AgenticActionOption[];
  reasoningContent?: string;
  usage?: MessageUsage;
  gameState: AgenticGameState;
  finishReason?: string;
}> {
  const messages: GenerateMessage[] = [...options.builtPrompt.messages];
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
    const result: GenerateResult = await generateAgenticStep(
      options.provider,
      {
        ...baseGenerateInput,
        messages,
        tools: AGENTIC_PLAY_TOOL_DEFINITIONS,
        toolChoice: "auto",
      },
      {
        onReasoningDelta: options.onReasoningDelta,
      },
    );

    usage = addUsage(usage, result.usage);
    reasoningContent = appendReasoning(reasoningContent, result.reasoningContent);
    finishReason = result.finishReason;

    if (result.toolCalls?.length) {
      const assistantVisibleContent = sanitizeAgenticVisibleContent(result.content || "");
      messages.push({
        role: "assistant",
        content: assistantVisibleContent,
        toolCalls: result.toolCalls,
      });

      let stopForUser: {
        content: string;
        agenticOptions: AgenticActionOption[];
      } | null = null;

      for (const call of result.toolCalls) {
        options.onToolRound?.(call.function.name);
        const executed = executeTool(call, gameState, options.character);
        if (call.function.name === "roll_dice") {
          options.onDiceResult?.(executed.result as DiceRollResult);
        }
        gameState = executed.nextState;
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.function.name,
          content: JSON.stringify(executed.result),
        });
        if (executed.stopForUser && executed.agenticOptions?.length) {
          stopForUser = {
            content: composeAgenticStopContent(result.content, executed.content),
            agenticOptions: executed.agenticOptions,
          };
        }
      }
      if (stopForUser) {
        options.onFinalRound?.();
        return {
          content: stopForUser.content,
          agenticOptions: stopForUser.agenticOptions,
          reasoningContent: reasoningContent || undefined,
          usage,
          gameState,
          finishReason,
        };
      }
      continue;
    }

    if (options.requirePlayerOptions) {
      messages.push({
        role: "assistant",
        content: sanitizeAgenticVisibleContent(result.content || ""),
      });
      messages.push({
        role: "system",
        content: AGENTIC_OPTIONS_REPAIR_PROMPT,
      });
      continue;
    }

    const visibleContent = sanitizeAgenticVisibleContent(result.content);
    if (visibleContent) await options.onContentDelta?.(visibleContent);
    options.onFinalRound?.();
    return {
      content: visibleContent,
      reasoningContent: reasoningContent || undefined,
      usage,
      gameState,
      finishReason,
    };
  }

  options.onFinalRound?.();
  const finalResult = await generateAgenticStep(
    options.provider,
    {
      ...baseGenerateInput,
      messages: [
        ...messages,
        {
          role: "system",
          content: options.requirePlayerOptions
            ? AGENTIC_OPTIONS_REPAIR_PROMPT
            : "工具回合已经结束。请根据已经得到的工具结果，直接输出本回合的可见 Markdown 回复，不要再调用工具。",
        },
      ],
      tools: options.requirePlayerOptions ? AGENTIC_PLAY_TOOL_DEFINITIONS : undefined,
      toolChoice: options.requirePlayerOptions
        ? { type: "function", function: { name: "present_player_options" } }
        : undefined,
    },
    {
      onContentDelta: options.onContentDelta,
      onReasoningDelta: options.onReasoningDelta,
    },
  );

  usage = addUsage(usage, finalResult.usage);
  reasoningContent = appendReasoning(reasoningContent, finalResult.reasoningContent);

  if (finalResult.toolCalls?.length) {
    messages.push({
      role: "assistant",
      content: sanitizeAgenticVisibleContent(finalResult.content || ""),
      toolCalls: finalResult.toolCalls,
    });
    for (const call of finalResult.toolCalls) {
      options.onToolRound?.(call.function.name);
      const executed = executeTool(call, gameState, options.character);
      if (call.function.name === "roll_dice") {
        options.onDiceResult?.(executed.result as DiceRollResult);
      }
      gameState = executed.nextState;
      if (executed.stopForUser && executed.agenticOptions?.length) {
        return {
          content: composeAgenticStopContent(finalResult.content, executed.content),
          agenticOptions: executed.agenticOptions,
          reasoningContent: reasoningContent || undefined,
          usage,
          gameState,
          finishReason: finalResult.finishReason,
        };
      }
    }
  }

  const finalVisibleContent = sanitizeAgenticVisibleContent(finalResult.content);
  return {
    content: finalVisibleContent,
    reasoningContent: reasoningContent || undefined,
    usage,
    gameState,
    finishReason: finalResult.finishReason,
  };
}
