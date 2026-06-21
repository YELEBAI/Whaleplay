import { describe, expect, it } from "vitest";
import { prefKeys, resolveSettingStorageTarget } from "../keys";

describe("settings storage routing", () => {
  it("routes RAG and streaming preferences through the prefs namespace", () => {
    expect(resolveSettingStorageTarget("ragMemory")).toEqual({ scope: "prefs", key: prefKeys.ragMemory });
    expect(resolveSettingStorageTarget("smartStreamingScrollEnabled")).toEqual({
      scope: "prefs",
      key: prefKeys.smartStreamingScrollEnabled,
    });
  });

  it("continues to reject unregistered setting keys", () => {
    expect(() => resolveSettingStorageTarget("unknownRagSetting")).toThrow("Unknown settings storage key");
  });
});
