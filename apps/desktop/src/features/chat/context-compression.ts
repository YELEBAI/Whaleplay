import { chatMemoryRepository, secondaryApiUsageRepository, settingsRepository } from "@/db/repositories";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { getChatScopedDeepSeekUserId, shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import { useSettingsStore } from "@/features/settings/settings.store";
import { createModelProvider, stripPromptContent } from "@neo-tavern/core";
import { generateId } from "@neo-tavern/shared";
import type { Message, ModelConfig } from "@neo-tavern/shared";
import {
  buildLightweightMemorySummary,
  CONTEXT_COMPRESSION_PRESERVE_TURNS,
  formatMemorySegmentsForPrompt,
  hashMessages,
  splitMessagesByRecentAssistantTurns,
} from "./memory";
import type { ChatMemorySegment } from "@/db/repositories";

export interface ContextCompressionPromptPlan {
  recentMessages: Message[];
  memoryBlock: null;
  compressedMessageCount: number;
}

export interface ContextCompressionResult {
  status: "compressed" | "skipped";
  compressedMessageCount: number;
  preservedMessageCount: number;
  compressionMode?: "model" | "fallback" | "local";
  summary?: string;
  reason?: "not-enough-history" | "empty-history";
}

function capText(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

export function stripContextCompressionMessages(messages: Message[]): Message[] {
  const rules = useSettingsStore.getState().getActiveRegexRules() ?? [];
  return messages.map((message) =>
    message.role === "assistant" ? { ...message, content: stripPromptContent(message.content, rules) } : message,
  );
}

function getCompressionSourceMessages(messages: Message[]) {
  return stripContextCompressionMessages(messages).filter((message) => message.content.trim());
}

function formatMessagesForContextCompression(messages: Message[], maxChars: number) {
  const sourceLimit = Math.max(60_000, Math.min(240_000, maxChars * 24));
  const source = messages
    .map((message) => {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "AI" : "系统";
      const time = message.createdAt ? `time: ${message.createdAt}\n` : "";
      return [`--- message ---`, `role: ${role}`, time ? time.trimEnd() : "", "content:", capText(message.content, 5000)]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  if (source.length <= sourceLimit) return source;
  return `（chat history 过长，以下优先保留靠后的旧剧情片段。）\n${source
    .slice(source.length - sourceLimit)
    .trimStart()}`;
}

function clampSummary(summary: string, maxChars: number) {
  const normalized = summary.trim();
  if (normalized.length <= maxChars) return normalized;
  const marker = "\n...\n";
  const headBudget = Math.max(600, Math.floor(maxChars * 0.35));
  const tailBudget = Math.max(600, maxChars - headBudget - marker.length);
  return `${normalized.slice(0, headBudget).trimEnd()}${marker}${normalized.slice(-tailBudget).trimStart()}`;
}

function getCompressorKey(config: ModelConfig | null) {
  if (!config) return "local";
  return ["model", config.id, config.baseUrl, config.model, config.maxTokens, config.updatedAt].join(":");
}

async function resolveContextCompressorConfig(configId: string | null, fallbackConfig: ModelConfig | null) {
  if (configId) {
    const stateConfig = useSettingsStore.getState().modelConfigs.find((config) => config.id === configId);
    const storedConfig = stateConfig ?? (await settingsRepository.getModelConfig(configId));
    if (storedConfig) return storedConfig;
  }
  return fallbackConfig;
}

async function buildModelContextCompressionSummary(
  messages: Message[],
  maxChars: number,
  compressorConfig: ModelConfig,
  userId?: string,
  signal?: AbortSignal,
) {
  const provider = createModelProvider(compressorConfig);
  const source = formatMessagesForContextCompression(messages, maxChars);
  const result = await provider.generate({
    messages: [
      {
        role: "system",
        content: [
          "你是“聊天历史上下文压缩器”。",
          "",
          "任务：",
          "只根据提供给你的 chat history 生成一份第三人称上下文摘要。不要读取、引用、改写或混入任何 system prompt、developer prompt、角色卡、用户设置、模型规则、应用配置或其他非 chat history 内容。",
          "",
          "输入说明：",
          "你收到的 chat history 已经由程序预处理，只包含需要被压缩的旧对话内容。",
          "不要假设还有其他未提供的对话。",
          "不要提及程序逻辑或保留策略。",
          "不要在输出中保留原文对话格式。",
          "",
          "摘要写法：",
          "1. 使用第三人称叙述。",
          "2. 按时间顺序整理事件。",
          "3. 必须尽量保留人物、地点、时间、行动、多人物同场互动、心理、关系或立场转变、身体状态、重要物品、未完成事项和伏笔。",
          "4. 如果同一空间内有多个人物，必须写清楚每个人的位置、行为和互动。",
          "5. 保留人物内心想法、情绪、犹豫、欲望、恐惧、态度变化，以及身体变化、姿势、外观、衣着、受伤、疲惫等会影响连续性的信息。",
          "",
          "压缩原则：",
          "1. 保留剧情连续性和人物状态，不要只写结论。",
          "2. 删除重复寒暄、无意义确认、格式噪音和不影响后续的细枝末节。",
          "3. 不要添加 chat history 中没有的信息。",
          "4. 不要替角色做新的决定。",
          "5. 不要改变人物关系、动机、时间线或事件因果。",
          "6. 如果原文信息不明确，用“似乎”“可能”“没有明确说明”等方式标记不确定性。",
          "7. 如果内容涉及不允许详细复述的违法或极端敏感内容，只保留必要的高层级剧情连续性，不写操作性、露骨或美化细节。",
          "",
          "输出格式：",
          "【压缩上下文】",
          "用第三人称、按时间顺序写成连贯摘要。",
          "",
          "【人物状态】",
          "列出主要人物当前所在地点、身体状态、心理状态、目标、与其他人物的关系。",
          "",
          "【地点与时间线】",
          "列出重要地点、事件先后顺序、当前时间点。",
          "",
          "【重要物品与伏笔】",
          "列出仍会影响后续剧情的物品、线索、承诺、威胁或未解决事件。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `请把以下 chat history 压缩为不超过 ${maxChars} 个中文字符的上下文摘要。`,
          "只输出摘要，不要输出解释。",
          "",
          "【chat history】",
          source,
        ].join("\n"),
      },
    ],
    model: compressorConfig.model,
    omitTemperature: shouldOmitTemperatureForModel(compressorConfig),
    temperature: Math.min(compressorConfig.temperature ?? 0.2, 0.3),
    maxTokens: Math.min(
      Math.max(1000, Math.ceil(maxChars / 1.4)),
      Math.max(1000, compressorConfig.maxTokens || 4096),
      8192,
    ),
    reasoningEffort: compressorConfig.reasoningEffort || undefined,
    userId,
    signal,
  });

  const summary = result.content.trim();
  if (!summary) throw new Error("Context compression API returned an empty summary.");
  return {
    summary: clampSummary(summary, maxChars),
    usage: result.usage,
  };
}

function createManualCompressionSegment(
  summary: string,
  sourceMessages: Message[],
  options: {
    compressorConfigId?: string | null;
    compressorKey: string;
    compressionMode: "local" | "model" | "fallback";
    memorySummaryMaxChars: number;
  },
): ChatMemorySegment {
  return {
    id: generateId(),
    index: 1,
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

function createCompressedHistoryMessage(chatId: string, summary: string, createdAt: string): Message {
  return {
    id: `context-compression-summary-${chatId}`,
    chatId,
    parentId: null,
    role: "system",
    content: summary,
    hidden: true,
    metadata: { hiddenReason: "context_compression_summary" },
    createdAt,
  };
}

export async function compressChatHistoryForPrompt(
  chatId: string,
  messages: Message[],
  signal?: AbortSignal,
): Promise<ContextCompressionResult> {
  const { memoryMessages, recentMessages } = splitMessagesByRecentAssistantTurns(
    messages,
    CONTEXT_COMPRESSION_PRESERVE_TURNS,
  );

  if (memoryMessages.length === 0) {
    return {
      status: "skipped",
      compressedMessageCount: 0,
      preservedMessageCount: recentMessages.length,
      reason: "not-enough-history",
    };
  }

  const sourceMessages = getCompressionSourceMessages(memoryMessages);
  if (sourceMessages.length === 0) {
    return {
      status: "skipped",
      compressedMessageCount: 0,
      preservedMessageCount: recentMessages.length,
      reason: "empty-history",
    };
  }

  const settings = useSettingsStore.getState();
  const maxChars = settings.memorySummaryMaxChars;
  const compressorConfig = await resolveContextCompressorConfig(settings.memoryCompressorConfigId, settings.modelConfig);
  const compressorKey = getCompressorKey(compressorConfig);
  let compressionMode: "local" | "model" | "fallback";
  let summary: string;

  if (compressorConfig) {
    try {
      const compressed = await buildModelContextCompressionSummary(
        sourceMessages,
        maxChars,
        compressorConfig,
        getChatScopedDeepSeekUserId(compressorConfig, chatId),
        signal,
      );
      summary = compressed.summary;
      compressionMode = "model";
      const compressedUsage = withDeepSeekUsageCost(compressed.usage, compressorConfig);
      void secondaryApiUsageRepository.create({
        chatId,
        source: "memory-compressor",
        label: "Manual Context Compression",
        modelConfigId: compressorConfig.id,
        model: compressorConfig.model,
        usage: compressedUsage,
      });
      void recordUsageCostAndWarn(compressedUsage);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      summary = buildLightweightMemorySummary(sourceMessages, maxChars);
      compressionMode = "fallback";
    }
  } else {
    summary = buildLightweightMemorySummary(sourceMessages, maxChars);
    compressionMode = "local";
  }

  const segment = createManualCompressionSegment(summary, sourceMessages, {
    compressorConfigId: compressorConfig?.id ?? null,
    compressorKey,
    compressionMode,
    memorySummaryMaxChars: maxChars,
  });
  const promptSummary = formatMemorySegmentsForPrompt([segment]);

  await chatMemoryRepository.upsert({
    chatId,
    summary: promptSummary,
    sourceHash: segment.sourceHash,
    sourceMessageCount: sourceMessages.length,
    compressorConfigId: compressorConfig?.id ?? null,
    compressorKey,
    compressionMode,
    memorySummaryMaxChars: maxChars,
    segments: [segment],
  });

  return {
    status: "compressed",
    compressedMessageCount: sourceMessages.length,
    preservedMessageCount: recentMessages.length,
    compressionMode,
    summary: promptSummary,
  };
}

export async function buildStoredContextCompressionPromptPlan(
  chatId: string,
  historyMessages: Message[],
): Promise<ContextCompressionPromptPlan> {
  const { memoryMessages, recentMessages } = splitMessagesByRecentAssistantTurns(
    historyMessages,
    CONTEXT_COMPRESSION_PRESERVE_TURNS,
  );

  if (memoryMessages.length === 0) {
    return { recentMessages: historyMessages, memoryBlock: null, compressedMessageCount: 0 };
  }

  const sourceMessages = getCompressionSourceMessages(memoryMessages);
  const cached = await chatMemoryRepository.get(chatId);
  const cachedMessageCount = Math.max(0, Math.min(cached?.sourceMessageCount ?? 0, sourceMessages.length));
  const cachedPrefixMessages = cachedMessageCount > 0 ? sourceMessages.slice(0, cachedMessageCount) : [];
  const cacheReusable =
    !!cached &&
    cachedMessageCount > 0 &&
    cached.summary.trim().length > 0 &&
    cached.sourceHash === hashMessages(cachedPrefixMessages);

  if (!cacheReusable) {
    return { recentMessages: historyMessages, memoryBlock: null, compressedMessageCount: 0 };
  }

  return {
    recentMessages: [
      createCompressedHistoryMessage(chatId, cached.summary, cached.updatedAt),
      ...sourceMessages.slice(cachedMessageCount),
      ...recentMessages,
    ],
    memoryBlock: null,
    compressedMessageCount: cachedMessageCount,
  };
}
