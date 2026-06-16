import type { ConflictRecord, SyncEntity } from "@neo-tavern/shared";
import { SyncNotImplementedError } from "./errors";

export type MergeDecision = "keepLocal" | "keepRemote" | "keepBoth";

export interface MergeResult {
  decision: MergeDecision;
  resolved: SyncEntity | null;
  conflict: ConflictRecord;
}

export interface MergeEngine {
  canAutoResolve(conflict: ConflictRecord): boolean;
  resolve(conflict: ConflictRecord): Promise<MergeResult>;
}

export class EmptyMergeEngine implements MergeEngine {
  canAutoResolve(): boolean {
    return false;
  }
  async resolve(conflict: ConflictRecord): Promise<MergeResult> {
    const type = conflict?.entity?.type ?? "unknown";
    throw new SyncNotImplementedError(`merge.resolve(${type})`);
  }
}
