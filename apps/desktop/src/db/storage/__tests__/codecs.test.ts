import { describe, expect, it } from "vitest";
import { decode, decodeArray, decodeOr, decodeReadResult } from "../codecs";
import type { ReadResult } from "../driver";

// ── decode ────────────────────────────────────────────────────────────

describe("decode", () => {
  it("returns valid for a well-formed JSON string", () => {
    const result = decode<{ a: number }>('{"a":1}');
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.value).toEqual({ a: 1 });
  });

  it("returns valid for a JSON string that is null", () => {
    const result = decode("null");
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.value).toBeNull();
  });

  it("returns valid for a JSON string that is a number", () => {
    const result = decode("42");
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.value).toBe(42);
  });

  it("returns missing when raw is null", () => {
    expect(decode(null).status).toBe("missing");
  });

  it("returns missing when raw is undefined", () => {
    expect(decode(undefined).status).toBe("missing");
  });

  it("returns corrupt for unparseable JSON", () => {
    const result = decode("{bad json");
    expect(result.status).toBe("corrupt");
    if (result.status === "corrupt") {
      expect(result.raw).toBe("{bad json");
      expect(result.error).toBeTruthy();
    }
  });

  it("returns corrupt for trailing garbage", () => {
    const result = decode('"hello"extra');
    expect(result.status).toBe("corrupt");
  });

  it("type parameter flows through (generic)", () => {
    const result = decode<{ name: string }>('{"name":"test"}');
    expect(result.status).toBe("valid");
  });
});

// ── decodeReadResult ──────────────────────────────────────────────────

describe("decodeReadResult", () => {
  function found(v: string): ReadResult {
    return { status: "found", value: v };
  }
  const missing: ReadResult = { status: "missing" };
  const error: ReadResult = { status: "error", reason: "backend down" };

  it("delegates to decode for a found result", () => {
    const result = decodeReadResult<{ x: number }>(found('{"x":99}'));
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.value).toEqual({ x: 99 });
  });

  it("returns missing for a missing ReadResult", () => {
    expect(decodeReadResult(missing).status).toBe("missing");
  });

  it("returns corrupt for an error ReadResult", () => {
    const result = decodeReadResult(error);
    expect(result.status).toBe("corrupt");
    if (result.status === "corrupt") expect(result.error).toBe("backend down");
  });
});

// ── decodeOr ──────────────────────────────────────────────────────────

describe("decodeOr", () => {
  it("returns the parsed value when found + valid", () => {
    expect(decodeOr({ status: "found", value: "99" }, 0)).toBe(99);
  });

  it("returns fallback when missing", () => {
    expect(decodeOr({ status: "missing" }, 42)).toBe(42);
  });

  it("returns fallback when driver error", () => {
    expect(decodeOr({ status: "error", reason: "nope" }, 42)).toBe(42);
  });

  it("returns fallback when corrupt", () => {
    expect(decodeOr({ status: "found", value: "not json" }, { default: true })).toEqual({
      default: true,
    });
  });
});

// ── decodeArray ───────────────────────────────────────────────────────

describe("decodeArray", () => {
  it("returns the parsed array", () => {
    const result = decodeArray<{ id: string }>({ status: "found", value: '[{"id":"a"}]' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([{ id: "a" }]);
  });

  it("returns empty array when missing", () => {
    const result = decodeArray({ status: "missing" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns corrupt when driver error", () => {
    const result = decodeArray({ status: "error", reason: "fail" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.corrupt).toBe(true);
  });

  it("returns empty array when the value is not an array", () => {
    const result = decodeArray({ status: "found", value: "999" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns empty array when the value is a JSON object", () => {
    const result = decodeArray({ status: "found", value: '{"a":1}' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns corrupt for unparseable JSON", () => {
    const result = decodeArray({ status: "found", value: "::::" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.corrupt).toBe(true);
      expect(result.raw).toBe("::::");
    }
  });
});
