/**
 * Whale Builder Tool Registry
 * Inspired by DeepSeek-Reasonix's ToolRegistry — centralizes all tool
 * definitions and handlers, eliminating duplication between chat and
 * one-shot agent entry points.
 */
import type { GenerateToolDefinition, CreateCharacterInput } from "@neo-tavern/shared";
import type {
  DraftPayload,
  NeoBuilderTurnOptions,
  NeoBuilderChoice,
  NeoCharacterBuilderResult,
  NeoCreationPlan,
  NeoPersonalityPalette,
  NeoBuilderEvaluationReport,
} from "./types";
import type { NeoMvuConfig } from "./types";
import { REFERENCE_TEXTS } from "./references";
import {
  NEO_BUILDER_REFERENCE_LOOKUP_IDS,
  listNeoBuilderSkillReferences,
  readNeoBuilderSkillReference,
} from "../neo-builder-skill-references";
import {
  trimString,
  optionalString,
} from "./utils";
import {
  normalizeDraft,
  normalizePersonalityPalette,
  normalizeCreationPlan,
  normalizeEvaluationReport,
  updatePlanEntryStatus,
} from "./validation";
import { normalizeChoices, formatCreationPlan, defaultPlanChoices } from "./prompt";

// ── Tool result type ──

export interface ToolExecResult {
  output: unknown;
  savedDraft?: Omit<NeoCharacterBuilderResult, "usage" | "toolLog">;
  creationPlan?: NeoCreationPlan;
  personalityPalette?: NeoPersonalityPalette;
  evaluationReport?: NeoBuilderEvaluationReport;
  mvu?: NeoMvuConfig;
  choices?: NeoBuilderChoice[];
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
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(8, args.limit))
        : 5;
    const results = await options.searchWeb(query, limit);
    return { output: { ok: true, query, results } };
  }

  private _handleAskUserOptions(args: Record<string, unknown>): ToolExecResult {
    const question = trimString(args.question) || "你想把这个角色往哪个方向推进？";
    const choices = normalizeChoices(args.options);
    return {
      output: { ok: true, question, reason: optionalString(args.reason), choices },
      choices,
      stopForUser: true,
    };
  }

  private _handlePresentCreationPlan(
    args: Record<string, unknown>,
    options: NeoBuilderTurnOptions & { creationPlan?: NeoCreationPlan },
  ): ToolExecResult {
    const choices = normalizeChoices(args.options);
    const creationPlan = normalizeCreationPlan(args, options.creationPlan);
    const personalityPalette = normalizePersonalityPalette(args.personalityPalette);
    return {
      output: {
        ok: true,
        question: "这个规划可以继续吗？",
        summaryText: formatCreationPlan(args),
        creationPlan,
        personalityPalette,
        choices: choices.length ? choices : defaultPlanChoices(),
      },
      creationPlan,
      personalityPalette,
      choices: choices.length ? choices : defaultPlanChoices(),
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
    const characterArg =
      args.character && typeof args.character === "object"
        ? (args.character as Partial<CreateCharacterInput>)
        : (options.currentDraft ?? options.existingCharacter ?? undefined);
    const validation = normalizeDraft(
      {
        character: characterArg,
        worldbookEntries: args.worldbookEntries ?? options.currentWorldbookEntries ?? [],
        personalityPalette: args.personalityPalette ?? options.personalityPalette ?? undefined,
        creationPlan: args.creationPlan ?? options.creationPlan ?? undefined,
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
    const validation = normalizeDraft(
      {
        ...(args as DraftPayload),
        personalityPalette: args.personalityPalette ?? options.personalityPalette ?? undefined,
        creationPlan: args.creationPlan ?? options.creationPlan ?? undefined,
        mvu: args.mvu ?? undefined,
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
        },
      },
      savedDraft: toolName === "save_character_draft" ? draft : undefined,
      personalityPalette: draft.personalityPalette,
      creationPlan: draft.creationPlan,
      mvu: draft.mvu,
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
      description: "检查 Whale Play 角色卡草稿是否满足字段、世界书和质量要求。",
      parameters: {
        type: "object",
        properties: {
          character: { type: "object" },
          worldbookName: { type: "string" },
          worldbookDescription: { type: "string" },
          worldbookEntries: { type: "array", items: { type: "object" } },
          personalityPalette: { type: "object" },
          creationPlan: { type: "object" },
          mvu: {
            type: "object",
            properties: {
              schemaTs: { type: "string", description: "TypeScript Zod schema (schema.ts content)." },
              initvarYaml: { type: "string", description: "YAML initial variable values." },
              updateRulesYaml: { type: "string", description: "YAML variable update rules." },
            },
          },
          notes: { type: "string" },
        },
        required: ["character"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_character_draft",
      description: "保存最终 Whale Play 角色卡草稿。草稿必须已经满足 Whale Play 字段和世界书规则。",
      parameters: {
        type: "object",
        properties: {
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
          worldbookEntries: { type: "array", items: { type: "object" } },
          personalityPalette: {
            type: "object",
            properties: {
              base: { type: "string" },
              main: { type: "array", items: { type: "string" } },
              accents: { type: "array", items: { type: "string" } },
              derivatives: { type: "array", items: { type: "object" } },
              futureDerivatives: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              compiledText: { type: "string" },
            },
          },
          creationPlan: { type: "object" },
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
      description: "评估当前 Whale Play 角色卡、性格调色盘、世界书和创作规划，输出可执行修改建议。",
      parameters: {
        type: "object",
        properties: {
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
