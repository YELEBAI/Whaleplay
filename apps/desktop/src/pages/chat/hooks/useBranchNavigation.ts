import { useMemo } from "react";
import { useChatStore } from "@/features/chat/chat.store";
import type { Message } from "@neo-tavern/shared";

/**
 * Unified hook for conversation branch navigation.
 *
 * Wraps chat store branching methods and provides derived state
 * (visible message path, fork point detection) consumed by ChatPage
 * and ChatRightPanel.
 */
export function useBranchNavigation(_chatId: string | undefined) {
  const messages = useChatStore((s) => s.messages);
  const messagesHydrated = useChatStore((s) => s.messagesHydrated);
  const chatId = useChatStore((s) => s.currentChat?.id);
  const activeLeafId = useChatStore((s) => s.activeLeafId);
  const getActivePath = useChatStore((s) => s.getActivePath);
  const switchBranch = useChatStore((s) => s.switchBranch);
  const createBranch = useChatStore((s) => s.createBranch);
  const getBranchName = useChatStore((s) => s.getBranchName);
  const setBranchName = useChatStore((s) => s.setBranchName);

  /** Messages along the active branch path, excluding hidden user messages */
  const visibleMessages = useMemo(() => {
    if (!chatId) return [];
    const path = getActivePath(chatId);
    return path.filter((m: Message) => !m.hidden);
    // activeLeafId is read inside getActivePath via store.get(),
    // but we still list it as a dep so useMemo re-runs on branch switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, messages, activeLeafId]);

  /** Message ids that have 2+ children — displayed as fork points in the tree panel */
  const forkParents = useMemo(() => {
    // Only compute when all messages are loaded for this chat
    if (!messagesHydrated || !chatId) return new Set<string>();
    const childCounts = new Map<string, number>();
    for (const m of messages) {
      if (m.parentId && m.chatId === chatId) {
        childCounts.set(m.parentId, (childCounts.get(m.parentId) ?? 0) + 1);
      }
    }
    return new Set([...childCounts].filter(([, c]) => c >= 2).map(([id]) => id));
  }, [messages, messagesHydrated, chatId]);

  return {
    activeLeafId,
    visibleMessages,
    forkParents,
    switchBranch,
    createBranch,
    getBranchName,
    setBranchName,
  };
}
