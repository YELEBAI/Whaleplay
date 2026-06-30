import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildChatPrompt, formatPreview, stripPromptContent } from "@neo-tavern/core";
import type { BuiltPrompt, ContextBlock, Message } from "@neo-tavern/shared";
import {
  buildLightweightMemorySummary,
  createMemoryContextBlock,
  splitMessagesByRecentTurns,
} from "@/features/chat/memory";
import { presetRepository } from "@/db/repositories";
import { device } from "@/db/kv";
import { resolveWorldbookEntries, getWorldbookEntryInsertPosition } from "@neo-tavern/core";
import { useSendMessage } from "@/features/chat/hooks/useSendMessage";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import type { PendingSendItem } from "../types";
import { CONTINUE_PROMPT, getChatDraftKey, replaceUserPlaceholders } from "../utils";
import type { UseChatSessionReturn } from "./useChatSession";

interface UseNormalChatParams {
  session: UseChatSessionReturn;
  visibleMessagesLength: number;
  /** Agentic toggles — when on, prompt preview resolves agentic preset items. */
  agenticPlayEnabled: boolean;
  agenticGameState: import("@/features/agentic-play/agentic-play").AgenticGameState | null;
  /** Lifted setter so streaming game-state updates can land without a cycle. */
  setAgenticGameState: import("react").Dispatch<
    import("react").SetStateAction<import("@/features/agentic-play/agentic-play").AgenticGameState | null>
  >;
}

/**
 * Bundles the input/send/continue/abort flows for the normal chat path, plus
 * the pending-send queue and prompt-preview builder (shared with the prompt
 * dialog). `submitContent` is the single entry point both the input area and
 * the agentic choice panel funnel through.
 *
 * Extracted from ChatPage (Phase 1 UI split).
 */
export function useNormalChat({
  session,
  visibleMessagesLength,
  agenticPlayEnabled,
  agenticGameState,
  setAgenticGameState,
}: UseNormalChatParams) {
  const { t } = useTranslation("chat");
  const { character, currentChat, messages, addMessage, input, setInput, mountedRef, currentChatIdRef } = session;
  const firstMessage = character?.firstMessage;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [pendingSendQueue, setPendingSendQueue] = useState<PendingSendItem[]>([]);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const presetItemsRef = useRef<{ role: "system" | "user"; content: string; injectionOrder: number }[]>([]);

  const personaName = useSettingsStore((s) => s.personaName);

  // Load the active preset items once (used by both preview and send paths).
  useEffect(() => {
    presetRepository.getActivePresetId().then(async (activeId) => {
      if (activeId) {
        const preset = await presetRepository.getById(activeId);
        if (preset) {
          presetItemsRef.current = preset.items
            .filter((i) => i.enabled)
            .map((i) => ({ role: i.role, content: i.content, injectionOrder: i.injectionOrder }));
        }
      } else {
        presetItemsRef.current = [];
      }
    });
  }, []);

  // Build the streaming callback here (agentic state is lifted to ChatPage,
  // so this avoids the normal↔agentic dependency cycle).
  const onAgenticPlayStateUpdated = useCallback(
    (state: import("@/features/agentic-play/agentic-play").AgenticGameState | null) => {
      if (mountedRef.current && currentChatIdRef.current === currentChat?.id) setAgenticGameState(state);
    },
    [currentChat?.id, currentChatIdRef, mountedRef, setAgenticGameState],
  );

  const {
    sendMessage,
    regenerate,
    abort,
    sending,
    sendingChatId,
    streamingMessageId,
    generationPhase,
    error: sendError,
    clearError: clearSendError,
  } = useSendMessage({
    character,
    chatId: currentChat?.id,
    agenticPlayEnabled,
    onAgenticPlayStateUpdated,
    onPromptBuilt: (built: BuiltPrompt) => {
      if (!mountedRef.current || currentChatIdRef.current !== currentChat?.id) return;
      setPreviewText(formatPreview(built));
    },
  });

  const updatePreview = useCallback(
    async (userInput: string) => {
      if (!character) return;
      const settingsState = useSettingsStore.getState();
      const cs = settingsState.contextTokens ?? 64000;
      const promptRules = settingsState.getActiveRegexRules() ?? [];
      const promptMessages = messages.map((message) =>
        message.role === "assistant"
          ? { ...message, content: stripPromptContent(message.content, promptRules) }
          : message,
      );
      const memorySplit = settingsState.lightweightMemoryEnabled
        ? splitMessagesByRecentTurns(promptMessages, settingsState.promptRecentTurns)
        : { memoryMessages: [] as Message[], recentMessages: promptMessages };
      const memorySummary = settingsState.lightweightMemoryEnabled
        ? buildLightweightMemorySummary(memorySplit.memoryMessages, settingsState.memorySummaryMaxChars)
        : "";
      const memoryBlock = settingsState.lightweightMemoryEnabled ? createMemoryContextBlock(memorySummary) : null;
      const wbState = useWorldbookStore.getState();
      let contextBlocks: ContextBlock[] | undefined;
      const worldbookId = character.worldbookId || wbState.activeWorldbookId;
      if (worldbookId) {
        const wb = wbState.worldbooks.find((w) => w.id === worldbookId);
        if (wb && wb.entries.length > 0) {
          const { matched } = resolveWorldbookEntries(wb.entries, userInput || "", promptMessages);
          contextBlocks = matched.map((e) => ({
            id: e.id,
            source: "worldbook" as const,
            title: e.title,
            content: e.content,
            priority: e.priority,
            role: e.role ?? "system",
            position: getWorldbookEntryInsertPosition(e),
            depth: e.depth ?? 0,
          }));
        }
      }
      const agenticBlock =
        agenticPlayEnabled && agenticGameState
          ? // Lazy import shape — agentic-play context block builder
            (await import("@/features/agentic-play/agentic-play")).createAgenticPlayContextBlock(agenticGameState)
          : null;
      const allContextBlocks = [memoryBlock, agenticBlock, ...(contextBlocks ?? [])].filter(Boolean);
      const presetItems = agenticPlayEnabled
        ? await (await import("@/features/agentic-play/agentic-preset")).getAgenticPlayPresetItems()
        : presetItemsRef.current;
      const built = buildChatPrompt({
        character,
        recentMessages: memorySplit.recentMessages,
        userInput: userInput || "(your message)",
        maxTotalTokens: cs,
        presetItems,
        contextBlocks: allContextBlocks as ContextBlock[],
        userName: settingsState.personaName,
      });
      setPreviewText(formatPreview(built));
    },
    [character, messages, agenticPlayEnabled, agenticGameState],
  );

  // Debounced preview refresh.
  useEffect(() => {
    if (!previewOpen && !promptDialogOpen) return;
    const timeout = window.setTimeout(() => {
      updatePreview(input);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [input, previewOpen, promptDialogOpen, updatePreview]);

  const submitContent = useCallback(
    async (content: string, options: Pick<PendingSendItem, "hiddenUserMessage" | "label" | "metadata"> = {}) => {
      if (!content.trim() || !currentChat) return;
      const trimmedContent = content.trim();
      if (sending) {
        setPendingSendQueue((queue) => [...queue, { chatId: currentChat.id, content: trimmedContent, ...options }]);
        return;
      }
      if (visibleMessagesLength === 0 && firstMessage?.trim()) {
        await addMessage({
          chatId: currentChat.id,
          parentId: null,
          role: "assistant",
          content: replaceUserPlaceholders(firstMessage, personaName).trim(),
        });
      }
      await sendMessage(trimmedContent, {
        hiddenUserMessage: options.hiddenUserMessage,
        hiddenReason: options.label,
        metadata: options.metadata,
      });
    },
    [currentChat, sending, visibleMessagesLength, firstMessage, addMessage, personaName, sendMessage],
  );

  // Drain the pending queue when generation finishes.
  useEffect(() => {
    if (sending || pendingSendQueue.length === 0 || !currentChat) return;
    const nextIndex = pendingSendQueue.findIndex((item) => item.chatId === currentChat.id);
    if (nextIndex < 0) return;
    const next = pendingSendQueue[nextIndex];
    const timeout = window.setTimeout(() => {
      setPendingSendQueue((queue) => queue.filter((_, index) => index !== nextIndex));
      void sendMessage(next.content, {
        hiddenUserMessage: next.hiddenUserMessage,
        hiddenReason: next.label,
        metadata: next.metadata,
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [sending, pendingSendQueue, currentChat, sendMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !currentChat) return;
    const content = input.trim();
    setInput("");
    if (currentChat?.id) void device.remove(getChatDraftKey(currentChat.id));
    await submitContent(content);
  }, [input, currentChat, setInput, submitContent]);

  const handleContinue = useCallback(async () => {
    await submitContent(CONTINUE_PROMPT, { hiddenUserMessage: true, label: t("continueLabel") });
  }, [submitContent, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [setInput],
  );

  const showPromptDialog = useCallback(() => {
    updatePreview(input);
    setPromptDialogOpen(true);
  }, [input, updatePreview]);

  // React Compiler auto-memoises.
  const pendingSendCount = currentChat ? pendingSendQueue.filter((item) => item.chatId === currentChat.id).length : 0;

  return {
    // generation state
    sendMessage,
    regenerate,
    abort,
    sending,
    sendingChatId,
    streamingMessageId,
    generationPhase,
    sendError,
    clearSendError,
    // input + handlers
    input,
    setInput,
    handleSend,
    handleContinue,
    handleKeyDown,
    handleInputChange,
    submitContent,
    // preview
    previewOpen,
    setPreviewOpen,
    previewText,
    promptDialogOpen,
    setPromptDialogOpen,
    showPromptDialog,
    updatePreview,
    // queue
    pendingSendQueue,
    setPendingSendQueue,
    pendingSendCount,
  };
}

export type UseNormalChatReturn = ReturnType<typeof useNormalChat>;
