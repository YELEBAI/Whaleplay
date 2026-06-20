import { describe, expect, it } from "vitest";
import type { StorageDriver, StorageOperation } from "../../storage/driver";
import { migration001 } from "../001-bootstrap";
import { migration002 } from "../002-extract-settings-persist";
import { migration003 } from "../003-repair-settings-persist";
import { runMigrations } from "../runner";
import type { MigrationContext } from "../types";

function inMemoryDriver(initial: Record<string, string> = {}): StorageDriver {
  const store = new Map(Object.entries(initial));
  const apply = (operations: StorageOperation[]) => {
    for (const operation of operations) {
      if (operation.type === "set") store.set(operation.key, operation.value);
      else store.delete(operation.key);
    }
  };

  return {
    get: async (key) => (store.has(key) ? { status: "found", value: store.get(key)! } : { status: "missing" }),
    set: async (key, value) => {
      store.set(key, value);
    },
    remove: async (key) => {
      store.delete(key);
    },
    entries: async (prefix) => Object.fromEntries([...store].filter(([key]) => key.startsWith(prefix))),
    batch: async (operations) => apply(operations),
  };
}

function persistedSettings(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    state: {
      debugMode: true,
      contextTokens: 32768,
      personaName: "Tester",
      personaDesc: "Migration fixture",
      webSearchProvider: "tavily",
      tavilyApiKey: "tvly-test-not-a-real-secret",
      tavilySearchDepth: "advanced",
      dailyCostWarningEnabled: false,
      dailyCostWarningLimitCny: 8,
      dailyCostSpentCny: 3.5,
      ...overrides,
    },
    version: 0,
  });
}

function context(driver: StorageDriver, legacyLocalStorage: Record<string, string> = {}): MigrationContext {
  return { driver, legacyLocalStorage, appVersion: "test" };
}

async function foundValue(driver: StorageDriver, key: string) {
  const result = await driver.get(key);
  expect(result.status).toBe("found");
  return result.status === "found" ? result.value : undefined;
}

describe("settings persist migrations", () => {
  it("extracts the supported fields from the legacy Zustand envelope", async () => {
    const driver = inMemoryDriver();
    const ctx = context(driver, { "neotavern-settings": persistedSettings() });

    await driver.batch(await migration002.plan(ctx));
    await migration002.verify(ctx);

    expect(await foundValue(driver, "neotavern_setting_tavilyApiKey")).toBe("tvly-test-not-a-real-secret");
    expect(await foundValue(driver, "neotavern_setting_webSearchProvider")).toBe("tavily");
    expect(await foundValue(driver, "neotavern_setting_debugMode")).toBe("1");
    expect(await foundValue(driver, "neotavern_setting_dailyCostWarningEnabled")).toBe("0");
    expect(JSON.parse((await foundValue(driver, "neotavern_persona"))!)).toEqual({
      name: "Tester",
      desc: "Migration fixture",
    });
    expect((await driver.get("neotavern_setting_dailyCostSpentCny")).status).toBe("missing");
  });

  it("keeps an existing canonical value instead of overwriting it from the envelope", async () => {
    const driver = inMemoryDriver({
      "neotavern-settings": persistedSettings(),
      neotavern_setting_tavilyApiKey: "canonical-key",
    });
    const ctx = context(driver);

    await driver.batch(await migration002.plan(ctx));
    await migration002.verify(ctx);

    expect(await foundValue(driver, "neotavern_setting_tavilyApiKey")).toBe("canonical-key");
  });

  it("repairs a v2 store where 002 was marked complete but the API key was skipped", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "2",
      "meta:migration:002-extract-settings-persist": JSON.stringify({ state: "completed", from: 1, to: 2 }),
      "neotavern-settings": persistedSettings(),
      neotavern_setting_autoUpdateEnabled: "1",
      neotavern_setting_webSearchProvider: "tavily",
      "neotavern_setting_dailyCostSpend:2026-06-19": "3.5",
    });

    expect(await runMigrations(driver, [migration003], "test")).toBe(true);
    expect(await foundValue(driver, "neotavern_setting_tavilyApiKey")).toBe("tvly-test-not-a-real-secret");
    expect(await foundValue(driver, "meta:schema-version")).toBe("3");
    expect((await driver.get("meta:migration:003-repair-settings-persist")).status).toBe("found");
  });

  it("does not advance the schema when the legacy envelope is corrupt", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "2",
      "neotavern-settings": "{not-json",
    });

    expect(await runMigrations(driver, [migration003], "test")).toBe(false);
    expect(await foundValue(driver, "meta:schema-version")).toBe("2");
  });

  it("001 detects a legacy install from the canonical store as well as localStorage", async () => {
    const driver = inMemoryDriver({ "neotavern-settings": persistedSettings() });
    const operations = await migration001.plan(context(driver));

    expect(operations).toContainEqual({ type: "set", key: "meta:install-type", value: "legacy" });
  });
});
