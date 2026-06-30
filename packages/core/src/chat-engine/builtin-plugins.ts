import type { ChatPlugin } from "./types";
import { createFloodInspectOutput, type FloodDetectionConfig } from "./flood-guard";

export interface FloodGuardPluginOptions {
  id?: string;
  priority?: number;
  recentContents?: string[];
  config?: Partial<FloodDetectionConfig>;
}

/**
 * Minimal built-in plugin example for chat-engine.
 *
 * The plugin surface is intentionally small: this factory only contributes an
 * inspectOutput hook, so callers can register it without changing prompt
 * building, generation strategy, or UI code. Desktop currently wires flood
 * guard directly while the plugin pipeline is still being integrated.
 */
export function createFloodGuardPlugin({
  id = "core.flood-guard",
  priority = 20,
  recentContents = [],
  config,
}: FloodGuardPluginOptions = {}): ChatPlugin {
  return {
    id,
    priority,
    inspectOutput: createFloodInspectOutput(recentContents, config),
  };
}
