/**
 * Whale Builder Tool Registry
 * Inspired by DeepSeek-Reasonix's ToolRegistry — centralizes all tool
 * definitions and handlers, eliminating duplication between chat and
 * one-shot agent entry points.
 */
import type { GenerateToolDefinition, CreateCharacterInput } from "@neo-tavern/shared";
import type {
  NeoBuilderTurnOptions,
  NeoBuilderChoice,
  NeoBuilderQuestion,
  NeoCharacterBuilderResult,
  NeoCreationPlan,
  NeoPersonalityPalette,
  NeoBuilderEvaluationReport,
  NeoStatusBarConfig,
} from "./types";
import type { NeoMvuConfig } from "./types";
import { REFERENCE_TEXTS } from "./references";
import {
  NEO_BUILDER_REFERENCE_LOOKUP_IDS,
  listNeoBuilderSkillReferences,
  readNeoBuilderSkillReference,
} from "../neo-builder-skill-references";
import { trimString, optionalString } from "./utils";
import {
  normalizeDraft,
  normalizePersonalityPalette,
  normalizeCreationPlan,
  normalizeEvaluationReport,
  updatePlanEntryStatus,
} from "./validation";
import { normalizeChoices, normalizeQuestionBundle, formatCreationPlan, defaultPlanChoices } from "./prompt";

// ── Tool result type ──

export interface ToolExecResult {
  output: unknown;
  savedDraft?: Omit<NeoCharacterBuilderResult, "usage" | "toolLog">;
  creationPlan?: NeoCreationPlan;
  personalityPalette?: NeoPersonalityPalette;
  evaluationReport?: NeoBuilderEvaluationReport;
  mvu?: NeoMvuConfig;
  statusBars?: NeoStatusBarConfig;
  choices?: NeoBuilderChoice[];
  questions?: NeoBuilderQuestion[];
  stopForUser?: boolean;
}

// ── Registry ──

export class WhaleBuilderToolRegistry {
  /** All registered tools indexed by name. */
  private readonly _tools = new Map<string, GenerateToolDefinition>();

  constructor() {
    for (const def of ALL_TOOL_DEFINITIONS) {
      this._tools.set(def.function.name, def);
    }
  }

  /** Chat-mode tool specs sent to the model. */
  get chatSpecs(): GenerateToolDefinition[] {
    return CHAT_TOOL_SPECS.map((name) => this._tools.get(name)!).filter(Boolean);
  }

  /** One-shot tool specs sent to the model. */
  get oneShotSpecs(): GenerateToolDefinition[] {
    return ONE_SHOT_SPECS.map((name) => this._tools.get(name)!).filter(Boolean);
  }

  /**
   * Execute a tool by name. Returns structured result including any
   * saved drafts, creation plans, or evaluation reports.
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions & {
      creationPlan?: NeoCreationPlan;
      personalityPalette?: NeoPersonalityPalette;
    },
  ): Promise<ToolExecResult> {
    switch (toolName) {
      case "list_skill_references":
        return this._handleListSkillReferences(args);

      case "read_skill_reference":
        return this._handleReadSkillReference(args);

      case "web_search":
        return this._handleWebSearch(args, options);

      case "ask_user_options":
        return this._handleAskUserOptions(args);

      case "present_creation_plan":
        return this._handlePresentCreationPlan(args, options);

      case "record_entry_output":
        return this._handleRecordEntryOutput(args, options);

      case "evaluate_character_draft":
        return this._handleEvaluateDraft(args, options);

      case "validate_character_draft":
      case "save_character_draft":
        return this._handleValidateOrSave(toolName, args, options);

      default:
        return { output: { ok: false, error: `Unknown tool: ${toolName}` } };
    }
  }

  private _handleListSkillReferences(args: Record<string, unknown>): ToolExecResult {
    const query = optionalString(args.query);
    return {
      output: {
        ok: true,
        query,
        references: listNeoBuilderSkillReferences(query),
      },
    };
  }

  private _handleReadSkillReference(args: Record<string, unknown>): ToolExecResult {
    const id = trimString(args.id);
    const reference = readNeoBuilderSkillReference(id);
    // Also check local REFERENCE_TEXTS for built-in short references
    const localText = REFERENCE_TEXTS[id];
    if (reference) {
      return {
        output: {
          ok: true,
          id: reference.id,
          title: reference.title,
          summary: reference.summary,
          content: reference.content,
        },
      };
    }
    if (localText) {
      return {
        output: {
          ok: true,
          id,
          title: id,
          content: localText,
        },
      };
    }
    return {
      output: {
        ok: false,
        error: `Unknown reference id: ${id}`,
        availableIds: NEO_BUILDER_REFERENCE_LOOKUP_IDS,
      },
    };
  }

  private async _handleWebSearch(
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions,
  ): Promise<ToolExecResult> {
    if (!options.webSearchEnabled) {
      return { output: { ok: false, error: "联网搜索未开启。" } };
    }
    if (!options.searchWeb) {
      return { output: { ok: false, error: "当前环境没有可用的联网搜索实现。" } };
    }
    const query = trimString(args.query);
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.max(1, Math.min(8, args.limit)) : 5;
    const results = await options.searchWeb(query, limit);
    return { output: { ok: true, query, results } };
  }

  private _handleAskUserOptions(args: Record<string, unknown>): ToolExecResult {
    const questions = normalizeQuestionBundle(args);
    const firstQuestion = questions[0];
    const choices = firstQuestion?.choices ?? [];
    return {
      output: {
        ok: true,
        question: firstQuestion?.question ?? "你想把这个角色往哪个方向推进？",
        reason: firstQuestion?.reason ?? optionalString(args.reason),
        choices,
        questions,
      },
      choices,
      questions,
      stopForUser: true,
    };
  }

  private _handlePresentCreationPlan(
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions & { creationPlan?: NeoCreationPlan },
  ): ToolExecResult {
    const choices = normalizeChoices(args.options);
    const planChoices = choices.length ? choices : defaultPlanChoices();
    const questions: NeoBuilderQuestion[] = [
      {
        id: "confirm_creation_plan",
        question: "这个规划可以继续吗？",
        choices: planChoices,
      },
    ];
    const creationPlan = normalizeCreationPlan(args, options.creationPlan);
    const personalityPalette = normalizePersonalityPalette(args.personalityPalette);
    return {
      output: {
        ok: true,
        question: "这个规划可以继续吗？",
        summaryText: formatCreationPlan(args),
        creationPlan,
        personalityPalette,
        choices: planChoices,
        questions,
      },
      creationPlan,
      personalityPalette,
      choices: planChoices,
      questions,
      stopForUser: true,
    };
  }

  private _handleRecordEntryOutput(
    args: Record<string, unknown>,
    options: { creationPlan?: NeoCreationPlan },
  ): ToolExecResult {
    const creationPlan = updatePlanEntryStatus(options.creationPlan, args);
    return {
      output: creationPlan
        ? {
            ok: true,
            summary: {
              entry: trimString(args.name || args.entryId),
              status: args.status,
              done: creationPlan.entries.filter((e) => e.status === "done").length,
              total: creationPlan.entries.length,
            },
          }
        : { ok: false, error: "当前没有可更新的创作规划。" },
      creationPlan,
    };
  }

  private _handleEvaluateDraft(
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions & {
      creationPlan?: NeoCreationPlan;
      personalityPalette?: NeoPersonalityPalette;
    },
  ): ToolExecResult {
    const pack = args.pack as Record<string, unknown> | undefined;
    const characterArg =
      pack?.character && typeof pack.character === "object"
        ? (pack.character as Partial<CreateCharacterInput>)
        : args.character && typeof args.character === "object"
          ? (args.character as Partial<CreateCharacterInput>)
          : (options.currentDraft ?? options.existingCharacter ?? undefined);
    const worldbookEntries =
      pack?.worldbook && typeof pack.worldbook === "object"
        ? (pack.worldbook as Record<string, unknown>).entries
        : (args.worldbookEntries ?? options.currentWorldbookEntries ?? []);
    const validation = normalizeDraft(
      {
        character: characterArg,
        worldbookEntries,
        personalityPalette:
          pack?.personalityPalette ?? args.personalityPalette ?? options.personalityPalette ?? undefined,
        creationPlan: pack?.creationPlan ?? args.creationPlan ?? options.creationPlan ?? undefined,
        mvu: pack?.mvu ?? args.mvu ?? undefined,
        statusBars: pack?.statusBars ?? args.statusBars ?? undefined,
      },
      options.existingCharacter,
    );
    const evaluationReport = normalizeEvaluationReport(args, validation.issues);
    return {
      output: {
        ok: true,
        summary: {
          issues: evaluationReport.issues.length,
          score: evaluationReport.score,
        },
        evaluationReport,
      },
      evaluationReport,
    };
  }

  private _handleValidateOrSave(
    toolName: string,
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions & {
      creationPlan?: NeoCreationPlan;
      personalityPalette?: NeoPersonalityPalette;
    },
  ): ToolExecResult {
    // If pack is provided, use it directly (Skill-native format)
    const pack = args.pack as Record<string, unknown> | undefined;
    const validation = normalizeDraft(
      {
        character: (pack?.character ?? args.character) as Record<string, unknown> | undefined,
        worldbookEntries:
          pack?.worldbook && typeof pack.worldbook === "object"
            ? (pack.worldbook as Record<string, unknown>).entries
            : args.worldbookEntries,
        worldbookName:
          pack?.worldbook && typeof pack.worldbook === "object"
            ? (pack.worldbook as Record<string, unknown>).name
            : args.worldbookName,
        worldbookDescription:
          pack?.worldbook && typeof pack.worldbook === "object"
            ? (pack.worldbook as Record<string, unknown>).description
            : args.worldbookDescription,
        personalityPalette:
          pack?.personalityPalette ?? args.personalityPalette ?? options.personalityPalette ?? undefined,
        creationPlan: pack?.creationPlan ?? args.creationPlan ?? options.creationPlan ?? undefined,
        mvu: pack?.mvu ?? args.mvu ?? undefined,
        statusBars: pack?.statusBars ?? args.statusBars ?? undefined,
        notes: pack?.notes ?? args.notes,
      },
      options.existingCharacter,
    );
    if (validation.issues.length > 0) {
      return { output: { ok: false, issues: validation.issues, normalizedDraft: validation.draft } };
    }
    const draft = {
      ...validation.draft,
      personalityPalette: validation.draft.personalityPalette ?? options.personalityPalette ?? undefined,
      creationPlan: validation.draft.creationPlan ?? options.creationPlan ?? undefined,
    };
    return {
      output: {
        ok: true,
        summary: {
          name: draft.character.name,
          worldbookEntries: draft.worldbookEntries.length,
          hasMvu: !!draft.mvu,
          hasStatusBars: !!draft.statusBars?.bars.length,
        },
      },
      savedDraft: toolName === "save_character_draft" ? draft : undefined,
      personalityPalette: draft.personalityPalette,
      creationPlan: draft.creationPlan,
      mvu: draft.mvu,
      statusBars: draft.statusBars,
    };
  }
}

// ── Tool definitions ──

const COMMON_TOOLS: GenerateToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_skill_reference",
      description: "读取 Whale Play 角色卡生成工作流的本地参考资料。",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "要读取的参考资料 id、路径或兼容别名。",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_character_draft",
      description: "检查 Whale Play 角色卡草稿是否满足字段、世界书和质量要求。接受 pack 对象或独立字段。",
      parameters: {
        type: "object",
        properties: {
          pack: { type: "object", description: "Skill 兼容的完整数据包（与 save_character_draft 相同格式）。" },
          character: { type: "object" },
          worldbookName: { type: "string" },
          worldbookDescription: { type: "string" },
          worldbookEntries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "条目名称" },
                keys: { type: "string", description: "逗号分隔的关键词" },
                content: { type: "string", description: "条目正文" },
                type: { type: "string", enum: ["always", "trigger"] },
                entryPath: { type: "string", description: "文件路径, e.g. 世界书/角色/苏云/基础信息.txt" },
                entryTypeName: { type: "string", description: "分类名, e.g. 角色、世界观、NPC" },
                priority: { type: "number", description: "优先级" },
                triggerMode: { type: "string", enum: ["and", "or"] },
                position: { type: "string", enum: ["beforeHistory", "afterHistory", "atDepth"] },
                role: { type: "string", enum: ["system", "user", "assistant"] },
              },
            },
          },
          personalityPalette: {
            type: "object",
            properties: {
              base: { type: "string", description: "底色：最深层性格基调" },
              main: { type: "array", items: { type: "string" }, description: "主色调" },
              accents: { type: "array", items: { type: "string" }, description: "点缀" },
              derivatives: {
                type: "array",
                description:
                  '衍生数组。每个条目包含 color（性格名）和 items（≥2 条场景行为描述）。也接受 {"性格名": ["描述1", "描述2"]} 格式。',
                items: {
                  type: "object",
                  properties: {
                    color: { type: "string", description: "性格名称，必须匹配 main/accents" },
                    items: { type: "array", items: { type: "string" }, description: "具体场景行为，每性格 ≥2 条" },
                  },
                },
              },
              futureDerivatives: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              compiledText: { type: "string" },
            },
          },
          creationPlan: { type: "object" },
          mvu: {
            type: "object",
            properties: {
              schemaTs: { type: "string", description: "TypeScript Zod schema (schema.ts content)." },
              initvarYaml: { type: "string", description: "YAML initial variable values." },
              updateRulesYaml: { type: "string", description: "YAML variable update rules." },
            },
          },
          statusBars: {
            type: "object",
            description: "Agentic Play 初始状态栏配置。只写结构化数据，不写 HTML/CSS。",
            properties: {
              version: { type: "number", enum: [1] },
              bars: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "稳定 id，如 health、mana、affection。" },
                    assetId: {
                      type: "string",
                      description: "本地素材 id：health/mana/stamina/affection/experience/sanity/danger。",
                    },
                    label: { type: "string" },
                    value: { type: ["number", "null"] },
                    max: { type: "number" },
                    min: { type: "number" },
                    description: { type: "string" },
                    valueLabel: { type: "string" },
                    visible: { type: "boolean" },
                    mvuPath: { type: "string" },
                  },
                  required: ["id", "assetId", "label", "value", "max"],
                },
              },
            },
          },
          notes: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_character_draft",
      description: "保存最终 Whale Play 角色卡草稿为 Skill 兼容格式。推荐使用 pack 对象。",
      parameters: {
        type: "object",
        properties: {
          pack: {
            type: "object",
            description: "Skill 兼容的完整角色卡数据包。",
            properties: {
              project: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  worldbookName: { type: "string" },
                  form: { type: "string", enum: ["charactercard", "worldbook"] },
                  mvu: { type: "boolean" },
                },
              },
              character: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  personality: { type: "string" },
                  scenario: { type: "string" },
                  firstMessage: { type: "string" },
                  exampleDialogues: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
              },
              personalityPalette: {
                type: "object",
                properties: {
                  base: { type: "string", description: "底色：最深层性格基调，始终存在" },
                  main: { type: "array", items: { type: "string" }, description: "主色调：日常最突出的性格（1-2 个）" },
                  accents: { type: "array", items: { type: "string" }, description: "点缀：特定条件下才显现的性格" },
                  derivatives: {
                    type: "array",
                    description:
                      '衍生：每个性格在具体场景中的行为。每条包含 color（性格名，须匹配 main/accents）和 items（≥2 条具体场景描述）。也接受 key-value map 格式 {"性格名": ["衍生一", "衍生二"]}。',
                    items: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: "性格名称，必须与 main 或 accents 中某个条目一致" },
                        items: {
                          type: "array",
                          items: { type: "string" },
                          description: "该性格在具体场景中的行为描述，每个性格至少 2 条",
                        },
                      },
                    },
                  },
                  futureDerivatives: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                  compiledText: { type: "string" },
                },
              },
              worldbook: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  entries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "条目名称" },
                        keys: { type: "string", description: "逗号分隔关键词（trigger必填）" },
                        content: { type: "string", description: "条目正文" },
                        type: { type: "string", enum: ["always", "trigger"] },
                        entryPath: { type: "string", description: "磁盘文件路径, e.g. 世界书/角色/苏云/基础信息.txt" },
                        entryTypeName: { type: "string", description: "分类名, e.g. 角色、世界观、NPC" },
                        priority: { type: "number" },
                        triggerMode: { type: "string", enum: ["and", "or"] },
                        position: { type: "string", enum: ["beforeHistory", "afterHistory", "atDepth"] },
                        role: { type: "string", enum: ["system", "user", "assistant"] },
                        enabled: { type: "boolean" },
                      },
                    },
                  },
                },
              },
              mvu: {
                type: "object",
                properties: {
                  schemaTs: { type: "string" },
                  initvarYaml: { type: "string" },
                  updateRulesYaml: { type: "string" },
                },
              },
              statusBars: {
                type: "object",
                description: "Agentic Play 初始状态栏配置。状态栏 UI 由本地素材库渲染，pack 里只写结构化数据。",
                properties: {
                  version: { type: "number", enum: [1] },
                  bars: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        assetId: { type: "string" },
                        label: { type: "string" },
                        value: { type: ["number", "null"] },
                        max: { type: "number" },
                        min: { type: "number" },
                        description: { type: "string" },
                        valueLabel: { type: "string" },
                        visible: { type: "boolean" },
                        mvuPath: { type: "string" },
                      },
                      required: ["id", "assetId", "label", "value", "max"],
                    },
                  },
                },
              },
              creationPlan: { type: "object" },
            },
          },
          character: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              personality: { type: "string" },
              scenario: { type: "string" },
              firstMessage: { type: "string" },
              exampleDialogues: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "personality", "scenario", "firstMessage"],
          },
          worldbookName: { type: "string" },
          worldbookDescription: { type: "string" },
          worldbookEntries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "条目名称" },
                keys: { type: "string", description: "逗号分隔的关键词" },
                content: { type: "string", description: "条目正文" },
                type: { type: "string", enum: ["always", "trigger"] },
                entryPath: { type: "string", description: "文件路径, e.g. 世界书/角色/苏云/基础信息.txt" },
                entryTypeName: { type: "string", description: "分类名, e.g. 角色、世界观、NPC" },
                priority: { type: "number" },
                triggerMode: { type: "string", enum: ["and", "or"] },
                position: { type: "string", enum: ["beforeHistory", "afterHistory", "atDepth"] },
                role: { type: "string", enum: ["system", "user", "assistant"] },
              },
            },
          },
          personalityPalette: {
            type: "object",
            properties: {
              base: { type: "string", description: "底色" },
              main: { type: "array", items: { type: "string" }, description: "主色调" },
              accents: { type: "array", items: { type: "string" }, description: "点缀" },
              derivatives: {
                type: "array",
                description:
                  '衍生数组。每个条目包含 color（性格名）和 items（≥2 条场景行为描述）。也接受 {"性格名": ["描述1", "描述2"]} 格式。',
                items: {
                  type: "object",
                  properties: {
                    color: { type: "string", description: "性格名称，必须匹配 main/accents" },
                    items: { type: "array", items: { type: "string" }, description: "具体场景行为，每性格 ≥2 条" },
                  },
                },
              },
              futureDerivatives: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              compiledText: { type: "string" },
            },
          },
          creationPlan: { type: "object" },
          statusBars: { type: "object", description: "Agentic Play 初始状态栏配置，与 pack.statusBars 相同。" },
          notes: { type: "string" },
        },
        required: ["character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_skill_references",
      description: "列出 Whale Builder 内置 skill reference 索引，用于决定下一步应读取哪些文档。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "可选搜索词，例如 character、worldbook、first-message。" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_character_draft",
      description:
        "评估当前 Whale Play 角色卡、性格调色盘、世界书和创作规划，输出可执行修改建议。接受 pack 对象或独立字段。",
      parameters: {
        type: "object",
        properties: {
          pack: { type: "object", description: "Skill 兼容的完整数据包（与 save_character_draft 相同格式）。" },
          character: { type: "object" },
          worldbookEntries: { type: "array", items: { type: "object" } },
          personalityPalette: { type: "object" },
          creationPlan: { type: "object" },
          summary: { type: "string" },
          issues: { type: "array", items: { type: "object" } },
          suggestions: { type: "array", items: { type: "string" } },
          score: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_entry_output",
      description: "登记创作规划中的某个条目已经完成、正在执行或跳过，用于断点续接和逐条产出追踪。",
      parameters: {
        type: "object",
        properties: {
          entryId: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["planned", "in_progress", "done", "skipped"] },
          outputRef: { type: "string" },
          skipReason: { type: "string" },
        },
        required: ["status"],
      },
    },
  },
];

const CHAT_ONLY_TOOLS: GenerateToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "ask_user_options",
      description: "向用户提出一个需要补全的角色设计问题，并给出 2-4 个可点击选项。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "要问用户的问题。" },
          reason: { type: "string", description: "为什么这个信息会影响角色卡。" },
          questions: {
            type: "array",
            description:
              "同一创作阶段需要一次性确认的 2-5 个问题。每个问题都有自己的选项；不要把同一阶段拆成多轮追问。",
            minItems: 2,
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                question: { type: "string" },
                reason: { type: "string" },
                options: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["label", "value"],
                  },
                },
              },
              required: ["question", "options"],
            },
          },
          options: {
            type: "array",
            description: "单个问题的选项。若本阶段有多个问题，改用 questions 数组。",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                description: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "present_creation_plan",
      description: "展示 Whale Play 角色卡创作规划并等待用户确认。",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          worldbookName: { type: "string" },
          sourceType: { type: "string" },
          planningMode: { type: "string" },
          summary: { type: "string" },
          characterPlan: { type: "string" },
          characters: { type: "array", items: { type: "object" } },
          personalityPalette: { type: "object" },
          worldPlan: { type: "string" },
          world: { type: "object" },
          style: { type: "object" },
          entryPlan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                type: { type: "string" },
                path: { type: "string" },
                part: { type: "string" },
                scope: { type: "string" },
                purpose: { type: "string" },
                keys: { type: "string" },
                sourceChapters: { type: "array", items: { type: "string" } },
              },
            },
          },
          firstMessagePlan: { type: "string" },
          firstMessage: { type: "object" },
          openQuestions: { type: "array", items: { type: "string" } },
          yaml: { type: "string" },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                description: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "联网搜索真实资料、历史背景、职业/地点/神话/作品风格等参考信息。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词。" },
          limit: { type: "number", description: "最多返回结果数量，默认 5。" },
        },
        required: ["query"],
      },
    },
  },
];

const ALL_TOOL_DEFINITIONS: GenerateToolDefinition[] = [...COMMON_TOOLS, ...CHAT_ONLY_TOOLS];

const ONE_SHOT_SPECS = [
  "read_skill_reference",
  "list_skill_references",
  "validate_character_draft",
  "save_character_draft",
  "evaluate_character_draft",
  "record_entry_output",
];

const CHAT_TOOL_SPECS = [
  "read_skill_reference",
  "ask_user_options",
  "present_creation_plan",
  "web_search",
  "validate_character_draft",
  "save_character_draft",
  "list_skill_references",
  "evaluate_character_draft",
  "record_entry_output",
];

// ── Singleton instance ──

export const builderToolRegistry = new WhaleBuilderToolRegistry();
