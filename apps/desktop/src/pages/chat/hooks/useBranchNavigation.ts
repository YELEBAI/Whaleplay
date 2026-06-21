import { useMemo } from "react";
import { useChatStore } from "@/features/chat/chat.store";
import { buildMessagePath } from "@/db/repositories";
import type { Message } from "@neo-tavern/shared";

export interface BranchSummary {
  leafId: string;
  isActive: boolean;
  messageCount: number;
  forkMessageIndex: number | null;
  lastMessagePreview: string;
  forkPreview: string;
}

function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
  });
}

function previewMessage(message: Message | undefined, fallback: string) {
  const content = message?.content.trim().replace(/\s+/g, " ");
  return content || fallback;
}

function getDefaultLeafId(messages: Message[]) {
  return sortMessages(messages).at(-1)?.id ?? null;
}

function getChildCounts(messages: Message[]) {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (message.parentId) counts.set(message.parentId, (counts.get(message.parentId) ?? 0) + 1);
  }
  return counts;
}

function getLeafMessages(messages: Message[]) {
  const parents = new Set(messages.map((message) => message.parentId).filter(Boolean));
  return sortMessages(messages).filter((message) => !parents.has(message.id));
}

export function buildBranchSummaries(messages: Message[], activeLeafId: string | null): BranchSummary[] {
  const childCounts = getChildCounts(messages);
  const hasBranches = [...childCounts.values()].some((count) => count >= 2);
  if (!hasBranches) return [];

  const effectiveActiveLeafId =
    activeLeafId && messages.some((message) => message.id === activeLeafId) ? activeLeafId : getDefaultLeafId(messages);

  return getLeafMessages(messages).map((leaf, index) => {
    const path = buildMessagePath(messages, leaf.id);
    const visiblePath = path.filter((message) => !message.hidden);
    const forkMessage = [...path].reverse().find((message) => (childCounts.get(message.id) ?? 0) >= 2);
    const forkMessageIndex = forkMessage ? visiblePath.findIndex((message) => message.id === forkMessage.id) + 1 : 0;
    const lastVisibleMessage = visiblePath.at(-1);

    return {
      leafId: leaf.id,
      isActive: leaf.id === effectiveActiveLeafId,
      messageCount: visiblePath.length,
      forkMessageIndex: forkMessageIndex || null,
      lastMessagePreview: previewMessage(lastVisibleMessage, `Branch ${index + 1}`),
      forkPreview: previewMessage(forkMessage, "Conversation split"),
    };
  });
}

/**
 * Conversation branch navigation state for ChatPage and the right panel.
 * The UI consumes compact branch summaries instead of traversing the tree.
 */
export function useBranchNavigation(chatId: string | undefined) {
  const messages = useChatStore((s) => s.messages);
  const activeLeafId = useChatStore((s) => s.activeLeafId);
  const switchBranch = useChatStore((s) => s.switchBranch);

  const chatMessages = useMemo(
    () => (chatId ? messages.filter((message) => message.chatId === chatId) : []),
    [chatId, messages],
  );
  const visibleMessages = useMemo(() => {
    if (!chatId || chatMessages.length === 0) return [];
    const leafId =
      activeLeafId && chatMessages.some((message) => message.id === activeLeafId)
        ? activeLeafId
        : getDefaultLeafId(chatMessages);
    return leafId ? buildMessagePath(chatMessages, leafId).filter((message: Message) => !message.hidden) : [];
  }, [activeLeafId, chatId, chatMessages]);
  const branchSummaries = useMemo(() => buildBranchSummaries(chatMessages, activeLeafId), [activeLeafId, chatMessages]);
  const effectiveActiveLeafId =
    branchSummaries.find((summary) => summary.isActive)?.leafId ?? activeLeafId ?? visibleMessages.at(-1)?.id ?? null;

  return {
    activeLeafId: effectiveActiveLeafId,
    visibleMessages,
    hasBranches: branchSummaries.length > 1,
    branchSummaries,
    switchBranch,
  };
}
