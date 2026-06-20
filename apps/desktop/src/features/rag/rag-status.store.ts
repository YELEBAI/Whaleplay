import { create } from "zustand";

export type RagStatusOperation = "initialization" | "retrieval" | "memory";

export type RagStatusPhase =
  | "initializing"
  | "indexing-character"
  | "indexing-worldbook"
  | "embedding"
  | "retrieving"
  | "summarizing"
  | "ready"
  | "skipped"
  | "error";

export interface RagTaskStatus {
  chatId: string;
  runId: string;
  operation: RagStatusOperation;
  phase: RagStatusPhase;
  label: string;
  detail?: string;
  active: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  recalledCount?: number;
  model?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

type RagStatusPatch = Partial<
  Pick<
    RagTaskStatus,
    | "operation"
    | "phase"
    | "label"
    | "detail"
    | "active"
    | "progressCurrent"
    | "progressTotal"
    | "recalledCount"
    | "model"
    | "error"
  >
>;

interface RagStatusState {
  statusByChatId: Record<string, RagTaskStatus>;
  begin: (chatId: string, patch: RagStatusPatch) => string;
  update: (chatId: string, runId: string, patch: RagStatusPatch) => void;
  finish: (chatId: string, runId: string, patch?: RagStatusPatch) => void;
  fail: (chatId: string, runId: string, error: unknown, patch?: RagStatusPatch) => void;
  clear: (chatId: string) => void;
}

function createRunId() {
  return `rag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export const useRagStatusStore = create<RagStatusState>((set) => ({
  statusByChatId: {},

  begin: (chatId, patch) => {
    const runId = createRunId();
    const now = Date.now();
    set((state) => ({
      statusByChatId: {
        ...state.statusByChatId,
        [chatId]: {
          chatId,
          runId,
          operation: patch.operation ?? "retrieval",
          phase: patch.phase ?? "retrieving",
          label: patch.label ?? "RAG 正在处理",
          detail: patch.detail,
          active: patch.active ?? true,
          progressCurrent: patch.progressCurrent,
          progressTotal: patch.progressTotal,
          recalledCount: patch.recalledCount,
          model: patch.model,
          error: patch.error,
          startedAt: now,
          updatedAt: now,
        },
      },
    }));
    return runId;
  },

  update: (chatId, runId, patch) => {
    set((state) => {
      const current = state.statusByChatId[chatId];
      if (!current || current.runId !== runId) return state;
      return {
        statusByChatId: {
          ...state.statusByChatId,
          [chatId]: {
            ...current,
            ...patch,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  finish: (chatId, runId, patch) => {
    set((state) => {
      const current = state.statusByChatId[chatId];
      if (!current || current.runId !== runId) return state;
      return {
        statusByChatId: {
          ...state.statusByChatId,
          [chatId]: {
            ...current,
            ...patch,
            active: false,
            phase: patch?.phase ?? current.phase,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  fail: (chatId, runId, error, patch) => {
    set((state) => {
      const current = state.statusByChatId[chatId];
      if (!current || current.runId !== runId) return state;
      return {
        statusByChatId: {
          ...state.statusByChatId,
          [chatId]: {
            ...current,
            ...patch,
            active: false,
            phase: "error",
            label: patch?.label ?? "RAG 处理失败",
            error: getErrorMessage(error),
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  clear: (chatId) => {
    set((state) => {
      if (!state.statusByChatId[chatId]) return state;
      const next = { ...state.statusByChatId };
      delete next[chatId];
      return { statusByChatId: next };
    });
  },
}));
