import { describe, it, expect } from "vitest";
import {
  detectExplicitContent,
  textSimilarity,
  detectFlood,
  createHealthyModeContextBlock,
  checkHealthyModeOutput,
  HEALTHY_MODE_PROMPT,
} from "./healthy-mode";

describe("healthy-mode", () => {
  describe("detectExplicitContent", () => {
    it("returns null for clean text", () => {
      expect(detectExplicitContent("今天天气真好，我们一起去散步吧。")).toBeNull();
      expect(detectExplicitContent("她轻轻地握住他的手，微笑着看向他。")).toBeNull();
    });

    it("detects explicit sexual descriptions", () => {
      const text = "他用力插入她的体内，感受着她的温度。";
      expect(detectExplicitContent(text)).not.toBeNull();
    });

    it("detects explicit anatomical terms", () => {
      expect(detectExplicitContent("她的阴蒂被轻轻触碰")).not.toBeNull();
      expect(detectExplicitContent("龟头微微颤抖")).not.toBeNull();
    });

    it("does not flag normal romantic content", () => {
      expect(detectExplicitContent("他吻了她的额头，轻声说晚安。")).toBeNull();
      expect(detectExplicitContent("两人紧紧相拥，感受着彼此的心跳。")).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(detectExplicitContent("")).toBeNull();
      expect(detectExplicitContent(null as unknown as string)).toBeNull();
    });
  });

  describe("textSimilarity", () => {
    it("returns 1 for identical strings", () => {
      expect(textSimilarity("你好世界", "你好世界")).toBe(1);
    });

    it("returns 0 for completely different strings", () => {
      expect(textSimilarity("abc", "xyz")).toBeLessThan(0.1);
    });

    it("handles whitespace and punctuation differences", () => {
      const sim = textSimilarity("你好 世界！", "你好世界");
      expect(sim).toBe(1);
    });

    it("returns high similarity for near-duplicates", () => {
      const a = "她走到窗前，看着窗外的雨景，心中涌起一阵莫名的惆怅。";
      const b = "她走到窗前，看着窗外的雨景，心中涌起一阵莫名的惆怅和感伤。";
      expect(textSimilarity(a, b)).toBeGreaterThan(0.85);
    });

    it("returns low similarity for different content", () => {
      const a = "今天我们去公园散步，看到了很多花。";
      const b = "数学公式推导需要严谨的逻辑和耐心。";
      expect(textSimilarity(a, b)).toBeLessThan(0.3);
    });

    it("returns 0 for empty strings", () => {
      expect(textSimilarity("", "test")).toBe(0);
      expect(textSimilarity("test", "")).toBe(0);
    });
  });

  describe("detectFlood", () => {
    it("detects flooding when content repeats 5+ times", () => {
      const repeated = "这是完全相同的内容，用于测试刷屏检测功能。";
      const recent = Array(5).fill(repeated);
      const result = detectFlood(recent, repeated);
      expect(result.flooded).toBe(true);
      expect(result.count).toBe(5);
    });

    it("does not trigger below threshold count", () => {
      const repeated = "这是完全相同的内容，用于测试刷屏检测功能。";
      const recent = Array(4).fill(repeated);
      const result = detectFlood(recent, repeated);
      expect(result.flooded).toBe(false);
      expect(result.count).toBe(4);
    });

    it("detects near-duplicate flooding", () => {
      const base = "她走到窗前看着雨心中很惆怅";
      const recent = [
        "她走到窗前看着雨心中很惆怅",
        "她走到窗前看着雨心中很惆怅",
        "她走到窗前看着雨心中很惆怅",
        "她走到窗前看着雨心中很惆怅",
        "她走到窗前看着雨心中很惆怅",
      ];
      const result = detectFlood(recent, base, { similarityThreshold: 0.85, maxOccurrences: 5 });
      expect(result.flooded).toBe(true);
    });

    it("returns not flooded for diverse content", () => {
      const recent = ["今天天气晴朗。", "我们去公园玩吧。", "晚饭吃什么好呢？", "这本书真有趣。", "明天有个会议。"];
      const result = detectFlood(recent, "晚上好，有什么可以帮你的吗？");
      expect(result.flooded).toBe(false);
      expect(result.count).toBe(0);
    });

    it("handles empty new content", () => {
      expect(detectFlood(["some content"], "").flooded).toBe(false);
    });
  });

  describe("createHealthyModeContextBlock", () => {
    it("creates a safety context block with high priority", () => {
      const block = createHealthyModeContextBlock();
      expect(block.source).toBe("safety");
      expect(block.priority).toBeGreaterThan(100);
      expect(block.content).toContain("健康模式");
      expect(block.role).toBe("system");
      expect(block.position).toBe("beforeHistory");
    });

    it("includes explicit content avoidance instructions", () => {
      expect(HEALTHY_MODE_PROMPT).toContain("禁止");
      expect(HEALTHY_MODE_PROMPT).toContain("色情");
    });
  });

  describe("checkHealthyModeOutput", () => {
    it("detects explicit content in AI output", () => {
      const result = checkHealthyModeOutput("他用力插入她的体内", []);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("explicit-output");
    });

    it("detects flooding in AI output", () => {
      const repeated = "她走到窗前看着雨，心中很惆怅。";
      const recent = [
        { role: "assistant", content: repeated },
        { role: "assistant", content: repeated },
        { role: "assistant", content: repeated },
        { role: "assistant", content: repeated },
        { role: "assistant", content: repeated },
      ];
      const result = checkHealthyModeOutput(repeated, recent);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("flood");
    });

    it("returns null for clean, diverse output", () => {
      const recent = [
        { role: "assistant", content: "你好！" },
        { role: "user", content: "在吗？" },
        { role: "assistant", content: "在的，有什么事？" },
      ];
      const result = checkHealthyModeOutput("今天天气不错呢。", recent);
      expect(result).toBeNull();
    });
  });
});
