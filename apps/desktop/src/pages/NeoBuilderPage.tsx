import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Eye,
  FileText,
  Globe2,
  Loader2,
  Save,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from "@neo-tavern/ui";
import { useVirtualList, VirtualList } from "@/components";
import { generateId } from "@neo-tavern/shared";
import type {
  Character,
  CreateCharacterInput,
  CreateWorldbookEntryInput,
  MessageUsage,
  Worldbook,
} from "@neo-tavern/shared";
import { worldbookRepository } from "@/db/repositories";
import { formatCnyCost } from "@/features/billing/deepseek-billing";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import {
  runNeoCharacterBuilderTurn,
  type NeoBuilderEvaluationReport,
  type NeoBuilderChoice,
  type NeoBuilderConversationMessage,
  type NeoBuilderToolEvent,
  type NeoBuilderTurnResult,
  type NeoCreationPlan,
  type NeoPersonalityPalette,
} from "@/features/character/neo-character-builder";
import { searchWeb } from "@/features/character/web-search";
import { toast } from "@/utils/toast";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";

const NEW_TARGET = "__new__";
const BUILDER_WORKSPACE_STORAGE_KEY = "neo:character-builder:workspace:v1";
const BUILDER_WORKSPACE_RECORDS_STORAGE_KEY = "neo:character-builder:workspace-records:v1";

type BuilderTarget = typeof NEW_TARGET | string;

type WorldbookDraft = {
  name?: string;
  description?: string;
  entries: CreateWorldbookEntryInput[];
};

type BuilderMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  choices?: NeoBuilderChoice[];
  reasoningContent?: string;
  toolEvents?: NeoBuilderToolEvent[];
  usage?: MessageUsage;
  pending?: boolean;
  startedAt?: number;
  completedAt?: number;
};

type ArtifactView = "character" | "worldbook" | "plan" | "palette" | "evaluation" | null;

type BuilderWorkspaceSnapshot = {
  targetId: BuilderTarget;
  messages: BuilderMessage[];
  input: string;
  webSearchEnabled: boolean;
  lastResult: NeoBuilderTurnResult | null;
  draft: CreateCharacterInput | null;
  worldbookDraft: WorldbookDraft | null;
  creationPlan: NeoCreationPlan | null;
  personalityPalette: NeoPersonalityPalette | null;
  evaluationReport: NeoBuilderEvaluationReport | null;
  savedCharacterId: string | null;
  builderSessionId: string;
};

type BuilderWorkspaceRecord = BuilderWorkspaceSnapshot & {
  id: string;
  title: string;
  updatedAt: string;
};

function normalizeRestoredMessages(messages: unknown): BuilderMessage[] {
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

function readBuilderWorkspaceSnapshot(): BuilderWorkspaceSnapshot | null {
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
      savedCharacterId: parsed.savedCharacterId ?? null,
      builderSessionId: typeof parsed.builderSessionId === "string" ? parsed.builderSessionId : generateId(),
    };
  } catch {
    return null;
  }
}

function writeBuilderWorkspaceSnapshot(snapshot: BuilderWorkspaceSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUILDER_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Local snapshots are best-effort; the Builder should keep working if storage is full or blocked.
  }
}

function getLatestUserMessage(messages: BuilderMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim()) return message.content.trim();
  }
  return "";
}

function hasWorkspaceProgress(snapshot: BuilderWorkspaceSnapshot) {
  return !!(
    snapshot.input.trim() ||
    snapshot.draft?.name?.trim() ||
    snapshot.creationPlan?.project?.name?.trim() ||
    snapshot.personalityPalette?.base?.trim() ||
    snapshot.evaluationReport?.summary?.trim() ||
    snapshot.savedCharacterId ||
    getLatestUserMessage(snapshot.messages) ||
    snapshot.messages.length > 1
  );
}

function buildWorkspaceTitle(snapshot: BuilderWorkspaceSnapshot) {
  const draftName = snapshot.draft?.name?.trim();
  if (draftName) return draftName;
  const projectName = snapshot.creationPlan?.project?.name?.trim();
  if (projectName) return projectName;
  const latestUserMessage = getLatestUserMessage(snapshot.messages);
  if (latestUserMessage)
    return latestUserMessage.length > 24 ? `${latestUserMessage.slice(0, 24)}...` : latestUserMessage;
  return "未命名创作";
}

function createWorkspaceRecord(
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

function normalizeWorkspaceRecord(record: Partial<BuilderWorkspaceRecord>): BuilderWorkspaceRecord | null {
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

function readBuilderWorkspaceRecords(): BuilderWorkspaceRecord[] {
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

function writeBuilderWorkspaceRecords(records: BuilderWorkspaceRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUILDER_WORKSPACE_RECORDS_STORAGE_KEY, JSON.stringify(records.slice(0, 80)));
  } catch {
    // Best-effort bookkeeping for Builder workspace history.
  }
}

function upsertWorkspaceRecord(records: BuilderWorkspaceRecord[], record: BuilderWorkspaceRecord) {
  const next = [record, ...records.filter((item) => item.id !== record.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 80);
  return next;
}

function getWorkspaceRecordStatus(record: BuilderWorkspaceRecord) {
  if (record.savedCharacterId) return "已保存";
  if (record.draft?.name?.trim()) return "待保存";
  return "构思中";
}

function getWorkspaceRecordStatusClass(record: BuilderWorkspaceRecord) {
  if (record.savedCharacterId) return "text-emerald-500";
  if (record.draft?.name?.trim()) return "text-amber-500";
  return "text-muted-foreground";
}

function readInitialBuilderSnapshot() {
  const snapshot = readBuilderWorkspaceSnapshot();
  if (snapshot) return snapshot;
  const records = readBuilderWorkspaceRecords();
  return records[0] ?? null;
}

function readInitialBuilderRecords(initialSnapshot: BuilderWorkspaceSnapshot | null) {
  const records = readBuilderWorkspaceRecords();
  if (initialSnapshot && hasWorkspaceProgress(initialSnapshot)) {
    return upsertWorkspaceRecord(records, createWorkspaceRecord(initialSnapshot, new Date().toISOString()));
  }
  return records;
}

function initialMessages(): BuilderMessage[] {
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

function toConversation(messages: BuilderMessage[]): NeoBuilderConversationMessage[] {
  return messages
    .filter((message) => !message.pending && message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function upsertToolEvent(events: NeoBuilderToolEvent[] | undefined, event: NeoBuilderToolEvent) {
  const next = [...(events ?? [])];
  const index = next.findIndex((item) => item.id === event.id);
  if (index >= 0) next[index] = event;
  else next.push(event);
  return next;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatToolSummary(events: NeoBuilderToolEvent[]) {
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

function ToolTimeline({ events }: { events: NeoBuilderToolEvent[] | undefined }) {
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
        className={`flex min-w-0 items-center gap-1 text-xs ${hasError ? "text-destructive" : "text-muted-foreground"}`}
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

function BuilderActivityTimeline({ message }: { message: BuilderMessage }) {
  const active = !!message.pending;
  const [now, setNow] = useState(() => Date.now());
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    if (!active || !message.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, message.startedAt]);

  const hasThinking = active || !!message.reasoningContent;
  const hasTools = !!message.toolEvents?.length;
  const hasActivity = hasThinking || hasTools;
  if (!hasActivity) return null;

  const elapsed = message.startedAt ? formatElapsed((message.completedAt ?? now) - message.startedAt) : null;
  const reasoningLines = (message.reasoningContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const reasoningPreview = reasoningLines.length ? reasoningLines[reasoningLines.length - 1] : "";

  return (
    <div className="mb-3 min-w-0">
      {elapsed && (
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-center tabular-nums">任务耗时 {elapsed}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className="min-w-0 border-l border-border/80">
        {hasThinking && (
          <div className="relative pb-3 pl-5">
            <span
              className={`absolute left-[-6px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ${
                active ? "text-primary" : "text-emerald-500"
              }`}
            >
              {active ? (
                <CircleDashed className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </span>
            <button
              type="button"
              className="flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden text-left text-sm font-medium disabled:cursor-default"
              onClick={() => setThinkingOpen((open) => !open)}
              disabled={!message.reasoningContent}
            >
              <Brain className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">{active ? "正在思考" : "已完成思考"}</span>
              {active && !thinkingOpen && reasoningPreview ? (
                <span className="min-w-0 truncate text-muted-foreground">· {reasoningPreview}</span>
              ) : null}
              {thinkingOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
            {thinkingOpen && message.reasoningContent ? (
              <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                {message.reasoningContent}
              </div>
            ) : null}
          </div>
        )}

        <ToolTimeline events={message.toolEvents} />
      </div>
    </div>
  );
}

function formatCharacterUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function BuilderWorkspaceList({
  records,
  activeWorkspaceId,
  disabled,
  onNew,
  onSelect,
  onDelete,
}: {
  records: BuilderWorkspaceRecord[];
  activeWorkspaceId: string;
  disabled: boolean;
  onNew: () => void;
  onSelect: (record: BuilderWorkspaceRecord) => void;
  onDelete: (record: BuilderWorkspaceRecord) => void;
}) {
  const { t } = useTranslation("neo-builder");
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {t("workspace.title")}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          className="mb-2 flex w-full min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted/60"
          onClick={onNew}
          disabled={disabled}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{t("workspace.newWorkspace")}</span>
        </button>

        <div className="space-y-1">
          {records.map((record) => (
            <div
              key={record.id}
              className={`flex min-w-0 items-stretch rounded-md border ${
                activeWorkspaceId === record.id ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/60"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2 text-left"
                onClick={() => onSelect(record)}
                disabled={disabled}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">{record.title}</span>
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className={`shrink-0 ${getWorkspaceRecordStatusClass(record)}`}>
                    {getWorkspaceRecordStatus(record)}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatCharacterUpdatedAt(record.updatedAt)}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onDelete(record)}
                disabled={disabled}
                title={t("workspace.delete")}
                aria-label={t("workspace.deleteAria", { title: record.title })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {!records.length ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{t("workspace.empty")}</div>
        ) : null}
      </div>
    </aside>
  );
}

function BuilderChatMessage({
  message,
  onChoice,
}: {
  message: BuilderMessage;
  onChoice: (choice: NeoBuilderChoice) => void;
}) {
  const { t } = useTranslation("neo-builder");
  const isUser = message.role === "user";
  return (
    <div className={`flex min-w-0 gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={`min-w-0 overflow-hidden ${isUser ? "max-w-[min(82%,48rem)] rounded-lg border bg-primary p-4 text-primary-foreground" : "w-full max-w-4xl py-1"}`}
      >
        {!isUser && <BuilderActivityTimeline message={message} />}

        {message.content ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</div>
        ) : null}

        {message.choices?.length ? (
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {message.choices.map((choice) => (
              <Button
                key={choice.id}
                type="button"
                variant="outline"
                size="sm"
                className="max-w-full whitespace-normal break-words text-left"
                onClick={() => onChoice(choice)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        ) : null}

        {message.usage && (
          <div className="mt-3 text-xs text-muted-foreground">
            {message.usage.totalTokens ? `${message.usage.totalTokens.toLocaleString()} tokens` : t("chat.tokensDash")}
            {message.usage.costCny ? ` · ${formatCnyCost(message.usage.costCny)}` : ""}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function NeoBuilderPage() {
  const { t } = useTranslation("neo-builder");
  const navigate = useNavigate();
  const { loadCharacters, createCharacter, updateCharacter } = useCharacterStore();
  const [initialSnapshot] = useState(() => readInitialBuilderSnapshot());
  const [targetId, setTargetId] = useState<BuilderTarget>(() => initialSnapshot?.targetId ?? NEW_TARGET);
  const [messages, setMessages] = useState<BuilderMessage[]>(() => initialSnapshot?.messages ?? initialMessages());
  const [input, setInput] = useState(() => initialSnapshot?.input ?? "");
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => initialSnapshot?.webSearchEnabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<NeoBuilderTurnResult | null>(() => initialSnapshot?.lastResult ?? null);
  const [draft, setDraft] = useState<CreateCharacterInput | null>(() => initialSnapshot?.draft ?? null);
  const [worldbookDraft, setWorldbookDraft] = useState<WorldbookDraft | null>(
    () => initialSnapshot?.worldbookDraft ?? null,
  );
  const [creationPlan, setCreationPlan] = useState<NeoCreationPlan | null>(() => initialSnapshot?.creationPlan ?? null);
  const [personalityPalette, setPersonalityPalette] = useState<NeoPersonalityPalette | null>(
    () => initialSnapshot?.personalityPalette ?? null,
  );
  const [evaluationReport, setEvaluationReport] = useState<NeoBuilderEvaluationReport | null>(
    () => initialSnapshot?.evaluationReport ?? null,
  );
  const [artifactView, setArtifactView] = useState<ArtifactView>(null);
  const [savedCharacterId, setSavedCharacterId] = useState<string | null>(
    () => initialSnapshot?.savedCharacterId ?? null,
  );
  const [workspaceRecords, setWorkspaceRecords] = useState<BuilderWorkspaceRecord[]>(() =>
    readInitialBuilderRecords(initialSnapshot ?? null),
  );
  const [builderSessionId, setBuilderSessionId] = useState(() => initialSnapshot?.builderSessionId ?? generateId());

  const {
    virtualizer: builderVirtualizer,
    containerRef: builderScrollRef,
    isNearBottomRef,
    handleScroll: handleBuilderScroll,
    scrollToIndex: builderScrollToIndex,
  } = useVirtualList({
    count: messages.length,
    getItemKey: (index) => messages[index]?.id ?? `msg-${index}`,
    estimateSize: () => 240,
    overscan: 6,
  });

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    if (isNearBottomRef.current) {
      builderScrollToIndex(messages.length - 1);
    }
    // isNearBottomRef is a ref — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, builderScrollToIndex]);

  useLayoutEffect(() => {
    builderScrollToIndex(messages.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderSessionId]);

  useEffect(() => {
    writeBuilderWorkspaceRecords(workspaceRecords);
  }, [workspaceRecords]);

  useEffect(() => {
    const snapshot: BuilderWorkspaceSnapshot = {
      targetId,
      messages,
      input,
      webSearchEnabled,
      lastResult,
      draft,
      worldbookDraft,
      creationPlan,
      personalityPalette,
      evaluationReport,
      savedCharacterId,
      builderSessionId,
    };
    writeBuilderWorkspaceSnapshot(snapshot);
    if (hasWorkspaceProgress(snapshot)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspaceRecords((records) => upsertWorkspaceRecord(records, createWorkspaceRecord(snapshot)));
    }
  }, [
    targetId,
    messages,
    input,
    webSearchEnabled,
    lastResult,
    draft,
    worldbookDraft,
    creationPlan,
    personalityPalette,
    evaluationReport,
    savedCharacterId,
    builderSessionId,
  ]);

  const resetWorkspace = () => {
    setTargetId(NEW_TARGET);
    setBuilderSessionId(generateId());
    setMessages(initialMessages());
    setLastResult(null);
    setDraft(null);
    setWorldbookDraft(null);
    setCreationPlan(null);
    setPersonalityPalette(null);
    setEvaluationReport(null);
    setArtifactView(null);
    setSavedCharacterId(null);
    setError(null);
    setInput("");
  };

  const handleNewWorkspace = () => {
    resetWorkspace();
  };

  const handleSelectWorkspace = (record: BuilderWorkspaceRecord) => {
    setTargetId(record.targetId);
    setBuilderSessionId(record.builderSessionId);
    setMessages(normalizeRestoredMessages(record.messages));
    setInput(record.input);
    setWebSearchEnabled(record.webSearchEnabled);
    setLastResult(record.lastResult);
    setDraft(record.draft);
    setWorldbookDraft(record.worldbookDraft);
    setCreationPlan(record.creationPlan);
    setPersonalityPalette(record.personalityPalette);
    setEvaluationReport(record.evaluationReport);
    setSavedCharacterId(record.savedCharacterId);
    setArtifactView(null);
    setError(null);
  };

  const handleDeleteWorkspace = (record: BuilderWorkspaceRecord) => {
    setWorkspaceRecords((records) => records.filter((item) => item.id !== record.id));
    if (record.id === builderSessionId) resetWorkspace();
  };

  const applyDraftFromResult = (result: NeoBuilderTurnResult) => {
    if (result.creationPlan) setCreationPlan(result.creationPlan);
    if (result.personalityPalette) setPersonalityPalette(result.personalityPalette);
    if (result.evaluationReport) setEvaluationReport(result.evaluationReport);
    if (!result.draft) return;
    setTargetId(NEW_TARGET);
    setSavedCharacterId(null);
    setDraft(result.draft.character);
    setCreationPlan(result.draft.creationPlan ?? result.creationPlan ?? creationPlan);
    setPersonalityPalette(result.draft.personalityPalette ?? result.personalityPalette ?? personalityPalette);
    setEvaluationReport(result.draft.evaluationReport ?? result.evaluationReport ?? evaluationReport);
    setWorldbookDraft(
      result.draft.worldbookEntries.length > 0
        ? {
            name: result.draft.worldbookName,
            description: result.draft.worldbookDescription,
            entries: result.draft.worldbookEntries,
          }
        : null,
    );
  };

  const sendMessage = async (content: string, webSearchOverride = webSearchEnabled) => {
    const clean = content.trim();
    if (!clean || running) return;

    const config = useSettingsStore.getState().modelConfig;
    if (!config) {
      const message = "请先在设置里配置主 API 模型。";
      setError(message);
      toast("error", message);
      return;
    }

    const userMessage: BuilderMessage = { id: generateId(), role: "user", content: clean };
    const assistantId = generateId();
    const assistantMessage: BuilderMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      startedAt: Date.now(),
    };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setInput("");
    setRunning(true);
    setError(null);

    try {
      const result = await runNeoCharacterBuilderTurn({
        conversation: toConversation(nextMessages),
        existingCharacter: null,
        currentDraft: draft,
        currentWorldbookEntries: worldbookDraft?.entries ?? [],
        creationPlan,
        personalityPalette,
        modelConfig: config,
        scopeId: builderSessionId,
        webSearchEnabled: webSearchOverride,
        searchWeb,
        onContentDelta: (delta) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content: `${message.content}${delta}` } : message,
            ),
          );
        },
        onReasoningDelta: (delta) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, reasoningContent: `${message.reasoningContent ?? ""}${delta}` }
                : message,
            ),
          );
        },
        onToolEvent: (event) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, toolEvents: upsertToolEvent(message.toolEvents, event) }
                : message,
            ),
          );
        },
      });

      setLastResult(result);
      applyDraftFromResult(result);
      void recordUsageCostAndWarn(result.usage);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: result.content,
                choices: result.choices,
                reasoningContent: result.reasoningContent,
                toolEvents: result.toolEvents,
                usage: result.usage,
                pending: false,
                completedAt: Date.now(),
              }
            : message,
        ),
      );
    } catch (err) {
      const message = (err as Error).message || "Whale Builder failed";
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId ? { ...item, content: message, pending: false, completedAt: Date.now() } : item,
        ),
      );
      toast("error", message);
    } finally {
      setRunning(false);
    }
  };

  const handleChoice = (choice: NeoBuilderChoice) => {
    const shouldEnableSearch = /联网|搜索|查资料|真实资料/.test(`${choice.label} ${choice.value}`);
    if (shouldEnableSearch) setWebSearchEnabled(true);
    void sendMessage(choice.value, shouldEnableSearch ? true : webSearchEnabled);
  };

  const saveWorldbookForCharacter = async (character: Character, nextDraft: WorldbookDraft) => {
    const now = new Date().toISOString();
    const worldbooks = useWorldbookStore.getState().worldbooks;
    const existingWorldbook = character.worldbookId
      ? worldbooks.find((worldbook) => worldbook.id === character.worldbookId)
      : null;
    const worldbookId = existingWorldbook?.id || generateId();
    const worldbook: Worldbook = {
      id: worldbookId,
      name: nextDraft.name || `${character.name} Worldbook`,
      description: nextDraft.description || `Generated by Whale Builder for ${character.name}`,
      entries: nextDraft.entries.map((entry) => ({
        ...entry,
        id: generateId(),
        worldbookId,
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: existingWorldbook?.createdAt || now,
      updatedAt: now,
    };

    const nextWorldbooks = existingWorldbook
      ? worldbooks.map((item) => (item.id === worldbookId ? worldbook : item))
      : [...worldbooks, worldbook];

    await worldbookRepository.save(nextWorldbooks);
    useWorldbookStore.getState().loadWorldbooks();
    useWorldbookStore.getState().setActiveWorldbook(worldbookId);
    return updateCharacter(character.id, { worldbookId });
  };

  const handleSave = async () => {
    if (!draft?.name.trim() || savedCharacterId) return;

    setSaving(true);
    setError(null);
    try {
      let saved = await createCharacter(draft);
      setTargetId(saved.id);

      if (worldbookDraft?.entries.length) {
        saved = await saveWorldbookForCharacter(saved, worldbookDraft);
        setTargetId(saved.id);
      }

      setSavedCharacterId(saved.id);
      await loadCharacters();
      toast("success", `Saved "${saved.name}"`);
    } catch (err) {
      const message = (err as Error).message || t("toast.saveFailed");
      setError(message);
      toast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const allToolEvents = messages.flatMap((message) => message.toolEvents ?? []);
  const hasUserMessage = messages.some((message) => message.role === "user");
  const hasOptionPrompt = allToolEvents.some((event) => event.name === "ask_user_options" && event.status === "done");
  const hasCreationPlan = allToolEvents.some(
    (event) => event.name === "present_creation_plan" && event.status === "done",
  );
  const hasWebSearch = allToolEvents.some((event) => event.name === "web_search" && event.status === "done");
  const hasSavedDraftTool = allToolEvents.some(
    (event) => event.name === "save_character_draft" && event.status === "done",
  );
  const planEntries = creationPlan?.entries ?? [];
  const completedPlanEntries = planEntries.filter(
    (entry) => entry.status === "done" || entry.status === "skipped",
  ).length;
  const steps = [
    { label: t("steps.gatherDirection"), done: hasUserMessage, active: running && !hasUserMessage },
    {
      label: t("steps.alignPlan"),
      done: !!creationPlan || hasOptionPrompt || hasCreationPlan || !!draft,
      active: running && hasUserMessage && !creationPlan && !draft,
    },
    {
      label: t("steps.searchReference"),
      done: hasWebSearch,
      active: running && webSearchEnabled && !hasWebSearch,
      optional: true,
    },
    {
      label: t("steps.generateEntries"),
      done: planEntries.length ? completedPlanEntries === planEntries.length : !!draft || hasSavedDraftTool,
      active: running && (!!creationPlan || hasUserMessage) && !draft,
    },
    { label: t("steps.generateCharacter"), done: !!draft || hasSavedDraftTool, active: running && !draft },
    { label: t("steps.saveToWhalePlay"), done: !!savedCharacterId, active: saving },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/character")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("backToCharacters")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px] gap-4 p-4 flex-1 overflow-hidden">
        <BuilderWorkspaceList
          records={workspaceRecords}
          activeWorkspaceId={builderSessionId}
          disabled={running || saving}
          onNew={handleNewWorkspace}
          onSelect={handleSelectWorkspace}
          onDelete={handleDeleteWorkspace}
        />

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
          <VirtualList
            virtualizer={builderVirtualizer}
            containerRef={builderScrollRef}
            onScroll={handleBuilderScroll}
            containerClassName="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5"
            renderItem={(index) => {
              const message = messages[index];
              if (!message) return null;
              return (
                <div className="mx-auto w-full min-w-0 max-w-4xl pb-5">
                  <BuilderChatMessage message={message} onChoice={handleChoice} />
                </div>
              );
            }}
          />

          {error && <div className="mx-5 mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <div className="shrink-0 border-t bg-card p-4">
            <div className="mx-auto w-full min-w-0 max-w-4xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={webSearchEnabled ? "default" : "outline"}
                  onClick={() => setWebSearchEnabled((value) => !value)}
                  disabled={running}
                >
                  <Globe2 className="mr-1 h-3.5 w-3.5" />
                  {t("chat.webSearch")}
                </Button>
                {lastResult?.draft && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("chat.draftReady")}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
                  onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder={t("chat.placeholder")}
                  rows={3}
                  disabled={running || saving}
                  className="min-w-0 flex-1 resize-none"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => sendMessage(input)}
                  disabled={running || saving || !input.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="hidden xl:contents">
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="shrink-0 border-b p-4">
              <h2 className="font-semibold">{t("sidebar.progressAndArtifacts")}</h2>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("sidebar.progress")}
                </div>
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div
                      key={step.label}
                      className={`flex items-center gap-3 rounded-md border bg-background p-3 ${
                        step.active ? "border-primary/60 bg-primary/5" : ""
                      }`}
                    >
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                          step.done
                            ? "bg-emerald-500 text-white"
                            : step.active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {step.done ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : step.active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{step.label}</div>
                        {step.optional && !step.done ? (
                          <div className="text-xs text-muted-foreground">{t("sidebar.optional")}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {planEntries.length ? (
                  <div className="mt-3 rounded-md border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t("planEntries.title")}</span>
                      <span>
                        {completedPlanEntries}/{planEntries.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {planEntries.slice(0, 10).map((entry) => (
                        <div key={entry.id} className="flex min-w-0 items-center gap-2 text-xs">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              entry.status === "done"
                                ? "bg-emerald-500"
                                : entry.status === "in_progress"
                                  ? "bg-primary"
                                  : entry.status === "skipped"
                                    ? "bg-amber-500"
                                    : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                          <span className="shrink-0 text-muted-foreground">{entry.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="mt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4" />
                  {t("sidebar.artifacts")}
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          {t("artifacts.plan.title")}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {creationPlan
                            ? t("artifacts.plan.entries", { count: creationPlan.entries.length })
                            : t("status.generated")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setArtifactView("plan")}
                        disabled={!creationPlan}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("view")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Brain className="h-4 w-4" />
                          {t("artifacts.palette.title")}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {personalityPalette
                            ? t("artifacts.palette.summary", {
                                base: personalityPalette.base || t("artifacts.palette.noBase"),
                                count: personalityPalette.derivatives.length,
                              })
                            : t("status.generated")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setArtifactView("palette")}
                        disabled={!personalityPalette}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("view")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          {t("artifacts.character.title")}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {draft ? draft.name : t("status.generated")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setArtifactView("character")}
                        disabled={!draft}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("view")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <BookOpen className="h-4 w-4" />
                          {t("artifacts.worldbook.title")}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {worldbookDraft?.entries.length
                            ? t("artifacts.worldbook.entries", { count: worldbookDraft.entries.length })
                            : t("status.generated")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setArtifactView("worldbook")}
                        disabled={!worldbookDraft?.entries.length}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("view")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          {t("artifacts.evaluation.title")}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {evaluationReport
                            ? t("artifacts.evaluation.issues", { count: evaluationReport.issues.length })
                            : t("status.evaluated")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setArtifactView("evaluation")}
                          disabled={!evaluationReport}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          {t("view")}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      sendMessage(
                        "请评估当前 Whale Builder 草稿，检查角色卡、性格调色盘、世界书条目、创作规划.yaml 是否完整，并给出可执行修改建议。",
                      )
                    }
                    disabled={running || saving || (!draft && !creationPlan)}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    {t("evaluate")}
                  </Button>

                  <Button
                    className="w-full"
                    onClick={handleSave}
                    disabled={!draft?.name.trim() || running || saving || !!savedCharacterId}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    {savedCharacterId ? t("save.saved") : saving ? t("save.saving") : t("save.create")}
                  </Button>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>

      <Dialog
        open={artifactView === "plan"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.creationPlan.title")}</DialogTitle>
            <DialogDescription>Whale Builder 当前工作台的持久创作规划。</DialogDescription>
          </DialogHeader>
          {creationPlan ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
                <span>项目：{creationPlan.project.name}</span>
                <span>条目：{creationPlan.entries.length}</span>
                <span>更新：{formatCharacterUpdatedAt(creationPlan.updatedAt)}</span>
              </div>
              <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {creationPlan.yaml}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "palette"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.palette.title")}</DialogTitle>
            <DialogDescription>底色、主色调、点缀和具体衍生。</DialogDescription>
          </DialogHeader>
          {personalityPalette ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">底色</h3>
                  <p className="mt-2 break-words">{personalityPalette.base || "-"}</p>
                </section>
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">主色调</h3>
                  <p className="mt-2 break-words">{personalityPalette.main.join("、") || "-"}</p>
                </section>
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">点缀</h3>
                  <p className="mt-2 break-words">{personalityPalette.accents.join("、") || "-"}</p>
                </section>
              </div>
              {personalityPalette.derivatives.map((derivative) => (
                <section key={derivative.color} className="rounded-md border bg-background p-4">
                  <h3 className="mb-2 text-sm font-semibold">{derivative.color}衍生</h3>
                  <div className="space-y-2">
                    {derivative.items.map((item, index) => (
                      <p
                        key={`${derivative.color}-${index}`}
                        className="whitespace-pre-wrap break-words text-sm leading-relaxed"
                      >
                        {index + 1}. {item}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
              {personalityPalette.futureDerivatives?.length ? (
                <section className="rounded-md border bg-background p-4">
                  <h3 className="mb-2 text-sm font-semibold">未来衍生</h3>
                  <div className="space-y-2">
                    {personalityPalette.futureDerivatives.map((item, index) => (
                      <p key={`${item}-${index}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
              {personalityPalette.compiledText ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Compiled Personality</h3>
                  <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                    {personalityPalette.compiledText}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "evaluation"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.evaluation.title")}</DialogTitle>
            <DialogDescription>当前草稿的结构、质量和一致性检查。</DialogDescription>
          </DialogHeader>
          {evaluationReport ? (
            <div className="space-y-4 text-sm">
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">摘要</h3>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{evaluationReport.summary}</p>
                {typeof evaluationReport.score === "number" ? (
                  <p className="mt-2 text-xs text-muted-foreground">Score {evaluationReport.score}/100</p>
                ) : null}
              </section>
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">问题</h3>
                {evaluationReport.issues.length ? (
                  <div className="space-y-2">
                    {evaluationReport.issues.map((issue, index) => (
                      <div key={`${issue.target}-${index}`} className="rounded-md border bg-muted/20 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{issue.severity}</span>
                          <span>{issue.target}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无问题</p>
                )}
              </section>
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">修改建议</h3>
                <div className="space-y-2">
                  {evaluationReport.suggestions.map((item, index) => (
                    <p key={`${item}-${index}`} className="whitespace-pre-wrap break-words">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "character"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.name || t("dialogs.characterCard.defaultTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.characterCard.description")}</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-5 text-sm">
              {draft.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Description</h3>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{draft.description || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Personality</h3>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{draft.personality || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Scenario</h3>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{draft.scenario || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">First Message</h3>
                <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 leading-relaxed">
                  {draft.firstMessage || "-"}
                </p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Example Dialogues</h3>
                <p className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">
                  {draft.exampleDialogues || "-"}
                </p>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "worldbook"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{worldbookDraft?.name || t("dialogs.worldbook.defaultTitle")}</DialogTitle>
            <DialogDescription>{worldbookDraft?.description || t("dialogs.worldbook.description")}</DialogDescription>
          </DialogHeader>
          {worldbookDraft?.entries.length ? (
            <div className="space-y-4">
              {worldbookDraft.entries.map((entry, index) => (
                <section key={`${entry.title}-${index}`} className="rounded-md border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words text-sm font-semibold">{entry.title}</h3>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-2 py-1">{entry.type}</span>
                      <span className="rounded bg-muted px-2 py-1">{entry.position || "afterHistory"}</span>
                      <span className="rounded bg-muted px-2 py-1">priority {entry.priority}</span>
                      <span className="rounded bg-muted px-2 py-1">{entry.triggerMode}</span>
                    </div>
                  </div>
                  {entry.keys ? (
                    <p className="mt-3 break-words text-xs text-muted-foreground">Keys: {entry.keys}</p>
                  ) : null}
                  {entry.secondaryKeys ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">Secondary: {entry.secondaryKeys}</p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.content}</p>
                </section>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
