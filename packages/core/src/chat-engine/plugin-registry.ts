import type { ChatPlugin, GenerationHooks, TurnContext, TurnResult } from "./types";

function composeInspectors<TModeState, TSideEffects extends Record<string, unknown>>(
  plugins: ChatPlugin<TModeState, TSideEffects>[],
): GenerationHooks["inspectOutput"] {
  const inspectors = plugins.map((plugin) => plugin.inspectOutput).filter(Boolean);
  if (!inspectors.length) return undefined;
  return (accumulated) => {
    for (const inspect of inspectors) {
      const result = inspect?.(accumulated);
      if (result && !result.pass) return result;
    }
    return { pass: true };
  };
}

export class ChatPluginRegistry<
  TModeState = unknown,
  TSideEffects extends Record<string, unknown> = Record<string, unknown>,
> {
  private plugins: ChatPlugin<TModeState, TSideEffects>[] = [];

  register(plugin: ChatPlugin<TModeState, TSideEffects>) {
    const existingIndex = this.plugins.findIndex((item) => item.id === plugin.id);
    if (existingIndex >= 0) this.plugins.splice(existingIndex, 1, plugin);
    else this.plugins.push(plugin);
    this.plugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  clear() {
    this.plugins = [];
  }

  list() {
    return [...this.plugins];
  }

  async applyBeforePromptBuild(ctx: TurnContext<TModeState>) {
    for (const plugin of this.plugins) {
      await plugin.onBeforePromptBuild?.(ctx);
    }
  }

  applyContextBlocks(blocks: TurnContext<TModeState>["contextBlocks"], ctx: TurnContext<TModeState>) {
    return this.plugins.reduce((acc, plugin) => plugin.onContextBlocks?.(acc, ctx) ?? acc, blocks ?? []);
  }

  composeHooks(_ctx: TurnContext<TModeState>): GenerationHooks {
    const active = [...this.plugins];
    return {
      onContentDelta: async (delta, accumulated) => {
        for (const plugin of active) await plugin.onContentDelta?.(delta, accumulated);
      },
      onReasoningDelta: async (delta, accumulated) => {
        for (const plugin of active) await plugin.onReasoningDelta?.(delta, accumulated);
      },
      inspectOutput: composeInspectors(active),
      onPhaseChange: undefined,
      onToolEvent: undefined,
      signal: undefined,
    };
  }

  async applyAfterTurn(result: TurnResult<TSideEffects>, ctx: TurnContext<TModeState>) {
    for (const plugin of this.plugins) {
      await plugin.onAfterTurn?.(result, ctx);
    }
  }
}

export const chatPluginRegistry = new ChatPluginRegistry();
