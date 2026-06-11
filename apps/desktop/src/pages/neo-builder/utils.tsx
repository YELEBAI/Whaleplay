import type { CreateCharacterInput } from "@neo-tavern/shared";
import { generateId } from "@neo-tavern/shared";
import type {
  NeoBuilderConversationMessage,
  NeoBuilderToolEvent,
  NeoBuilderTurnResult,
  NeoCreationPlan,
  NeoCreationPlanEntry,
} from "@/features/character/neo-character-builder";
import { CheckCircle2, ChevronRight, Loader2, Wrench, XCircle } from "lucide-react";
import { cn } from "@neo-tavern/ui";
import {
  BUILDER_WORKSPACE_RECORDS_STORAGE_KEY,
  BUILDER_WORKSPACE_STORAGE_KEY,
  NEW_TARGET,
  type BuilderMessage,
  type BuilderWorkspaceRecord,
  type BuilderWorkspaceSnapshot,
} from "./types";
export { NEW_TARGET };

// ── Message helpers ──────────────────────────────────

export function normalizeRestoredMessages(messages: unknown): BuilderMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return initialMessages();
  return messages
    .filter(
      (message): message is BuilderMessage =>
        !!message &&
        typeof message === "object" &&
        ((message as BuilderMessage).role === "assistant" || (message as BuilderMessage).role === "user") &&
        typeof (message as BuilderMessage).content === "string",
    )
    .map((message) => ({
      ...message,
      pending: false,
      completedAt: message.pending && message.startedAt ? Date.now() : message.completedAt,
    }));
}

export function readBuilderWorkspaceSnapshot(): BuilderWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BUILDER_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BuilderWorkspaceSnapshot>;
    return {
      targetId: typeof parsed.targetId === "string" ? parsed.targetId : NEW_TARGET,
      messages: normalizeRestoredMessages(parsed.messages),
      input: typeof parsed.input === "string" ? parsed.input : "",
      webSearchEnabled: !!parsed.webSearchEnabled,
      lastResult: parsed.lastResult ?? null,
      draft: parsed.draft ?? null,
      worldbookDraft: parsed.worldbookDraft ?? null,
      creationPlan: parsed.creationPlan ?? null,
      personalityPalette: parsed.personalityPalette ?? null,
      evaluationReport: parsed.evaluationReport ?? null,
      mvu: parsed.mvu ?? null,
      statusBars: parsed.statusBars ?? parsed.draft?.statusBars ?? null,
      savedCharacterId: parsed.savedCharacterId ?? null,
      builderSessionId: typeof parsed.builderSessionId === "string" ? parsed.builderSessionId : generateId(),
    };
  } catch {
    return null;
  }
}

export function writeBuilderWorkspaceSnapshot(snapshot: BuilderWorkspaceSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUILDER_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Local snapshots are best-effort; the Builder should keep working if storage is full or blocked.
  }
}

export function getLatestUserMessage(messages: BuilderMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && !message.hidden && message.content.trim()) return message.content.trim();
  }
  return "";
}

// ── Workspace snapshot helpers ───────────────────────

export function hasWorkspaceProgress(snapshot: BuilderWorkspaceSnapshot) {
  return !!(
    snapshot.input.trim() ||
    snapshot.draft?.name?.trim() ||
    snapshot.creationPlan?.project?.name?.trim() ||
    snapshot.personalityPalette?.base?.trim() ||
    snapshot.evaluationReport?.summary?.trim() ||
    !!snapshot.statusBars?.bars?.length ||
    snapshot.savedCharacterId ||
    getLatestUserMessage(snapshot.messages) ||
    snapshot.messages.length > 1
  );
}

export function buildWorkspaceTitle(snapshot: BuilderWorkspaceSnapshot) {
  const draftName = snapshot.draft?.name?.trim();
  if (draftName) return draftName;
  const projectName = snapshot.creationPlan?.project?.name?.trim();
  if (projectName) return projectName;
  const latestUserMessage = getLatestUserMessage(snapshot.messages);
  if (latestUserMessage)
    return latestUserMessage.length > 24 ? `${latestUserMessage.slice(0, 24)}...` : latestUserMessage;
  return "未命名创作";
}

// ── Workspace record helpers ─────────────────────────

export function createWorkspaceRecord(
  snapshot: BuilderWorkspaceSnapshot,
  updatedAt = new Date().toISOString(),
): BuilderWorkspaceRecord {
  return {
    ...snapshot,
    id: snapshot.builderSessionId,
    title: buildWorkspaceTitle(snapshot),
    updatedAt,
  };
}

export function normalizeWorkspaceRecord(record: Partial<BuilderWorkspaceRecord>): BuilderWorkspaceRecord | null {
  const builderSessionId =
    typeof record.builderSessionId === "string"
      ? record.builderSessionId
      : typeof record.id === "string"
        ? record.id
        : generateId();
  const snapshot: BuilderWorkspaceSnapshot = {
    targetId: typeof record.targetId === "string" ? record.targetId : NEW_TARGET,
    messages: normalizeRestoredMessages(record.messages),
    input: typeof record.input === "string" ? record.input : "",
    webSearchEnabled: !!record.webSearchEnabled,
    lastResult: record.lastResult ?? null,
    draft: record.draft ?? null,
    worldbookDraft: record.worldbookDraft ?? null,
    creationPlan: record.creationPlan ?? null,
    personalityPalette: record.personalityPalette ?? null,
    evaluationReport: record.evaluationReport ?? null,
    mvu: record.mvu ?? null,
    statusBars: record.statusBars ?? record.draft?.statusBars ?? null,
    savedCharacterId: record.savedCharacterId ?? null,
    builderSessionId,
  };
  if (!hasWorkspaceProgress(snapshot)) return null;
  return {
    ...snapshot,
    id: typeof record.id === "string" ? record.id : builderSessionId,
    title: typeof record.title === "string" && record.title.trim() ? record.title : buildWorkspaceTitle(snapshot),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

export function readBuilderWorkspaceRecords(): BuilderWorkspaceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BUILDER_WORKSPACE_RECORDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((record) => normalizeWorkspaceRecord(record as Partial<BuilderWorkspaceRecord>))
      .filter((record): record is BuilderWorkspaceRecord => !!record)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function writeBuilderWorkspaceRecords(records: BuilderWorkspaceRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUILDER_WORKSPACE_RECORDS_STORAGE_KEY, JSON.stringify(records.slice(0, 80)));
  } catch {
    // Best-effort bookkeeping for Builder workspace history.
  }
}

export function upsertWorkspaceRecord(records: BuilderWorkspaceRecord[], record: BuilderWorkspaceRecord) {
  const next = [record, ...records.filter((item) => item.id !== record.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 80);
  return next;
}

export function getWorkspaceRecordStatus(record: BuilderWorkspaceRecord) {
  if (record.savedCharacterId) return "已保存";
  if (record.draft?.name?.trim()) return "待保存";
  return "构思中";
}

export function readInitialBuilderSnapshot() {
  const snapshot = readBuilderWorkspaceSnapshot();
  if (snapshot) return snapshot;
  const records = readBuilderWorkspaceRecords();
  return records[0] ?? null;
}

export function readInitialBuilderRecords(initialSnapshot: BuilderWorkspaceSnapshot | null) {
  const records = readBuilderWorkspaceRecords();
  if (initialSnapshot && hasWorkspaceProgress(initialSnapshot)) {
    return upsertWorkspaceRecord(records, createWorkspaceRecord(initialSnapshot, new Date().toISOString()));
  }
  return records;
}

// ── Initial state / conversation ─────────────────────

export function initialMessages(): BuilderMessage[] {
  return [
    {
      id: generateId(),
      role: "assistant",
      content:
        "把角色想法直接丢给我就行。我会按 Whale Play 工作流先对齐规划，信息不够时给你几个选项；需要真实资料时可以打开联网搜索。",
      choices: [
        { id: "original", label: "原创角色", value: "我想做一个原创角色，请先帮我确定核心方向。" },
        { id: "palette", label: "先做调色盘", value: "我想先做角色性格调色盘，请引导我确定底色、主色调、点缀和衍生。" },
        { id: "research", label: "查资料写卡", value: "我想基于真实资料或已有题材写角色，请先联网搜索并提炼参考。" },
      ],
    },
  ];
}

export function toConversation(messages: BuilderMessage[]): NeoBuilderConversationMessage[] {
  return messages
    .filter((message) => !message.pending && message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

// ── Tool event helpers ───────────────────────────────

export function upsertToolEvent(events: NeoBuilderToolEvent[] | undefined, event: NeoBuilderToolEvent) {
  const next = [...(events ?? [])];
  const index = next.findIndex((item) => item.id === event.id);
  if (index >= 0) next[index] = event;
  else next.push(event);
  return next;
}

export function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatToolSummary(events: NeoBuilderToolEvent[]) {
  const running = events.filter((event) => event.status === "running");
  const failed = events.filter((event) => event.status === "error");
  const labelCounts = events.reduce<Map<string, number>>((counts, event) => {
    counts.set(event.label, (counts.get(event.label) ?? 0) + 1);
    return counts;
  }, new Map());
  const labels = [...labelCounts.entries()]
    .slice(0, 3)
    .map(([label, count]) => (count > 1 ? `${label} x${count}` : label))
    .join("、");

  if (running.length > 0) return `正在调用 ${running.length} 个工具${labels ? `：${labels}` : ""}`;
  if (failed.length > 0) return `已调用 ${events.length} 次工具，${failed.length} 个失败${labels ? `：${labels}` : ""}`;
  return `已调用 ${events.length} 次工具${labels ? `：${labels}` : ""}`;
}

// ── Generic record readers ───────────────────────────

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ── Plan helpers ─────────────────────────────────────

export function normalizePlanStatus(value: unknown, fallback: NeoCreationPlanEntry["status"]): NeoCreationPlanEntry["status"] {
  return value === "done" || value === "in_progress" || value === "skipped" || value === "planned" ? value : fallback;
}

export function getPlanStatusLabel(status: NeoCreationPlanEntry["status"]) {
  switch (status) {
    case "done":
      return "done";
    case "in_progress":
      return "running";
    case "skipped":
      return "skipped";
    default:
      return "planned";
  }
}

export function applyEntryProgressEvent(
  plan: NeoCreationPlan | null,
  event: NeoBuilderToolEvent,
): NeoCreationPlan | null {
  if (!plan || event.name !== "record_entry_output" || event.status === "error") return plan;

  const args = readRecord(event.args);
  const result = readRecord(event.result);
  const summary = readRecord(result.summary);
  const entryKey =
    readString(args.entryId) ||
    readString(args.id) ||
    readString(args.name) ||
    readString(summary.entry);
  if (!entryKey) return plan;

  const nextStatus =
    event.status === "running"
      ? "in_progress"
      : normalizePlanStatus(args.status || summary.status, "done");
  let changed = false;
  const entries = plan.entries.map((entry) => {
    if (entry.id !== entryKey && entry.name !== entryKey) return entry;
    changed = true;
    return {
      ...entry,
      status: nextStatus,
      outputRef: readString(args.outputRef || args.output_ref) || entry.outputRef,
      skipReason: readString(args.skipReason || args.skip_reason) || entry.skipReason,
    };
  });

  return changed ? { ...plan, entries, updatedAt: new Date().toISOString() } : plan;
}

// ── Background run helpers ───────────────────────────

export function shouldRunBuilderTurnInBackground(
  content: string,
  plan: NeoCreationPlan | null,
  draft: CreateCharacterInput | null,
  hiddenUserMessage: boolean,
) {
  if (!plan?.entries.length || draft) return false;
  if (/调整|修改|改一下|补细节|先补|别生成|不要生成|暂停/.test(content)) return false;
  if (hiddenUserMessage) return true;
  return /确认|按规划|开始|继续|逐条|生成|创作|本阶段选项汇总|选项回答/.test(content);
}

export function getBackgroundResultContent(result: NeoBuilderTurnResult) {
  if (result.draft?.character?.name) return `后台创作已完成：${result.draft.character.name}。右侧可以查看角色卡与世界书。`;
  if (result.draft) return "后台创作已完成。右侧可以查看产出物。";
  return "后台创作已暂停。请查看右侧进度与产出物。";
}

// ── Small inline components / pure display helpers ────

export function ToolTimeline({ events }: { events: NeoBuilderToolEvent[] | undefined }) {
  if (!events?.length) return null;
  const hasRunning = events.some((event) => event.status === "running");
  const hasError = events.some((event) => event.status === "error");
  return (
    <div className="relative pb-3 pl-5">
      <span
        className={`absolute left-[-6px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ${
          hasError ? "text-destructive" : hasRunning ? "text-primary" : "text-emerald-500"
        }`}
      >
        {hasError ? (
          <XCircle className="h-3.5 w-3.5" />
        ) : hasRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
      </span>
      <div
        className={cn("flex min-w-0 items-center gap-1 text-xs", hasError ? "text-destructive" : "text-muted-foreground")}
      >
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate" title={events.map((event) => event.label).join("、")}>
          {formatToolSummary(events)}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </div>
    </div>
  );
}

export function formatCharacterUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getChoicePanelTitle(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "请选择一个方向";
}
