import { describe, expect, it } from "vitest";
import {
  EmptyMergeEngine,
  EmptySyncClient,
  EmptySyncServer,
  SyncNotImplementedError,
  isSyncNotImplementedError,
} from "../index";
import type { ConflictRecord } from "@neo-tavern/shared";

describe("EmptySyncServer", () => {
  const server = new EmptySyncServer();

  it("rejects getManifest", async () => {
    await expect(server.getManifest()).rejects.toBeInstanceOf(SyncNotImplementedError);
  });
  it("rejects getSnapshot", async () => {
    await expect(server.getSnapshot()).rejects.toBeInstanceOf(SyncNotImplementedError);
  });
  it("rejects getChangesSince", async () => {
    await expect(server.getChangesSince(null)).rejects.toBeInstanceOf(SyncNotImplementedError);
  });
  it("rejects applyPush", async () => {
    await expect(server.applyPush({ sourceNode: "n", changes: [] })).rejects.toBeInstanceOf(SyncNotImplementedError);
  });
  it("rejects pairing", async () => {
    await expect(server.createPairingChallenge()).rejects.toBeInstanceOf(SyncNotImplementedError);
    await expect(server.pair({ code: "x", clientName: "c", clientNode: "n" })).rejects.toBeInstanceOf(
      SyncNotImplementedError,
    );
  });
});

describe("EmptySyncClient", () => {
  const client = new EmptySyncClient();

  it("rejects every operation", async () => {
    await expect(client.pair("http://x", "code", "name")).rejects.toBeInstanceOf(SyncNotImplementedError);
    await expect(client.pull(null)).rejects.toBeInstanceOf(SyncNotImplementedError);
    await expect(client.push({ sourceNode: "n", changes: [] })).rejects.toBeInstanceOf(SyncNotImplementedError);
    expect(() => client.getCursor()).toThrow(SyncNotImplementedError);
  });
});

describe("EmptyMergeEngine", () => {
  const engine = new EmptyMergeEngine();

  it("never claims it can auto-resolve", () => {
    expect(engine.canAutoResolve({} as ConflictRecord)).toBe(false);
  });
  it("rejects resolve", async () => {
    await expect(engine.resolve({} as ConflictRecord)).rejects.toBeInstanceOf(SyncNotImplementedError);
  });
});

describe("isSyncNotImplementedError", () => {
  it("recognizes the sentinel", async () => {
    try {
      await new EmptySyncServer().getManifest();
    } catch (e) {
      expect(isSyncNotImplementedError(e)).toBe(true);
      if (isSyncNotImplementedError(e)) expect(e.operation).toBe("server.getManifest");
    }
  });
  it("rejects unrelated errors", () => {
    expect(isSyncNotImplementedError(new Error("nope"))).toBe(false);
    expect(isSyncNotImplementedError("string")).toBe(false);
  });
});
