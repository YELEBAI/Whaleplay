import { useCallback } from "react";
import { assembleChatContext } from "../context-assembler";
import { cancelAutoImageGeneration, runAutoImageGeneration } from "../auto-image-runner";
import { buildMemoryPromptPlan, resolveModelConfig } from "../memory-planner";
import { generateAssistantWithRetry, getNextDebugRound, type DebugPromptContext } from "../generation-runner";
import { finalizeAssistantTurn, handleTurnError } from "../turn-finalizer";
import { abortChatTurn, startChatTurn } from "../turn-runtime";
import { useChatStore } from "../chat.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";
import { stripPromptContent } from "@neo-tavern/core";
import type { Character, BuiltPrompt, Message } from "@neo-tavern/shared";
import type { GenerationPhase } from "../chat.types";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { detectExplicitContent } from "@/features/content-policy/healthy-mode";
import { createContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { toast } from "@/utils/toast";
import { getChatWorldbookContextBlocks, getImagePlannerWorldbookReferences } from "../worldbook-context";

interface UseSendMessageOptions {
  character: Character | undefined;
  chatId: string | undefined;
  agenticPlayEnabled?: boolean;
  onAgenticPlayStateUpdated?: (state: AgenticGameState) => void;
  onPromptBuilt?: (built: BuiltPrompt) => void;
}

export interface SendMessageOptions {
  hiddenUserMessage?: boolean;
  hiddenReason?: string;
  metadata?: Message["metadata"];
}

interface UseSendMessageReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  regenerate: () => Promise<void>;
  abort: () => void;
  sending: boolean;
  sendingChatId: string | null;
  streamingMessageId: string | null;
  generationPhase: GenerationPhase | null;
  error: string | null;
  clearError: () => void;
}

export function useSendMessage({
  character,
  chatId,
  agenticPlayEnabled = false,
  onAgenticPlayStateUpdated,
  onPromptBuilt,
}: UseSendMessageOptions): UseSendMessageReturn {
  const addMessage = useChatStore((s) => s.addMessage);
  const patchMessage = useChatStore((s) => s.patchMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const ensureMessagesHydrated = useChatStore((s) => s.ensureMessagesHydrated);
  const getActivePath = useChatStore((s) => s.getActivePath);
  const activeChatGeneration = useChatStore((s) => (chatId ? s.activeGenerations[chatId] : undefined));
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);
  const setGenerationPhase = useChatStore((s) => s.setGenerationPhase);
  const generationError = useChatStore((s) => (chatId ? (s.generationErrors[chatId] ?? null) : null));
  const setGenerationError = useChatStore((s) => s.setGenerationError);
  const sending = !!activeChatGeneration;
  const sendingChatId = sending ? (chatId ?? null) : null;
  const streamingMessageId = activeChatGeneration?.streamingMessageId ?? null;
  const generationPhase = activeChatGeneration?.generationPhase ?? null;
  const error = generationError;

  const setChatError = useCallback(
    (targetChatId: string | null | undefined, message: string | null) => {
      if (targetChatId) setGenerationError(targetChatId, message);
      if (message) toast("error", message);
    },
    [setGenerationError],
  );

  const abort = useCallback(() => {
    if (!chatId) return;
    abortChatTurn(chatId);
  }, [chatId]);

  const isGenerationActive = (controller: AbortController) => !controller.signal.aborted;

  const stripMessages = useCallback((msgs: Message[]): Message[] => {
    const rules = useSettingsStore.getState().getActiveRegexRules() ?? [];
    return msgs.map((m) => (m.role === "assistant" ? { ...m, content: stripPromptContent(m.content, rules) } : m));
  }, []);

  const removeEmptyStreamingDraft = useCallback(
    async (draftId: string | null) => {
      if (!draftId) return;
      const draft = useChatStore.getState().messages.find((m) => m.id === draftId);
      if (draft && !draft.content.trim() && !draft.reasoningContent?.trim()) {
        await deleteMessage(draftId);
      }
    },
    [deleteMessage],
  );

  const getWorldbookContextBlocks = useCallback(
    async (userInput: string, recentMessages: Message[]) => {
      const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
      if (!character) return [];
      return getChatWorldbookContextBlocks({
        activeWorldbookId,
        character,
        recentMessages,
        userInput,
        worldbooks,
      });
    },
    [character],
  );

  const getPlannerWorldbookReferences = useCallback(
    async (content: string) => {
      const imageSettings = useSettingsStore.getState().imageGeneration;
      if (!imageSettings.worldbookReferenceEnabled || !character) return [];

      const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
      return getImagePlannerWorldbookReferences({
        activeWorldbookId,
        character,
        content,
        recentMessages: [],
        worldbooks,
      });
    },
    [character],
  );

  const scheduleAutoImageGeneration = useCallback(
    (params: { chatId: string; assistantId: string; content: string }) => {
      void runAutoImageGeneration({
        chatId: params.chatId,
        assistantId: params.assistantId,
        content: params.content,
        patchMessage,
        setChatError,
        resolvePlannerConfig: resolveModelConfig,
        getWorldbookReferences: getPlannerWorldbookReferences,
      });
    },
    [getPlannerWorldbookReferences, patchMessage, setChatError],
  );

  const getMemoryPromptPlan = useCallback(
    async (historyMessages: Message[], targetChatId: string, signal?: AbortSignal) =>
      buildMemoryPromptPlan({
        historyMessages,
        targetChatId,
        stripMessages,
        signal,
      }),
    [stripMessages],
  );

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      const trimmedContent = content.trim();
      const targetChatId = chatId;
      const targetCharacter = character;
      if (!trimmedContent || !targetChatId || !targetCharacter) return;

      return startChatTurn(targetChatId, async ({ controller, isCurrent }) => {
        const chatId = targetChatId;
        const character = targetCharacter;
        let assistantId: string | null = null;
        const contentPolicy = createContentPolicySnapshot(useSettingsStore.getState().contentMode);

        // Strict healthy mode: block explicit user input before sending.
        if (contentPolicy.blockExplicitInput) {
          const explicitMatch = detectExplicitContent(trimmedContent);
          if (explicitMatch) {
            setChatError(chatId, "健康模式：检测到不当输入，消息已被拦截。");
            return;
          }
        }

        try {
          const activePath = getActivePath(chatId);
          const lastMessageId = activePath.length > 0 ? activePath[activePath.length - 1].id : null;

          const userMsg = await addMessage({
            chatId,
            parentId: lastMessageId,
            role: "user",
            content: trimmedContent,
            hidden: !!options.hiddenUserMessage,
            metadata:
              options.metadata ??
              (options.hiddenUserMessage ? { hiddenReason: options.hiddenReason ?? "hidden" } : undefined),
          });

          const recentMessages = await ensureMessagesHydrated(chatId);
          const assembled = await assembleChatContext({
            chatId,
            character,
            userInput: trimmedContent,
            promptMessages: recentMessages,
            contentPolicy,
            agenticPlayEnabled,
            signal: controller.signal,
            getMemoryPromptPlan,
            getWorldbookContextBlocks,
            stripMessages,
          });
          const { agenticRecord, built, contextTokens, generationHooks, modelConfig } = assembled;

          if (onPromptBuilt) {
            onPromptBuilt(built);
          }

          const assistant = await addMessage({
            chatId,
            parentId: userMsg.id,
            role: "assistant",
            content: "",
          });
          assistantId = assistant.id;
          setStreamingMessageId(chatId, assistant.id);
          const debugContext: DebugPromptContext | undefined = useSettingsStore.getState().debugMode
            ? {
                chatId,
                characterId: character.id,
                characterName: character.name,
                contextTokens,
                round: getNextDebugRound(recentMessages),
                assistantMessageId: assistant.id,
                baseTrigger: options.hiddenUserMessage ? "continue" : "send",
                hiddenUserMessage: !!options.hiddenUserMessage,
              }
            : undefined;
          const finalContent = await generateAssistantWithRetry({
            chatId,
            assistantId: assistant.id,
            built,
            modelConfig,
            controller,
            debugContext,
            generationHooks,
            agentic:
              agenticRecord && agenticPlayEnabled
                ? {
                    character,
                    initialGameState: agenticRecord.gameState,
                  }
                : undefined,
            effects: {
              patchMessage,
              deleteMessage,
              setStreamingMessageId,
              setGenerationPhase,
              onAgenticPlayStateUpdated,
            },
          });
          await finalizeAssistantTurn({
            chatId,
            assistantId: assistant.id,
            characterName: character.name,
            finalContent,
            contentPolicy,
            isCurrent,
            isGenerationActive: () => isGenerationActive(controller),
            patchMessage,
            removeEmptyStreamingDraft,
            setChatError,
            runAutoImageGeneration: () =>
              scheduleAutoImageGeneration({ chatId, assistantId: assistant.id, content: finalContent }),
          });
        } catch (err) {
          await removeEmptyStreamingDraft(assistantId);
          handleTurnError({
            chatId,
            error: err,
            isCurrent,
            aborted: controller.signal.aborted,
            fallbackMessage: "Failed to send message",
            setChatError,
          });
        }
      });
    },
    [
      chatId,
      character,
      setChatError,
      getActivePath,
      addMessage,
      ensureMessagesHydrated,
      getMemoryPromptPlan,
      getWorldbookContextBlocks,
      scheduleAutoImageGeneration,
      stripMessages,
      agenticPlayEnabled,
      onPromptBuilt,
      setStreamingMessageId,
      setGenerationPhase,
      onAgenticPlayStateUpdated,
      removeEmptyStreamingDraft,
      patchMessage,
      deleteMessage,
    ],
  );

  const clearError = useCallback(() => setChatError(chatId, null), [chatId, setChatError]);

  const regenerate = useCallback(async () => {
    const targetChatId = chatId;
    const targetCharacter = character;
    if (!targetChatId || !targetCharacter) return;

    return startChatTurn(targetChatId, async ({ controller, isCurrent }) => {
      const chatId = targetChatId;
      const character = targetCharacter;
      const contentPolicy = createContentPolicySnapshot(useSettingsStore.getState().contentMode);
      let assistantId: string | null = null;

      try {
        const allMessages = await ensureMessagesHydrated(chatId);

        let lastAssistantIdx = -1;
        for (let i = allMessages.length - 1; i >= 0; i--) {
          if (allMessages[i].role === "assistant") {
            lastAssistantIdx = i;
            break;
          }
        }
        if (lastAssistantIdx < 0) {
          setChatError(chatId, "No AI response to regenerate");
          return;
        }

        const lastAssistantMsg = allMessages[lastAssistantIdx];

        let lastUserIdx = lastAssistantIdx - 1;
        while (lastUserIdx >= 0 && allMessages[lastUserIdx].role !== "user") lastUserIdx--;
        if (lastUserIdx < 0) {
          setChatError(chatId, "No user message found to regenerate from");
          return;
        }
        const userContent = allMessages[lastUserIdx].content;

        cancelAutoImageGeneration(lastAssistantMsg.id);
        await deleteMessage(lastAssistantMsg.id);

        const messagesForPrompt = allMessages.filter((message) => message.id !== lastAssistantMsg.id);
        const assembled = await assembleChatContext({
          chatId,
          character,
          userInput: userContent,
          promptMessages: messagesForPrompt,
          contentPolicy,
          agenticPlayEnabled,
          signal: controller.signal,
          getMemoryPromptPlan,
          getWorldbookContextBlocks,
          stripMessages,
        });
        const { agenticRecord, built, contextTokens, generationHooks, modelConfig } = assembled;

        if (onPromptBuilt) onPromptBuilt(built);

        const assistant = await addMessage({
          chatId,
          parentId: allMessages[lastUserIdx].id,
          role: "assistant",
          content: "",
        });
        assistantId = assistant.id;
        setStreamingMessageId(chatId, assistant.id);
        const promptMessages = messagesForPrompt;
        const debugContext: DebugPromptContext | undefined = useSettingsStore.getState().debugMode
          ? {
              chatId,
              characterId: character.id,
              characterName: character.name,
              contextTokens,
              round: getNextDebugRound(promptMessages),
              assistantMessageId: assistant.id,
              baseTrigger: "regenerate",
              hiddenUserMessage: false,
            }
          : undefined;
        const finalContent = await generateAssistantWithRetry({
          chatId,
          assistantId: assistant.id,
          built,
          modelConfig,
          controller,
          debugContext,
          generationHooks,
          agentic:
            agenticRecord && agenticPlayEnabled
              ? {
                  character,
                  initialGameState: agenticRecord.gameState,
                }
              : undefined,
          effects: {
            patchMessage,
            deleteMessage,
            setStreamingMessageId,
            setGenerationPhase,
            onAgenticPlayStateUpdated,
          },
        });
        await finalizeAssistantTurn({
          chatId,
          assistantId: assistant.id,
          characterName: character.name,
          finalContent,
          contentPolicy,
          isCurrent,
          isGenerationActive: () => isGenerationActive(controller),
          patchMessage,
          removeEmptyStreamingDraft,
          setChatError,
          runAutoImageGeneration: () =>
            scheduleAutoImageGeneration({ chatId, assistantId: assistant.id, content: finalContent }),
        });
      } catch (err) {
        await removeEmptyStreamingDraft(assistantId);
        handleTurnError({
          chatId,
          error: err,
          isCurrent,
          aborted: controller.signal.aborted,
          fallbackMessage: "Failed to regenerate",
          setChatError,
        });
      }
    });
  }, [
    chatId,
    character,
    setChatError,
    ensureMessagesHydrated,
    deleteMessage,
    getMemoryPromptPlan,
    getWorldbookContextBlocks,
    scheduleAutoImageGeneration,
    stripMessages,
    agenticPlayEnabled,
    onPromptBuilt,
    addMessage,
    setStreamingMessageId,
    setGenerationPhase,
    onAgenticPlayStateUpdated,
    removeEmptyStreamingDraft,
    patchMessage,
  ]);

  return {
    sendMessage,
    regenerate,
    abort,
    sending,
    sendingChatId,
    streamingMessageId,
    generationPhase,
    error,
    clearError,
  };
}
