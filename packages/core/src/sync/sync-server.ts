/**
 * SyncServer — provider-side contract.
 *
 * Implemented by the desktop (over its local store/SQLite + change log) and
 * exposed over the LAN HTTP transport. A React Native client never implements
 * this; it talks to the server via SyncClient.
 *
 * The interface is transport-agnostic: a future cloud backend would implement
 * the same shape.
 */
import type {
  ChangeLogPage,
  PairingChallenge,
  PairingRequest,
  PairingResponse,
  PushRequest,
  PushResult,
  SyncCursor,
  SyncEntity,
  SyncManifest,
  SyncEntityType,
} from "@neo-tavern/shared";

export interface SyncSnapshotOptions {
  types?: SyncEntityType[];
}

export interface SyncSnapshot {
  entities: SyncEntity[];
  manifest: SyncManifest;
}

export interface SyncServer {
  getManifest(): Promise<SyncManifest>;
  getSnapshot(options?: SyncSnapshotOptions): Promise<SyncSnapshot>;
  getChangesSince(cursor: SyncCursor | null, limit?: number): Promise<ChangeLogPage>;
  applyPush(request: PushRequest): Promise<PushResult>;
  createPairingChallenge(): Promise<PairingChallenge>;
  pair(request: PairingRequest): Promise<PairingResponse>;
}

import { SyncNotImplementedError } from "./errors";

export class EmptySyncServer implements SyncServer {
  async getManifest(): Promise<SyncManifest> {
    throw new SyncNotImplementedError("server.getManifest");
  }
  async getSnapshot(): Promise<SyncSnapshot> {
    throw new SyncNotImplementedError("server.getSnapshot");
  }
  async getChangesSince(): Promise<ChangeLogPage> {
    throw new SyncNotImplementedError("server.getChangesSince");
  }
  async applyPush(): Promise<PushResult> {
    throw new SyncNotImplementedError("server.applyPush");
  }
  async createPairingChallenge(): Promise<PairingChallenge> {
    throw new SyncNotImplementedError("server.createPairingChallenge");
  }
  async pair(): Promise<PairingResponse> {
    throw new SyncNotImplementedError("server.pair");
  }
}
