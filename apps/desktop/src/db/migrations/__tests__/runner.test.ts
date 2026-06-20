import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import { getBackend } from "@/platform";
import { runMigrations } from "../runner";
import type { StorageDriver, ReadResult } from "../../storage/driver";
import type { StorageMigration } from "../types";

function inMemoryDriver(): StorageDriver {
  const store = new Map<string, string>();
  return {
    get: async (key) => {
      if (!store.has(key)) return { status: "missing" };
      return { status: "found", value: store.get(key)! };
    },
    set: async (key, value) => {
      store.set(key, value);
    },
    remove: async (key) => {
      store.delete(key);
    },
    entries: async (prefix) => {
      const result: Record<string, string> = {};
      for (const [k, v] of store) {
        if (k.startsWith(prefix)) result[k] = v;
      }
      return result;
    },
    batch: async (ops) => {
      for (const op of ops) {
        if (op.type === "set") store.set(op.key, op.value);
        else store.delete(op.key);
      }
    },
  };
}

const APP_VERSION = "0.1.3";

describe("runMigrations", () => {
  let driver: StorageDriver;

  beforeEach(() => {
    driver = inMemoryDriver();
  });

  it("returns true when there are no migrations", async () => {
    expect(await runMigrations(driver, [], APP_VERSION)).toBe(true);
  });

  it("does not touch the backend when there are no migrations", async () => {
    const unavailable = inMemoryDriver();
    unavailable.get = async () => {
      throw new Error("backend unavailable");
    };
    await expect(runMigrations(unavailable, [], APP_VERSION)).resolves.toBe(true);
  });

  it("runs a single migration that sets a value", async () => {
    const migration: StorageMigration = {
      id: "001-test",
      from: -1,
      to: 1,
      description: "test migration",
      plan: async () => [{ type: "set", key: "prefs:test", value: "hello" }],
      verify: async (ctx) => {
        const r = await ctx.driver.get("prefs:test");
        if (r.status !== "found" || r.value !== "hello") throw new Error("verify failed");
      },
    };

    const ok = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok).toBe(true);

    // Schema version should be at 1
    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("found");
    if (v.status === "found") expect(v.value).toBe("1");

    // Migration record should exist
    const rec = await driver.get("meta:migration:001-test");
    expect(rec.status).toBe("found");

    // The data should be present
    const data = await driver.get("prefs:test");
    expect(data.status).toBe("found");
    if (data.status === "found") expect(data.value).toBe("hello");
  });

  it("records the backup path and releases the native lock", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(true);
    const backend = getBackend();
    vi.mocked(backend.store.lock).mockResolvedValueOnce(true);
    vi.mocked(backend.store.backup).mockResolvedValueOnce("/backup/store.json");
    const migration: StorageMigration = {
      id: "001-native-backup",
      from: -1,
      to: 1,
      description: "native migration",
      plan: async () => [],
      verify: async () => {},
    };

    expect(await runMigrations(driver, [migration], APP_VERSION)).toBe(true);
    const record = await driver.get("meta:migration:001-native-backup");
    expect(record.status).toBe("found");
    if (record.status === "found") expect(JSON.parse(record.value).backup).toBe("/backup/store.json");
    expect(backend.store.unlock).toHaveBeenCalled();
  });

  it("is idempotent — running twice does not re-apply", async () => {
    let planCalls = 0;
    const migration: StorageMigration = {
      id: "002-idem",
      from: -1,
      to: 1,
      description: "idempotent test",
      plan: async () => {
        planCalls++;
        return [{ type: "set", key: "prefs:counter", value: String(planCalls) }];
      },
      verify: async () => {},
    };

    await runMigrations(driver, [migration], APP_VERSION);
    expect(planCalls).toBe(1);

    // Second run — should be skipped because version is already 1
    await runMigrations(driver, [migration], APP_VERSION);
    expect(planCalls).toBe(1); // plan was not called again
  });

  it("runs multiple migrations in order", async () => {
    const results: string[] = [];
    const m1: StorageMigration = {
      id: "003-a",
      from: -1,
      to: 1,
      description: "first",
      plan: async () => {
        results.push("a");
        return [{ type: "set", key: "a", value: "1" }];
      },
      verify: async () => {},
    };
    const m2: StorageMigration = {
      id: "003-b",
      from: 1,
      to: 2,
      description: "second",
      plan: async () => {
        results.push("b");
        return [{ type: "set", key: "b", value: "2" }];
      },
      verify: async () => {},
    };

    await runMigrations(driver, [m1, m2], APP_VERSION);
    expect(results).toEqual(["a", "b"]);

    const v = await driver.get("meta:schema-version");
    if (v.status === "found") expect(v.value).toBe("2");
  });

  it("does not advance schema version on failure", async () => {
    const migration: StorageMigration = {
      id: "004-fail",
      from: -1,
      to: 1,
      description: "will fail",
      plan: async () => [{ type: "set", key: "x", value: "y" }],
      verify: async () => {
        throw new Error("verify failed");
      },
    };

    const ok = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok).toBe(false);

    // Schema version should NOT be set
    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("missing");

    // On retry, the migration runs again (and fails again)
    const ok2 = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok2).toBe(false);
  });

  it("skips already-applied migrations when starting from a higher version", async () => {
    // Manually set schema version to 1
    await driver.set("meta:schema-version", "1");

    const m2: StorageMigration = {
      id: "005-only-second",
      from: 1,
      to: 2,
      description: "second only",
      plan: async () => [{ type: "set", key: "v2", value: "done" }],
      verify: async () => {},
    };

    await runMigrations(driver, [m2], APP_VERSION);
    const v = await driver.get("meta:schema-version");
    if (v.status === "found") expect(v.value).toBe("2");
  });

  it("rejects a corrupt schema version", async () => {
    await driver.set("meta:schema-version", "not-a-version");
    const migration: StorageMigration = {
      id: "006-corrupt-version",
      from: -1,
      to: 1,
      description: "must not run",
      plan: async () => [],
      verify: async () => {},
    };
    await expect(runMigrations(driver, [migration], APP_VERSION)).rejects.toThrow("Invalid storage schema version");
  });

  it("rejects registry gaps instead of skipping a schema", async () => {
    const m1: StorageMigration = {
      id: "007-first",
      from: -1,
      to: 1,
      description: "first",
      plan: async () => [],
      verify: async () => {},
    };
    const m3: StorageMigration = {
      id: "007-third",
      from: 2,
      to: 3,
      description: "gap",
      plan: async () => [],
      verify: async () => {},
    };
    await expect(runMigrations(driver, [m1, m3], APP_VERSION)).rejects.toThrow("Migration gap");
  });

  it("rejects a schema newer than the application supports", async () => {
    await driver.set("meta:schema-version", "9");
    const migration: StorageMigration = {
      id: "008-current",
      from: -1,
      to: 1,
      description: "current",
      plan: async () => [],
      verify: async () => {},
    };
    await expect(runMigrations(driver, [migration], APP_VERSION)).rejects.toThrow("newer than this app supports");
  });

  it("fails when the schema-version backend read fails", async () => {
    const unavailable = inMemoryDriver();
    unavailable.get = async (): Promise<ReadResult> => ({ status: "error", reason: "offline" });
    const migration: StorageMigration = {
      id: "009-backend-error",
      from: -1,
      to: 1,
      description: "must not run",
      plan: async () => [],
      verify: async () => {},
    };
    await expect(runMigrations(unavailable, [migration], APP_VERSION)).rejects.toThrow("offline");
  });
});
