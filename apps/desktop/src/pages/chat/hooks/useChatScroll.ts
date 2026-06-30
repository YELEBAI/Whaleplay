import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Message } from "@neo-tavern/shared";
import type { RenderedMessage } from "../types";

interface UseChatScrollParams {
  /** Rendered (regex/option-aware) messages — drives scroll-on-update. */
  renderedMessages: RenderedMessage[];
  /** Raw visible messages from branch navigation. */
  visibleMessages: Message[];
  visibleMessagesLength: number;
  currentChatId: string | undefined;
  activeLeafId: string | null;
  sending: boolean;
  sendingChatId: string | null;
  streamingMessageId: string | null;
  loading: boolean;
  fontSize: number;
  chatListCollapsed: boolean;
}

/**
 * Owns every scroll concern of the chat view:
 * - the scroll container + bottom sentinel refs (returned for JSX attachment)
 * - near-bottom tracking
 * - auto-scroll on layout / font / message changes
 * - scroll-to-bottom when the user sends, when streaming completes, and on first open
 *
 * Extracted verbatim from ChatPage (Phase 1 UI split) — no logic change.
 */
export function useChatScroll({
  renderedMessages,
  visibleMessages,
  visibleMessagesLength,
  currentChatId,
  activeLeafId,
  sending,
  sendingChatId,
  streamingMessageId,
  loading,
  fontSize,
  chatListCollapsed,
}: UseChatScrollParams) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatScrollFrameRef = useRef<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const skipNextMessageAutoScrollRef = useRef<string | null>(null);
  const wasGeneratingCurrentChatRef = useRef(false);
  const activeStreamingMessageRef = useRef<string | null>(null);
  const completedScrollMessageRef = useRef<string | null>(null);
  const lastOpenedChatRef = useRef<string | null>(null);

  // Reset transient scroll state whenever the active chat changes.
  useEffect(() => {
    wasGeneratingCurrentChatRef.current = false;
    activeStreamingMessageRef.current = null;
    completedScrollMessageRef.current = null;
    isNearBottomRef.current = true;
  }, [currentChatId]);

  const handleChatScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }, []);

  const scheduleChatScrollToBottom = useCallback(() => {
    if (chatScrollFrameRef.current !== null) cancelAnimationFrame(chatScrollFrameRef.current);
    chatScrollFrameRef.current = requestAnimationFrame(() => {
      chatScrollFrameRef.current = null;
      const el = messagesContainerRef.current;
      if (!el) return;
      chatBottomRef.current?.scrollIntoView?.({ block: "end" });
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
    });
  }, []);

  // Cancel any pending rAF on unmount.
  useEffect(
    () => () => {
      if (chatScrollFrameRef.current !== null) cancelAnimationFrame(chatScrollFrameRef.current);
      chatScrollFrameRef.current = null;
    },
    [],
  );

  // Auto-scroll when layout/font/messages shift, but only if the user is near the bottom.
  useLayoutEffect(() => {
    if (isNearBottomRef.current) scheduleChatScrollToBottom();
  }, [fontSize, chatListCollapsed, renderedMessages, scheduleChatScrollToBottom]);

  // Scroll on user message, and snap to the completed streaming assistant message.
  useEffect(() => {
    const lastMsg = visibleMessages[visibleMessagesLength - 1];
    if (!lastMsg) return;

    const isGeneratingThisChat = sending && !!currentChatId && sendingChatId === currentChatId;
    if (isGeneratingThisChat && streamingMessageId) {
      activeStreamingMessageRef.current = streamingMessageId;
    }

    if (skipNextMessageAutoScrollRef.current === currentChatId) {
      skipNextMessageAutoScrollRef.current = null;
      wasGeneratingCurrentChatRef.current = isGeneratingThisChat;
      return;
    }

    const justFinishedGenerating = wasGeneratingCurrentChatRef.current && !isGeneratingThisChat;
    const completedMessageId = activeStreamingMessageRef.current;

    if (
      justFinishedGenerating &&
      completedMessageId &&
      lastMsg.role === "assistant" &&
      lastMsg.id === completedMessageId &&
      completedScrollMessageRef.current !== completedMessageId
    ) {
      const completedIndex = renderedMessages.findIndex((m) => m.msg.id === completedMessageId);
      if (completedIndex >= 0 && isNearBottomRef.current) {
        scheduleChatScrollToBottom();
      }
      completedScrollMessageRef.current = completedMessageId;
      activeStreamingMessageRef.current = null;
    } else if (lastMsg.role === "user") {
      if (isNearBottomRef.current) {
        scheduleChatScrollToBottom();
      }
    }

    wasGeneratingCurrentChatRef.current = isGeneratingThisChat;
  }, [
    visibleMessages,
    visibleMessagesLength,
    sending,
    sendingChatId,
    streamingMessageId,
    currentChatId,
    renderedMessages,
    scheduleChatScrollToBottom,
  ]);

  // On first open of a chat/branch, jump to bottom once without animating.
  useLayoutEffect(() => {
    if (loading || !currentChatId || visibleMessagesLength === 0) return;
    const listKey = `${currentChatId}:${activeLeafId ?? "default"}`;
    if (lastOpenedChatRef.current === listKey) return;
    lastOpenedChatRef.current = listKey;
    skipNextMessageAutoScrollRef.current = currentChatId;
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    scheduleChatScrollToBottom();
  }, [
    currentChatId,
    activeLeafId,
    loading,
    visibleMessagesLength,
    renderedMessages.length,
    scheduleChatScrollToBottom,
  ]);

  return { messagesContainerRef, chatBottomRef, handleChatScroll, scheduleChatScrollToBottom };
}
