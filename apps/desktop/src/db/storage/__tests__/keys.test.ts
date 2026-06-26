import { describe, expect, it } from "vitest";
import { resolveSettingStorageTarget } from "../keys";

describe("settings storage keys", () => {
  it("routes content policy settings into prefs", () => {
    expect(resolveSettingStorageTarget("contentMode")).toEqual({
      scope: "prefs",
      key: "content-mode",
    });
    expect(resolveSettingStorageTarget("healthyMode")).toEqual({
      scope: "prefs",
      key: "safety:healthy-mode",
    });
  });
});
