import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserStorageDriver } from "../runtime";

describe("browser storage drivers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps device data in localStorage", async () => {
    const driver = createBrowserStorageDriver("localStorage");
    await driver.set("device:key", "value");
    expect(localStorage.getItem("device:key")).toBe("value");
    expect(await driver.get("device:key")).toEqual({ status: "found", value: "value" });
  });

  it("keeps session data isolated from device data", async () => {
    const device = createBrowserStorageDriver("localStorage");
    const session = createBrowserStorageDriver("sessionStorage");
    await device.set("same", "device");
    await session.set("same", "session");
    expect(await device.get("same")).toEqual({ status: "found", value: "device" });
    expect(await session.get("same")).toEqual({ status: "found", value: "session" });
  });

  it("applies a batch and preserves unrelated keys", async () => {
    const driver = createBrowserStorageDriver("localStorage");
    localStorage.setItem("keep", "yes");
    await driver.batch([
      { type: "set", key: "a", value: "1" },
      { type: "set", key: "b", value: "2" },
      { type: "remove", key: "a" },
    ]);
    expect(localStorage.getItem("a")).toBeNull();
    expect(localStorage.getItem("b")).toBe("2");
    expect(localStorage.getItem("keep")).toBe("yes");
  });
});
