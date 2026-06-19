import { beforeEach, describe, expect, it } from "vitest";
import { createPrefixedKV } from "../namespaces";
import type { StorageDriver } from "../driver";

/**
 * An in-memory StorageDriver that stores raw strings in a plain object.
 * Suitable for unit-testing namespaces without touching any real backend.
 */
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

describe("createPrefixedKV", () => {
  let driver: StorageDriver;
  let kv: ReturnType<typeof createPrefixedKV>;

  beforeEach(() => {
    driver = inMemoryDriver();
    kv = createPrefixedKV("test:", driver);
  });

  it("get returns found after set", async () => {
    await kv.set("alpha", "hello");
    const r = await kv.get("alpha");
    expect(r.status).toBe("found");
    if (r.status === "found") expect(r.value).toBe("hello");
  });

  it("get returns missing for unknown keys", async () => {
    const r = await kv.get("nope");
    expect(r.status).toBe("missing");
  });

  it("remove deletes a key", async () => {
    await kv.set("temp", "x");
    await kv.remove("temp");
    expect((await kv.get("temp")).status).toBe("missing");
  });

  it("getJson returns valid parsed JSON", async () => {
    await kv.setJson("obj", { a: 1, b: [2] });
    const r = await kv.getJson<{ a: number; b: number[] }>("obj");
    expect(r.status).toBe("valid");
    if (r.status === "valid") expect(r.value).toEqual({ a: 1, b: [2] });
  });

  it("getJson returns missing when key absent", async () => {
    const r = await kv.getJson("ghost");
    expect(r.status).toBe("missing");
  });

  it("getJson returns corrupt for unparseable data", async () => {
    await driver.set("test:bad-json", "{not valid");
    const r = await kv.getJson("bad-json");
    expect(r.status).toBe("corrupt");
  });

  it("getArray returns parsed array", async () => {
    await kv.setJson("list", [{ id: "x" }, { id: "y" }]);
    const r = await kv.getArray<{ id: string }>("list");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([{ id: "x" }, { id: "y" }]);
  });

  it("getArray returns empty array when missing", async () => {
    const r = await kv.getArray("nope");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it("getArray returns corrupt for bad JSON", async () => {
    await driver.set("test:broken", "{{");
    const r = await kv.getArray("broken");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe("corrupt");
  });

  it("getOr returns parsed value", async () => {
    await kv.set("num", "88");
    expect(await kv.getOr("num", 0)).toBe(88);
  });

  it("getOr returns fallback when missing", async () => {
    expect(await kv.getOr("missing-key", -1)).toBe(-1);
  });

  it("getOr returns fallback when corrupt", async () => {
    await driver.set("test:garbage", "not-json");
    expect(await kv.getOr("garbage", { fallback: 1 })).toEqual({ fallback: 1 });
  });

  it("entries returns all keys under the prefix, without the prefix", async () => {
    await kv.set("a", "1");
    await kv.set("b", "2");
    // Write a key with a different prefix — should NOT appear
    await driver.set("other:x", "99");

    const all = await kv.entries();
    expect(all).toEqual({ a: "1", b: "2" });
  });

  it("clear removes every key under the prefix", async () => {
    await kv.set("c1", "v");
    await kv.set("c2", "v");
    await driver.set("other:keep", "keep-me");

    await kv.clear();

    expect((await kv.get("c1")).status).toBe("missing");
    expect((await kv.get("c2")).status).toBe("missing");
    expect((await driver.get("other:keep")).status).toBe("found");
  });

  it("clear on empty namespace is a no-op", async () => {
    await expect(kv.clear()).resolves.toBeUndefined();
  });

  it("idempotent set and remove sequence", async () => {
    await kv.setJson("idem", 99);
    expect(await kv.getOr("idem", 0)).toBe(99);
    await kv.remove("idem");
    expect(await kv.getOr("idem", 0)).toBe(0);
  });
});

describe("pre-built instances smoke test", () => {
  // Import the pre-built instances — they should not throw during import.
  // No real backend is touched because we are not calling any method.
  it("import prefs/data/sys/meta/device/session without error", async () => {
    const mod = await import("../namespaces");
    expect(mod.prefs).toBeDefined();
    expect(mod.data).toBeDefined();
    expect(mod.sys).toBeDefined();
    expect(mod.meta).toBeDefined();
    expect(mod.device).toBeDefined();
    expect(mod.session).toBeDefined();
  });
});
