import type { ModelConfig, ModelProvider } from "@neo-tavern/shared";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.provider";

export function createModelProvider(config: ModelConfig): ModelProvider {
  if (config.provider === "openai-compatible") {
    return new OpenAICompatibleProvider({
      id: config.id,
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  throw new Error(`Unknown provider type: ${config.provider}`);
}
