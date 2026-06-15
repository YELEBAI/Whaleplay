import type { MessageUsage, ModelConfig } from "@neo-tavern/shared";

export interface DeepSeekBalanceInfo {
  currency: "CNY" | "USD" | string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}

export interface DeepSeekBalanceResult {
  isAvailable: boolean;
  balances: DeepSeekBalanceInfo[];
  endpoint: string;
}

interface DeepSeekPricing {
  name: string;
  inputCacheHitPerMillionCny: number;
  inputCacheMissPerMillionCny: number;
  outputPerMillionCny: number;
}

const DEEPSEEK_FLASH_PRICING: DeepSeekPricing = {
  name: "DeepSeek V4 Flash",
  inputCacheHitPerMillionCny: 0.02,
  inputCacheMissPerMillionCny: 1,
  outputPerMillionCny: 2,
};

const DEEPSEEK_PRO_PRICING: DeepSeekPricing = {
  name: "DeepSeek V4 Pro",
  inputCacheHitPerMillionCny: 0.025,
  inputCacheMissPerMillionCny: 3,
  outputPerMillionCny: 6,
};

function cleanNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeModel(model: string | undefined) {
  return (model || "").trim().toLowerCase();
}

export function isDeepSeekConfig(config: Pick<ModelConfig, "baseUrl" | "model"> | null | undefined) {
  if (!config) return false;
  const model = normalizeModel(config.model);
  if (model.startsWith("deepseek-")) return true;
  try {
    const host = new URL(config.baseUrl).host.toLowerCase();
    return host.includes("deepseek.com");
  } catch {
    return config.baseUrl.toLowerCase().includes("deepseek");
  }
}

function getDeepSeekPricing(model: string | undefined): DeepSeekPricing | null {
  const normalized = normalizeModel(model);
  if (!normalized.startsWith("deepseek-")) return null;
  if (normalized.includes("v4-pro")) return DEEPSEEK_PRO_PRICING;
  return DEEPSEEK_FLASH_PRICING;
}

export function withDeepSeekUsageCost(
  usage: MessageUsage | undefined,
  config: Pick<ModelConfig, "baseUrl" | "model"> | null | undefined,
): MessageUsage | undefined {
  if (!usage || !isDeepSeekConfig(config)) return usage;
  const pricing = getDeepSeekPricing(config?.model);
  if (!pricing) return usage;

  const promptTokens = cleanNumber(usage.promptTokens);
  const completionTokens = cleanNumber(usage.completionTokens);
  const cacheHitTokens = Math.min(cleanNumber(usage.cacheHitTokens), promptTokens);
  const cacheMissTokens =
    usage.cacheMissTokens == null ? Math.max(0, promptTokens - cacheHitTokens) : cleanNumber(usage.cacheMissTokens);

  if (promptTokens <= 0 && completionTokens <= 0) return usage;

  const inputHitCny = (cacheHitTokens * pricing.inputCacheHitPerMillionCny) / 1_000_000;
  const inputMissCny = (cacheMissTokens * pricing.inputCacheMissPerMillionCny) / 1_000_000;
  const outputCny = (completionTokens * pricing.outputPerMillionCny) / 1_000_000;
  const costCny = inputHitCny + inputMissCny + outputCny;

  return {
    ...usage,
    costCny,
    costCurrency: "CNY",
    costInputCacheHitCny: inputHitCny,
    costInputCacheMissCny: inputMissCny,
    costOutputCny: outputCny,
    costModel: config?.model,
    costPricingName: pricing.name,
  };
}

interface FormatCnyCostOptions {
  fractionDigits?: number;
}

export function formatCnyCost(value: number | null | undefined, options: FormatCnyCostOptions = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (typeof options.fractionDigits === "number") return `${value.toFixed(options.fractionDigits)} 元`;

  const abs = Math.abs(value);
  if (abs === 0) return "0 元";
  if (abs >= 1) return `${value.toFixed(2)} 元`;
  if (abs >= 0.01) return `${value.toFixed(4)} 元`;
  if (abs >= 0.0001) return `${value.toFixed(6)} 元`;
  return value > 0 ? "<0.0001 元" : ">-0.0001 元";
}

export function formatCnyExact(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(6)} 元`;
}

export function buildDeepSeekBalanceEndpoint(baseUrl: string) {
  const clean = (baseUrl || "https://api.deepseek.com").trim().replace(/\/+$/, "");
  try {
    const url = new URL(clean);
    if (url.hostname.toLowerCase().includes("deepseek.com")) {
      return `${url.origin}/user/balance`;
    }
  } catch {
    // Keep the fallback below for custom proxies or manually entered URLs.
  }
  return `${clean.replace(/\/(v1|beta)$/i, "")}/user/balance`;
}

export async function fetchDeepSeekBalance(
  config: Pick<ModelConfig, "baseUrl" | "apiKey">,
): Promise<DeepSeekBalanceResult> {
  const endpoint = buildDeepSeekBalanceEndpoint(config.baseUrl);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  const data = (await response.json()) as {
    is_available?: boolean;
    balance_infos?: Array<{
      currency?: string;
      total_balance?: string;
      granted_balance?: string;
      topped_up_balance?: string;
    }>;
  };

  return {
    isAvailable: !!data.is_available,
    endpoint,
    balances: (data.balance_infos || []).map((info) => ({
      currency: info.currency || "CNY",
      totalBalance: cleanNumber(info.total_balance),
      grantedBalance: cleanNumber(info.granted_balance),
      toppedUpBalance: cleanNumber(info.topped_up_balance),
    })),
  };
}
