import { describe, expect, it } from "vitest";
import type { StorageDriver } from "../driver";
import { collectStorageDiagnostics } from "../diagnostics";

function diagnosticDriver(values: Record<string, string>): StorageDriver {
  return {
    get: async (key) => (key in values ? { status: "found", value: values[key] } : { status: "missing" }),
    set: async () => {},
    remove: async () => {},
    entries: async (prefix) => Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(prefix))),
    batch: async () => {},
  };
}

describe("collectStorageDiagnostics", () => {
  it("reports sizes by scope without exposing stored values", async () => {
    const secretValue = "tvly-test-secret-value";
    const result = await collectStorageDiagnostics(
      diagnosticDriver({
        "prefs:theme": "dark",
        "data:characters": "[]",
        "secret:web-search:tavily:api-key": secretValue,
        neotavern_locale: "zh",
      }),
      2,
    );

    expect(result.totalKeys).toBe(4);
    expect(result.byScope).toMatchObject({
      prefs: { keys: 1 },
      data: { keys: 1 },
      secret: { keys: 1 },
      legacy: { keys: 1 },
    });
    expect(result.largest).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(secretValue);
  });
});
