import { describe, it, expect } from "vitest";
import {
  normalizeRestoredMessages,
  hasWorkspaceProgress,
  buildWorkspaceTitle,
  upsertWorkspaceRecord,
  getWorkspaceRecordStatus,
  toConversation,
  upsertToolEvent,
  formatElapsed,
  formatToolSummary,
  normalizePlanStatus,
  getPlanStatusLabel,
  applyEntryProgressEvent,
  shouldRunBuilderTurnInBackground,
  getBackgroundResultContent,
  getChoicePanelTitle,
  createWorkspaceRecord,
  getLatestUserMessage,
  formatCharacterUpdatedAt,
  NEW_TARGET,
} from "./utils";
import type {
  BuilderMessage,
  BuilderWorkspaceSnapshot,
  BuilderWorkspaceRecord,
  NeoBuilderToolEvent,
  NeoCreationPlan,
  NeoBuilderTurnResult,
} from "./types";

// ── Shared test fixtures ─────────────────────────────

function makeMessage(overrides: Partial<BuilderMessage> = {}): BuilderMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "创建一个角色",
    ...overrides,
  };
}

function makeAssistantMessage(overrides: Partial<BuilderMessage> = {}): BuilderMessage {
  return makeMessage({ role: "assistant", content: "好的，让我来帮你。", ...overrides });
}

function makeSnapshot(overrides: Partial<BuilderWorkspaceSnapshot> = {}): BuilderWorkspaceSnapshot {
  return {
    targetId: NEW_TARGET,
    messages: [],
    input: "",
    webSearchEnabled: false,
    lastResult: null,
    draft: null,
    worldbookDraft: null,
    creationPlan: null,
    personalityPalette: null,
    evaluationReport: null,
    mvu: null,
    statusBars: null,
    savedCharacterId: null,
    builderSessionId: "session-1",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<BuilderWorkspaceRecord> = {}): BuilderWorkspaceRecord {
  const base = makeSnapshot();
  return {
    ...base,
    id: base.builderSessionId,
    title: "未命名创作",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeToolEvent(overrides: Partial<NeoBuilderToolEvent> = {}): NeoBuilderToolEvent {
  return {
    id: "evt-1",
    name: "search_web",
    label: "联网搜索",
    status: "done",
    ...overrides,
  };
}

// ── 1. normalizeRestoredMessages ──────────────────────

describe("normalizeRestoredMessages", () => {
  it("returns initialMessages() when passed an empty array", () => {
    const result = normalizeRestoredMessages([]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].choices).toHaveLength(3);
  });

  it("returns initialMessages() when passed a non-array", () => {
    const result = normalizeRestoredMessages(null);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
  });

  it("returns initialMessages() when passed undefined", () => {
    const result = normalizeRestoredMessages(undefined);
    expect(result).toHaveLength(1);
  });

  it("returns initialMessages() when passed a plain object", () => {
    const result = normalizeRestoredMessages({ foo: "bar" });
    expect(result).toHaveLength(1);
  });

  it("filters out items missing role property", () => {
    const result = normalizeRestoredMessages([{ content: "hello" }, makeMessage({ role: "user", content: "valid" })]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("filters out items missing content property", () => {
    const result = normalizeRestoredMessages([{ role: "user" }, makeMessage({ role: "user", content: "valid" })]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("filters out items with non-string content", () => {
    const result = normalizeRestoredMessages([
      { role: "user", content: 123 },
      makeMessage({ role: "user", content: "valid" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("filters out items with invalid role (not user or assistant)", () => {
    const result = normalizeRestoredMessages([
      { role: "system", content: "hello" },
      makeMessage({ role: "user", content: "valid" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("filters out null / falsy items", () => {
    const result = normalizeRestoredMessages([
      null,
      undefined,
      false,
      0,
      makeMessage({ role: "assistant", content: "ok" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("ok");
  });

  it("sets pending to false on all messages", () => {
    const result = normalizeRestoredMessages([
      makeMessage({ role: "user", content: "hi", pending: true }),
      makeAssistantMessage({ pending: false }),
    ]);
    expect(result).toHaveLength(2);
    for (const msg of result) {
      expect(msg.pending).toBe(false);
    }
  });

  it("sets completedAt to Date.now() when pending was true and startedAt exists", () => {
    const before = Date.now();
    const result = normalizeRestoredMessages([
      makeMessage({ role: "user", content: "hi", pending: true, startedAt: 1000 }),
    ]);
    const after = Date.now();
    expect(result).toHaveLength(1);
    expect(result[0].completedAt).toBeGreaterThanOrEqual(before);
    expect(result[0].completedAt).toBeLessThanOrEqual(after);
  });

  it("preserves existing completedAt when pending is false", () => {
    const result = normalizeRestoredMessages([
      makeMessage({ role: "user", content: "hi", pending: false, completedAt: 5000 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].completedAt).toBe(5000);
  });

  it("preserves completedAt when pending is true but no startedAt", () => {
    // When pending is true but startedAt is undefined, completedAt stays unchanged
    const result = normalizeRestoredMessages([
      makeMessage({ role: "user", content: "hi", pending: true, completedAt: 5000 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(false);
    // pending && undefined → falsy, so completedAt stays as original
    expect(result[0].completedAt).toBe(5000);
  });

  it("returns normal messages unchanged (except pending → false)", () => {
    const msg = makeMessage({ role: "assistant", content: "hello", choices: [] });
    const result = normalizeRestoredMessages([msg]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("hello");
    expect(result[0].pending).toBe(false);
  });
});

// ── 2. hasWorkspaceProgress ──────────────────────────

describe("hasWorkspaceProgress", () => {
  it("returns false for a completely empty snapshot", () => {
    expect(hasWorkspaceProgress(makeSnapshot())).toBe(false);
  });

  it("returns true when input is non-empty", () => {
    expect(hasWorkspaceProgress(makeSnapshot({ input: "hello" }))).toBe(true);
  });

  it("returns true when input is whitespace only (trimmed → empty, so false)", () => {
    // snapshot.input.trim() → "" → falsy
    expect(hasWorkspaceProgress(makeSnapshot({ input: "   " }))).toBe(false);
  });

  it("returns true when draft.name is set", () => {
    const snapshot = makeSnapshot({
      draft: { name: "My Character", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });

  it("returns false when draft.name is whitespace only", () => {
    const snapshot = makeSnapshot({
      draft: { name: "   ", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(false);
  });

  it("returns true when creationPlan.project.name is set", () => {
    const snapshot = makeSnapshot({
      creationPlan: {
        project: { name: "Test Project", form: "charactercard" },
        characters: [],
        entries: [],
        yaml: "",
        updatedAt: "",
      },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });

  it("returns true when savedCharacterId is set", () => {
    expect(hasWorkspaceProgress(makeSnapshot({ savedCharacterId: "char-1" }))).toBe(true);
  });

  it("returns true when statusBars has bars", () => {
    const snapshot = makeSnapshot({
      statusBars: { version: 1, bars: [{ id: "hp", assetId: "health", label: "HP", value: 100, max: 100 }] },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });

  it("returns false when statusBars has empty bars array", () => {
    const snapshot = makeSnapshot({ statusBars: { version: 1, bars: [] } });
    expect(hasWorkspaceProgress(snapshot)).toBe(false);
  });

  it("returns true when messages.length > 1", () => {
    const snapshot = makeSnapshot({
      messages: [makeMessage({ role: "user", content: "hi" }), makeAssistantMessage()],
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });

  it("returns false when only one message and it has no content", () => {
    const snapshot = makeSnapshot({
      messages: [makeMessage({ role: "assistant", content: "" })],
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(false);
  });

  it("returns true when personalityPalette.base is set", () => {
    const snapshot = makeSnapshot({
      personalityPalette: { base: "warm", main: [], accents: [], derivatives: [] },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });

  it("returns true when evaluationReport.summary is set", () => {
    const snapshot = makeSnapshot({
      evaluationReport: { summary: "Looks good", issues: [], suggestions: [] },
    });
    expect(hasWorkspaceProgress(snapshot)).toBe(true);
  });
});

// ── 3. buildWorkspaceTitle ───────────────────────────

describe("buildWorkspaceTitle", () => {
  it("returns draft.name when available", () => {
    const snapshot = makeSnapshot({
      draft: { name: "艾莉丝", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("艾莉丝");
  });

  it("returns draft.name trimmed", () => {
    const snapshot = makeSnapshot({
      draft: { name: "  艾莉丝  ", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("艾莉丝");
  });

  it("falls back to creationPlan.project.name when no draft.name", () => {
    const snapshot = makeSnapshot({
      creationPlan: {
        project: { name: "奇幻冒险", form: "charactercard" },
        characters: [],
        entries: [],
        yaml: "",
        updatedAt: "",
      },
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("奇幻冒险");
  });

  it("falls back to latest user message when neither draft nor plan name exists", () => {
    const snapshot = makeSnapshot({
      messages: [makeMessage({ role: "user", content: "帮我创建一个角色" })],
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("帮我创建一个角色");
  });

  it("truncates long user message to 24 chars + '...'", () => {
    const longMsg = "这是一个非常非常非常长的用户消息用于测试截断功能哟";
    const snapshot = makeSnapshot({
      messages: [makeMessage({ role: "user", content: longMsg })],
    });
    const title = buildWorkspaceTitle(snapshot);
    expect(title).toHaveLength(27); // 24 + 3 dots
    expect(title.endsWith("...")).toBe(true);
    expect(title).toBe(longMsg.slice(0, 24) + "...");
  });

  it("does not truncate user message exactly 24 chars", () => {
    const exact24 = "123456789012345678901234"; // 24 chars
    const snapshot = makeSnapshot({
      messages: [makeMessage({ role: "user", content: exact24 })],
    });
    expect(buildWorkspaceTitle(snapshot)).toBe(exact24);
  });

  it("returns '未命名创作' when nothing is available", () => {
    expect(buildWorkspaceTitle(makeSnapshot())).toBe("未命名创作");
  });

  it("prefers draft.name over creationPlan.project.name", () => {
    const snapshot = makeSnapshot({
      draft: { name: "Draft Name", description: "", personality: "", scenario: "", firstMessage: "" },
      creationPlan: {
        project: { name: "Plan Name", form: "charactercard" },
        characters: [],
        entries: [],
        yaml: "",
        updatedAt: "",
      },
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("Draft Name");
  });

  it("skips hidden user messages", () => {
    const snapshot = makeSnapshot({
      messages: [
        makeMessage({ role: "user", content: "hidden msg", hidden: true }),
        makeMessage({ role: "user", content: "visible msg" }),
      ],
    });
    expect(buildWorkspaceTitle(snapshot)).toBe("visible msg");
  });
});

// ── 4. upsertWorkspaceRecord ─────────────────────────

describe("upsertWorkspaceRecord", () => {
  it("inserts a new record at the front", () => {
    const existing = [makeRecord({ id: "a", updatedAt: "2025-01-01T00:00:00.000Z" })];
    const newRecord = makeRecord({ id: "b", updatedAt: "2025-02-01T00:00:00.000Z" });
    const result = upsertWorkspaceRecord(existing, newRecord);
    expect(result[0].id).toBe("b");
    expect(result).toHaveLength(2);
  });

  it("updates an existing record and moves it to the front", () => {
    const existing = [makeRecord({ id: "a", updatedAt: "2025-01-01T00:00:00.000Z", title: "old" })];
    const updated = makeRecord({ id: "a", updatedAt: "2025-06-01T00:00:00.000Z", title: "new" });
    const result = upsertWorkspaceRecord(existing, updated);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("new");
  });

  it("sorts by updatedAt descending", () => {
    const existing = [makeRecord({ id: "oldest", updatedAt: "2025-01-01T00:00:00.000Z" })];
    const newer = makeRecord({ id: "middle", updatedAt: "2025-03-01T00:00:00.000Z" });
    const result1 = upsertWorkspaceRecord(existing, newer);
    const newest = makeRecord({ id: "newest", updatedAt: "2025-06-01T00:00:00.000Z" });
    const result2 = upsertWorkspaceRecord(result1, newest);
    expect(result2[0].id).toBe("newest");
    expect(result2[1].id).toBe("middle");
    expect(result2[2].id).toBe("oldest");
  });

  it("caps at 80 records", () => {
    const records: BuilderWorkspaceRecord[] = [];
    for (let i = 0; i < 81; i++) {
      records.push(
        makeRecord({
          id: `r-${i}`,
          updatedAt: new Date(2025, 0, i + 1).toISOString(),
        }),
      );
    }
    const newRecord = makeRecord({ id: "new", updatedAt: "2026-01-01T00:00:00.000Z" });
    const result = upsertWorkspaceRecord(records, newRecord);
    expect(result).toHaveLength(80);
    expect(result[0].id).toBe("new");
  });

  it("works with an empty initial array", () => {
    const record = makeRecord({ id: "only" });
    const result = upsertWorkspaceRecord([], record);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("only");
  });

  it("deduplicates by id: only one copy of each id remains", () => {
    const existing = [makeRecord({ id: "dup", updatedAt: "2025-01-01T00:00:00.000Z" })];
    const updated = makeRecord({ id: "dup", updatedAt: "2025-06-01T00:00:00.000Z" });
    const result = upsertWorkspaceRecord(existing, updated);
    expect(result).toHaveLength(1);
  });
});

// ── 5. getWorkspaceRecordStatus ──────────────────────

describe("getWorkspaceRecordStatus", () => {
  it("returns '已保存' when savedCharacterId exists", () => {
    const record = makeRecord({ savedCharacterId: "char-1" });
    expect(getWorkspaceRecordStatus(record)).toBe("已保存");
  });

  it("returns '待保存' when draft.name exists and no savedCharacterId", () => {
    const record = makeRecord({
      draft: { name: "Draft", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(getWorkspaceRecordStatus(record)).toBe("待保存");
  });

  it("returns '待保存' when draft.name is whitespace-trimmed non-empty", () => {
    const record = makeRecord({
      draft: { name: "  Draft  ", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(getWorkspaceRecordStatus(record)).toBe("待保存");
  });

  it("returns '构思中' when neither savedCharacterId nor draft.name exists", () => {
    const record = makeRecord();
    expect(getWorkspaceRecordStatus(record)).toBe("构思中");
  });

  it("returns '构思中' when draft exists but name is empty string", () => {
    const record = makeRecord({
      draft: { name: "", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(getWorkspaceRecordStatus(record)).toBe("构思中");
  });

  it("returns '构思中' when draft exists but name is whitespace only", () => {
    const record = makeRecord({
      draft: { name: "   ", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(getWorkspaceRecordStatus(record)).toBe("构思中");
  });

  it("returns '已保存' when both savedCharacterId and draft.name exist (saved takes priority)", () => {
    const record = makeRecord({
      savedCharacterId: "char-1",
      draft: { name: "Draft", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    expect(getWorkspaceRecordStatus(record)).toBe("已保存");
  });
});

// ── 6. toConversation ────────────────────────────────

describe("toConversation", () => {
  it("filters out pending messages", () => {
    const messages = [
      makeMessage({ role: "user", content: "hi", pending: true }),
      makeMessage({ role: "user", content: "hello" }),
    ];
    const result = toConversation(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hello");
  });

  it("filters out messages with empty content", () => {
    const messages = [makeMessage({ role: "user", content: "" }), makeMessage({ role: "user", content: "valid" })];
    const result = toConversation(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("filters out messages with whitespace-only content", () => {
    const messages = [makeMessage({ role: "user", content: "   " }), makeMessage({ role: "user", content: "valid" })];
    const result = toConversation(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("maps role and content correctly", () => {
    const messages = [
      makeMessage({ role: "user", content: "user msg" }),
      makeAssistantMessage({ content: "assistant msg" }),
    ];
    const result = toConversation(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "user msg" });
    expect(result[1]).toEqual({ role: "assistant", content: "assistant msg" });
  });

  it("returns empty array for empty input", () => {
    expect(toConversation([])).toEqual([]);
  });

  it("filters out messages that are both pending and empty", () => {
    const messages = [
      makeMessage({ role: "user", content: "", pending: true }),
      makeMessage({ role: "user", content: "   ", pending: false }),
    ];
    expect(toConversation(messages)).toEqual([]);
  });
});

// ── 7. upsertToolEvent ───────────────────────────────

describe("upsertToolEvent", () => {
  it("appends a new event to the list", () => {
    const events = [makeToolEvent({ id: "evt-1", label: "first" })];
    const newEvent = makeToolEvent({ id: "evt-2", label: "second" });
    const result = upsertToolEvent(events, newEvent);
    expect(result).toHaveLength(2);
    expect(result[1].label).toBe("second");
  });

  it("replaces an existing event with the same id", () => {
    const events = [makeToolEvent({ id: "evt-1", label: "old", status: "running" })];
    const updated = makeToolEvent({ id: "evt-1", label: "updated", status: "done" });
    const result = upsertToolEvent(events, updated);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("updated");
    expect(result[0].status).toBe("done");
  });

  it("creates a new array when events is undefined", () => {
    const event = makeToolEvent({ id: "evt-1" });
    const result = upsertToolEvent(undefined, event);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("evt-1");
  });

  it("does not mutate the original array", () => {
    const events = [makeToolEvent({ id: "evt-1" })];
    const originalLength = events.length;
    upsertToolEvent(events, makeToolEvent({ id: "evt-2" }));
    expect(events).toHaveLength(originalLength);
  });

  it("handles multiple events insertion and update", () => {
    let events: NeoBuilderToolEvent[] | undefined;
    events = upsertToolEvent(events, makeToolEvent({ id: "a", label: "A" }));
    events = upsertToolEvent(events, makeToolEvent({ id: "b", label: "B" }));
    events = upsertToolEvent(events, makeToolEvent({ id: "a", label: "A-updated" }));
    expect(events).toHaveLength(2);
    expect(events![0].label).toBe("A-updated");
    expect(events![1].label).toBe("B");
  });
});

// ── 8. formatElapsed ─────────────────────────────────

describe("formatElapsed", () => {
  it("returns '0s' for 0ms", () => {
    expect(formatElapsed(0)).toBe("0s");
  });

  it("returns '0s' for negative ms", () => {
    expect(formatElapsed(-1000)).toBe("0s");
  });

  it("formats seconds only (< 60s)", () => {
    expect(formatElapsed(1000)).toBe("1s");
    expect(formatElapsed(59000)).toBe("59s");
  });

  it("formats minutes and seconds (>= 60s, < 3600s)", () => {
    expect(formatElapsed(60000)).toBe("1m 0s");
    expect(formatElapsed(61000)).toBe("1m 1s");
    expect(formatElapsed(3599000)).toBe("59m 59s");
  });

  it("formats hours and minutes (>= 3600s)", () => {
    expect(formatElapsed(3600000)).toBe("1h 0m");
    expect(formatElapsed(3660000)).toBe("1h 1m");
    expect(formatElapsed(7200000)).toBe("2h 0m");
    expect(formatElapsed(9000000)).toBe("2h 30m");
  });

  it("handles sub-second values", () => {
    expect(formatElapsed(500)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
  });

  it("handles large values", () => {
    const result = formatElapsed(100000000);
    expect(result).toMatch(/^\d+h \d+m$/);
  });
});

// ── 9. formatToolSummary ─────────────────────────────

describe("formatToolSummary", () => {
  it("returns '已调用 0 次工具' for empty array", () => {
    expect(formatToolSummary([])).toBe("已调用 0 次工具");
  });

  it("shows running events with '正在调用'", () => {
    const events = [makeToolEvent({ id: "1", status: "running", label: "搜索" })];
    const result = formatToolSummary(events);
    expect(result).toContain("正在调用");
    expect(result).toContain("1 个工具");
    expect(result).toContain("搜索");
  });

  it("shows error events with '失败'", () => {
    const events = [makeToolEvent({ id: "1", status: "error", label: "生成" })];
    const result = formatToolSummary(events);
    expect(result).toContain("失败");
    expect(result).toContain("生成");
  });

  it("collapses same-label events with 'xN' suffix", () => {
    const events = [
      makeToolEvent({ id: "1", status: "done", label: "搜索" }),
      makeToolEvent({ id: "2", status: "done", label: "搜索" }),
      makeToolEvent({ id: "3", status: "done", label: "搜索" }),
    ];
    const result = formatToolSummary(events);
    expect(result).toContain("搜索 x3");
  });

  it("shows up to 3 unique labels", () => {
    const events = [
      makeToolEvent({ id: "1", status: "done", label: "A" }),
      makeToolEvent({ id: "2", status: "done", label: "B" }),
      makeToolEvent({ id: "3", status: "done", label: "C" }),
      makeToolEvent({ id: "4", status: "done", label: "D" }),
    ];
    const result = formatToolSummary(events);
    // Should only show first 3 labels: A, B, C
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("C");
    expect(result).not.toContain("D");
  });

  it("handles multiple running events", () => {
    const events = [
      makeToolEvent({ id: "1", status: "running", label: "搜索" }),
      makeToolEvent({ id: "2", status: "running", label: "生成" }),
    ];
    const result = formatToolSummary(events);
    expect(result).toContain("正在调用 2 个工具");
    expect(result).toContain("搜索");
    expect(result).toContain("生成");
  });

  it("prioritizes running over error over done", () => {
    const events = [
      makeToolEvent({ id: "1", status: "running", label: "A" }),
      makeToolEvent({ id: "2", status: "error", label: "B" }),
    ];
    const result = formatToolSummary(events);
    expect(result).toContain("正在调用");
    expect(result).not.toContain("失败");
  });

  it("shows error summary when no running events exist", () => {
    const events = [
      makeToolEvent({ id: "1", status: "error", label: "A" }),
      makeToolEvent({ id: "2", status: "done", label: "B" }),
    ];
    const result = formatToolSummary(events);
    expect(result).toContain("失败");
    expect(result).toContain("1 个失败");
  });
});

// ── 10. normalizePlanStatus ──────────────────────────

describe("normalizePlanStatus", () => {
  it("returns 'done' for 'done'", () => {
    expect(normalizePlanStatus("done", "planned")).toBe("done");
  });

  it("returns 'in_progress' for 'in_progress'", () => {
    expect(normalizePlanStatus("in_progress", "planned")).toBe("in_progress");
  });

  it("returns 'skipped' for 'skipped'", () => {
    expect(normalizePlanStatus("skipped", "planned")).toBe("skipped");
  });

  it("returns 'planned' for 'planned'", () => {
    expect(normalizePlanStatus("planned", "done")).toBe("planned");
  });

  it("returns fallback for invalid values", () => {
    expect(normalizePlanStatus("unknown", "planned")).toBe("planned");
    expect(normalizePlanStatus(null, "done")).toBe("done");
    expect(normalizePlanStatus(undefined, "in_progress")).toBe("in_progress");
    expect(normalizePlanStatus(123, "skipped")).toBe("skipped");
    expect(normalizePlanStatus("", "planned")).toBe("planned");
  });
});

// ── 11. getPlanStatusLabel ───────────────────────────

describe("getPlanStatusLabel", () => {
  it("returns 'done' for 'done'", () => {
    expect(getPlanStatusLabel("done")).toBe("done");
  });

  it("returns 'running' for 'in_progress'", () => {
    expect(getPlanStatusLabel("in_progress")).toBe("running");
  });

  it("returns 'skipped' for 'skipped'", () => {
    expect(getPlanStatusLabel("skipped")).toBe("skipped");
  });

  it("returns 'planned' for 'planned'", () => {
    expect(getPlanStatusLabel("planned")).toBe("planned");
  });
});

// ── 12. applyEntryProgressEvent ──────────────────────

describe("applyEntryProgressEvent", () => {
  function makePlan(overrides: Partial<NeoCreationPlan> = {}): NeoCreationPlan {
    return {
      project: { name: "Test", form: "charactercard" },
      characters: [],
      entries: [
        { id: "entry-1", name: "基本设定", type: "character", status: "planned" as const },
        { id: "entry-2", name: "外貌描写", type: "character", status: "planned" as const },
      ],
      yaml: "",
      updatedAt: "2025-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("returns null when plan is null", () => {
    const event = makeToolEvent({ name: "record_entry_output", status: "done", args: { entryId: "entry-1" } });
    expect(applyEntryProgressEvent(null, event)).toBeNull();
  });

  it("does not modify plan for error status events", () => {
    const plan = makePlan();
    const event = makeToolEvent({ name: "record_entry_output", status: "error", args: { entryId: "entry-1" } });
    expect(applyEntryProgressEvent(plan, event)).toBe(plan);
  });

  it("does not modify plan for non-record_entry_output events", () => {
    const plan = makePlan();
    const event = makeToolEvent({ name: "search_web", status: "done", args: { entryId: "entry-1" } });
    expect(applyEntryProgressEvent(plan, event)).toBe(plan);
  });

  it("updates entry status by entryId", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { entryId: "entry-1", status: "done" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).not.toBeNull();
    expect(result!.entries[0].status).toBe("done");
    expect(result!.entries[1].status).toBe("planned"); // unchanged
  });

  it("updates entry status by id (when no entryId)", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { id: "entry-1", status: "done" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).not.toBeNull();
    expect(result!.entries[0].status).toBe("done");
  });

  it("updates entry status by name (when no entryId or id)", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { name: "基本设定", status: "done" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).not.toBeNull();
    expect(result!.entries[0].status).toBe("done");
  });

  it("updates entry status by result.summary.entry (when no args keys)", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: {},
      result: { summary: { entry: "基本设定", status: "done" } },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).not.toBeNull();
    expect(result!.entries[0].status).toBe("done");
  });

  it("sets status to 'in_progress' when event is running", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "running",
      args: { entryId: "entry-1" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).not.toBeNull();
    expect(result!.entries[0].status).toBe("in_progress");
  });

  it("updates outputRef when provided", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { entryId: "entry-1", outputRef: "ref-123" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result!.entries[0].outputRef).toBe("ref-123");
  });

  it("updates skipReason when provided", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { entryId: "entry-1", skipReason: "not needed" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result!.entries[0].skipReason).toBe("not needed");
  });

  it("returns original plan when no entry matches", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: { entryId: "non-existent" },
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).toBe(plan);
  });

  it("returns original plan when entryKey is empty", () => {
    const plan = makePlan();
    const event = makeToolEvent({
      name: "record_entry_output",
      status: "done",
      args: {},
    });
    const result = applyEntryProgressEvent(plan, event);
    expect(result).toBe(plan);
  });
});

// ── 13. shouldRunBuilderTurnInBackground ─────────────

describe("shouldRunBuilderTurnInBackground", () => {
  const plan = {
    project: { name: "Test", form: "charactercard" as const },
    characters: [],
    entries: [{ id: "e1", name: "设定", type: "character", status: "planned" as const }],
    yaml: "",
    updatedAt: "",
  };

  it("returns false when plan is null", () => {
    expect(shouldRunBuilderTurnInBackground("开始", null, null, false)).toBe(false);
  });

  it("returns false when plan has no entries", () => {
    const emptyPlan = { ...plan, entries: [] };
    expect(shouldRunBuilderTurnInBackground("开始", emptyPlan, null, false)).toBe(false);
  });

  it("returns false when draft already exists", () => {
    const draft = { name: "Test", description: "", personality: "", scenario: "", firstMessage: "" };
    expect(shouldRunBuilderTurnInBackground("开始", plan, draft, false)).toBe(false);
  });

  it("returns false when content contains '调整'", () => {
    expect(shouldRunBuilderTurnInBackground("调整一下设定", plan, null, false)).toBe(false);
  });

  it("returns false when content contains '修改'", () => {
    expect(shouldRunBuilderTurnInBackground("修改角色描述", plan, null, false)).toBe(false);
  });

  it("returns false when content contains '改一下'", () => {
    expect(shouldRunBuilderTurnInBackground("改一下外貌", plan, null, false)).toBe(false);
  });

  it("returns false when content contains '暂停'", () => {
    expect(shouldRunBuilderTurnInBackground("暂停生成", plan, null, false)).toBe(false);
  });

  it("returns false when content contains '不要生成'", () => {
    expect(shouldRunBuilderTurnInBackground("不要生成角色", plan, null, false)).toBe(false);
  });

  it("returns true when hiddenUserMessage is true", () => {
    expect(shouldRunBuilderTurnInBackground("any content", plan, null, true)).toBe(true);
  });

  it("returns true for '确认' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("确认按规划生成", plan, null, false)).toBe(true);
  });

  it("returns true for '开始' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("开始创作吧", plan, null, false)).toBe(true);
  });

  it("returns true for '继续' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("继续生成", plan, null, false)).toBe(true);
  });

  it("returns true for '逐条' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("逐条生成设定", plan, null, false)).toBe(true);
  });

  it("returns true for '生成' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("生成角色", plan, null, false)).toBe(true);
  });

  it("returns true for '创作' keyword", () => {
    expect(shouldRunBuilderTurnInBackground("开始创作", plan, null, false)).toBe(true);
  });

  it("returns false for content that matches no keyword", () => {
    expect(shouldRunBuilderTurnInBackground("随便聊聊", plan, null, false)).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(shouldRunBuilderTurnInBackground("", plan, null, false)).toBe(false);
  });
});

// ── 14. getBackgroundResultContent ───────────────────

describe("getBackgroundResultContent", () => {
  function makeTurnResult(overrides: Partial<NeoBuilderTurnResult> = {}): NeoBuilderTurnResult {
    return {
      content: "done",
      toolEvents: [],
      toolLog: [],
      ...overrides,
    };
  }

  it("returns name-specific message when draft.character.name exists", () => {
    const result = makeTurnResult({
      draft: {
        character: { name: "艾莉丝", description: "", personality: "", scenario: "", firstMessage: "" },
        worldbookEntries: [],
      },
    });
    const content = getBackgroundResultContent(result);
    expect(content).toContain("艾莉丝");
    expect(content).toContain("后台创作已完成");
  });

  it("returns generic done message when draft exists without character.name", () => {
    const result = makeTurnResult({
      draft: {
        character: { name: "", description: "", personality: "", scenario: "", firstMessage: "" },
        worldbookEntries: [],
      },
    });
    const content = getBackgroundResultContent(result);
    expect(content).toBe("后台创作已完成。右侧可以查看产出物。");
  });

  it("returns paused message when no draft", () => {
    const result = makeTurnResult();
    const content = getBackgroundResultContent(result);
    expect(content).toBe("后台创作已暂停。请查看右侧进度与产出物。");
  });
});

// ── 15. getChoicePanelTitle ──────────────────────────

describe("getChoicePanelTitle", () => {
  it("returns the single line for single-line content", () => {
    expect(getChoicePanelTitle("请选择一个方向")).toBe("请选择一个方向");
  });

  it("returns the last non-empty line for multi-line content", () => {
    const content = "第一行\n第二行\n第三行";
    expect(getChoicePanelTitle(content)).toBe("第三行");
  });

  it("skips empty lines and returns the last non-empty line", () => {
    const content = "第一行\n\n\n最后一行";
    expect(getChoicePanelTitle(content)).toBe("最后一行");
  });

  it("returns '请选择一个方向' for empty string", () => {
    expect(getChoicePanelTitle("")).toBe("请选择一个方向");
  });

  it("returns '请选择一个方向' for whitespace-only content", () => {
    expect(getChoicePanelTitle("   \n  \n   ")).toBe("请选择一个方向");
  });

  it("trims whitespace from each line", () => {
    const content = "  前面有空格  \n  最后一行  ";
    expect(getChoicePanelTitle(content)).toBe("最后一行");
  });

  it("handles Windows-style line endings (\\r\\n)", () => {
    const content = "第一行\r\n第二行\r\n第三行";
    expect(getChoicePanelTitle(content)).toBe("第三行");
  });
});

// ── 16. createWorkspaceRecord ────────────────────────

describe("createWorkspaceRecord", () => {
  it("uses snapshot.builderSessionId as record id", () => {
    const snapshot = makeSnapshot({ builderSessionId: "custom-session-id" });
    const record = createWorkspaceRecord(snapshot);
    expect(record.id).toBe("custom-session-id");
  });

  it("uses buildWorkspaceTitle for the title", () => {
    const snapshot = makeSnapshot({
      draft: { name: "艾莉丝", description: "", personality: "", scenario: "", firstMessage: "" },
    });
    const record = createWorkspaceRecord(snapshot);
    expect(record.title).toBe("艾莉丝");
  });

  it("defaults to '未命名创作' when no title info available", () => {
    const snapshot = makeSnapshot();
    const record = createWorkspaceRecord(snapshot);
    expect(record.title).toBe("未命名创作");
  });

  it("spreads snapshot properties into the record", () => {
    const snapshot = makeSnapshot({
      input: "test input",
      savedCharacterId: "char-1",
    });
    const record = createWorkspaceRecord(snapshot);
    expect(record.input).toBe("test input");
    expect(record.savedCharacterId).toBe("char-1");
  });

  it("sets updatedAt to the current time by default", () => {
    const before = new Date().toISOString();
    const record = createWorkspaceRecord(makeSnapshot());
    const after = new Date().toISOString();
    expect(record.updatedAt >= before).toBe(true);
    expect(record.updatedAt <= after).toBe(true);
  });

  it("accepts a custom updatedAt value", () => {
    const customDate = "2025-06-01T12:00:00.000Z";
    const record = createWorkspaceRecord(makeSnapshot(), customDate);
    expect(record.updatedAt).toBe(customDate);
  });
});

// ── 17. getLatestUserMessage ─────────────────────────

describe("getLatestUserMessage", () => {
  it("returns the last non-hidden user message content", () => {
    const messages = [makeMessage({ role: "user", content: "first" }), makeMessage({ role: "user", content: "last" })];
    expect(getLatestUserMessage(messages)).toBe("last");
  });

  it("skips hidden messages", () => {
    const messages = [
      makeMessage({ role: "user", content: "visible1" }),
      makeMessage({ role: "user", content: "hidden", hidden: true }),
    ];
    expect(getLatestUserMessage(messages)).toBe("visible1");
  });

  it("skips empty content messages", () => {
    const messages = [
      makeMessage({ role: "user", content: "" }),
      makeMessage({ role: "user", content: "   " }),
      makeMessage({ role: "user", content: "actual" }),
    ];
    expect(getLatestUserMessage(messages)).toBe("actual");
  });

  it("skips assistant messages", () => {
    const messages = [
      makeAssistantMessage({ content: "assistant reply" }),
      makeMessage({ role: "user", content: "user msg" }),
    ];
    expect(getLatestUserMessage(messages)).toBe("user msg");
  });

  it("returns empty string when no user messages exist", () => {
    const messages = [makeAssistantMessage({ content: "only assistant" })];
    expect(getLatestUserMessage(messages)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getLatestUserMessage([])).toBe("");
  });

  it("returns trimmed content", () => {
    const messages = [makeMessage({ role: "user", content: "  trimmed  " })];
    expect(getLatestUserMessage(messages)).toBe("trimmed");
  });

  it("handles all messages being hidden", () => {
    const messages = [
      makeMessage({ role: "user", content: "hidden1", hidden: true }),
      makeMessage({ role: "user", content: "hidden2", hidden: true }),
    ];
    expect(getLatestUserMessage(messages)).toBe("");
  });
});

// ── 18. formatCharacterUpdatedAt ─────────────────────

describe("formatCharacterUpdatedAt", () => {
  it("formats a valid ISO date string to zh-CN format", () => {
    const result = formatCharacterUpdatedAt("2025-06-15T10:30:00.000Z");
    // Expected format: MM/DD HH:mm (e.g., "06/15 18:30" in CST)
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("returns empty string for invalid date", () => {
    expect(formatCharacterUpdatedAt("not-a-date")).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatCharacterUpdatedAt("")).toBe("");
  });

  it("handles different valid date formats", () => {
    const result = formatCharacterUpdatedAt("2025-01-01T00:00:00Z");
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("handles date-only strings (no time)", () => {
    // "2025-06-15" parses as midnight UTC
    const result = formatCharacterUpdatedAt("2025-06-15");
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
