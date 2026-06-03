// ── ChatPage-local types ─────────────────────────────

export type TokenUsageView = "main" | "secondary";

export type PendingSendItem = {
  chatId: string;
  content: string;
  hiddenUserMessage?: boolean;
  label?: string;
};

// ── Re-exports from shared packages ──────────────────
export type { Message, MessageImage } from "@neo-tavern/shared";
