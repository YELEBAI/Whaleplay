/**
 * Whale Builder Agent Loop
 * Unifies the chat-based (runNeoCharacterBuilderTurn) and one-shot (buildNeoCharacterDraft)
 * entry points through a shared ToolRegistry — eliminating 90% of the duplicated handler code.
 *
 * Inspired by DeepSeek-Reasonix's CacheFirstLoop:
 * - Tool dispatch via unified registry
 * - Intermediate product preservation on errors
 * - Exponential-backoff retry for provider calls
 */
import { createModelProvider } from "@neo-tavern/core";
import type {
  CreateCharacterInput,
  GenerateMessage,
  MessageUsage,
} from "@neo-tavern/shared";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { getChatScopedDeepSeekUserId, shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import type {
  NeoCharacterBuilderOptions,
  NeoCharacterBuilderResult,
  NeoBuilderTurnOptions,
  NeoBuilderTurnResult,
  NeoBuilderToolEvent,
  NeoBuilderChoice,
  NeoCreationPlan,
  NeoPersonalityPalette,
  NeoBuilderEvaluationReport,
  NeoMvuConfig,
} from "./types";
import { WhaleBuilderToolRegistry, builderToolRegistry } from "./tool-registry";
import { generateBuilderStep } from "./streaming";
import { buildSystemPrompt, buildUserPrompt, conversationToGenerateMessages } from "./prompt";
import { withRetry } from "./retry";
import {
  addUsage,
  parseToolArguments,
  stringifyToolResult,
  createBuilderEventId,
  getToolLabel,
  emitToolEvent,
  appendVisibleBuilderContent,
  summarizeToolOutput,
  buildStopForUserContent,
} from "./utils";
import { extractJsonObject } from "./utils";
import { normalizeDraft } from "./validation";

// ── Autocontinue import → defined in prompt.ts, re-exported below ──
import {
  shouldAutoContinueBuilderText,
  buildAutoContinueInstruction,
} from "./prompt";

const BUILDER_MAX_TOOL_ROUNDS = 24;

// ── Intermediate state container — survives tool errors ──

interface AgentState {
  savedDraft?: Omit<NeoCharacterBuilderResult, "usage" | "toolLog">;
  creationPlan?: NeoCreationPlan;
  personalityPalette?: NeoPersonalityPalette;
  evaluationReport?: NeoBuilderEvaluationReport;
  mvu?: NeoMvuConfig;
}

/**
 * Chat-mode agent. Multi-turn tool-calling loop with streaming.
 */
export async function runNeoCharacterBuilderTurn(
  options: NeoBuilderTurnOptions,
  registry: WhaleBuilderToolRegistry = builderToolRegistry,
): Promise<NeoBuilderTurnResult> {
  const provider = createModelProvider(options.modelConfig);
  const messages = conversationToGenerateMessages(options);
  const events: NeoBuilderToolEvent[] = [];
  const toolLog: string[] = [];
  let totalUsage: MessageUsage | undefined;
  let reasoningContent = "";
  const state: AgentState = {
    creationPlan: options.creationPlan ?? undefined,
    personalityPalette: options.personalityPalette ?? undefined,
    mvu: options.currentMvu ?? undefined,
  };
  let pendingChoices: NeoBuilderChoice[] | undefined;
  let assistantContent = "";
  let textContinuations = 0;

  for (let round = 0; round < BUILDER_MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await withRetry(
        () =>
          generateBuilderStep(
            provider,
            {
              messages,
              model: options.modelConfig.model,
              temperature: options.modelConfig.temperature,
              omitTemperature: shouldOmitTemperatureForModel(options.modelConfig),
              maxTokens: Math.max(options.modelConfig.maxTokens || 0, 2600),
              reasoningEffort: options.modelConfig.reasoningEffort,
              tools: registry.chatSpecs,
              toolChoice: "auto",
              userId: getChatScopedDeepSeekUserId(options.modelConfig, `character_builder_${options.scopeId || "new"}`),
              signal: options.signal,
            },
            options,
          ),
        { signal: options.signal, onRetry: (info) => { toolLog.push(`retry:${info.reason}`); } },
      );
    } catch (err) {
      if (options.signal?.aborted) throw err;
      // Provider calls exhausted retries — return best-effort intermediate state
      const errMsg = (err as Error).message || "AI generation failed";
      return {
        content: assistantContent || errMsg,
        choices: pendingChoices,
        draft: state.savedDraft,
        creationPlan: state.creationPlan,
        personalityPalette: state.personalityPalette,
        evaluationReport: state.evaluationReport,
        mvu: state.mvu,
        usage: withDeepSeekUsageCost(totalUsage, options.modelConfig),
        reasoningContent: reasoningContent || undefined,
        toolEvents: events,
        toolLog,
      };
    }

    totalUsage = addUsage(totalUsage, result.usage);
    if (result.reasoningContent) {
      reasoningContent = [reasoningContent, result.reasoningContent].filter(Boolean).join("\n\n");
    }
    assistantContent = appendVisibleBuilderContent(assistantContent, result.content || "");

    if (result.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: result.content || "",
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const args = parseToolArguments(call.function.arguments);
        const toolName = call.function.name;
        const id = createBuilderEventId();
        const runningEvent: NeoBuilderToolEvent = {
          id, name: toolName, label: getToolLabel(toolName), status: "running", args,
        };
        emitToolEvent(events, options.onToolEvent, runningEvent);

        try {
          const executed = await registry.execute(toolName, args, {
            ...options,
            creationPlan: state.creationPlan,
            personalityPalette: state.personalityPalette,
          });
          const doneEvent: NeoBuilderToolEvent = {
            ...runningEvent, status: "done", result: summarizeToolOutput(executed.output),
          };
          emitToolEvent(events, options.onToolEvent, doneEvent);
          toolLog.push(toolName);

          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: toolName,
            content: stringifyToolResult(executed.output),
          });

          // Accumulate intermediate products (survive later errors)
          if (executed.savedDraft) state.savedDraft = executed.savedDraft;
          if (executed.creationPlan) state.creationPlan = executed.creationPlan;
          if (executed.personalityPalette) state.personalityPalette = executed.personalityPalette;
          if (executed.evaluationReport) state.evaluationReport = executed.evaluationReport;
          if (executed.mvu) state.mvu = executed.mvu;
          if (executed.choices?.length) pendingChoices = executed.choices;

          if (executed.stopForUser) {
            const output = executed.output as Record<string, unknown>;
            assistantContent = buildStopForUserContent(output);
            return {
              content: assistantContent || result.content || "我需要你再补一个选择。",
              choices: pendingChoices,
              draft: state.savedDraft,
              creationPlan: state.creationPlan,
              personalityPalette: state.personalityPalette,
              evaluationReport: state.evaluationReport,
              mvu: state.mvu,
              usage: withDeepSeekUsageCost(totalUsage, options.modelConfig),
              reasoningContent: reasoningContent || undefined,
              toolEvents: [...events],
              toolLog,
            };
          }
        } catch (err) {
          const errorMessage = (err as Error).message || "Tool failed";
          emitToolEvent(events, options.onToolEvent, {
            ...runningEvent, status: "error", error: errorMessage,
          });
          toolLog.push(toolName);
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: toolName,
            content: stringifyToolResult({ ok: false, error: errorMessage }),
          });
        }
      }

      if (state.savedDraft) {
        assistantContent =
          result.content ||
          `产出物已准备好：${state.savedDraft.character.name}。你可以在右侧查看角色卡与世界书细则，然后保存。`;
        break;
      }
      continue;
    }

    // No tool calls — try JSON extraction as fallback
    const parsed = extractJsonObject(assistantContent);
    if (parsed) {
      const validation = normalizeDraft(parsed as any, options.existingCharacter);
      if (validation.issues.length === 0) state.savedDraft = validation.draft;
    }

    if (state.savedDraft) break;

    if (
      shouldAutoContinueBuilderText({
        content: result.content || assistantContent,
        finishReason: result.finishReason,
        textContinuations,
        toolLog,
        creationPlan: state.creationPlan,
        currentDraft: options.currentDraft,
        currentWorldbookEntries: options.currentWorldbookEntries,
      })
    ) {
      textContinuations += 1;
      messages.push({ role: "assistant", content: result.content || assistantContent });
      messages.push({
        role: "user",
        content: buildAutoContinueInstruction({
          content: result.content || assistantContent,
          finishReason: result.finishReason,
          creationPlan: state.creationPlan,
          hasDraft: !!options.currentDraft || !!state.savedDraft,
          hasWorldbookEntries: !!options.currentWorldbookEntries?.length,
        }),
      });
      continue;
    }
    break;
  }

  return {
    content:
      assistantContent || (state.savedDraft ? `产出物已准备好：${state.savedDraft.character.name}。` : "我已经处理完这一轮。"),
    choices: pendingChoices,
    draft: state.savedDraft,
    creationPlan: state.creationPlan,
    personalityPalette: state.savedDraft?.personalityPalette ?? state.personalityPalette,
    evaluationReport: state.evaluationReport,
    mvu: state.savedDraft?.mvu ?? state.mvu,
    usage: withDeepSeekUsageCost(totalUsage, options.modelConfig),
    reasoningContent: reasoningContent || undefined,
    toolEvents: events,
    toolLog,
  };
}

/**
 * One-shot agent. Single generate → tool-calling loop → draft.
 * Shares the same ToolRegistry as the chat mode.
 */
export async function buildNeoCharacterDraft(
  options: NeoCharacterBuilderOptions,
  registry: WhaleBuilderToolRegistry = builderToolRegistry,
): Promise<NeoCharacterBuilderResult> {
  const provider = createModelProvider(options.modelConfig);
  const messages: GenerateMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(options) },
  ];

  let totalUsage: MessageUsage | undefined;
  const state: AgentState = {};
  const toolLog: string[] = [];

  for (let round = 0; round < 12; round++) {
    let result;
    try {
      result = await withRetry(
        () =>
          provider.generate({
            messages,
            model: options.modelConfig.model,
            temperature: options.modelConfig.temperature,
            omitTemperature: shouldOmitTemperatureForModel(options.modelConfig),
            maxTokens: Math.max(options.modelConfig.maxTokens || 0, 3200),
            reasoningEffort: options.modelConfig.reasoningEffort,
            tools: registry.oneShotSpecs,
            toolChoice: "auto",
            userId: getChatScopedDeepSeekUserId(options.modelConfig, `character_builder_${options.scopeId || "new"}`),
            signal: options.signal,
          }),
        { signal: options.signal },
      );
    } catch (err) {
      if (options.signal?.aborted) throw err;
      return createBestEffortResult(state, toolLog, totalUsage, options, (err as Error).message);
    }

    totalUsage = addUsage(totalUsage, result.usage);

    if (result.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: result.content || "",
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const args = parseToolArguments(call.function.arguments);
        const toolName = call.function.name;

        try {
          const executed = await registry.execute(toolName, args, {
            conversation: [],
            modelConfig: options.modelConfig,
            existingCharacter: options.existingCharacter,
            scopeId: options.scopeId,
            signal: options.signal,
            creationPlan: state.creationPlan,
            personalityPalette: state.personalityPalette,
          });
          toolLog.push(toolName);

          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: toolName,
            content: stringifyToolResult(executed.output),
          });

          if (executed.savedDraft) state.savedDraft = executed.savedDraft;
          if (executed.creationPlan) state.creationPlan = executed.creationPlan;
          if (executed.personalityPalette) state.personalityPalette = executed.personalityPalette;
          if (executed.evaluationReport) state.evaluationReport = executed.evaluationReport;
          if (executed.mvu) state.mvu = executed.mvu;
        } catch (err) {
          toolLog.push(toolName);
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: toolName,
            content: stringifyToolResult({ ok: false, error: (err as Error).message }),
          });
        }
      }

      if (state.savedDraft) break;
      continue;
    }

    const parsed = extractJsonObject(result.content || "");
    if (parsed) {
      const validation = normalizeDraft(parsed as any, options.existingCharacter);
      if (validation.issues.length === 0) {
        state.savedDraft = validation.draft;
        break;
      }
    }

    messages.push({
      role: "assistant",
      content: result.content || "",
    });
    messages.push({
      role: "user",
      content: "请不要继续普通文本说明。请根据 Whale Play 工作流修正草稿，并调用 save_character_draft 保存最终结果。",
    });
  }

  return createBestEffortResult(state, toolLog, totalUsage, options);
}

function createBestEffortResult(
  state: AgentState,
  toolLog: string[],
  totalUsage: MessageUsage | undefined,
  options: { modelConfig: import("@neo-tavern/shared").ModelConfig; scopeId?: string | null; existingCharacter?: CreateCharacterInput | null },
  error?: string,
): NeoCharacterBuilderResult {
  if (!state.savedDraft) {
    throw new Error(error || "AI 没有保存可用的 Whale Play 角色卡草稿，请补充更明确的角色方向后重试。");
  }

  return {
    character: state.savedDraft.character,
    worldbookName: state.savedDraft.worldbookName,
    worldbookDescription: state.savedDraft.worldbookDescription,
    worldbookEntries: state.savedDraft.worldbookEntries,
    personalityPalette: state.savedDraft.personalityPalette ?? state.personalityPalette,
    creationPlan: state.savedDraft.creationPlan ?? state.creationPlan,
    evaluationReport: state.evaluationReport,
    mvu: state.savedDraft.mvu ?? state.mvu,
    notes: error ? `生成过程中遇到错误：${error}` : state.savedDraft.notes,
    usage: withDeepSeekUsageCost(totalUsage, options.modelConfig as any),
    toolLog,
  };
}
