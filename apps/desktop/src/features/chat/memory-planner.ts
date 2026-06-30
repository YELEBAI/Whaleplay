import { createModelProvider } from "@neo-tavern/core";
import type { ContextBlock, Message, ModelConfig } from "@neo-tavern/shared";
import { chatMemoryRepository, secondaryApiUsageRepository, settingsRepository } from "@/db/repositories";
import type { ChatMemory, ChatMemorySegment } from "@/db/repositories";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { getChatScopedDeepSeekUserId, shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import { useSettingsStore } from "@/features/settings/settings.store";
import {
  buildLightweightMemorySummary,
  countMemoryTurns,
  createMemoryContextBlock,
  formatMemorySegmentsForPrompt,
  hashMessages,
  splitMessagesByRecentTurns,
} from "./memory";

const LOCAL_MEMORY_COMPRESSOR_KEY = "local";
const MEMORY_COMPACTION_BATCH_TURNS = 4;
const MEMORY_COMPACTION_BATCH_MIN_CHARS = 6000;

/**
 * Builds the memory part of a prompt: recent full turns plus an optional compact
 * summary block for older turns. This is the place future RAG/compression stages
 * should integrate, because it owns the history-to-context boundary.
 */
export interface BuildMemoryPromptPlanParams {
  historyMessages: Message[];
  targetChatId: string;
  stripMessages: (messages: Message[]) => Message[];
  signal?: AbortSignal;
}

interface BuildModelMemorySummaryParams {
  messages: Message[];
  maxChars: number;
  compressorConfig: ModelConfig;
  userId?: string;
  signal?: AbortSignal;
}

export function capText(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

// The compression prompt can be much longer than the requested summary. Cap the
// source to a predictable range so secondary model calls remain bounded.
function formatMessagesForCompression(messages: Message[], maxChars: number) {
  const sourceLimit = Math.max(60_000, Math.min(240_000, maxChars * 20));
  const source = messages
    .map((message, index) => {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "角色" : "系统";
      const createdAt = message.createdAt ? ` · ${message.createdAt}` : "";
      return `### ${index + 1}. ${role}${createdAt}\n${capText(message.content, 4000)}`;
    })
    .join("\n\n");

  if (source.length <= sourceLimit) return source;
  return `（来源过长，已优先保留靠后的旧剧情片段。）\n${source.slice(source.length - sourceLimit).trimStart()}`;
}

function countMessageChars(messages: Message[]) {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function shouldCompactMemoryBuffer(messages: Message[], maxChars: number) {
  if (messages.length === 0) return false;
  return (
    countMemoryTurns(messages) >= MEMORY_COMPACTION_BATCH_TURNS ||
    countMessageChars(messages) >= Math.max(MEMORY_COMPACTION_BATCH_MIN_CHARS, Math.floor(maxChars * 1.5))
  );
}

// Preserve the leading header and most recent details when model compression
// exceeds the configured memory budget.
function clampMemorySummary(summary: string, maxChars: number) {
  const normalized = summary.trim();
  if (normalized.length <= maxChars) return normalized;
  const firstLineBreak = normalized.indexOf("\n");
  const header = firstLineBreak >= 0 ? normalized.slice(0, firstLineBreak).trim() : "";
  const body = firstLineBreak >= 0 ? normalized.slice(firstLineBreak + 1).trim() : normalized;
  const marker = "\n…\n";
  const budget = Math.max(200, maxChars - header.length - marker.length);
  return `${header}${marker}${body.slice(-budget).trimStart()}`;
}

// The cache key changes whenever the model identity or important limits change,
// preventing stale summaries from being reused across compressor configs.
function getMemoryCompressorKey(config: ModelConfig | null) {
  if (!config) return LOCAL_MEMORY_COMPRESSOR_KEY;
  return ["model", config.id, config.baseUrl, config.model, config.maxTokens, config.updatedAt].join(":");
}

export async function resolveModelConfig(configId: string | null) {
  if (!configId) return null;
  const stateConfig = useSettingsStore.getState().modelConfigs.find((config) => config.id === configId);
  return stateConfig ?? settingsRepository.getModelConfig(configId);
}

// Older installs may have a single legacy summary. Normalize it into the segment
// format so new incremental compaction can reuse it.
function normalizeMemorySegments(memory: ChatMemory | null): ChatMemorySegment[] {
  if (!memory) return [];
  if (Array.isArray(memory.segments) && memory.segments.length > 0) {
    return memory.segments.filter((segment) => segment.summary?.trim()).sort((a, b) => a.index - b.index);
  }
  if (!memory.summary?.trim()) return [];
  return [
    {
      id: `${memory.chatId}-legacy-memory`,
      index: 1,
      summary: memory.summary,
      sourceHash: memory.sourceHash,
      sourceMessageCount: memory.sourceMessageCount,
      compressorConfigId: memory.compressorConfigId,
      compressorKey: memory.compressorKey,
      compressionMode: memory.compressionMode,
      memorySummaryMaxChars: memory.memorySummaryMaxChars,
      createdAt: memory.updatedAt,
    },
  ];
}

// Memory segments are append-only summaries of older message batches. The source
// hash lets later turns reuse the already-compressed prefix.
function createMemorySegment(
  summary: string,
  sourceMessages: Message[],
  index: number,
  options: {
    compressorConfigId?: string | null;
    compressorKey: string;
    compressionMode: "local" | "model" | "fallback";
    memorySummaryMaxChars: number;
  },
): ChatMemorySegment {
  return {
    id: `memory-segment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    index,
    summary,
    sourceHash: hashMessages(sourceMessages),
    sourceMessageCount: sourceMessages.length,
    compressorConfigId: options.compressorConfigId,
    compressorKey: options.compressorKey,
    compressionMode: options.compressionMode,
    memorySummaryMaxChars: options.memorySummaryMaxChars,
    createdAt: new Date().toISOString(),
  };
}

// Uses a secondary model as a plot-memory compressor. If it fails, callers fall
// back to the local lightweight summary unless the failure was an abort.
async function buildModelMemorySummary({
  messages,
  maxChars,
  compressorConfig,
  userId,
  signal,
}: BuildModelMemorySummaryParams): Promise<{ summary: string; usage?: Message["usage"] }> {
  const provider = createModelProvider(compressorConfig);
  const source = formatMessagesForCompression(messages, maxChars);
  const result = await provider.generate({
    messages: [
      {
        role: "system",
        content: [
          "你是 Whale Play 的剧情记忆压缩器。",
          "你的任务是把这一批较早对话提炼成一个稳定、完整、可长期复用的剧情记忆段。",
          "只记录已经发生或已经明确设定的事实，不续写剧情，不新增设定，不评价内容。",
          "必须从第一条到最后一条顺序扫描，覆盖本批旧剧情的开头、中段、结尾；不要只总结最近片段。",
          "完整性优先于文采，允许使用密集短句。不要为了简洁丢掉关键因果、名称、位置、物品、约定和伏笔。",
          "用户角色的信息只记录其已经明确说过、做过、被动经历过或被设定确认过的内容；不要替用户补心理或动机。",
          "如果内容很多，请合并同类事实，但保留所有会影响后续剧情连续性的状态变化和未解决事项。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `请把以下较早对话提炼成一个长期记忆段，控制在 ${maxChars} 字符以内。`,
          "请使用下面的结构；没有信息的栏目可以省略，但不要省略有信息的栏目：",
          "",
          "【时间线】按发生顺序记录关键事件、因果、转折和当前停留点。",
          "【角色与关系】记录出场角色、身份、称呼、彼此态度、关系变化、承诺和矛盾。",
          "【地点与物品】记录重要地点、环境变化、道具、线索、资源、伤痕、服装或特殊状态。",
          "【用户角色已确认】只记录用户角色已经明确做过/说过/被动遭遇/设定确认的内容。",
          "【当前状态】记录各角色目标、情绪外显、身体/能力状态、危险、限制条件。",
          "【未解决事项】记录悬念、伏笔、待兑现约定、未完成行动、需要后续承接的信息。",
          "",
          "写法要求：用简洁中文分点；不要复述每轮原文；不要输出分析过程；不要添加原文没有的信息；直接输出摘要。",
          "",
          "【本批旧剧情】",
          source,
        ].join("\n"),
      },
    ],
    model: compressorConfig.model,
    omitTemperature: shouldOmitTemperatureForModel(compressorConfig),
    temperature: Math.min(compressorConfig.temperature ?? 0.2, 0.3),
    maxTokens: Math.min(
      Math.max(800, Math.ceil(maxChars / 1.6)),
      Math.max(800, compressorConfig.maxTokens || 4096),
      8192,
    ),
    reasoningEffort: compressorConfig.reasoningEffort || undefined,
    userId,
    signal,
  });

  const summary = result.content.trim();
  if (!summary) throw new Error("Compression API returned an empty summary.");
  const header = "以下是较早剧情的长期记忆摘要，用于保持连续性；最近完整对话仍以后续消息为准。";
  return {
    summary: clampMemorySummary(summary.startsWith(header) ? summary : `${header}\n${summary}`, maxChars),
    usage: result.usage,
  };
}

/**
 * Computes what history enters the prompt this turn. Recent messages remain
 * verbatim; older messages are summarized into cached segments when needed.
 */
export async function buildMemoryPromptPlan({
  historyMessages,
  targetChatId,
  stripMessages,
  signal,
}: BuildMemoryPromptPlanParams): Promise<{ recentMessages: Message[]; memoryBlock: ContextBlock | null }> {
  const settings = useSettingsStore.getState();
  if (!settings.lightweightMemoryEnabled) {
    return { recentMessages: historyMessages, memoryBlock: null };
  }

  // Split first so recent turns stay lossless, while only older turns are
  // eligible for summary/cache handling.
  const { memoryMessages, recentMessages } = splitMessagesByRecentTurns(historyMessages, settings.promptRecentTurns);
  if (memoryMessages.length === 0) {
    return { recentMessages, memoryBlock: null };
  }

  const memorySourceMessages = stripMessages(memoryMessages);
  const compressorConfig = await resolveModelConfig(settings.memoryCompressorConfigId);
  const compressorKey = getMemoryCompressorKey(compressorConfig);
  const cached = targetChatId ? await chatMemoryRepository.get(targetChatId) : null;
  const cachedMessageCount = Math.max(0, Math.min(cached?.sourceMessageCount ?? 0, memorySourceMessages.length));
  const cachedPrefixMessages = cachedMessageCount > 0 ? memorySourceMessages.slice(0, cachedMessageCount) : [];
  const cacheReusable =
    !!cached &&
    cachedMessageCount > 0 &&
    cached.sourceHash === hashMessages(cachedPrefixMessages) &&
    cached.compressorKey === compressorKey &&
    cached.memorySummaryMaxChars === settings.memorySummaryMaxChars;

  // Reuse the cached prefix when possible; only summarize new overflow messages
  // once enough old material has accumulated.
  let compressionMode: "local" | "model" | "fallback" = compressorConfig ? "fallback" : "local";
  let summarizedMessageCount = cacheReusable ? cachedMessageCount : 0;
  let segments = cacheReusable ? normalizeMemorySegments(cached) : [];
  let overflowMemoryMessages = cacheReusable ? memorySourceMessages.slice(cachedMessageCount) : ([] as Message[]);
  let shouldPersistMemory = false;

  if (!cacheReusable || shouldCompactMemoryBuffer(overflowMemoryMessages, settings.memorySummaryMaxChars)) {
    const messagesToSummarize = cacheReusable ? overflowMemoryMessages : memorySourceMessages;
    let segmentSummary: string;

    if (compressorConfig) {
      try {
        const compressed = await buildModelMemorySummary({
          messages: messagesToSummarize,
          maxChars: settings.memorySummaryMaxChars,
          compressorConfig,
          userId: getChatScopedDeepSeekUserId(compressorConfig, targetChatId),
          signal,
        });
        segmentSummary = compressed.summary;
        const compressedUsage = withDeepSeekUsageCost(compressed.usage, compressorConfig);
        if (targetChatId) {
          void secondaryApiUsageRepository.create({
            chatId: targetChatId,
            source: "memory-compressor",
            label: "Memory Compression",
            modelConfigId: compressorConfig.id,
            model: compressorConfig.model,
            usage: compressedUsage,
          });
          void recordUsageCostAndWarn(compressedUsage);
        }
        compressionMode = "model";
      } catch (err) {
        // Manual stop must remain a real abort. Other compressor failures should
        // degrade to local memory so the chat turn can continue.
        if ((err as Error).name === "AbortError") throw err;
        segmentSummary = buildLightweightMemorySummary(messagesToSummarize, settings.memorySummaryMaxChars);
        compressionMode = "fallback";
      }
    } else {
      segmentSummary = buildLightweightMemorySummary(messagesToSummarize, settings.memorySummaryMaxChars);
      compressionMode = "local";
    }

    segments = [
      ...segments,
      createMemorySegment(segmentSummary, messagesToSummarize, segments.length + 1, {
        compressorConfigId: compressorConfig?.id ?? null,
        compressorKey,
        compressionMode,
        memorySummaryMaxChars: settings.memorySummaryMaxChars,
      }),
    ];
    summarizedMessageCount = memorySourceMessages.length;
    overflowMemoryMessages = [];
    shouldPersistMemory = true;
  }

  if (targetChatId && shouldPersistMemory) {
    // Persist only after the new segment is ready, so a failed compressor call
    // cannot corrupt the reusable memory cache.
    const summarizedSourceMessages = memorySourceMessages.slice(0, summarizedMessageCount);
    const summary = formatMemorySegmentsForPrompt(segments);
    await chatMemoryRepository.upsert({
      chatId: targetChatId,
      summary,
      sourceHash: hashMessages(summarizedSourceMessages),
      sourceMessageCount: summarizedMessageCount,
      compressorConfigId: compressorConfig?.id ?? null,
      compressorKey,
      compressionMode,
      memorySummaryMaxChars: settings.memorySummaryMaxChars,
      segments,
    });
  }

  const memorySummary = formatMemorySegmentsForPrompt(segments);
  return {
    recentMessages: [...overflowMemoryMessages, ...recentMessages],
    memoryBlock: createMemoryContextBlock(memorySummary),
  };
}
