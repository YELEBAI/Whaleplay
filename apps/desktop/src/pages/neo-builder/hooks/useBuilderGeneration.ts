/**
 * useBuilderGeneration — state machine for the NeoBuilder's AI generation lifecycle.
 *
 * The builder-session store manages message state. Generation itself is
 * page-bound and is cancelled by the page when the Builder unmounts. This
 * hook adds a front-end state machine that:
 *
 * - Prevents concurrent sends with a synchronous lock (useRef)
 * - Exposes explicit `isIdle` / `isBusy` booleans for UI binding
 * - Tracks terminal states (done / error / aborted) for post-generation UX
 * - Provides `abort()` wired to the store's generation cancellation
 *
 * State transitions (legal):
 *
 *   idle/done/error/aborted ──[begin]──> running
 *                                 │  │
 *                                 │  └──[error]──> error ──[reset]──> idle
 *                                 └──[abort]──> aborted ──[reset]──> idle
 *                                 └──[done]──> done ──[reset]──> idle
 *
 * Illegal transitions (e.g. begin while running) are silently ignored
 * by the reducer. The synchronous lockRef provides the primary guard.
 */

import { useCallback, useReducer, useRef } from "react";
import { builderSessions } from "@/features/character/builder-session.store";
import type { NeoBuilderTurnResult } from "@/features/character/neo-character-builder";
import type { CreateCharacterInput } from "@neo-tavern/shared";
import type { WorldbookDraft } from "../types";

// ── State machine types ──────────────────────────────

/** Union of all generation lifecycle states. */
export type GenStatus = "idle" | "running" | "done" | "error" | "aborted";

/** The generation state machine's shape. */
export interface GenState {
  status: GenStatus;
  /** Human-readable error message, set only in "error" status. */
  errorMessage: string | null;
}

/** Events that drive state transitions. */
export type GenEvent =
  | { type: "BEGIN" }
  | { type: "DONE" }
  | { type: "ERROR"; message: string }
  | { type: "ABORT" }
  | { type: "RESET" };

// ── Initial state ─────────────────────────────────────

const INITIAL_STATE: GenState = { status: "idle", errorMessage: null };

// ── Reducer ───────────────────────────────────────────

/**
 * Pure reducer enforcing legal state transitions.
 * Unknown events and illegal transitions are silently ignored
 * (return the current state unchanged).
 */
export function genReducer(state: GenState, event: GenEvent): GenState {
  switch (event.type) {
    case "BEGIN":
      if (state.status === "running") return state;
      return { status: "running", errorMessage: null };

    case "DONE":
      if (state.status !== "running") return state;
      return { status: "done", errorMessage: null };

    case "ERROR":
      if (state.status !== "running") return state;
      return { status: "error", errorMessage: event.message };

    case "ABORT":
      if (state.status !== "running") return state;
      return { status: "aborted", errorMessage: null };

    case "RESET":
      // Reset is valid from any terminal state
      if (state.status === "idle" || state.status === "running") return state;
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ── Workspace payload (subset needed by builderSessions.sendMessage) ──

export interface BuilderWorkspace {
  draft: CreateCharacterInput | null;
  worldbookDraft: WorldbookDraft | null;
  creationPlan: unknown;
  personalityPalette: unknown;
  mvu: unknown;
  statusBars: unknown;
}

// ── Hook ──────────────────────────────────────────────

/**
 * Manages the AI generation lifecycle for a builder session.
 *
 * @param sessionId - The builder session identifier (from useBuilderSession).
 */
export function useBuilderGeneration(sessionId: string) {
  const [state, dispatch] = useReducer(genReducer, INITIAL_STATE);

  /**
   * Synchronous lock to prevent concurrent sends.
   * useReducer dispatch is batched — two rapid calls to send()
   * would both see the same reducer state. This ref closes the gap.
   */
  const lockRef = useRef(false);

  // ── Actions ───────────────────────────────────────

  /** Start a generation turn. Returns null if already busy. */
  const send = useCallback(
    async (
      content: string,
      webSearchEnabled: boolean,
      workspace: BuilderWorkspace,
    ): Promise<NeoBuilderTurnResult | null> => {
      if (lockRef.current) return null;
      lockRef.current = true;

      dispatch({ type: "BEGIN" });

      try {
        const result = await builderSessions.sendMessage(sessionId, content, webSearchEnabled, workspace);

        if (result) {
          dispatch({ type: "DONE" });
          return result;
        }

        // result is null — distinguish error from abort by reading the store
        const snapshot = builderSessions.getSnapshot(sessionId);
        if (snapshot.error) {
          dispatch({ type: "ERROR", message: snapshot.error });
        } else {
          dispatch({ type: "ABORT" });
        }
        return null;
      } catch (err) {
        const message = (err as Error).message || "Generation failed";
        dispatch({ type: "ERROR", message });
        return null;
      } finally {
        lockRef.current = false;
      }
    },
    [sessionId],
  );

  /** Cancel an in-progress generation. Safe to call when idle. */
  const abort = useCallback(() => {
    builderSessions.abort(sessionId);
    dispatch({ type: "ABORT" });
  }, [sessionId]);

  /** Clear terminal state, returning to idle. */
  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // ── Derived values ────────────────────────────────

  const isBusy = state.status === "running";
  const isIdle = !isBusy;
  const hasError = state.status === "error";

  return {
    genState: state,
    send,
    abort,
    reset,
    isIdle,
    isBusy,
    hasError,
  } as const;
}
