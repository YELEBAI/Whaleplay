import type { BuiltPrompt, Character, CreateMessageInput, Message } from "@neo-tavern/shared";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";
import type { ContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { assembleChatContext, type AssembleChatContextParams, type MemoryPromptPlan } from "./context-assembler";
import {
  generateAssistantWithRetry,
  getNextDebugRound,
  type DebugPromptTrigger,
  type GenerationEffects,
} from "./generation-runner";
import { finalizeAssistantTurn, handleTurnError, type FinalizeAssistantTurnStatus } from "./turn-finalizer";

type AssistantTurnTrigger = Exclude<DebugPromptTrigger, "retry">;

/**
 * Store-side effects required to run one assistant reply.
 *
 * Keeping these as injected callbacks makes this runner independent from React
 * hooks and leaves send/regenerate responsible only for preparing messages.
 */
export interface AssistantTurnEffects extends GenerationEffects {
  addMessage: (input: CreateMessageInput) => Promise<Message>;
}

export interface RunAssistantTurnParams {
  chatId: string;
  character: Character;
  userInput: string;
  promptMessages: Message[];
  assistantParentId: string;
  contentPolicy: ContentPolicySnapshot;
  agenticPlayEnabled: boolean;
  controller: AbortController;
  isCurrent: () => boolean;
  fallbackMessage: string;
  debugBaseTrigger: AssistantTurnTrigger;
  hiddenUserMessage: boolean;
  isDebugEnabled: () => boolean;
  getMemoryPromptPlan: AssembleChatContextParams["getMemoryPromptPlan"];
  getWorldbookContextBlocks: AssembleChatContextParams["getWorldbookContextBlocks"];
  stripMessages: AssembleChatContextParams["stripMessages"];
  effects: AssistantTurnEffects;
  onPromptBuilt?: (built: BuiltPrompt) => void;
  removeEmptyStreamingDraft: (draftId: string | null) => Promise<void>;
  setChatError: (chatId: string, message: string | null) => void;
  runAutoImageGeneration: (params: { chatId: string; assistantId: string; content: string }) => void;
}

export interface RunAssistantTurnResult {
  assistantId: string | null;
  finalContent: string | null;
  status: FinalizeAssistantTurnStatus | "error";
}

/**
 * Shared assistant lifecycle for both send and regenerate:
 * build prompt context, create the streaming assistant draft, generate, then
 * run finalizers such as healthy-mode output blocking and auto image planning.
 */
export async function runAssistantTurn(params: RunAssistantTurnParams): Promise<RunAssistantTurnResult> {
  const {
    agenticPlayEnabled,
    assistantParentId,
    character,
    chatId,
    contentPolicy,
    controller,
    debugBaseTrigger,
    effects,
    fallbackMessage,
    getMemoryPromptPlan,
    getWorldbookContextBlocks,
    hiddenUserMessage,
    isCurrent,
    isDebugEnabled,
    onPromptBuilt,
    promptMessages,
    removeEmptyStreamingDraft,
    runAutoImageGeneration,
    setChatError,
    stripMessages,
    userInput,
  } = params;
  let assistantId: string | null = null;

  try {
    // Context assembly is intentionally before the assistant draft so failures
    // do not leave an empty message in the chat tree.
    const assembled = await assembleChatContext({
      chatId,
      character,
      userInput,
      promptMessages,
      contentPolicy,
      agenticPlayEnabled,
      signal: controller.signal,
      getMemoryPromptPlan,
      getWorldbookContextBlocks,
      stripMessages,
    });
    const { agenticRecord, built, contextTokens, generationHooks, modelConfig } = assembled;
    onPromptBuilt?.(built);

    // The draft becomes the stable streaming target for both normal and
    // Agentic generation paths.
    const assistant = await effects.addMessage({
      chatId,
      parentId: assistantParentId,
      role: "assistant",
      content: "",
    });
    assistantId = assistant.id;
    effects.setStreamingMessageId(chatId, assistant.id);

    // Debug prompt metadata is attached to usage so the cost/debug table can
    // link a generated row back to the saved prompt payload.
    const finalContent = await generateAssistantWithRetry({
      chatId,
      assistantId: assistant.id,
      built,
      modelConfig,
      controller,
      debugContext: isDebugEnabled()
        ? {
            chatId,
            characterId: character.id,
            characterName: character.name,
            contextTokens,
            round: getNextDebugRound(promptMessages),
            assistantMessageId: assistant.id,
            baseTrigger: debugBaseTrigger,
            hiddenUserMessage,
          }
        : undefined,
      generationHooks,
      agentic: getAgenticGenerationParams({
        agenticPlayEnabled,
        character,
        gameState: agenticRecord?.gameState,
      }),
      effects,
    });

    // Finalization owns UI-visible completion semantics: stale-turn cleanup,
    // healthy-mode output blocking, notification, and optional auto image work.
    const status = await finalizeAssistantTurn({
      chatId,
      assistantId: assistant.id,
      characterName: character.name,
      finalContent,
      contentPolicy,
      isCurrent,
      isGenerationActive: () => !controller.signal.aborted,
      patchMessage: effects.patchMessage,
      removeEmptyStreamingDraft,
      setChatError,
      runAutoImageGeneration: () =>
        runAutoImageGeneration({ chatId, assistantId: assistant.id, content: finalContent }),
    });

    return { assistantId: assistant.id, finalContent, status };
  } catch (error) {
    // Generation failures after draft creation must not leave a blank assistant
    // bubble. Error wording still goes through the shared turn error mapper.
    await removeEmptyStreamingDraft(assistantId);
    handleTurnError({
      chatId,
      error,
      isCurrent,
      aborted: controller.signal.aborted,
      fallbackMessage,
      setChatError,
    });
    return { assistantId, finalContent: null, status: "error" };
  }
}

function getAgenticGenerationParams(params: {
  agenticPlayEnabled: boolean;
  character: Character;
  gameState?: AgenticGameState;
}) {
  if (!params.agenticPlayEnabled || !params.gameState) return undefined;
  return {
    character: params.character,
    initialGameState: params.gameState,
  };
}

export type { MemoryPromptPlan };
