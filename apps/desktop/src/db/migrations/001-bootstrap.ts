import type { StorageMigration } from "./types";

export const migration001: StorageMigration = {
  id: "001-bootstrap",
  from: -1,
  to: 1,
  description: "Detect legacy install vs fresh install, set initial schema version",
  plan: async (ctx) => {
    const ops: Array<{ type: "set"; key: string; value: string } | { type: "remove"; key: string }> = [];
    const localLegacy = Object.keys(ctx.legacyLocalStorage).some(
      (key) => key.startsWith("neotavern_") || key.startsWith("neotavern-"),
    );
    const canonicalLegacy = Object.keys(await ctx.driver.entries("neotavern")).some(
      (key) => key.startsWith("neotavern_") || key.startsWith("neotavern-"),
    );
    const legacy = localLegacy || canonicalLegacy;
    // Mark install type
    ops.push({
      type: "set",
      key: "meta:install-type",
      value: legacy ? "legacy" : "fresh",
    });
    return ops;
  },
  verify: async (ctx) => {
    const r = await ctx.driver.get("meta:install-type");
    if (r.status !== "found" || (r.value !== "legacy" && r.value !== "fresh")) {
      throw new Error("meta:install-type not set correctly");
    }
  },
};
