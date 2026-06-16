import type { ModelConfig } from "@neo-tavern/shared";

export function isDeepSeekProModel(model: string | null | undefined) {
  return (model || "").trim().toLowerCase().includes("deepseek-v4-pro");
}

export function shouldOmitTemperatureForModel(
  config: Pick<ModelConfig, "model" | "reasoningEffort"> | null | undefined,
) {
  // Thinking mode ignores temperature entirely (DeepSeek docs). V4 Pro always omits it.
  return isDeepSeekProModel(config?.model) || !!config?.reasoningEffort;
}

function isDeepSeekConfig(config: Pick<ModelConfig, "baseUrl" | "model"> | null | undefined) {
  if (!config) return false;
  const model = (config.model || "").trim().toLowerCase();
  if (model.startsWith("deepseek-")) return true;
  try {
    return new URL(config.baseUrl).host.toLowerCase().includes("deepseek.com");
  } catch {
    return (config.baseUrl || "").toLowerCase().includes("deepseek");
  }
}

export function createChatScopedDeepSeekUserId(chatId: string | null | undefined) {
  const sanitized = (chatId || "").replace(/[^a-zA-Z0-9\-_]/g, "_").replace(/^_+|_+$/g, "");
  return `chat_${(sanitized || "unknown").slice(0, 507)}`;
}

export function getChatScopedDeepSeekUserId(
  config: Pick<ModelConfig, "baseUrl" | "model"> | null | undefined,
  chatId: string | null | undefined,
) {
  if (!chatId || !isDeepSeekConfig(config)) return undefined;
  return createChatScopedDeepSeekUserId(chatId);
}
