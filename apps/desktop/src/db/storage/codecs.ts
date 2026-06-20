/**
 * JSON codec helpers.
 *
 * Every consumer that deserializes stored JSON should use these helpers so
 * that "key absent", "backend unavailable", and "corrupt payload" remain
 * visibly different. The legacy behaviour of silently
 * returning `null` (or `[]`) for corrupt data is kept only as opt-in
 * fallbacks; new code should use the tri-state API.
 */
import type { ReadResult } from "./driver";

/**
 * Result of decoding a stored value.
 *
 * - `valid`   — the value exists and was successfully decoded.
 * - `missing` — the key does not exist in the backing store.
 * - `corrupt` — the raw string exists but could not be parsed / validated.
 * - `error`   — the backing driver could not complete the read.
 */
export type DecodeResult<T> =
  | { status: "valid"; value: T }
  | { status: "missing" }
  | { status: "corrupt"; raw: string; error: string }
  | { status: "error"; error: string };

/** Parse raw JSON, distinguishing the three states. */
export function decode<T = unknown>(raw: string | null | undefined): DecodeResult<T> {
  if (raw == null) return { status: "missing" };
  try {
    const value = JSON.parse(raw) as T;
    return { status: "valid", value };
  } catch (e) {
    return {
      status: "corrupt",
      raw,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Convert a `ReadResult` from the driver layer into a `DecodeResult`.
 * Suitable for drivers that store JSON strings natively.
 */
export function decodeReadResult<T = unknown>(result: ReadResult): DecodeResult<T> {
  if (result.status === "missing") return { status: "missing" };
  if (result.status === "error") return { status: "error", error: result.reason };
  return decode<T>(result.value);
}

/**
 * Legacy-compatible helper: returns the decoded value, or `fallback` when
 * the key is missing or corrupt.  Useful when incrementally migrating
 * existing code that does not yet handle the tri-state result.
 */
export function decodeOr<T>(result: ReadResult, fallback: T): T {
  if (result.status === "missing") return fallback;
  if (result.status === "error") return fallback;
  const decoded = decode<T>(result.value);
  return decoded.status === "valid" ? decoded.value : fallback;
}

/**
 * Decode a stored JSON string that is expected to be an array.
 * Returns the empty array when missing (the most common legacy fallback),
 * but surfaces corrupt payloads so the caller can decide to abort migration.
 */
export function decodeArray<T = unknown>(
  result: ReadResult,
):
  | { ok: true; value: T[] }
  | { ok: false; status: "corrupt"; raw: string }
  | { ok: false; status: "error"; error: string } {
  if (result.status === "missing") return { ok: true, value: [] };
  if (result.status === "error") return { ok: false, status: "error", error: result.reason };
  try {
    const parsed = JSON.parse(result.value);
    if (!Array.isArray(parsed)) return { ok: false, status: "corrupt", raw: result.value };
    return { ok: true, value: parsed as T[] };
  } catch {
    return { ok: false, status: "corrupt", raw: result.value };
  }
}
