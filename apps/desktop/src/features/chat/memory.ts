import type { ContextBlock, Message } from "@neo-tavern/shared";

export const DEFAULT_LIGHTWEIGHT_MEMORY_ENABLED = true;
export const DEFAULT_PROMPT_RECENT_TURNS = 12;
export const DEFAULT_MEMORY_SUMMARY_MAX_CHARS = 4500;
export const CONTEXT_COMPRESSION_PRESERVE_TURNS = 5;

export interface PromptMemorySettings {
  lightweightMemoryEnabled: boolean;
  promptRecentTurns: number;
  memorySummaryMaxChars: number;
}

export interface MemorySummarySegmentView {
  index: number;
  summary: string;
}

function normalizeText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function clip(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function hashMessages(messages: Message[]) {
  let hash = 2166136261;
  for (const message of messages) {
    const text = `${message.role}\u0000${message.id}\u0000${message.content}\u0000`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}

function isMemoryTurnStart(messages: Message[], index: number) {
  const message = messages[index];
  if (!message) return false;
  if (message.role === "user") return true;
  if (message.role === "assistant") {
    return index === 0 || messages[index - 1]?.role !== "user";
  }
  return index === 0;
}

export function countMemoryTurns(messages: Message[]) {
  return messages.reduce((count, _message, index) => count + (isMemoryTurnStart(messages, index) ? 1 : 0), 0);
}

export function getRecentMemoryTurnStartIndex(messages: Message[], turnLimit: number) {
  const limit = Math.max(1, Math.floor(turnLimit || DEFAULT_PROMPT_RECENT_TURNS));
  const starts: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (isMemoryTurnStart(messages, i)) starts.push(i);
  }

  if (starts.length <= limit) return 0;
  return starts[starts.length - limit];
}

export function splitMessagesByRecentTurns(messages: Message[], turnLimit: number) {
  const start = getRecentMemoryTurnStartIndex(messages, turnLimit);
  if (start <= 0) {
    return {
      memoryMessages: [] as Message[],
      recentMessages: messages,
    };
  }

  return {
    memoryMessages: messages.slice(0, start),
    recentMessages: messages.slice(start),
  };
}

export function getRecentAssistantTurnStartIndex(messages: Message[], turnLimit = CONTEXT_COMPRESSION_PRESERVE_TURNS) {
  const limit = Math.max(1, Math.floor(turnLimit || CONTEXT_COMPRESSION_PRESERVE_TURNS));
  const indexedAssistantMessages = messages.filter(
    (message) => message.role === "assistant" && typeof message.roundIndex === "number" && message.roundIndex > 0,
  );

  if (indexedAssistantMessages.length > 0) {
    const latestRoundIndex = Math.max(...indexedAssistantMessages.map((message) => message.roundIndex ?? 0));
    if (latestRoundIndex <= limit) return 0;

    const preserveFromRoundIndex = latestRoundIndex - limit + 1;
    const firstAssistantToKeep = messages.findIndex(
      (message) =>
        message.role === "assistant" &&
        typeof message.roundIndex === "number" &&
        message.roundIndex >= preserveFromRoundIndex,
    );

    if (firstAssistantToKeep < 0) return 0;
    let start = firstAssistantToKeep;
    while (start > 0 && messages[start - 1].role !== "assistant") {
      start -= 1;
    }
    return start;
  }

  const assistantIndexes: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") assistantIndexes.push(i);
  }

  if (assistantIndexes.length <= limit) return 0;

  const firstAssistantToKeep = assistantIndexes[assistantIndexes.length - limit];
  let start = firstAssistantToKeep;
  while (start > 0 && messages[start - 1].role !== "assistant") {
    start -= 1;
  }
  return start;
}

export function splitMessagesByRecentAssistantTurns(
  messages: Message[],
  turnLimit = CONTEXT_COMPRESSION_PRESERVE_TURNS,
) {
  const start = getRecentAssistantTurnStartIndex(messages, turnLimit);
  if (start <= 0) {
    return {
      memoryMessages: [] as Message[],
      recentMessages: messages,
    };
  }

  return {
    memoryMessages: messages.slice(0, start),
    recentMessages: messages.slice(start),
  };
}

export function buildLightweightMemorySummary(messages: Message[], maxChars: number) {
  if (messages.length === 0) return "";

  const lines = messages.map((message) => {
    const role = message.role === "user" ? "用户" : message.role === "assistant" ? "角色" : "系统";
    const maxLineChars = message.role === "assistant" ? 320 : 220;
    return `- ${role}: ${clip(normalizeText(message.content), maxLineChars)}`;
  });

  const header = "以下是较早剧情的轻量记忆摘要，用于保持连续性；最近完整对话仍以后续消息为准。";
  const kept: Array<{ index: number; line: string }> = [];
  let start = 0;
  let end = lines.length - 1;
  let takeFromStart = true;

  while (start <= end) {
    const index = takeFromStart ? start++ : end--;
    const line = lines[index];
    const next = [...kept, { index, line }].sort((a, b) => a.index - b.index).map((item) => item.line);
    if (`${header}\n${next.join("\n")}`.length > maxChars && kept.length > 0) break;
    kept.push({ index, line });
    takeFromStart = !takeFromStart;
  }

  return `${header}\n${kept
    .sort((a, b) => a.index - b.index)
    .map((item) => item.line)
    .join("\n")}`;
}

export function stripMemorySummaryHeader(summary: string) {
  return summary.replace(/^以下是较早剧情的(?:轻量|智能|稳定|长期)记忆摘要[^\n]*\n?/u, "").trim();
}

export function formatMemorySegmentsForPrompt(segments: MemorySummarySegmentView[]) {
  const valid = segments.filter((segment) => segment.summary.trim()).sort((a, b) => a.index - b.index);

  if (valid.length === 0) return "";

  const lines = [
    "以下是从开局至今逐段提炼的长期剧情记忆。每个记忆段都是此前剧情的一次稳定摘要；最近完整对话仍以后续消息为准。",
  ];

  for (const segment of valid) {
    lines.push("");
    lines.push(`【长期记忆段 ${segment.index}】`);
    lines.push(stripMemorySummaryHeader(segment.summary));
  }

  return lines.join("\n");
}

export function createMemoryContextBlock(summary: string): ContextBlock | null {
  if (!summary.trim()) return null;
  return {
    id: "chat-memory-summary",
    source: "memory",
    title: "Long-Term Memory Segments",
    content: summary,
    priority: 10_000,
    role: "system",
    position: "beforeHistory",
  };
}
