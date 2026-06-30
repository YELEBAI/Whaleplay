import { describe, expect, it } from "vitest";
import { createFloodInspectOutput, detectFlood, detectSelfFlood, textSimilarity } from "../flood-guard";

describe("flood guard", () => {
  it("computes text similarity across punctuation and whitespace", () => {
    expect(textSimilarity("你好 世界！", "你好世界")).toBe(1);
  });

  it("detects output similar to recent assistant messages", () => {
    const repeated = "这是完全相同的内容，用于测试刷屏检测功能。";
    const result = detectFlood(Array(5).fill(repeated), repeated);

    expect(result.flooded).toBe(true);
    expect(result.count).toBe(5);
  });

  it("detects repeated segments inside the current stream", () => {
    const sentence = "她只是站在那里，静静地望着雨。";
    const result = detectSelfFlood(Array(5).fill(sentence).join("\n"), { minContentChars: 40 });

    expect(result.flooded).toBe(true);
    expect(result.reason).toBe("repeated-segment");
  });

  it("creates an inspectOutput hook that terminates flooding streams", () => {
    const inspect = createFloodInspectOutput([], { minContentChars: 40 });
    const sentence = "她只是站在那里，静静地望着雨。";
    const result = inspect(Array(10).fill(sentence).join("\n"));

    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.terminate).toBe(true);
  });
});
