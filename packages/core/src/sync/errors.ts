/**
 * Sentinel error used by every `Empty*` sync implementation.
 *
 * Throwing a typed error (instead of returning null/empty) makes it obvious in
 * logs and tests that the feature is intentionally unimplemented, and lets the
 * UI distinguish "sync not wired" from "sync ran but had nothing to do".
 */
export class SyncNotImplementedError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`Sync operation not implemented: ${operation}`);
    this.name = "SyncNotImplementedError";
    this.operation = operation;
    Object.setPrototypeOf(this, SyncNotImplementedError.prototype);
  }
}

export function isSyncNotImplementedError(error: unknown): error is SyncNotImplementedError {
  return error instanceof SyncNotImplementedError;
}
