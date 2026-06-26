import { useCallback } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { generationTaskRunner } from "@/app/generation-task-runner";
import { getBackend } from "@/platform";
import { useChatStore } from "../chat.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import {
  agenticPlayStateRepository,
  chatMemoryRepository,
  presetRepository,
  secondaryApiUsageRepository,
  settingsRepository,
} from "@/db/repositories";
import {
  buildLightweightMemorySummary,
  countMemoryTurns,
  createMemoryContextBlock,
  formatMemorySegmentsForPrompt,
  hashMessages,
  splitMessagesByRecentTurns,
} from "../memory";
import {
  createGeneratingImages,
  extractImageMarkers,
  generateComfyImage,
  normalizeImageSettings,
  planImageMarkersWithModel,
  type ImagePlannerWorldbookReference,
} from "@/features/image-generation/image-generation";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { getChatScopedDeepSeekUserId, shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import {
  createAgenticPlayContextBlock,
  generateAgenticPlayTurn,
  type AgenticActionOption,
  type AgenticGameState,
} from "@/features/agentic-play/agentic-play";
import { getAgenticPlayPresetItems } from "@/features/agentic-play/agentic-preset";
import {
  applyRegexRules,
  buildChatPrompt,
  createModelProvider,
  estimateTokens,
  stripPromptContent,
  WorldbookContributor,
} from "@neo-tavern/core";
import type { Character, BuiltPrompt, ContextBlock, GenerateMessage, Message, ModelConfig } from "@neo-tavern/shared";
import type { ChatMemory, ChatMemorySegment } from "@/db/repositories";
import type { GenerationPhase } from "../chat.types";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import {
  createHealthyModeContextBlock,
  checkHealthyModeOutput,
  detectExplicitContent,
  detectFlood,
  filterNsfwItems,
  NSFW_ITEM_NAME,
  HEALTHY_MODE_BLOCKED_PLACEHOLDER,
  HEALTHY_MODE_FLOOD_PLACEHOLDER,
} from "@/features/healthy-mode/healthy-mode";

interface UseSendMessageOptions {
  character: Character | undefined;
  chatId: string | undefined;
  agenticPlayEnabled?: boolean;
  onAgenticPlayStateUpdated?: (state: AgenticGameState) => void;
  onPromptBuilt?: (built: BuiltPrompt) => void;
}

interface SendMessageOptions {
  hiddenUserMessage?: boolean;
  hiddenReason?: string;
  metadata?: Message["metadata"];
}

interface UseSendMessageReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  regenerate: () => Promise<void>;
  abort: () => void;
  sending: boolean;
  sendingChatId: string | null;
  streamingMessageId: string | null;
  generationPhase: GenerationPhase | null;
  error: string | null;
  clearError: () => void;
}

const activeImageGenerations = new Map<string, { controller: AbortController; token: string }>();

const LOCAL_MEMORY_COMPRESSOR_KEY = "local";
const MEMORY_COMPACTION_BATCH_TURNS = 4;
const MEMORY_COMPACTION_BATCH_MIN_CHARS = 6000;
const EMPTY_ASSISTANT_RETRY_LIMIT = 1;
const EMPTY_ASSISTANT_RETRY_MESSAGE = [
  "上一轮模型回复没有生成可显示的正文，Whale Play 正在自动重试。",
  "请重新生成当前这一轮角色回复，必须包含非空正文。",
  "如果当前预设要求使用 <content></content>，请把完整正文写在这个标签内。",
  "不要解释重试原因，不要输出道歉，只输出符合当前角色与预设格式的回复。",
].join("\n");

type DebugPromptTrigger = "send" | "continue" | "regenerate" | "retry";

interface DebugPromptContext {
  chatId: string;
  characterId: string;
  characterName: string;
  contextTokens: number;
  round: number;
  assistantMessageId: string;
  baseTrigger: Exclude<DebugPromptTrigger, "retry">;
  hiddenUserMessage: boolean;
}

interface SavedDebugPrompt {
  round: number;
  attempt: number;
  trigger: DebugPromptTrigger;
  baseTrigger: Exclude<DebugPromptTrigger, "retry">;
  folder: string;
  filename: string;
  path: string;
}

function sanitizeDebugPathPart(value: string, fallback: string) {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || fallback;
}

function shortDebugId(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "unknown";
}

function getNextDebugRound(messages: Message[]) {
  return messages.filter((message) => message.role === "assistant" && message.usage).length + 1;
}

function notifyDebugPromptSaveFailed(error: unknown) {
  const toast = typeof window !== "undefined" ? window.__toast : null;
  const message = (error as Error).message || "Unknown error";
  if (toast) toast("error", `Debug prompt save failed: ${message}`);
}

function isAbortError(error: unknown) {
  return (error as Error).name === "AbortError";
}

function withDebugUsage(
  usage: Message["usage"] | undefined,
  debugPrompt?: SavedDebugPrompt,
): Message["usage"] | undefined {
  if (!debugPrompt) return usage;
  return {
    ...(usage ?? {}),
    debugRound: debugPrompt.round,
    debugAttempt: debugPrompt.attempt,
    debugTrigger: debugPrompt.trigger,
    debugBaseTrigger: debugPrompt.baseTrigger,
    debugPromptFolder: debugPrompt.folder,
    debugPromptFilename: debugPrompt.filename,
    debugPromptPath: debugPrompt.path,
  };
}

function cancelImageGeneration(messageId: string) {
  const active = activeImageGenerations.get(messageId);
  if (!active) return;
  active.controller.abort();
  activeImageGenerations.delete(messageId);
}

function beginImageGeneration(messageId: string) {
  cancelImageGeneration(messageId);
  const run = {
    controller: new AbortController(),
    token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  activeImageGenerations.set(messageId, run);
  return run;
}

function isCurrentImageGeneration(messageId: string, token: string) {
  const active = activeImageGenerations.get(messageId);
  return !!active && active.token === token && !active.controller.signal.aborted;
}

function finishImageGeneration(messageId: string, token: string) {
  if (activeImageGenerations.get(messageId)?.token === token) {
    activeImageGenerations.delete(messageId);
  }
}

async function notifyAssistantOutputComplete(characterName?: string) {
  const toast = typeof window !== "undefined" ? window.__toast : null;
  const name = characterName?.trim();
  const message = name ? `${name} 的回复已生成` : "AI 回复已生成";
  const shouldUseSystemNotification =
    typeof document !== "undefined" && (document.visibilityState !== "visible" || !document.hasFocus());

  if (shouldUseSystemNotification) {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }
      if (permissionGranted) {
        sendNotification({
          title: "Whale Play",
          body: message,
        });
        return;
      }
    } catch {
      // Fall back to the in-app toast when native notifications are unavailable.
    }
  }

  if (toast) toast("success", message);
}

function capText(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

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

function getMemoryCompressorKey(config: ModelConfig | null) {
  if (!config) return LOCAL_MEMORY_COMPRESSOR_KEY;
  return ["model", config.id, config.baseUrl, config.model, config.maxTokens, config.updatedAt].join(":");
}

async function resolveMemoryCompressorConfig(configId: string | null) {
  if (!configId) return null;
  const stateConfig = useSettingsStore.getState().modelConfigs.find((config) => config.id === configId);
  return stateConfig ?? settingsRepository.getModelConfig(configId);
}

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

async function buildModelMemorySummary(
  messages: Message[],
  maxChars: number,
  compressorConfig: ModelConfig,
  userId?: string,
  signal?: AbortSignal,
): Promise<{ summary: string; usage?: Message["usage"] }> {
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

async function saveDebugPromptFile(
  debugContext: DebugPromptContext,
  built: BuiltPrompt,
  messages: GenerateMessage[],
  trigger: DebugPromptTrigger,
  attempt: number,
  userId?: string,
): Promise<SavedDebugPrompt> {
  const characterFolder = sanitizeDebugPathPart(debugContext.characterName, "character");
  const folder = `${characterFolder}_${shortDebugId(debugContext.chatId)}`;
  const roundStr = String(debugContext.round).padStart(4, "0");
  const filename = `round_${roundStr}_${trigger}_attempt_${attempt}_${shortDebugId(debugContext.assistantMessageId)}.json`;

  const debugPayload = {
    round: debugContext.round,
    usageRow: debugContext.round,
    trigger,
    baseTrigger: debugContext.baseTrigger,
    attempt,
    hiddenUserMessage: debugContext.hiddenUserMessage,
    assistantMessageId: debugContext.assistantMessageId,
    chatId: debugContext.chatId,
    characterId: debugContext.characterId,
    characterName: debugContext.characterName,
    contextTokens: debugContext.contextTokens,
    deepSeekUserId: userId,
    debugPromptFolder: folder,
    debugPromptFilename: filename,
    timestamp: new Date().toISOString(),
    messageCount: messages.length,
    estimatedTokens: estimateTokens(messages),
    contextBlocks: built.includedContextBlocks.map((block) => ({
      id: block.id,
      source: block.source,
      title: block.title,
      position: block.position,
      priority: block.priority,
      contentLength: block.content.length,
    })),
    messages,
  };

  const path = await getBackend().file.saveDebugPrompt(folder, filename, JSON.stringify(debugPayload, null, 2));

  return {
    round: debugContext.round,
    attempt,
    trigger,
    baseTrigger: debugContext.baseTrigger,
    folder,
    filename,
    path,
  };
}

export function useSendMessage({
  character,
  chatId,
  agenticPlayEnabled = false,
  onAgenticPlayStateUpdated,
  onPromptBuilt,
}: UseSendMessageOptions): UseSendMessageReturn {
  const addMessage = useChatStore((s) => s.addMessage);
  const patchMessage = useChatStore((s) => s.patchMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const ensureMessagesHydrated = useChatStore((s) => s.ensureMessagesHydrated);
  const getActivePath = useChatStore((s) => s.getActivePath);
  const activeChatGeneration = useChatStore((s) => (chatId ? s.activeGenerations[chatId] : undefined));
  const beginSending = useChatStore((s) => s.beginSending);
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId);
  const setGenerationPhase = useChatStore((s) => s.setGenerationPhase);
  const finishSending = useChatStore((s) => s.finishSending);
  const generationError = useChatStore((s) => (chatId ? (s.generationErrors[chatId] ?? null) : null));
  const setGenerationError = useChatStore((s) => s.setGenerationError);
  const sending = !!activeChatGeneration;
  const sendingChatId = sending ? (chatId ?? null) : null;
  const streamingMessageId = activeChatGeneration?.streamingMessageId ?? null;
  const generationPhase = activeChatGeneration?.generationPhase ?? null;
  const error = generationError;

  const setChatError = useCallback(
    (targetChatId: string | null | undefined, message: string | null) => {
      if (targetChatId) setGenerationError(targetChatId, message);
    },
    [setGenerationError],
  );

  const abort = useCallback(() => {
    if (!chatId) return;
    generationTaskRunner.abort(`chat:${chatId}`);
    finishSending(chatId);
  }, [chatId, finishSending]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isGenerationActive = (controller: AbortController) => !controller.signal.aborted;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stripMessages = (msgs: Message[]): Message[] => {
    const rules = useSettingsStore.getState().getActiveRegexRules() ?? [];
    return msgs.map((m) => (m.role === "assistant" ? { ...m, content: stripPromptContent(m.content, rules) } : m));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const removeEmptyStreamingDraft = async (draftId: string | null) => {
    if (!draftId) return;
    const draft = useChatStore.getState().messages.find((m) => m.id === draftId);
    if (draft && !draft.content.trim() && !draft.reasoningContent?.trim()) {
      await deleteMessage(draftId);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getWorldbookContextBlocks = async (userInput: string, recentMessages: Message[]) => {
    const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
    if (!character) return [];
    const worldbookId = character.worldbookId || activeWorldbookId;
    if (!worldbookId) return [];
    const wb = worldbooks.find((w) => w.id === worldbookId);
    if (!wb || wb.entries.length === 0) return [];
    const contributor = new WorldbookContributor();
    contributor.setEntries(wb.entries);
    return contributor.contribute({
      character,
      recentMessages,
      userInput,
    });
  };

  const getImagePlannerWorldbookReferences = async (content: string): Promise<ImagePlannerWorldbookReference[]> => {
    const imageSettings = useSettingsStore.getState().imageGeneration;
    if (!imageSettings.worldbookReferenceEnabled || !character) return [];

    const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
    const worldbookId = character.worldbookId || activeWorldbookId;
    if (!worldbookId) return [];

    const wb = worldbooks.find((w) => w.id === worldbookId);
    if (!wb || wb.entries.length === 0) return [];

    const contributor = new WorldbookContributor();
    contributor.setEntries(wb.entries);
    const blocks = await contributor.contribute({
      character,
      recentMessages: [],
      userInput: content,
    });

    return blocks.slice(0, 8).map((block) => ({
      title: block.title,
      content: capText(block.content, 1200),
    }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getMemoryPromptPlan = async (
    historyMessages: Message[],
    targetChatId: string,
    signal?: AbortSignal,
  ): Promise<{ recentMessages: Message[]; memoryBlock: ContextBlock | null }> => {
    const settings = useSettingsStore.getState();
    if (!settings.lightweightMemoryEnabled) {
      return { recentMessages: historyMessages, memoryBlock: null };
    }

    const { memoryMessages, recentMessages } = splitMessagesByRecentTurns(historyMessages, settings.promptRecentTurns);
    if (memoryMessages.length === 0) {
      return { recentMessages, memoryBlock: null };
    }

    const memorySourceMessages = stripMessages(memoryMessages) as Message[];
    const compressorConfig = await resolveMemoryCompressorConfig(settings.memoryCompressorConfigId);
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
          const compressed = await buildModelMemorySummary(
            messagesToSummarize,
            settings.memorySummaryMaxChars,
            compressorConfig,
            getChatScopedDeepSeekUserId(compressorConfig, targetChatId),
            signal,
          );
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
  };

  const hasVisibleAssistantBody = (content: string) => {
    if (!content.trim()) return false;
    const rules = useSettingsStore.getState().getActiveRegexRules();
    if (!rules || rules.length === 0) return content.trim().length > 0;
    try {
      return applyRegexRules(content, rules).displayContent.trim().length > 0;
    } catch {
      return content.trim().length > 0;
    }
  };

  const throwGenerationStopped = () => {
    const err = new Error("Generation stopped");
    err.name = "AbortError";
    throw err;
  };

  const getAttemptMessages = (built: BuiltPrompt, retrying: boolean) => {
    if (!retrying) return built.messages;
    return [...built.messages, { role: "system" as const, content: EMPTY_ASSISTANT_RETRY_MESSAGE }];
  };

  const generateAssistantOnce = async (
    targetChatId: string,
    assistantId: string,
    built: BuiltPrompt,
    modelConfig: ModelConfig,
    controller: AbortController,
    retrying: boolean,
    attempt: number,
    debugContext?: DebugPromptContext,
  ): Promise<{
    content: string;
    agenticOptions?: AgenticActionOption[];
    reasoningContent: string;
    usage?: Message["usage"];
    generateDuration: number;
    thinkingDuration: number;
  }> => {
    const provider = createModelProvider(modelConfig);
    const genStart = Date.now();
    let nextContent = "";
    let nextReasoningContent = "";
    let nextUsage: Message["usage"] | undefined;
    let thinkingDuration: number | undefined;
    const showLiveText = modelConfig.streamingEnabled !== false;
    const attemptMessages = getAttemptMessages(built, retrying);
    const userId = getChatScopedDeepSeekUserId(modelConfig, targetChatId);
    let debugPrompt: SavedDebugPrompt | undefined;

    if (debugContext) {
      try {
        debugPrompt = await saveDebugPromptFile(
          debugContext,
          built,
          attemptMessages,
          retrying ? "retry" : debugContext.baseTrigger,
          attempt,
          userId,
        );
      } catch (err) {
        notifyDebugPromptSaveFailed(err);
      }
    }

    setGenerationPhase(targetChatId, retrying ? "retrying" : "thinking");
    await patchMessage(
      assistantId,
      {
        content: "",
        reasoningContent: undefined,
        generateDuration: undefined,
        thinkingDuration: undefined,
        usage: undefined,
        agenticOptions: undefined,
      },
      { persist: false },
    );

    if (provider.streamGenerate) {
      for await (const chunk of provider.streamGenerate({
        messages: attemptMessages,
        model: modelConfig.model,
        omitTemperature: shouldOmitTemperatureForModel(modelConfig),
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        reasoningEffort: modelConfig.reasoningEffort || undefined,
        userId,
        signal: controller.signal,
      })) {
        if (!isGenerationActive(controller)) throwGenerationStopped();
        if (chunk.reasoningContentDelta) {
          nextReasoningContent += chunk.reasoningContentDelta;
          if (useChatStore.getState().activeGenerations[targetChatId]?.generationPhase !== "writing") {
            setGenerationPhase(targetChatId, retrying ? "retrying" : "thinking");
          }
        }
        if (chunk.contentDelta) {
          thinkingDuration ??= Date.now() - genStart;
          nextContent += chunk.contentDelta;
          setGenerationPhase(targetChatId, "writing");
        }
        if (chunk.usage) nextUsage = chunk.usage;
        if (chunk.reasoningContentDelta || chunk.contentDelta || chunk.usage) {
          await patchMessage(
            assistantId,
            {
              content: showLiveText ? nextContent : "",
              reasoningContent: nextReasoningContent || undefined,
              thinkingDuration,
              usage: nextUsage,
            },
            { persist: false },
          );
        }
      }
    } else {
      const result = await provider.generate({
        messages: attemptMessages,
        model: modelConfig.model,
        omitTemperature: shouldOmitTemperatureForModel(modelConfig),
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        reasoningEffort: modelConfig.reasoningEffort || undefined,
        userId,
        signal: controller.signal,
      });
      if (!isGenerationActive(controller)) throwGenerationStopped();
      thinkingDuration = Date.now() - genStart;
      setGenerationPhase(targetChatId, "writing");
      await patchMessage(
        assistantId,
        {
          content: "",
          reasoningContent: result.reasoningContent || undefined,
          thinkingDuration,
          usage: result.usage,
        },
        { persist: false },
      );
      nextContent = result.content;
      nextReasoningContent = result.reasoningContent ?? "";
      nextUsage = result.usage;
    }

    thinkingDuration ??= Date.now() - genStart;
    return {
      content: nextContent,
      reasoningContent: nextReasoningContent,
      usage: withDebugUsage(withDeepSeekUsageCost(nextUsage, modelConfig), debugPrompt),
      generateDuration: Date.now() - genStart,
      thinkingDuration,
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generateAssistantWithEmptyRetry = async (
    targetChatId: string,
    assistantId: string,
    built: BuiltPrompt,
    modelConfig: ModelConfig,
    controller: AbortController,
    debugContext?: DebugPromptContext,
  ): Promise<string> => {
    for (let attempt = 0; attempt <= EMPTY_ASSISTANT_RETRY_LIMIT; attempt++) {
      const attemptNumber = attempt + 1;
      const result = await generateAssistantOnce(
        targetChatId,
        assistantId,
        built,
        modelConfig,
        controller,
        attempt > 0,
        attemptNumber,
        debugContext,
      );
      void recordUsageCostAndWarn(result.usage);

      if (hasVisibleAssistantBody(result.content)) {
        await patchMessage(assistantId, {
          content: result.content,
          reasoningContent: result.reasoningContent || undefined,
          generateDuration: result.generateDuration,
          thinkingDuration: result.thinkingDuration,
          usage: result.usage,
        });
        return result.content;
      }

      if (attempt < EMPTY_ASSISTANT_RETRY_LIMIT) {
        setGenerationPhase(targetChatId, "retrying");
        await patchMessage(
          assistantId,
          {
            content: "",
            reasoningContent: undefined,
            generateDuration: undefined,
            thinkingDuration: result.thinkingDuration,
            usage: result.usage,
          },
          { persist: false },
        );
        continue;
      }

      await deleteMessage(assistantId);
      setStreamingMessageId(targetChatId, null);
      throw new Error("AI returned an empty body after automatic retry.");
    }
    return "";
  };

  const generateAgenticAssistantOnce = async (
    targetChatId: string,
    assistantId: string,
    built: BuiltPrompt,
    modelConfig: ModelConfig,
    initialGameState: AgenticGameState,
    controller: AbortController,
    retrying: boolean,
    attempt: number,
    debugContext?: DebugPromptContext,
  ): Promise<{
    content: string;
    agenticOptions?: AgenticActionOption[];
    reasoningContent: string;
    usage?: Message["usage"];
    generateDuration: number;
    thinkingDuration: number;
    gameState: AgenticGameState;
  }> => {
    const provider = createModelProvider(modelConfig);
    const genStart = Date.now();
    const userId = getChatScopedDeepSeekUserId(modelConfig, targetChatId);
    let nextContent = "";
    let nextReasoningContent = "";
    let thinkingDuration: number | undefined;
    const showLiveText = modelConfig.streamingEnabled !== false;
    let debugPrompt: SavedDebugPrompt | undefined;

    if (debugContext) {
      try {
        debugPrompt = await saveDebugPromptFile(
          debugContext,
          built,
          getAttemptMessages(built, retrying),
          retrying ? "retry" : debugContext.baseTrigger,
          attempt,
          userId,
        );
      } catch (err) {
        notifyDebugPromptSaveFailed(err);
      }
    }

    setGenerationPhase(targetChatId, retrying ? "retrying" : "thinking");
    await patchMessage(
      assistantId,
      {
        content: "",
        reasoningContent: undefined,
        generateDuration: undefined,
        thinkingDuration: undefined,
        usage: undefined,
        agenticOptions: undefined,
      },
      { persist: false },
    );

    const result = await generateAgenticPlayTurn({
      provider,
      modelConfig,
      builtPrompt: {
        ...built,
        messages: getAttemptMessages(built, retrying),
      },
      character: character!,
      gameState: initialGameState,
      userId,
      signal: controller.signal,
      onToolRound: () => {
        setGenerationPhase(targetChatId, retrying ? "retrying" : "thinking");
      },
      onDiceResult: (result) => {
        useChatStore.getState().setLastDiceResult(result);
      },
      onFinalRound: () => {
        setGenerationPhase(targetChatId, "writing");
      },
      onContentDelta: async (delta) => {
        if (!isGenerationActive(controller)) throwGenerationStopped();
        thinkingDuration ??= Date.now() - genStart;
        nextContent += delta;
        setGenerationPhase(targetChatId, "writing");
        await patchMessage(
          assistantId,
          {
            content: showLiveText ? nextContent : "",
            reasoningContent: nextReasoningContent || undefined,
            thinkingDuration,
          },
          { persist: false },
        );
      },
      onReasoningDelta: async (delta) => {
        if (!isGenerationActive(controller)) throwGenerationStopped();
        nextReasoningContent += delta;
        await patchMessage(
          assistantId,
          {
            content: showLiveText ? nextContent : "",
            reasoningContent: nextReasoningContent || undefined,
            thinkingDuration,
          },
          { persist: false },
        );
      },
      onContentReset: async () => {
        nextContent = "";
        await patchMessage(
          assistantId,
          {
            content: "",
            reasoningContent: nextReasoningContent || undefined,
            thinkingDuration,
            agenticOptions: undefined,
          },
          { persist: false },
        );
      },
      requirePlayerOptions: true,
    });

    if (!isGenerationActive(controller)) throwGenerationStopped();

    thinkingDuration ??= Date.now() - genStart;
    const usage = withDebugUsage(withDeepSeekUsageCost(result.usage, modelConfig), debugPrompt);
    return {
      content: result.content,
      agenticOptions: result.agenticOptions,
      reasoningContent: result.reasoningContent ?? nextReasoningContent,
      usage,
      generateDuration: Date.now() - genStart,
      thinkingDuration,
      gameState: result.gameState,
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generateAgenticAssistantWithEmptyRetry = async (
    targetChatId: string,
    assistantId: string,
    built: BuiltPrompt,
    modelConfig: ModelConfig,
    initialGameState: AgenticGameState,
    controller: AbortController,
    debugContext?: DebugPromptContext,
  ): Promise<string> => {
    let currentState = initialGameState;
    for (let attempt = 0; attempt <= EMPTY_ASSISTANT_RETRY_LIMIT; attempt++) {
      const attemptNumber = attempt + 1;
      const result = await generateAgenticAssistantOnce(
        targetChatId,
        assistantId,
        built,
        modelConfig,
        currentState,
        controller,
        attempt > 0,
        attemptNumber,
        debugContext,
      );
      currentState = result.gameState;
      void recordUsageCostAndWarn(result.usage);

      if (hasVisibleAssistantBody(result.content)) {
        if (character) {
          await agenticPlayStateRepository.updateState(targetChatId, character, result.gameState);
          onAgenticPlayStateUpdated?.(result.gameState);
        }
        await patchMessage(assistantId, {
          content: result.content,
          agenticOptions: result.agenticOptions,
          reasoningContent: result.reasoningContent || undefined,
          generateDuration: result.generateDuration,
          thinkingDuration: result.thinkingDuration,
          usage: result.usage,
        });
        return result.content;
      }

      if (attempt < EMPTY_ASSISTANT_RETRY_LIMIT) {
        setGenerationPhase(targetChatId, "retrying");
        await patchMessage(
          assistantId,
          {
            content: "",
            reasoningContent: undefined,
            generateDuration: undefined,
            thinkingDuration: result.thinkingDuration,
            usage: result.usage,
            agenticOptions: undefined,
          },
          { persist: false },
        );
        continue;
      }

      await deleteMessage(assistantId);
      setStreamingMessageId(targetChatId, null);
      throw new Error("Agentic Play returned an empty body after automatic retry.");
    }
    return "";
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const processImageGeneration = async (targetChatId: string, assistantId: string, content: string) => {
    const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
    if (!settings.enabled || settings.mode !== "auto" || settings.maxImages <= 0 || !settings.comfyWorkflowJson.trim())
      return;

    const imageRun = beginImageGeneration(assistantId);
    const imageToken = imageRun.token;
    const imageSignal = imageRun.controller.signal;
    const isCurrent = () => isCurrentImageGeneration(assistantId, imageToken);

    try {
      let nextContent = content;
      let markers = extractImageMarkers(nextContent, settings.maxImages);

      if (markers.length === 0) {
        const plannerConfig = settings.plannerConfigId
          ? await resolveMemoryCompressorConfig(settings.plannerConfigId)
          : null;
        if (!plannerConfig) return;

        const planned = await planImageMarkersWithModel({
          content: nextContent,
          settings,
          plannerConfig,
          worldbookReferences: await getImagePlannerWorldbookReferences(nextContent),
          userId: getChatScopedDeepSeekUserId(plannerConfig, targetChatId),
          signal: imageSignal,
        });
        if (!isCurrent()) return;

        const plannedUsage = withDeepSeekUsageCost(planned.usage, plannerConfig);
        void secondaryApiUsageRepository.create({
          chatId: targetChatId,
          source: "image-planner",
          label: "Auto Image Planning",
          modelConfigId: plannerConfig.id,
          model: plannerConfig.model,
          usage: plannedUsage,
        });
        void recordUsageCostAndWarn(plannedUsage);

        nextContent = planned.content;
        markers = extractImageMarkers(nextContent, settings.maxImages);
        if (nextContent !== content) {
          await patchMessage(assistantId, { content: nextContent });
        }
      }

      if (markers.length === 0 || !isCurrent()) return;

      let images = createGeneratingImages(markers);
      await patchMessage(assistantId, { images });

      for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        try {
          const src = await generateComfyImage(marker.prompt, settings, imageSignal);
          if (!isCurrent()) return;
          const latestImages =
            useChatStore.getState().messages.find((message) => message.id === assistantId)?.images ?? images;
          images = latestImages.map((image, index) => {
            if (index !== i) return image;
            if (image.status === "deleted") return image;
            return { ...image, status: "done" as const, src, error: undefined, updatedAt: new Date().toISOString() };
          });
        } catch (err) {
          if (isAbortError(err) || !isCurrent()) return;
          const latestImages =
            useChatStore.getState().messages.find((message) => message.id === assistantId)?.images ?? images;
          images = latestImages.map((image, index) => {
            if (index !== i) return image;
            if (image.status === "deleted") return image;
            return {
              ...image,
              status: "error" as const,
              error: (err as Error).message || "Image generation failed",
              updatedAt: new Date().toISOString(),
            };
          });
        }
        if (!isCurrent()) return;
        await patchMessage(assistantId, { images });
      }
    } catch (err) {
      if (isAbortError(err) || !isCurrent()) return;
      setChatError(targetChatId, (err as Error).message || "Image generation failed");
    } finally {
      finishImageGeneration(assistantId, imageToken);
    }
  };

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      const trimmedContent = content.trim();
      const targetChatId = chatId;
      const targetCharacter = character;
      if (!trimmedContent || !targetChatId || !targetCharacter) return;

      return generationTaskRunner.startExclusive(`chat:${targetChatId}`, async ({ controller, isCurrent }) => {
        const chatId = targetChatId;
        const character = targetCharacter;
        let assistantId: string | null = null;
        beginSending(chatId);
        setChatError(chatId, null);

        // Healthy mode: block explicit user input before sending
        const healthyMode = useSettingsStore.getState().healthyMode;
        if (healthyMode) {
          const explicitMatch = detectExplicitContent(trimmedContent);
          if (explicitMatch) {
            setChatError(chatId, "健康模式：检测到不当输入，消息已被拦截。");
            finishSending(chatId);
            return;
          }
        }

        try {
          const activePath = getActivePath(chatId);
          const lastMessageId = activePath.length > 0 ? activePath[activePath.length - 1].id : null;

          const userMsg = await addMessage({
            chatId,
            parentId: lastMessageId,
            role: "user",
            content: trimmedContent,
            hidden: !!options.hiddenUserMessage,
            metadata:
              options.metadata ??
              (options.hiddenUserMessage ? { hiddenReason: options.hiddenReason ?? "hidden" } : undefined),
          });

          const recentMessages = await ensureMessagesHydrated(chatId);
          const contextTokens = useSettingsStore.getState().contextTokens ?? 64000;

          const activePresetId = await presetRepository.getActivePresetId();
          let presetItems: { role: "system" | "user"; content: string; injectionOrder: number }[] | undefined;
          if (activePresetId) {
            const preset = await presetRepository.getById(activePresetId);
            if (preset) {
              presetItems = preset.items
                .filter((i) => i.enabled)
                .filter((i) => !useSettingsStore.getState().healthyMode || i.name !== NSFW_ITEM_NAME)
                .map((i) => ({
                  role: i.role,
                  content: i.content,
                  injectionOrder: i.injectionOrder,
                }));
            }
          }

          const historyMessages = recentMessages.slice(0, -1);
          const memoryPlan = await getMemoryPromptPlan(historyMessages, chatId, controller.signal);
          const worldbookBlocks = await getWorldbookContextBlocks(trimmedContent, stripMessages(recentMessages));
          const agenticRecord =
            agenticPlayEnabled && character
              ? await agenticPlayStateRepository.getOrCreate(chatId, character, true)
              : null;
          const agenticBlock = agenticRecord ? createAgenticPlayContextBlock(agenticRecord.gameState) : null;
          const contextBlocks = [memoryPlan.memoryBlock, agenticBlock, ...worldbookBlocks].filter(
            Boolean,
          ) as ContextBlock[];
          // Healthy mode: inject high-priority safety prompt
          if (useSettingsStore.getState().healthyMode) {
            contextBlocks.push(createHealthyModeContextBlock());
          }
          const effectivePresetItems = agenticRecord ? await getAgenticPlayPresetItems() : presetItems;

          const built = buildChatPrompt({
            character,
            recentMessages: stripMessages(memoryPlan.recentMessages) as Message[],
            userInput: trimmedContent,
            maxTotalTokens: contextTokens,
            presetItems: effectivePresetItems,
            contextBlocks,
            userName: useSettingsStore.getState().personaName,
          });

          if (onPromptBuilt) {
            onPromptBuilt(built);
          }

          const modelConfig = useSettingsStore.getState().modelConfig;
          if (!modelConfig) {
            throw new Error("Model not configured. Please set up API settings first.");
          }

          const assistant = await addMessage({
            chatId,
            parentId: userMsg.id,
            role: "assistant",
            content: "",
          });
          assistantId = assistant.id;
          setStreamingMessageId(chatId, assistant.id);
          const debugContext: DebugPromptContext | undefined = useSettingsStore.getState().debugMode
            ? {
                chatId,
                characterId: character.id,
                characterName: character.name,
                contextTokens,
                round: getNextDebugRound(recentMessages),
                assistantMessageId: assistant.id,
                baseTrigger: options.hiddenUserMessage ? "continue" : "send",
                hiddenUserMessage: !!options.hiddenUserMessage,
              }
            : undefined;
          const finalContent =
            agenticRecord && agenticPlayEnabled
              ? await generateAgenticAssistantWithEmptyRetry(
                  chatId,
                  assistant.id,
                  built,
                  modelConfig,
                  agenticRecord.gameState,
                  controller,
                  debugContext,
                )
              : await generateAssistantWithEmptyRetry(
                  chatId,
                  assistant.id,
                  built,
                  modelConfig,
                  controller,
                  debugContext,
                );
          if (!isCurrent() || !isGenerationActive(controller)) {
            await removeEmptyStreamingDraft(assistant.id);
            return;
          }
          // Healthy mode: check AI output for violations
          if (useSettingsStore.getState().healthyMode) {
            const violation = checkHealthyModeOutput(finalContent, recentMessages);
            if (violation) {
              const placeholder =
                violation.type === "flood" ? HEALTHY_MODE_FLOOD_PLACEHOLDER : HEALTHY_MODE_BLOCKED_PLACEHOLDER;
              await patchMessage(assistant.id, { content: placeholder, reasoningContent: undefined });
              setChatError(
                chatId,
                violation.type === "flood"
                  ? "健康模式：检测到输出重复异常，已终止。"
                  : "健康模式：检测到不当内容，回复已被拦截。",
              );
              void notifyAssistantOutputComplete(character.name);
              await removeEmptyStreamingDraft(assistant.id);
              return;
            }
          }
          void notifyAssistantOutputComplete(character.name);
          void processImageGeneration(chatId, assistant.id, finalContent);
          await removeEmptyStreamingDraft(assistant.id);
        } catch (err) {
          await removeEmptyStreamingDraft(assistantId);
          if ((err as Error).name === "AbortError" || controller.signal.aborted) {
            if (isCurrent()) setChatError(chatId, "Generation stopped");
          } else if (isCurrent()) {
            setChatError(chatId, (err as Error).message || "Failed to send message");
          }
        } finally {
          if (isCurrent()) finishSending(chatId);
        }
      });
    },
    [
      character,
      chatId,
      addMessage,
      ensureMessagesHydrated,
      agenticPlayEnabled,
      onPromptBuilt,
      getActivePath,
      beginSending,
      setStreamingMessageId,
      getMemoryPromptPlan,
      getWorldbookContextBlocks,
      stripMessages,
      generateAgenticAssistantWithEmptyRetry,
      generateAssistantWithEmptyRetry,
      isGenerationActive,
      processImageGeneration,
      removeEmptyStreamingDraft,
      setChatError,
      finishSending,
    ],
  );

  const clearError = useCallback(() => setChatError(chatId, null), [chatId, setChatError]);

  const regenerate = useCallback(async () => {
    const targetChatId = chatId;
    const targetCharacter = character;
    if (!targetChatId || !targetCharacter) return;

    return generationTaskRunner.startExclusive(`chat:${targetChatId}`, async ({ controller, isCurrent }) => {
      const chatId = targetChatId;
      const character = targetCharacter;
      beginSending(chatId);
      setChatError(chatId, null);
      let assistantId: string | null = null;

      try {
        const allMessages = await ensureMessagesHydrated(chatId);

        let lastAssistantIdx = -1;
        for (let i = allMessages.length - 1; i >= 0; i--) {
          if (allMessages[i].role === "assistant") {
            lastAssistantIdx = i;
            break;
          }
        }
        if (lastAssistantIdx < 0) {
          setChatError(chatId, "No AI response to regenerate");
          return;
        }

        const lastAssistantMsg = allMessages[lastAssistantIdx];

        let lastUserIdx = lastAssistantIdx - 1;
        while (lastUserIdx >= 0 && allMessages[lastUserIdx].role !== "user") lastUserIdx--;
        if (lastUserIdx < 0) {
          setChatError(chatId, "No user message found to regenerate from");
          return;
        }
        const userContent = allMessages[lastUserIdx].content;

        cancelImageGeneration(lastAssistantMsg.id);
        await deleteMessage(lastAssistantMsg.id);

        const messagesForPrompt = allMessages.filter((message) => message.id !== lastAssistantMsg.id);
        const contextTokens = useSettingsStore.getState().contextTokens ?? 64000;

        const activePresetId = await presetRepository.getActivePresetId();
        let presetItems: { role: "system" | "user"; content: string; injectionOrder: number }[] | undefined;
        if (activePresetId) {
          const preset = await presetRepository.getById(activePresetId);
          if (preset) {
            presetItems = preset.items
              .filter((i) => i.enabled)
              .filter((i) => !useSettingsStore.getState().healthyMode || i.name !== NSFW_ITEM_NAME)
              .map((i) => ({ role: i.role, content: i.content, injectionOrder: i.injectionOrder }));
          }
        }

        const historyMessages = messagesForPrompt.slice(0, -1);
        const memoryPlan = await getMemoryPromptPlan(historyMessages, chatId, controller.signal);
        const worldbookBlocks = await getWorldbookContextBlocks(userContent, stripMessages(messagesForPrompt));
        const agenticRecord =
          agenticPlayEnabled && character
            ? await agenticPlayStateRepository.getOrCreate(chatId, character, true)
            : null;
        const agenticBlock = agenticRecord ? createAgenticPlayContextBlock(agenticRecord.gameState) : null;
        const contextBlocks = [memoryPlan.memoryBlock, agenticBlock, ...worldbookBlocks].filter(
          Boolean,
        ) as ContextBlock[];
        // Healthy mode: inject high-priority safety prompt
        if (useSettingsStore.getState().healthyMode) {
          contextBlocks.push(createHealthyModeContextBlock());
        }
        const effectivePresetItems = agenticRecord ? await getAgenticPlayPresetItems() : presetItems;

        const built = buildChatPrompt({
          character,
          recentMessages: stripMessages(memoryPlan.recentMessages) as Message[],
          userInput: userContent,
          maxTotalTokens: contextTokens,
          presetItems: effectivePresetItems,
          contextBlocks,
          userName: useSettingsStore.getState().personaName,
        });

        if (onPromptBuilt) onPromptBuilt(built);

        const modelConfig = useSettingsStore.getState().modelConfig;
        if (!modelConfig) throw new Error("Model not configured. Please set up API settings first.");

        const assistant = await addMessage({
          chatId,
          parentId: allMessages[lastUserIdx].id,
          role: "assistant",
          content: "",
        });
        assistantId = assistant.id;
        setStreamingMessageId(chatId, assistant.id);
        const promptMessages = messagesForPrompt;
        const debugContext: DebugPromptContext | undefined = useSettingsStore.getState().debugMode
          ? {
              chatId,
              characterId: character.id,
              characterName: character.name,
              contextTokens,
              round: getNextDebugRound(promptMessages),
              assistantMessageId: assistant.id,
              baseTrigger: "regenerate",
              hiddenUserMessage: false,
            }
          : undefined;
        const finalContent =
          agenticRecord && agenticPlayEnabled
            ? await generateAgenticAssistantWithEmptyRetry(
                chatId,
                assistant.id,
                built,
                modelConfig,
                agenticRecord.gameState,
                controller,
                debugContext,
              )
            : await generateAssistantWithEmptyRetry(chatId, assistant.id, built, modelConfig, controller, debugContext);
        if (!isCurrent() || !isGenerationActive(controller)) {
          await removeEmptyStreamingDraft(assistant.id);
          return;
        }
        // Healthy mode: check AI output for violations
        if (useSettingsStore.getState().healthyMode) {
          const violation = checkHealthyModeOutput(finalContent, messagesForPrompt);
          if (violation) {
            const placeholder =
              violation.type === "flood" ? HEALTHY_MODE_FLOOD_PLACEHOLDER : HEALTHY_MODE_BLOCKED_PLACEHOLDER;
            await patchMessage(assistant.id, { content: placeholder, reasoningContent: undefined });
            setChatError(
              chatId,
              violation.type === "flood"
                ? "健康模式：检测到输出重复异常，已终止。"
                : "健康模式：检测到不当内容，回复已被拦截。",
            );
            void notifyAssistantOutputComplete(character.name);
            await removeEmptyStreamingDraft(assistant.id);
            return;
          }
        }
        void notifyAssistantOutputComplete(character.name);
        void processImageGeneration(chatId, assistant.id, finalContent);
      } catch (err) {
        if ((err as Error).name === "AbortError" || controller.signal.aborted) {
          if (isCurrent()) setChatError(chatId, "Generation stopped");
        } else if (isCurrent()) {
          setChatError(chatId, (err as Error).message || "Failed to regenerate");
        }
        await removeEmptyStreamingDraft(assistantId);
      } finally {
        if (isCurrent()) finishSending(chatId);
      }
    });
  }, [
    character,
    chatId,
    addMessage,
    deleteMessage,
    ensureMessagesHydrated,
    agenticPlayEnabled,
    onPromptBuilt,
    beginSending,
    setStreamingMessageId,
    getMemoryPromptPlan,
    getWorldbookContextBlocks,
    stripMessages,
    generateAgenticAssistantWithEmptyRetry,
    generateAssistantWithEmptyRetry,
    isGenerationActive,
    processImageGeneration,
    removeEmptyStreamingDraft,
    setChatError,
    finishSending,
  ]);

  return {
    sendMessage,
    regenerate,
    abort,
    sending,
    sendingChatId,
    streamingMessageId,
    generationPhase,
    error,
    clearError,
  };
}
