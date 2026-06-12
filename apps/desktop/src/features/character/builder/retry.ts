/**
 * Exponential-backoff retry for LLM provider calls.
 * Inspired by DeepSeek-Reasonix's fetchWithRetry — applies jitter, respects Retry-After,
 * and does NOT retry on aborts.
 */

export interface RetryOptions {
  /** Maximum total attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Initial backoff in ms. Doubles each retry, with jitter. Default 500. */
  initialBackoffMs?: number;
  /** Upper bound on any single backoff delay. Default 10000 (10s). */
  maxBackoffMs?: number;
  /** Abort signal; we do NOT retry once aborted. */
  signal?: AbortSignal;
  /** Called before each retry wait. */
  onRetry?: (info: RetryInfo) => void;
}

export interface RetryInfo {
  attempt: number;
  reason: string;
  waitMs: number;
}

function computeWait(attempt: number, initial: number, cap: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, cap);
  }
  const exp = initial * 2 ** attempt;
  const jitter = exp * (0.75 + Math.random() * 0.5);
  return Math.min(Math.max(jitter, 0), cap);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { name?: unknown }).name === "AbortError";
}

/**
 * Retry a provider call. Retries on network errors and rate-limit / server errors.
 * Does NOT retry on aborts — re-billing for desynced output is worse than failing.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const initial = opts.initialBackoffMs ?? 500;
  const cap = opts.maxBackoffMs ?? 10_000;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw new Error("aborted");

    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (isAbortError(err) || opts.signal?.aborted) throw err;

      // Check for rate-limit headers or known retryable patterns in the error message
      const reason = messageOf(err);
      const retryable = /429|rate.?limit|too many requests|server.*error|503|502|timeout|ETIMEDOUT/i.test(reason);

      if (!retryable) throw err;
      if (attempt === maxAttempts - 1) throw err;

      const waitMs = computeWait(attempt, initial, cap);
      opts.onRetry?.({ attempt: attempt + 1, reason, waitMs });
      await sleep(waitMs, opts.signal);
    }
  }

  throw lastError ?? new Error("withRetry: loop exited unexpectedly");
}
