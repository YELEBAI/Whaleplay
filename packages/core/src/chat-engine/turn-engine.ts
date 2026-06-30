import { chatPluginRegistry, type ChatPluginRegistry } from "./plugin-registry";
import type { ChatStrategy, TurnContext, TurnEvent, TurnPhase, TurnResult } from "./types";

export interface RunChatTurnOptions<
  TModeState = unknown,
  TSideEffects extends Record<string, unknown> = Record<string, unknown>,
> {
  signal?: AbortSignal;
  pluginRegistry?: ChatPluginRegistry<TModeState, TSideEffects>;
  onPhaseChange?: (phase: TurnPhase) => void;
  onEvent?: (event: TurnEvent<TSideEffects>) => void | Promise<void>;
}

async function emitTurnEvent<TSideEffects extends Record<string, unknown>>(
  options: Pick<RunChatTurnOptions<unknown, TSideEffects>, "onEvent" | "onPhaseChange">,
  event: TurnEvent<TSideEffects>,
) {
  if (event.type === "turn.phase") options.onPhaseChange?.(event.phase);
  await options.onEvent?.(event);
}

export async function runChatTurn<
  TModeState = unknown,
  TSideEffects extends Record<string, unknown> = Record<string, unknown>,
>(
  strategy: ChatStrategy<TModeState, TSideEffects>,
  ctx: TurnContext<TModeState>,
  options: RunChatTurnOptions<TModeState, TSideEffects> = {},
): Promise<TurnResult<TSideEffects>> {
  const registry = options.pluginRegistry ?? chatPluginRegistry;

  await emitTurnEvent(options, { type: "turn.started" });
  try {
    await emitTurnEvent(options, { type: "turn.phase", phase: "preparing" });
    await registry.applyBeforePromptBuild(ctx);
    const strategyContextBlocks = strategy.buildExtraContextBlocks(ctx);
    const contextBlocks = registry.applyContextBlocks(strategyContextBlocks, ctx);
    const presetItems = strategy.resolvePresetItems(ctx);
    const nextCtx = { ...ctx, contextBlocks, presetItems };

    await emitTurnEvent(options, { type: "turn.phase", phase: "streaming" });
    const pluginHooks = registry.composeHooks(nextCtx);
    const result = await strategy.generate(nextCtx, {
      ...pluginHooks,
      signal: options.signal,
      onContentDelta: async (delta, accumulated) => {
        await emitTurnEvent(options, { type: "content.delta", delta, accumulated });
        await pluginHooks.onContentDelta?.(delta, accumulated);
      },
      onReasoningDelta: async (delta, accumulated) => {
        await emitTurnEvent(options, { type: "reasoning.delta", delta, accumulated });
        await pluginHooks.onReasoningDelta?.(delta, accumulated);
      },
      onPhaseChange: (phase) => {
        void emitTurnEvent(options, { type: "generation.phase", phase });
        pluginHooks.onPhaseChange?.(phase);
      },
      onToolEvent: (toolName) => {
        void emitTurnEvent(options, { type: "tool.event", toolName });
        pluginHooks.onToolEvent?.(toolName);
      },
    });

    await emitTurnEvent(options, { type: "turn.phase", phase: "postprocessing" });
    await strategy.onTurnComplete(result, nextCtx);
    await registry.applyAfterTurn(result, nextCtx);
    await emitTurnEvent(options, { type: "turn.completed", result });
    await emitTurnEvent(options, { type: "turn.phase", phase: "idle" });
    return result;
  } catch (error) {
    await emitTurnEvent(options, { type: "turn.failed", error: error as Error });
    throw error;
  }
}
