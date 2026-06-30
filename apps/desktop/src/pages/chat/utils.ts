import type { Message } from "@neo-tavern/shared";
import type { GenerationPhase } from "@/features/chat/chat.types";

// ── Constants ─────────────────────────────────────────
export const DEEPSEEK_CONTEXT_LIMIT = 1_000_000;
export const CHAT_FONT_SIZE_KEY = "chat:font-size";
export const CHAT_DRAFT_KEY_PREFIX = "chat-draft";
export const CONTINUE_PROMPT = "继续";
export const CHAT_VISIBLE_TURN_LIMIT = 20;
export const CHAT_FONT_SIZE_MIN = 12;
export const CHAT_FONT_SIZE_MAX = 22;

// ── Re-export type (defined in types.ts alongside other chat types) ──
export type { PendingSendItem } from "./types";

// ── Pure helpers ──────────────────────────────────────
const compactTokenFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompactToken(value: number) {
  return compactTokenFormatter.format(value);
}

export function getChatDraftKey(chatId: string) {
  return `${CHAT_DRAFT_KEY_PREFIX}:${chatId}`;
}

export function clampChatFontSize(value: number) {
  if (!Number.isFinite(value)) return 15;
  return Math.min(CHAT_FONT_SIZE_MAX, Math.max(CHAT_FONT_SIZE_MIN, Math.round(value)));
}

export function countUserTurns(messages: Message[]) {
  return messages.filter((m) => m.role === "user").length;
}

export function getRecentTurnStartIndex(messages: Message[], turnLimit: number) {
  if (turnLimit <= 0) return messages.length;
  let turns = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    turns += 1;
    if (turns > turnLimit) {
      let start = i + 1;
      while (start < messages.length && messages[start].role !== "user") start += 1;
      return start;
    }
  }
  return 0;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatSavepointDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getGenerationStatus(phase: GenerationPhase | null) {
  if (phase === "retrying") {
    return {
      label: "正文空白，重写中",
      labelKey: "generationStatus.retrying",
      tag: "retrying",
      detail: "上一版没有可显示正文，正在重新整理剧情并补写角色回复",
      detailKey: "generationStatus.retryingDetail",
    };
  }
  if (phase === "writing") {
    return {
      label: "正文落笔中",
      labelKey: "generationStatus.writing",
      tag: "writing",
      detail: "正在把这一幕写成角色回复",
      detailKey: "generationStatus.writingDetail",
    };
  }
  return {
    label: "剧情构思中",
    labelKey: "generationStatus.thinking",
    tag: "thinking",
    detail: "正在整理角色动机、场景节奏与下一步推进",
    detailKey: "generationStatus.thinkingDetail",
  };
}

export function replaceUserPlaceholders(content: string, userName: string) {
  return content.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName);
}
