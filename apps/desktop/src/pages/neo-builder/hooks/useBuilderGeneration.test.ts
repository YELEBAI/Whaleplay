/**
 * Tests for the useBuilderGeneration state machine reducer.
 *
 * The reducer is a pure function — no mocking required.
 * Legal transitions are defined in the module's JSDoc.
 */

import { describe, it, expect } from "vitest";
import { genReducer, type GenState, type GenEvent } from "./useBuilderGeneration";

// ── Helpers ──────────────────────────────────────────

const idle: GenState = { status: "idle", errorMessage: null };
const running: GenState = { status: "running", errorMessage: null };
const done: GenState = { status: "done", errorMessage: null };
const error: GenState = { status: "error", errorMessage: "something broke" };
const aborted: GenState = { status: "aborted", errorMessage: null };

function dispatch(state: GenState, event: GenEvent): GenState {
  return genReducer(state, event);
}

// ── Legal transitions ────────────────────────────────

describe("genReducer — legal transitions", () => {
  it("idle → running via BEGIN", () => {
    expect(dispatch(idle, { type: "BEGIN" })).toEqual(running);
  });

  it("done → running via BEGIN", () => {
    expect(dispatch(done, { type: "BEGIN" })).toEqual(running);
  });

  it("error → running via BEGIN", () => {
    expect(dispatch(error, { type: "BEGIN" })).toEqual(running);
  });

  it("aborted → running via BEGIN", () => {
    expect(dispatch(aborted, { type: "BEGIN" })).toEqual(running);
  });

  it("running → done via DONE", () => {
    expect(dispatch(running, { type: "DONE" })).toEqual(done);
  });

  it("running → error via ERROR", () => {
    const next = dispatch(running, { type: "ERROR", message: "timeout" });
    expect(next).toEqual({ status: "error", errorMessage: "timeout" });
  });

  it("running → aborted via ABORT", () => {
    expect(dispatch(running, { type: "ABORT" })).toEqual(aborted);
  });

  it("done → idle via RESET", () => {
    expect(dispatch(done, { type: "RESET" })).toEqual(idle);
  });

  it("error → idle via RESET", () => {
    expect(dispatch(error, { type: "RESET" })).toEqual(idle);
  });

  it("aborted → idle via RESET", () => {
    expect(dispatch(aborted, { type: "RESET" })).toEqual(idle);
  });
});

// ── Illegal transitions (should be no-ops) ───────────

describe("genReducer — illegal transitions are silently ignored", () => {
  it("BEGIN from running is ignored", () => {
    expect(dispatch(running, { type: "BEGIN" })).toBe(running);
  });

  it("DONE from idle is ignored", () => {
    expect(dispatch(idle, { type: "DONE" })).toBe(idle);
  });

  it("DONE from done is ignored", () => {
    expect(dispatch(done, { type: "DONE" })).toBe(done);
  });

  it("DONE from error is ignored", () => {
    expect(dispatch(error, { type: "DONE" })).toBe(error);
  });

  it("DONE from aborted is ignored", () => {
    expect(dispatch(aborted, { type: "DONE" })).toBe(aborted);
  });

  it("ERROR from idle is ignored", () => {
    expect(dispatch(idle, { type: "ERROR", message: "nope" })).toBe(idle);
  });

  it("ERROR from done is ignored", () => {
    expect(dispatch(done, { type: "ERROR", message: "nope" })).toBe(done);
  });

  it("ERROR from error is ignored", () => {
    const current: GenState = { status: "error", errorMessage: "first" };
    expect(dispatch(current, { type: "ERROR", message: "second" })).toBe(current);
  });

  it("ABORT from idle is ignored", () => {
    expect(dispatch(idle, { type: "ABORT" })).toBe(idle);
  });

  it("ABORT from done is ignored", () => {
    expect(dispatch(done, { type: "ABORT" })).toBe(done);
  });

  it("RESET from idle is ignored (nothing to reset)", () => {
    expect(dispatch(idle, { type: "RESET" })).toBe(idle);
  });

  it("RESET from running is ignored (can't reset mid-generation)", () => {
    expect(dispatch(running, { type: "RESET" })).toBe(running);
  });
});

// ── Edge cases ───────────────────────────────────────

describe("genReducer — edge cases", () => {
  it("BEGIN clears previous error message", () => {
    const prevError: GenState = { status: "error", errorMessage: "old error" };
    const afterReset = dispatch(prevError, { type: "RESET" });
    expect(afterReset.errorMessage).toBeNull();

    const afterBegin = dispatch(afterReset, { type: "BEGIN" });
    expect(afterBegin.errorMessage).toBeNull();
  });

  it("full cycle: idle → running → done → idle", () => {
    let state = idle;
    state = dispatch(state, { type: "BEGIN" });
    expect(state.status).toBe("running");

    state = dispatch(state, { type: "DONE" });
    expect(state.status).toBe("done");

    state = dispatch(state, { type: "RESET" });
    expect(state.status).toBe("idle");
  });

  it("full cycle with error: idle → running → error → idle", () => {
    let state = idle;
    state = dispatch(state, { type: "BEGIN" });
    state = dispatch(state, { type: "ERROR", message: "fail" });
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("fail");

    state = dispatch(state, { type: "RESET" });
    expect(state).toEqual(idle);
  });

  it("full cycle with abort: idle → running → aborted → idle", () => {
    let state = idle;
    state = dispatch(state, { type: "BEGIN" });
    state = dispatch(state, { type: "ABORT" });
    expect(state.status).toBe("aborted");

    state = dispatch(state, { type: "RESET" });
    expect(state).toEqual(idle);
  });

  it("multiple consecutive idle → running → done cycles work", () => {
    // Cycle 1
    let state = dispatch(idle, { type: "BEGIN" });
    state = dispatch(state, { type: "DONE" });
    expect(state.status).toBe("done");

    // Reset
    state = dispatch(state, { type: "RESET" });
    expect(state.status).toBe("idle");

    // Cycle 2
    state = dispatch(state, { type: "BEGIN" });
    expect(state.status).toBe("running");

    state = dispatch(state, { type: "DONE" });
    expect(state.status).toBe("done");
  });

  it("ABORT after DONE is ignored (already finished)", () => {
    const state = dispatch(running, { type: "DONE" });
    expect(state.status).toBe("done");
    expect(dispatch(state, { type: "ABORT" })).toBe(state);
  });
});
