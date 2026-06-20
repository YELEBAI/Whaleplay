import { beforeEach, describe, expect, it } from "vitest";
import type { StorageDriver, StorageOperation } from "../../storage/driver";
import { migration003 } from "../003-repair-settings-persist";
import { migration004 } from "../004-route-storage-scopes";
import { runBrowserScopeMigrations } from "../browser-scopes";
import { runMigrations } from "../runner";

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

async function value(driver: StorageDriver, key: string) {
  const result = await driver.get(key);
  expect(result.status).toBe("found");
  return result.status === "found" ? result.value : undefined;
}

describe("004-route-storage-scopes", () => {
  it("upgrades the observed v2 settings shape through repair and scoped routing", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "2",
      "neotavern-settings": JSON.stringify({
        state: {
          debugMode: false,
          webSearchProvider: "tavily",
          tavilyApiKey: "tvly-test-not-real",
          tavilySearchDepth: "advanced",
        },
        version: 0,
      }),
      neotavern_setting_webSearchProvider: "tavily",
    });

    expect(await runMigrations(driver, [migration003, migration004], "test")).toBe(true);
    expect(await value(driver, "secret:web-search:tavily:api-key")).toBe("tvly-test-not-real");
    expect(await value(driver, "prefs:web-search:tavily:depth")).toBe("advanced");
    expect(await value(driver, "meta:schema-version")).toBe("4");
  });

  it("copies legacy values into scoped canonical keys and keeps legacy data", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "3",
      neotavern_setting_webSearchProvider: "tavily",
      neotavern_setting_tavilyApiKey: "tvly-test-not-real",
      "neotavern_setting_dailyCostSpend:2026-06-20": "2.5",
      neotavern_characters: JSON.stringify([{ id: "c1", name: "Alice" }]),
      neotavern_lan_port: "3000",
    });

    expect(await runMigrations(driver, [migration004], "test")).toBe(true);
    expect(await value(driver, "prefs:web-search:provider")).toBe("tavily");
    expect(await value(driver, "secret:web-search:tavily:api-key")).toBe("tvly-test-not-real");
    expect(await value(driver, "usage:daily-cost-spend:2026-06-20")).toBe("2.5");
    expect(JSON.parse((await value(driver, "data:characters"))!)).toEqual([{ id: "c1", name: "Alice" }]);
    expect(await value(driver, "sys:lan:port")).toBe("3000");
    expect(await value(driver, "meta:schema-version")).toBe("4");
    expect(await value(driver, "neotavern_setting_tavilyApiKey")).toBe("tvly-test-not-real");
  });

  it("does not overwrite an existing canonical target", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "3",
      neotavern_setting_tavilyApiKey: "legacy",
      "secret:web-search:tavily:api-key": "canonical",
    });

    expect(await runMigrations(driver, [migration004], "test")).toBe(true);
    expect(await value(driver, "secret:web-search:tavily:api-key")).toBe("canonical");
  });

  it("ignores a corrupt legacy value when a canonical target already exists", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "3",
      neotavern_characters: "{corrupt",
      "data:characters": JSON.stringify([{ id: "canonical" }]),
    });

    expect(await runMigrations(driver, [migration004], "test")).toBe(true);
    expect(JSON.parse((await value(driver, "data:characters"))!)).toEqual([{ id: "canonical" }]);
  });

  it("rejects corrupt structured data without advancing schema", async () => {
    const driver = inMemoryDriver({
      "meta:schema-version": "3",
      neotavern_characters: "{not-an-array}",
    });

    expect(await runMigrations(driver, [migration004], "test")).toBe(false);
    expect(await value(driver, "meta:schema-version")).toBe("3");
    expect((await driver.get("data:characters")).status).toBe("missing");
  });
});

describe("browser-owned scope migration", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("moves device and session values behind their scoped adapters", async () => {
    localStorage.setItem("neo:last-chat-id", "chat-1");
    localStorage.setItem("neo:character-builder:workspace:v1", JSON.stringify({ input: "hello" }));
    localStorage.setItem("neotavern_chat_draft_chat-1", "draft");
    sessionStorage.setItem("neo_token", "token");

    await runBrowserScopeMigrations();

    expect(localStorage.getItem("device:last-chat-id")).toBe("chat-1");
    expect(localStorage.getItem("device:builder-workspace")).toBe(JSON.stringify({ input: "hello" }));
    expect(localStorage.getItem("device:chat-draft:chat-1")).toBe("draft");
    expect(sessionStorage.getItem("session:auth-token")).toBe("token");
    expect(localStorage.getItem("device:meta:schema-version")).toBe("1");
  });

  it("preserves existing device values", async () => {
    localStorage.setItem("neo:last-chat-id", "legacy");
    localStorage.setItem("device:last-chat-id", "canonical");

    await runBrowserScopeMigrations();

    expect(localStorage.getItem("device:last-chat-id")).toBe("canonical");
  });
});
