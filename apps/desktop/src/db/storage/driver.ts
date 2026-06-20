/**
 * Canonical storage driver interface.
 *
 * Every "namespace" (prefs/data/sys/…) binds to a single StorageDriver at
 * creation time.  Unlike the legacy `db/storage.ts` 3-layer fallback, this
 * interface makes the separation between "key genuinely does not exist" and
 * "backend is temporarily unavailable" explicit through `ReadResult`.
 */

/** Outcome of a single read operation. */
export type ReadResult =
  | { status: "found"; value: string }
  | { status: "missing" }
  | { status: "error"; reason: string };

/** A single atomic mutation. */
export type StorageOperation = { type: "set"; key: string; value: string } | { type: "remove"; key: string };

export interface StorageDriver {
  get(key: string): Promise<ReadResult>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** All entries whose key starts with `prefix`. */
  entries(prefix: string): Promise<Record<string, string>>;
  /** Apply a batch; production shared drivers must implement this atomically. */
  batch(operations: StorageOperation[]): Promise<void>;
}

function wrapRead(raw: string | null): ReadResult {
  return raw !== null ? { status: "found", value: raw } : { status: "missing" };
}

async function canonicalStore() {
  const { getBackend } = await import("@/platform");
  return getBackend().store;
}

/** The authoritative Tauri/plugin-store driver. It never falls through to localStorage. */
export const canonicalBackendDriver: StorageDriver = {
  get: async (key) => {
    try {
      return wrapRead(await (await canonicalStore()).get(key));
    } catch (error) {
      return { status: "error", reason: error instanceof Error ? error.message : String(error) };
    }
  },
  set: async (key, value) => (await canonicalStore()).set(key, value),
  remove: async (key) => (await canonicalStore()).remove(key),
  entries: async (prefix) => {
    const entries = await (await canonicalStore()).entries();
    return Object.fromEntries(Object.entries(entries).filter(([key]) => key.startsWith(prefix)));
  },
  batch: async (operations) => (await canonicalStore()).batch(operations),
};

function restHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  try {
    const token = window.sessionStorage.getItem("session:auth-token");
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* The request will fail with an explicit HTTP error if auth is required. */
  }
  return headers;
}

async function requireRestResponse(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 240);
  } catch {
    /* best-effort diagnostics */
  }
  throw new Error(`${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

/** Authoritative LAN REST driver. Missing keys never fall through to browser storage. */
export const restBackendDriver: StorageDriver = {
  get: async (key) => {
    try {
      const response = await requireRestResponse(
        await fetch(`/api/store/${encodeURIComponent(key)}`, { headers: restHeaders() }),
        `REST get ${key}`,
      );
      const payload = (await response.json()) as { value?: string | null };
      return wrapRead(payload.value ?? null);
    } catch (error) {
      return { status: "error", reason: error instanceof Error ? error.message : String(error) };
    }
  },
  set: async (key, value) => {
    await requireRestResponse(
      await fetch(`/api/store/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: restHeaders(true),
        body: JSON.stringify({ value }),
      }),
      `REST set ${key}`,
    );
  },
  remove: async (key) => {
    await requireRestResponse(
      await fetch(`/api/store/${encodeURIComponent(key)}`, { method: "DELETE", headers: restHeaders() }),
      `REST remove ${key}`,
    );
  },
  entries: async (prefix) => {
    const response = await requireRestResponse(
      await fetch("/api/store", { headers: restHeaders() }),
      `REST entries ${prefix}`,
    );
    const payload = (await response.json()) as Record<string, string> | [string, string][];
    const entries = Array.isArray(payload) ? payload : Object.entries(payload);
    return Object.fromEntries(entries.filter(([key]) => key.startsWith(prefix)));
  },
  batch: async (operations) => {
    await requireRestResponse(
      await fetch("/api/store/batch", {
        method: "POST",
        headers: restHeaders(true),
        body: JSON.stringify(operations),
      }),
      "REST batch",
    );
  },
};
