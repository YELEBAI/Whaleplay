import type { MessageUsage } from "@neo-tavern/shared";
import type { NeoBuilderToolEvent, NeoBuilderTurnOptions, NeoCreationPlan } from "./types";

export function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function optionalString(value: unknown): string | undefined {
  const text = trimString(value);
  return text || undefined;
}

export function splitEntryKeys(keys: string): string[] {
  return keys
    .split(/[,，、;；\n]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

export function isSingleHanKey(key: string): boolean {
  return Array.from(key).length === 1 && /[\u3400-\u9fff]/.test(key);
}

export function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => trimString(item)).filter(Boolean);
  const text = trimString(value);
  return text ? splitEntryKeys(text) : [];
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => trimString(item)).filter(Boolean);
}

export function addUsage(
  total: MessageUsage | undefined,
  next: MessageUsage | undefined,
): MessageUsage | undefined {
  if (!next) return total;
  const merged: MessageUsage = { ...(total ?? {}) };
  const fields: Array<
    keyof Pick<MessageUsage, "promptTokens" | "completionTokens" | "totalTokens" | "cacheHitTokens" | "cacheMissTokens">
  > = ["promptTokens", "completionTokens", "totalTokens", "cacheHitTokens", "cacheMissTokens"];
  for (const field of fields) {
    const value = next[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      merged[field] = (merged[field] ?? 0) + value;
    }
  }
  return merged;
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function stringifyToolResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createBuilderEventId(): string {
  return `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const TOOL_LABELS: Record<string, string> = {
  list_skill_references: "查看规则索引",
  read_skill_reference: "读取 Whale Play 规则",
  ask_user_options: "生成追问选项",
  present_creation_plan: "确认创作规划",
  web_search: "联网搜索",
  validate_character_draft: "校验角色草稿",
  save_character_draft: "保存角色草稿",
  evaluate_character_draft: "评估角色草稿",
  record_entry_output: "记录条目进度",
};

export function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

export function emitToolEvent(
  events: NeoBuilderToolEvent[],
  onToolEvent: NeoBuilderTurnOptions["onToolEvent"],
  event: NeoBuilderToolEvent,
): void {
  const index = events.findIndex((item) => item.id === event.id);
  if (index >= 0) events[index] = event;
  else events.push(event);
  onToolEvent?.(event);
}

export function appendVisibleBuilderContent(current: string, next: string): string {
  const clean = next.trim();
  if (!clean) return current;
  return current ? `${current.trimEnd()}\n\n${clean}` : clean;
}

export function getPlanProgress(plan?: NeoCreationPlan): { done: number; total: number } {
  const entries = plan?.entries ?? [];
  const done = entries.filter((entry) => entry.status === "done" || entry.status === "skipped").length;
  return { done, total: entries.length };
}

export function summarizeToolOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const data = output as Record<string, unknown>;
  if (data.summary && typeof data.summary === "object") return { summary: data.summary };
  return output;
}

export function buildStopForUserContent(output: Record<string, unknown>): string {
  const question = typeof output.question === "string" ? output.question : "";
  const summaryText = typeof output.summaryText === "string" ? output.summaryText : "";
  const reason = typeof output.reason === "string" ? output.reason : "";
  if (question) return question;
  if (summaryText) return summaryText;
  if (reason) return reason;
  return "请选择一个选项。";
}

// ── JSON extraction ──

export type DraftPayload = {
  character?: Record<string, unknown>;
  [key: string]: unknown;
};

export function extractJsonObject(content: string): DraftPayload | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed].filter((candidate): candidate is string => !!candidate);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && "character" in parsed) return parsed as DraftPayload;
    } catch {
      continue;
    }
  }

  return null;
}
