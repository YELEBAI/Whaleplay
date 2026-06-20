import { describe, expect, it } from "vitest";
import { formatCnyCost } from "./deepseek-billing";

describe("formatCnyCost", () => {
  it("formats token usage costs with a fixed number of decimals when requested", () => {
    expect(formatCnyCost(0.0259, { fractionDigits: 4 })).toBe("0.0259 元");
    expect(formatCnyCost(0.008896, { fractionDigits: 4 })).toBe("0.0089 元");
    expect(formatCnyCost(0, { fractionDigits: 4 })).toBe("0.0000 元");
  });

  it("keeps the adaptive display by default", () => {
    expect(formatCnyCost(1.2345)).toBe("1.23 元");
    expect(formatCnyCost(0.008896)).toBe("0.008896 元");
  });
});
