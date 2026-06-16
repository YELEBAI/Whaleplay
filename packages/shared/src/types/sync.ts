/**
 * Sync protocol contract types.
 *
 * These types define the boundary between the desktop "sync server" and any
 * sync client (mobile, another desktop, future cloud). The actual transport
 * (LAN HTTP today) and conflict-resolution strategy are implemented elsewhere;
 * this file is intentionally transport- and strategy-agnostic so it can be
 * shared by desktop, `packages/sync`, and a future React Native client.
 *
 * Status: contract only. The desktop LAN server currently returns 501 for the
 * sync routes; `packages/sync` ships `Empty*` stubs. Real implementations land
 * on the `dev-sync` branch without changing these shapes.
 */

// ── Revision & identity ────────────────────────────────────────────────

/**
 * Monotonic per-entity revision.
 *
 * Clients compare revisions to decide who is ahead. The first iteration may
 * use a content hash or ISO timestamp; a later iteration can switch to a
 * Lamport clock without changing this type alias.
 */
export type Revision = string;

/** Logical clock stamp carried by every change record. */
export interface VectorClock {
  [nodeId: string]: number;
}

// ── Entity envelope ────────────────────────────────────────────────────

/**
 * Kinds of entities that participate in sync.
 *
 * Mirrors the desktop repositories. `settings` is a singleton pseudo-entity
 * (id = "settings") so it can flow through the same change log.
 */
export type SyncEntityType =
  | "character"
  | "chat"
  | "message"
  | "preset"
  | "worldbook"
  | "settings"
  | "chatMemory"
  | "agenticPlayState";

/**
 * Versioned envelope around a synchronizable entity payload.
 *
 * `revision`/`deletedAt` are OPTIONAL on the existing entity types so legacy
 * data deserializes without migration. When an entity enters the sync pipeline
 * it is wrapped into this envelope which always carries revision metadata.
 */
export interface SyncEntity<T = unknown> {
  id: string;
  type: SyncEntityType;
  /** Opaque payload (the entity itself, serialized as-is). */
  data: T;
  revision: Revision;
  updatedAt: string;
  /** Set when the entity was soft-deleted (tombstone). Null/absent = alive. */
  deletedAt: string | null;
}

// ── Manifest & cursors ─────────────────────────────────────────────────

/**
 * Compact summary the server returns so a client can decide whether it needs a
 * full snapshot or just incremental changes.
 */
export interface SyncManifestEntry {
  type: SyncEntityType;
  /** Number of live (non-tombstoned) entities of this type. */
  count: number;
  /** Highest revision seen for this type. */
  headRevision: Revision;
  /** Most recent updatedAt across this type. */
  updatedAt: string;
}

export interface SyncManifest {
  /** Server node id (stable per desktop instance). */
  serverId: string;
  /** Schema version of the sync envelope, bumps on incompatible changes. */
  schemaVersion: number;
  entries: SyncManifestEntry[];
  /** Server wall clock at manifest generation. */
  generatedAt: string;
}

/**
 * Opaque cursor a client sends to `getChangesSince` to resume an incremental
 * pull. The client should treat it as opaque and persist it last-writer-wins.
 */
export interface SyncCursor {
  /** Cursor payload; format is server-defined. */
  token: string;
  /** Wall clock when the cursor was issued. */
  issuedAt: string;
}

// ── Change log ─────────────────────────────────────────────────────────

/**
 * A single append-only change. Deletes are represented as a ChangeRecord whose
 * `entity.deletedAt` is set (tombstone), NOT by omitting the entity.
 */
export interface ChangeRecord {
  /** Monotonic sequence within the server's log. */
  seq: number;
  /** Entity this change touches. */
  entity: SyncEntity;
  /** Node that authored the change. */
  sourceNode: string;
  /** Wall clock of the change. */
  occurredAt: string;
}

export interface ChangeLogPage {
  changes: ChangeRecord[];
  /** Cursor to fetch the next page, or null if this was the tail. */
  nextCursor: SyncCursor | null;
  /** True when the page reached the current head of the log. */
  tail: boolean;
}

// ── Push & conflict ────────────────────────────────────────────────────

export interface PushRequest {
  /** Node submitting the changes. */
  sourceNode: string;
  /** Client's view of its latest applied cursor (for ordering hints). */
  basisCursor?: SyncCursor;
  changes: ChangeRecord[];
}

export type PushOutcome = "accepted" | "conflict" | "rejected";

export interface PushResultEntry {
  seq: number | null;
  entity: { id: string; type: SyncEntityType };
  outcome: PushOutcome;
  /** Server-side revision after applying, if accepted. */
  revision: Revision | null;
  /** Populated on conflict — the server's winning version. */
  conflictWith?: SyncEntity;
  /** Human-readable reason for rejected/conflicted entries. */
  reason?: string;
}

export interface PushResult {
  outcomes: PushResultEntry[];
  /** New cursor the client should persist after this push. */
  cursor: SyncCursor;
}

/**
 * Standalone conflict descriptor (used by MergeEngine and conflict UI).
 */
export interface ConflictRecord {
  entity: { id: string; type: SyncEntityType };
  local: SyncEntity;
  remote: SyncEntity;
  /** Strategy the engine would apply automatically, if any. */
  suggestedStrategy?: "keepLocal" | "keepRemote" | "keepBoth" | "mergeFields";
}

// ── Pairing ────────────────────────────────────────────────────────────

/**
 * LAN pairing handshake. The desktop shows a code/QR; the mobile posts it to
 * `/api/sync/pair` to obtain a sync-scoped token (separate from the LAN browse
 * token so it can carry different scopes/expiry later).
 */
export interface PairingChallenge {
  /** Short pairing code displayed on desktop. */
  code: string;
  /** Server node id. */
  serverId: string;
  /** ISO expiry; the desktop regenerates after this. */
  expiresAt: string;
}

export interface PairingRequest {
  code: string;
  /** Human-readable client name for the trusted-devices list. */
  clientName: string;
  /** Client node id (stable per device). */
  clientNode: string;
}

export interface PairingResponse {
  /** Sync-scoped bearer token. */
  token: string;
  serverId: string;
  schemaVersion: number;
  /** Initial manifest so the client can plan its first pull. */
  manifest: SyncManifest;
}
