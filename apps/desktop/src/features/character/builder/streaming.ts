import type { GenerateInput, GenerateResult, GenerateToolCall, ModelProvider } from "@neo-tavern/shared";
import type { ToolCallPart, NeoBuilderTurnOptions } from "./types";
import { addUsage } from "./utils";

/**
 * Append a tool-call delta from a streaming chunk.
 * Deltas accumulate within the same turn — this builds complete tool call objects.
 */
export function appendToolCallDelta(
  parts: Map<number, ToolCallPart>,
  delta: {
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  },
): void {
  const index = typeof delta.index === "number" ? delta.index : parts.size;
  const current: ToolCallPart = parts.get(index) ?? { type: "function", function: { arguments: "" } };
  const nextFunction = {
    name: delta.function?.name ?? current.function?.name,
    arguments: `${current.function?.arguments ?? ""}${delta.function?.arguments ?? ""}`,
  };
  parts.set(index, {
    ...current,
    id: delta.id ?? current.id,
    type: delta.type ?? current.type,
    function: nextFunction,
  });
}

/**
 * Generate one step via the provider. Supports both streaming and non-streaming.
 * Emits content/reasoning deltas via callbacks.
 */
export async function generateBuilderStep(
  provider: ModelProvider,
  input: GenerateInput,
  options: NeoBuilderTurnOptions,
): Promise<GenerateResult> {
  if (!provider.streamGenerate) {
    return provider.generate(input);
  }

  let content = "";
  let reasoningContent = "";
  let finishReason: string | undefined;
  let usage = undefined;
  const toolParts = new Map<number, ToolCallPart>();
  const raw: unknown[] = [];

  for await (const chunk of provider.streamGenerate(input)) {
    if (chunk.raw) raw.push(chunk.raw);
    if (chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.contentDelta) {
      content += chunk.contentDelta;
      options.onContentDelta?.(chunk.contentDelta);
    }
    if (chunk.reasoningContentDelta) {
      reasoningContent += chunk.reasoningContentDelta;
      options.onReasoningDelta?.(chunk.reasoningContentDelta);
    }
    for (const delta of chunk.toolCallDeltas ?? []) {
      appendToolCallDelta(toolParts, delta);
    }
    usage = addUsage(usage, chunk.usage);
  }

  const toolCalls: GenerateToolCall[] = [...toolParts.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([index, part]): GenerateToolCall => ({
        id: part.id || `tool_call_${index}`,
        type: "function",
        function: {
          name: part.function?.name || "",
          arguments: part.function?.arguments || "",
        },
      }),
    )
    .filter((call) => call.function.name);

  return {
    content,
    reasoningContent: reasoningContent || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason,
    usage,
    raw,
  };
}
