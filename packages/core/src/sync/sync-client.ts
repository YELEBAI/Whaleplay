/**
 * SyncClient — consumer-side contract.
 */
import type { PairingResponse, PushRequest, PushResult, SyncCursor } from "@neo-tavern/shared";
import type { SyncSnapshot } from "./sync-server";
import type { ChangeLogPage } from "@neo-tavern/shared";
import { SyncNotImplementedError } from "./errors";

export interface PullResult {
  snapshot?: SyncSnapshot;
  changes?: ChangeLogPage;
  cursor: SyncCursor;
}

export interface SyncClient {
  pair(endpoint: string, code: string, clientName: string): Promise<PairingResponse>;
  pull(cursor: SyncCursor | null): Promise<PullResult>;
  push(request: PushRequest): Promise<PushResult>;
  getCursor(): SyncCursor | null;
}

export class EmptySyncClient implements SyncClient {
  async pair(): Promise<PairingResponse> {
    throw new SyncNotImplementedError("client.pair");
  }
  async pull(): Promise<PullResult> {
    throw new SyncNotImplementedError("client.pull");
  }
  async push(): Promise<PushResult> {
    throw new SyncNotImplementedError("client.push");
  }
  getCursor(): SyncCursor | null {
    throw new SyncNotImplementedError("client.getCursor");
  }
}
