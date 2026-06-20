export type RagChunkScope = "character" | "worldbook" | "chat";
export type RagChunkStatus = "indexed" | "pending" | "skipped_too_long" | "stale" | "failed" | "deleted";
export type RagEmbeddingProvider = "builtin" | "ollama";
export type RagChunkKind =
  | "character_profile"
  | "worldbook_entry"
  | "plot_summary"
  | "dynamic_fact"
  | "placeholder";

export interface RagChunkRecord {
  id: string;
  scope: RagChunkScope;
  ownerId: string;
  sourceId: string;
  sourceHash: string;
  chunkIndex: number;
  title: string;
  content: string;
  embeddingModel: string;
  embedding: number[];
  status: RagChunkStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RagMemorySettings {
  enabled: boolean;
  embeddingProvider: RagEmbeddingProvider;
  builtinModel: string;
  ollamaBaseUrl: string;
  embeddingModel: string;
  summarizerConfigId: string | null;
  queryRewriteEnabled: boolean;
  queryRewriteConfigId: string | null;
  summarySourceTurns: number;
  queryRecentTurns: number;
  maxRecallChunks: number;
  maxReferenceChars: number;
  similarityThreshold: number;
  maxChunkChars: number;
  maxAssistantTokensForIndex: number;
  indexCharacter: boolean;
  indexWorldbook: boolean;
  indexChatMemory: boolean;
  extractDynamicFacts: boolean;
}

export const RAG_EMBEDDING_MODEL_PRESETS = [
  {
    id: "bge-small-zh-v1.5",
    label: "bge-small-zh-v1.5",
    badge: "默认",
    provider: "builtin" as const,
    builtinModel: "Xenova/bge-small-zh-v1.5",
    ollamaModel: "qllama/bge-small-zh-v1.5",
    description: "内置本地轻量中文检索模型，适合角色卡、世界书和中文剧情记忆。",
  },
  {
    id: "embeddinggemma",
    label: "embeddinggemma",
    badge: "进阶",
    provider: "ollama" as const,
    builtinModel: null,
    ollamaModel: "embeddinggemma",
    description: "Ollama 多语言 embedding，适合中英混合内容。",
  },
  {
    id: "qwen3-embedding-0.6b",
    label: "Qwen3-Embedding-0.6B",
    badge: "高质量",
    provider: "ollama" as const,
    builtinModel: null,
    ollamaModel: "qwen3-embedding:0.6b",
    description: "Ollama 高质量中文/多语言检索模型，需要更好的本地性能。",
  },
] as const;

export const DEFAULT_RAG_MEMORY_SETTINGS: RagMemorySettings = {
  enabled: false,
  embeddingProvider: "builtin",
  builtinModel: RAG_EMBEDDING_MODEL_PRESETS[0].builtinModel,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  embeddingModel: RAG_EMBEDDING_MODEL_PRESETS[0].builtinModel,
  summarizerConfigId: null,
  queryRewriteEnabled: false,
  queryRewriteConfigId: null,
  summarySourceTurns: 2,
  queryRecentTurns: 5,
  maxRecallChunks: 6,
  maxReferenceChars: 3200,
  similarityThreshold: 0.45,
  maxChunkChars: 700,
  maxAssistantTokensForIndex: 1800,
  indexCharacter: true,
  indexWorldbook: true,
  indexChatMemory: true,
  extractDynamicFacts: true,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(numeric * factor) / factor));
}

export function normalizeRagMemorySettings(input: Partial<RagMemorySettings> = {}): RagMemorySettings {
  const baseUrl = input.ollamaBaseUrl?.trim() || DEFAULT_RAG_MEMORY_SETTINGS.ollamaBaseUrl;
  const provider = input.embeddingProvider === "ollama" ? "ollama" : "builtin";
  const builtinModel =
    input.builtinModel?.trim() ||
    (input.embeddingModel?.trim().startsWith("Xenova/") ? input.embeddingModel.trim() : "") ||
    DEFAULT_RAG_MEMORY_SETTINGS.builtinModel;
  return {
    ...DEFAULT_RAG_MEMORY_SETTINGS,
    ...input,
    enabled: input.enabled ?? DEFAULT_RAG_MEMORY_SETTINGS.enabled,
    embeddingProvider: provider,
    builtinModel,
    ollamaBaseUrl: baseUrl.replace(/\/$/, ""),
    embeddingModel: provider === "ollama" ? input.embeddingModel?.trim() || RAG_EMBEDDING_MODEL_PRESETS[0].ollamaModel : builtinModel,
    summarizerConfigId: input.summarizerConfigId?.trim() || null,
    queryRewriteEnabled: input.queryRewriteEnabled ?? DEFAULT_RAG_MEMORY_SETTINGS.queryRewriteEnabled,
    queryRewriteConfigId: input.queryRewriteConfigId?.trim() || null,
    summarySourceTurns: clampNumber(input.summarySourceTurns, DEFAULT_RAG_MEMORY_SETTINGS.summarySourceTurns, 1, 8),
    queryRecentTurns: clampNumber(input.queryRecentTurns, DEFAULT_RAG_MEMORY_SETTINGS.queryRecentTurns, 1, 12),
    maxRecallChunks: clampNumber(input.maxRecallChunks, DEFAULT_RAG_MEMORY_SETTINGS.maxRecallChunks, 1, 16),
    maxReferenceChars: clampNumber(input.maxReferenceChars, DEFAULT_RAG_MEMORY_SETTINGS.maxReferenceChars, 600, 12000),
    similarityThreshold: clampNumber(
      input.similarityThreshold,
      DEFAULT_RAG_MEMORY_SETTINGS.similarityThreshold,
      0,
      1,
      2,
    ),
    maxChunkChars: clampNumber(input.maxChunkChars, DEFAULT_RAG_MEMORY_SETTINGS.maxChunkChars, 120, 2000),
    maxAssistantTokensForIndex: clampNumber(
      input.maxAssistantTokensForIndex,
      DEFAULT_RAG_MEMORY_SETTINGS.maxAssistantTokensForIndex,
      200,
      12000,
    ),
    indexCharacter: input.indexCharacter ?? DEFAULT_RAG_MEMORY_SETTINGS.indexCharacter,
    indexWorldbook: input.indexWorldbook ?? DEFAULT_RAG_MEMORY_SETTINGS.indexWorldbook,
    indexChatMemory: input.indexChatMemory ?? DEFAULT_RAG_MEMORY_SETTINGS.indexChatMemory,
    extractDynamicFacts: input.extractDynamicFacts ?? DEFAULT_RAG_MEMORY_SETTINGS.extractDynamicFacts,
  };
}
