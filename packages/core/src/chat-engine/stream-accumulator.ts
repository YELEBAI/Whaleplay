import type { GenerateChunk, GenerateResult, ModelConfig } from "@neo-tavern/shared";

type ModelUsage = GenerateResult["usage"];

export type ReasoningDeltaMode = "reasoning" | "content" | "ignore";

export interface GenerationStreamSnapshot {
  content: string;
  reasoningContent: string;
  usage?: ModelUsage;
}

export interface GenerationStreamAccumulatorOptions {
  reasoningDeltaMode?: ReasoningDeltaMode;
  onContentDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
}

export function isReasoningCaptureEnabled(config: Pick<ModelConfig, "reasoningEffort"> | null | undefined) {
  return !!config?.reasoningEffort?.trim();
}

export function mergeModelUsage(a?: ModelUsage, b?: ModelUsage): ModelUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: (a.promptTokens ?? 0) + (b.promptTokens ?? 0),
    completionTokens: (a.completionTokens ?? 0) + (b.completionTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    cacheHitTokens: (a.cacheHitTokens ?? 0) + (b.cacheHitTokens ?? 0),
    cacheMissTokens: (a.cacheMissTokens ?? 0) + (b.cacheMissTokens ?? 0),
  };
}

export function createGenerationStreamAccumulator(options: GenerationStreamAccumulatorOptions = {}) {
  let content = "";
  let reasoningContent = "";
  let usage: ModelUsage | undefined;
  const reasoningDeltaMode = options.reasoningDeltaMode ?? "reasoning";

  const acceptChunk = async (chunk: Pick<GenerateChunk, "contentDelta" | "reasoningContentDelta" | "usage">) => {
    let contentDelta = chunk.contentDelta ?? "";
    let reasoningDelta = chunk.reasoningContentDelta ?? "";

    if (reasoningDelta) {
      if (reasoningDeltaMode === "content") {
        contentDelta += reasoningDelta;
        reasoningDelta = "";
      } else if (reasoningDeltaMode === "ignore") {
        reasoningDelta = "";
      }
    }

    if (contentDelta) {
      content += contentDelta;
      await options.onContentDelta?.(contentDelta, content);
    }
    if (reasoningDelta) {
      reasoningContent += reasoningDelta;
      await options.onReasoningDelta?.(reasoningDelta, reasoningContent);
    }
    if (chunk.usage) {
      usage = mergeModelUsage(usage, chunk.usage);
      await options.onUsage?.(usage);
    }
  };

  return {
    acceptChunk,
    resetContent: () => {
      content = "";
    },
    resetReasoning: () => {
      reasoningContent = "";
    },
    reset: () => {
      content = "";
      reasoningContent = "";
      usage = undefined;
    },
    snapshot: (): GenerationStreamSnapshot => ({ content, reasoningContent, usage }),
    get content() {
      return content;
    },
    get reasoningContent() {
      return reasoningContent;
    },
    get usage() {
      return usage;
    },
  };
}
