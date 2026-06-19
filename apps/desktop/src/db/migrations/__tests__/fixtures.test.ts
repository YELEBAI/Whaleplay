import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../runner";
import type { StorageDriver } from "../../storage/driver";
import type { StorageMigration } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────

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

function prepopulateDriver(driver: StorageDriver, data: Record<string, string>) {
  return driver.batch(
    Object.entries(data).map(([key, value]) => ({
      type: "set" as const,
      key,
      value,
    })),
  );
}

const APP_VERSION = "0.1.3";

// ── Tests ───────────────────────────────────────────────────────────────

describe("migration fixtures", () => {
  let driver: StorageDriver;

  beforeEach(() => {
    driver = inMemoryDriver();
  });

  // ── 1. Fresh install ──────────────────────────────────────────────────

  it("on a fresh install, empty registry leaves schema version unchanged", async () => {
    const ok = await runMigrations(driver, [], APP_VERSION);
    expect(ok).toBe(true);

    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("missing");
  });

  // ── 2. Legacy neotavern_* keys ────────────────────────────────────────

  it("migrates legacy neotavern_* keys to new prefixed keys", async () => {
    await prepopulateDriver(driver, {
      neotavern_characters: JSON.stringify([{ id: "c1", name: "Alice" }]),
      neotavern_presets: JSON.stringify([{ name: "Combat" }]),
      neotavern_settings_tab: "inventory",
    });

    const migration: StorageMigration = {
      id: "010-legacy-tavern",
      from: -1,
      to: 1,
      description: "Copy neotavern_* keys to data: prefix",
      plan: async (ctx) => {
        const legacy = await ctx.driver.entries("neotavern_");
        return Object.entries(legacy).map(([key, value]) => ({
          type: "set" as const,
          key: key.replace("neotavern_", "data:"),
          value,
        }));
      },
      verify: async (ctx) => {
        const legacy = await ctx.driver.entries("neotavern_");
        for (const key of Object.keys(legacy)) {
          const r = await ctx.driver.get(key.replace("neotavern_", "data:"));
          if (r.status !== "found") {
            throw new Error(`Expected key ${key.replace("neotavern_", "data:")} to be migrated`);
          }
        }
      },
    };

    const ok = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok).toBe(true);

    const chars = await driver.get("data:characters");
    expect(chars.status).toBe("found");
    expect((chars as { value: string }).value).toContain("Alice");

    const presets = await driver.get("data:presets");
    expect(presets.status).toBe("found");

    const tab = await driver.get("data:settings_tab");
    expect(tab.status).toBe("found");
    expect((tab as { value: string }).value).toBe("inventory");

    // Schema version advanced
    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("found");
    if (v.status === "found") expect(v.value).toBe("1");
  });

  // ── 3. Legacy Zustand persist envelopes ───────────────────────────────

  it("extracts characters from legacy Zustand persist envelopes", async () => {
    await prepopulateDriver(driver, {
      "neotavern-characters": JSON.stringify({
        state: {
          characters: [
            { id: "a1", name: "Gandalf" },
            { id: "a2", name: "Aragorn" },
          ],
        },
        version: 0,
      }),
    });

    const migration: StorageMigration = {
      id: "011-zustand-extract",
      from: -1,
      to: 1,
      description: "Extract characters from Zustand persist envelope",
      plan: async (ctx) => {
        const r = await ctx.driver.get("neotavern-characters");
        if (r.status !== "found") return [];
        const parsed = JSON.parse(r.value);
        const characters = parsed.state?.characters;
        if (!Array.isArray(characters)) return [];
        return [
          {
            type: "set" as const,
            key: "data:characters",
            value: JSON.stringify(characters),
          },
        ];
      },
      verify: async (ctx) => {
        const r = await ctx.driver.get("data:characters");
        if (r.status !== "found") throw new Error("data:characters was not created");
        const parsed = JSON.parse(r.value);
        if (!Array.isArray(parsed) || parsed.length !== 2) {
          throw new Error("Expected 2 characters");
        }
      },
    };

    const ok = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok).toBe(true);

    const result = await driver.get("data:characters");
    expect(result.status).toBe("found");
    if (result.status === "found") {
      const characters = JSON.parse(result.value);
      expect(characters).toHaveLength(2);
      expect(characters[0].name).toBe("Gandalf");
      expect(characters[1].name).toBe("Aragorn");
    }
  });

  // ── 4. Corrupt JSON ───────────────────────────────────────────────────

  it("does not advance schema version when verify catches corrupt JSON", async () => {
    await prepopulateDriver(driver, {
      "neotavern-characters": "{invalid json!!}",
    });

    const migration: StorageMigration = {
      id: "012-corrupt-reject",
      from: -1,
      to: 1,
      description: "Reject corrupt JSON",
      plan: async (ctx) => {
        const r = await ctx.driver.get("neotavern-characters");
        if (r.status !== "found") return [];
        try {
          const parsed = JSON.parse(r.value);
          return [
            {
              type: "set" as const,
              key: "data:characters",
              value: JSON.stringify(parsed),
            },
          ];
        } catch {
          // Corrupt — plan returns empty; verify will catch it
          return [];
        }
      },
      verify: async (ctx) => {
        // Verify expects the migrated key to exist — corrupt input
        // means it was never written, so this will throw.
        const r = await ctx.driver.get("data:characters");
        if (r.status !== "found") {
          throw new Error("Migration failed: data:characters not created due to corrupt input");
        }
      },
    };

    const ok = await runMigrations(driver, [migration], APP_VERSION);
    expect(ok).toBe(false);

    // Schema version MUST NOT be advanced
    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("missing");

    // Corrupt key should still be present (not deleted)
    const corrupt = await driver.get("neotavern-characters");
    expect(corrupt.status).toBe("found");
  });

  // ── 5. Schema downgrade protection (empty registry) ───────────────────

  it("no-ops when stored schema version exceeds any migration target (empty registry)", async () => {
    // Simulate a future version written by a newer app release
    await driver.set("meta:schema-version", "99");

    // Empty registry: runner returns true before inspecting version
    const ok = await runMigrations(driver, [], APP_VERSION);
    expect(ok).toBe(true);

    // Schema version is left untouched
    const v = await driver.get("meta:schema-version");
    expect(v.status).toBe("found");
    if (v.status === "found") expect(v.value).toBe("99");
  });

  it("throws when stored schema version exceeds registry with migrations present", async () => {
    await driver.set("meta:schema-version", "99");

    const migration: StorageMigration = {
      id: "013-downgrade-guard",
      from: -1,
      to: 1,
      description: "should not run",
      plan: async () => [],
      verify: async () => {},
    };

    // With migrations registered, runner rejects a newer stored schema
    await expect(runMigrations(driver, [migration], APP_VERSION)).rejects.toThrow("newer than this app supports");
  });

  // ── 6. Partial migration interrupted and retried ──────────────────────

  it("retries an interrupted migration on next run and succeeds", async () => {
    let verifyCalls = 0;
    let planCalls = 0;

    const migration: StorageMigration = {
      id: "014-retry-interrupted",
      from: -1,
      to: 1,
      description: "Intentionally fails verify on first attempt",
      plan: async () => {
        planCalls++;
        return [{ type: "set" as const, key: "data:retry-test", value: "persisted" }];
      },
      verify: async (ctx) => {
        verifyCalls++;
        // Fail on the first invocation; succeed on retry
        if (verifyCalls === 1) {
          throw new Error("Simulated transient verify failure");
        }
        // On retry, assert the data is still correct
        const r = await ctx.driver.get("data:retry-test");
        if (r.status !== "found" || r.value !== "persisted") {
          throw new Error("Expected data:retry-test to exist after plan");
        }
      },
    };

    // First run — plan executes, batch applies, verify throws
    const first = await runMigrations(driver, [migration], APP_VERSION);
    expect(first).toBe(false);
    expect(planCalls).toBe(1);
    expect(verifyCalls).toBe(1);

    // Schema version NOT advanced
    let v = await driver.get("meta:schema-version");
    expect(v.status).toBe("missing");

    // Data from the plan IS persisted (batch succeeded before verify threw)
    const data = await driver.get("data:retry-test");
    expect(data.status).toBe("found");

    // Second run — migration runs again, verify passes this time
    const second = await runMigrations(driver, [migration], APP_VERSION);
    expect(second).toBe(true);
    expect(planCalls).toBe(2); // plan re-executed
    expect(verifyCalls).toBe(2); // verify called again, succeeded

    // Schema version now advanced
    v = await driver.get("meta:schema-version");
    expect(v.status).toBe("found");
    if (v.status === "found") expect(v.value).toBe("1");

    // Migration record written
    const rec = await driver.get("meta:migration:014-retry-interrupted");
    expect(rec.status).toBe("found");
  });
});
