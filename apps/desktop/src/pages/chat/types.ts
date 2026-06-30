// ── ChatPage-local types ─────────────────────────────

import type { SplitResult } from "@neo-tavern/core";
import type { Message } from "@neo-tavern/shared";
import type { AgenticActionOption } from "@/features/agentic-play/agentic-play";
import type { getGenerationStatus } from "./utils";

export type TokenUsageView = "main" | "secondary";

export type GenerationStatus = ReturnType<typeof getGenerationStatus>;

export type PendingSendItem = {
  chatId: string;
  content: string;
  hiddenUserMessage?: boolean;
  label?: string;
  metadata?: import("@neo-tavern/shared").Message["metadata"];
};

/**
 * Pre-computed per-message rendering data produced by `useChatMessages` and
 * consumed by `MessageList`. Lives here (not in a separate hooks/types file)
 * so the page has a single type surface.
 */
export interface RenderedMessage {
  msg: Message;
  isUser: boolean;
  isFinalAi: boolean;
  split: SplitResult | null;
  displayContent: string;
  agenticOptions: AgenticActionOption[];
  isStreamingAi: boolean;
  hasDisplayContent: boolean;
}

export interface MessageListLayout {
  fontSize: number;
  chatContentWidthClass: string;
  userBubbleWidthClass: string;
  firstMessageWidthClass: string;
}

export interface MessageListState {
  loading: boolean;
  visibleMessagesLength: number;
  isGeneratingCurrentChat: boolean;
  /** When generating but no streaming message is visible yet, show the spinner row. */
  hasStreamingMessage: boolean;
  copiedId: string | null;
  editingMsgId: string | null;
  canRegenerate: boolean;
}

export interface MessageListImageState {
  busyByMessageId: Record<string, boolean>;
  enabled: boolean;
  mode: string;
}

export interface MessageListActions {
  copy: (content: string, msgId: string) => void;
  startEdit: (msg: Message) => void;
  cancelEdit: () => void;
  saveEdit: (content: string) => Promise<void>;
  showPromptDialog: () => void;
  viewReasoning: (msg: Message) => void;
  generateImages: (msg: Message) => void;
  regenerate: () => void;
  deleteMessage: (msg: Message) => void;
  setInput: (value: string) => void;
  deleteImage: (messageId: string, imageIndex: number, fallbackPrompt: string) => void;
  editImagePrompt: (msg: Message, imageIndex: number, fallbackPrompt: string) => void;
  regenerateImage: (messageId: string, imageIndex: number, fallbackPrompt: string) => void;
}

export type { SplitResult as RegexSplitResult };

// ── Re-exports from shared packages ──────────────────
export type { Message, MessageImage } from "@neo-tavern/shared";
