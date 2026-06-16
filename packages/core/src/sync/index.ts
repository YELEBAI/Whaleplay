/**
 * @neo-tavern/core/sync — sync protocol contracts and empty scaffolding.
 *
 * These are the SHAPES. Desktop and mobile depend on them; concrete transports
 * and storage backends fill them in on `dev-sync`.
 *
 * Re-exporting the shared sync types through core gives consumers one import
 * surface: `import { SyncServer, SyncManifest } from "@neo-tavern/core"`.
 */
export type {
  Revision,
  VectorClock,
  SyncEntityType,
  SyncEntity,
  SyncManifestEntry,
  SyncManifest,
  SyncCursor,
  ChangeRecord,
  ChangeLogPage,
  PushRequest,
  PushOutcome,
  PushResultEntry,
  PushResult,
  ConflictRecord,
  PairingChallenge,
  PairingRequest,
  PairingResponse,
} from "@neo-tavern/shared";

export { SyncNotImplementedError, isSyncNotImplementedError } from "./errors";

export type { SyncServer, SyncSnapshotOptions, SyncSnapshot } from "./sync-server";
export { EmptySyncServer } from "./sync-server";

export type { SyncClient, PullResult } from "./sync-client";
export { EmptySyncClient } from "./sync-client";

export type { MergeEngine, MergeDecision, MergeResult } from "./merge-engine";
export { EmptyMergeEngine } from "./merge-engine";
