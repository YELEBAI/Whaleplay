import { describe, it, expect } from "vitest";
import {
  detectExplicitContent,
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
      const result = checkHealthyModeOutput("他用力插入她的体内");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("explicit-output");
    });

    it("returns null for clean, diverse output", () => {
      const result = checkHealthyModeOutput("今天天气不错呢。");
      expect(result).toBeNull();
    });
  });
});
