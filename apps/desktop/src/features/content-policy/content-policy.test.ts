import { describe, expect, it } from "vitest";
import {
  createContentPolicySnapshot,
  filterNsfwItems,
  isNsfwPresetItem,
  normalizeContentMode,
  NSFW_ITEM_KIND,
  NSFW_ITEM_NAME,
} from "./content-policy";

describe("content policy", () => {
  it("normalizes known modes only", () => {
    expect(normalizeContentMode("normal")).toBe("normal");
    expect(normalizeContentMode("healthy")).toBe("healthy");
    expect(normalizeContentMode("adultLimited")).toBe("adultLimited");
    expect(normalizeContentMode("unknown")).toBeNull();
  });

  it("uses a stable built-in marker for NSFW items with a name fallback", () => {
    expect(isNsfwPresetItem({ name: "renamed", builtinKind: NSFW_ITEM_KIND })).toBe(true);
    expect(isNsfwPresetItem({ name: NSFW_ITEM_NAME })).toBe(true);
    expect(isNsfwPresetItem({ name: "ordinary" })).toBe(false);
  });

  it("filters NSFW items only when the policy says so", () => {
    const items = [
      { name: "safe", builtinKind: undefined },
      { name: "renamed", builtinKind: NSFW_ITEM_KIND },
    ];
    expect(filterNsfwItems(items)).toEqual([{ name: "safe", builtinKind: undefined }]);
  });

  it("keeps flood detection outside the healthy content policy", () => {
    const healthy = createContentPolicySnapshot("healthy");
    expect(healthy.blockExplicitInput).toBe(true);
    expect(healthy.checkExplicitOutput).toBe(true);
    expect(healthy.checkFloodOutput).toBe(false);

    const adult = createContentPolicySnapshot("adultLimited");
    expect(adult.filterNsfwPresetItems).toBe(false);
    expect(adult.checkExplicitOutput).toBe(false);
  });
});
