import { createModelProvider } from "@neo-tavern/core";
import type { Character, ContextBlock, Message, ModelConfig, Worldbook, WorldbookEntry } from "@neo-tavern/shared";
import { ragRepository, settingsRepository, messageRepository } from "@/db/repositories";
import { useSettingsStore } from "@/features/settings/settings.store";
import { getChatScopedDeepSeekUserId, shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import { embedTexts } from "./ollama-client";
import { useRagStatusStore, type RagStatusPhase } from "./rag-status.store";
import {
  DEFAULT_RAG_MEMORY_SETTINGS,
  normalizeRagMemorySettings,
  type RagChunkKind,
  type RagChunkRecord,
  type RagMemorySettings,
} from "./rag-settings";

interface DynamicFact extends Record<string, unknown> {
  type?: string;
  subject?: string;
  predicate?: string;
  object?: string;
  evidence?: string;
  confidence?: number;
}

interface RagIndexProgress {
  phase: Extract<RagStatusPhase, "indexing-character" | "indexing-worldbook" | "embedding">;
  label: string;
  detail?: string;
  progressCurrent: number;
  progressTotal: number;
}

const RAG_STATIC_INDEX_VERSION = 2;

type StaticIndexTask = {
  phase: Extract<RagStatusPhase, "indexing-character" | "indexing-worldbook">;
  scope: "character" | "worldbook";
  ownerId: string;
  sourceId: string;
  sourceHash: string;
  title: string;
  texts: string[];
  metadata: Record<string, unknown>;
  existingChunks: RagChunkRecord[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function capText(text: string, maxChars: number) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function hashMessages(messages: Pick<Message, "id" | "role" | "content">[]) {
  return hashText(messages.map((message) => `${message.id}\u0000${message.role}\u0000${message.content}`).join("\u0001"));
}

function splitTextIntoChunks(text: string, maxChars: number) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalized]) {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars));
      }
      continue;
    }
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function makeChunkId(scope: string, ownerId: string, sourceId: string, chunkIndex: number, embeddingModel: string) {
  return `rag:${scope}:${ownerId}:${sourceId}:${chunkIndex}:${hashText(embeddingModel)}`;
}

function hasReusableSource(
  existing: RagChunkRecord[],
  sourceId: string,
  sourceHash: string,
  embeddingModel: string,
) {
  return existing.some(
    (chunk) => chunk.sourceId === sourceId && chunk.sourceHash === sourceHash && chunk.embeddingModel === embeddingModel,
  );
}

function getRagSettings() {
  return normalizeRagMemorySettings(useSettingsStore.getState().ragMemory ?? DEFAULT_RAG_MEMORY_SETTINGS);
}

function worldbookEntryText(worldbook: Worldbook, entry: WorldbookEntry, chunkText: string) {
  return [
    `世界书：${worldbook.name}`,
    `条目名称：${entry.title}`,
    entry.keys ? `关键词：${entry.keys}` : "",
    entry.secondaryKeys ? `次级关键词：${entry.secondaryKeys}` : "",
    "",
    chunkText,
  ]
    .filter(Boolean)
    .join("\n");
}

function createCharacterSources(character: Character) {
  const fields = [
    ["description", "角色描述", character.description],
    ["personality", "性格", character.personality],
    ["scenario", "场景", character.scenario],
    ["firstMessage", "开场白", character.firstMessage],
    ["exampleDialogues", "示例对话", character.exampleDialogues ?? ""],
    ["statusBars", "状态栏", character.statusBars ? JSON.stringify(character.statusBars, null, 2) : ""],
  ] as const;

  return fields
    .map(([field, label, content]) => ({
      sourceId: `character:${character.id}:${field}`,
      title: `角色卡：${character.name} / ${label}`,
      content: normalizeWhitespace(content),
      metadata: { kind: "character_profile" as RagChunkKind, characterId: character.id, field, characterName: character.name },
    }))
    .filter((source) => source.content);
}

function createWorldbookSources(worldbook: Worldbook, maxChunkChars: number) {
  const sources: Array<{
    sourceId: string;
    sourceHash: string;
    title: string;
    texts: string[];
    metadata: Record<string, unknown>;
  }> = [];

  for (const entry of worldbook.entries) {
    if (!entry.enabled || !entry.content.trim()) continue;
    const entryHashContent = [
      `rag-static-index:${RAG_STATIC_INDEX_VERSION}`,
      worldbook.name,
      entry.title,
      entry.keys,
      entry.secondaryKeys ?? "",
      entry.content,
      entry.priority,
      entry.type,
      entry.updatedAt,
    ].join("\n");
    const chunks = splitTextIntoChunks(entry.content, maxChunkChars);
    sources.push({
      sourceId: `worldbook-entry:${entry.id}`,
      sourceHash: hashText(entryHashContent),
      title: `世界书：${entry.title}`,
      texts: chunks.map((chunkText) => worldbookEntryText(worldbook, entry, chunkText)),
      metadata: {
        kind: "worldbook_entry" as RagChunkKind,
        worldbookId: worldbook.id,
        worldbookName: worldbook.name,
        entryId: entry.id,
        entryTitle: entry.title,
        entryKeys: entry.keys,
        entrySecondaryKeys: entry.secondaryKeys ?? "",
        entryPriority: entry.priority,
      },
    });
  }

  return sources;
}

function createLiveWorldbookCandidateChunks(
  worldbook: Worldbook | null,
  settings: RagMemorySettings,
  existingChunks: RagChunkRecord[],
) {
  if (!worldbook || !settings.indexWorldbook) return [];
  const existingKeys = new Set(
    existingChunks.map((chunk) => `${chunk.scope}:${chunk.sourceId}:${chunk.chunkIndex}:${chunk.embeddingModel}`),
  );
  const createdAt = nowIso();
  const liveChunks: RagChunkRecord[] = [];

  for (const source of createWorldbookSources(worldbook, settings.maxChunkChars)) {
    source.texts.forEach((text, index) => {
      const key = `worldbook:${source.sourceId}:${index}:${settings.embeddingModel}`;
      if (existingKeys.has(key)) return;
      liveChunks.push({
        id: `rag-live:${worldbook.id}:${source.sourceId}:${index}:${hashText(settings.embeddingModel)}`,
        scope: "worldbook",
        ownerId: worldbook.id,
        sourceId: source.sourceId,
        sourceHash: source.sourceHash,
        chunkIndex: index,
        title: source.title,
        content: text,
        embeddingModel: settings.embeddingModel,
        embedding: [],
        status: "indexed",
        metadata: { ...source.metadata, liveFallback: true },
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  return liveChunks;
}

async function upsertEmbeddedSource(options: {
  scope: "character" | "worldbook" | "chat";
  ownerId: string;
  sourceId: string;
  sourceHash: string;
  title: string;
  texts: string[];
  metadata: Record<string, unknown>;
  settings: RagMemorySettings;
  onEmbeddingProgress?: (message: string) => void;
  existingChunks?: RagChunkRecord[];
}) {
  const {
    scope,
    ownerId,
    sourceId,
    sourceHash,
    title,
    texts,
    metadata,
    settings,
    onEmbeddingProgress,
    existingChunks,
  } = options;
  const validTexts = texts.map((text) => normalizeWhitespace(text)).filter(Boolean);
  if (validTexts.length === 0) return 0;

  const existing = existingChunks ?? (await ragRepository.listByOwners([ownerId], settings.embeddingModel));
  const reusable = hasReusableSource(existing, sourceId, sourceHash, settings.embeddingModel);
  if (reusable) return 0;

  await ragRepository.deleteBySourceIds([sourceId]);
  onEmbeddingProgress?.(`正在向量化 ${validTexts.length} 个块`);
  const embeddings = await embedTexts(settings, validTexts, onEmbeddingProgress);
  const createdAt = nowIso();
  const chunks: RagChunkRecord[] = validTexts.map((text, index) => ({
    id: makeChunkId(scope, ownerId, sourceId, index, settings.embeddingModel),
    scope,
    ownerId,
    sourceId,
    sourceHash,
    chunkIndex: index,
    title,
    content: text,
    embeddingModel: settings.embeddingModel,
    embedding: embeddings[index] ?? [],
    status: embeddings[index]?.length ? "indexed" : "failed",
    metadata,
    createdAt,
    updatedAt: createdAt,
  }));
  return ragRepository.upsertChunks(chunks);
}

export async function ensureRagStaticIndex(
  character: Character,
  worldbook: Worldbook | null,
  settings = getRagSettings(),
  onProgress?: (progress: RagIndexProgress) => void,
) {
  if (!settings.enabled) return;

  const characterSources = settings.indexCharacter ? createCharacterSources(character) : [];
  const worldbookSources = settings.indexWorldbook && worldbook ? createWorldbookSources(worldbook, settings.maxChunkChars) : [];
  const characterExisting =
    characterSources.length > 0 ? await ragRepository.listByOwners([character.id], settings.embeddingModel) : [];
  const worldbookExisting =
    worldbook && worldbookSources.length > 0 ? await ragRepository.listByOwners([worldbook.id], settings.embeddingModel) : [];
  const pendingTasks: StaticIndexTask[] = [];

  for (const source of characterSources) {
    const sourceHash = hashText(source.content);
    const chunks = splitTextIntoChunks(source.content, settings.maxChunkChars);
    if (hasReusableSource(characterExisting, source.sourceId, sourceHash, settings.embeddingModel)) continue;
    pendingTasks.push({
      phase: "indexing-character",
      scope: "character",
      ownerId: character.id,
      sourceId: source.sourceId,
      sourceHash,
      title: source.title,
      texts: chunks,
      metadata: source.metadata,
      existingChunks: characterExisting,
    });
  }

  if (worldbook) {
    for (const source of worldbookSources) {
      if (hasReusableSource(worldbookExisting, source.sourceId, source.sourceHash, settings.embeddingModel)) continue;
      pendingTasks.push({
        phase: "indexing-worldbook",
        scope: "worldbook",
        ownerId: worldbook.id,
        sourceId: source.sourceId,
        sourceHash: source.sourceHash,
        title: source.title,
        texts: source.texts,
        metadata: source.metadata,
        existingChunks: worldbookExisting,
      });
    }
  }

  const totalSources = pendingTasks.length;
  let completedSources = 0;

  const reportSource = (
    phase: Extract<RagStatusPhase, "indexing-character" | "indexing-worldbook">,
    title: string,
    chunkCount: number,
  ) => {
    onProgress?.({
      phase,
      label: "RAG 初始化中",
      detail: `${title}${chunkCount > 0 ? `（${chunkCount} 块）` : ""}`,
      progressCurrent: completedSources,
      progressTotal: Math.max(1, totalSources),
    });
  };

  const reportEmbedding = (
    phase: Extract<RagStatusPhase, "indexing-character" | "indexing-worldbook">,
    title: string,
    message: string,
  ) => {
    onProgress?.({
      phase: "embedding",
      label: "RAG 正在向量化",
      detail: `${title} · ${message}`,
      progressCurrent: completedSources,
      progressTotal: Math.max(1, totalSources),
    });
  };

  for (const task of pendingTasks) {
    reportSource(task.phase, task.title, task.texts.length);
    await upsertEmbeddedSource({
      scope: task.scope,
      ownerId: task.ownerId,
      sourceId: task.sourceId,
      sourceHash: task.sourceHash,
      title: task.title,
      texts: task.texts,
      metadata: task.metadata,
      settings,
      existingChunks: task.existingChunks,
      onEmbeddingProgress: (message) => reportEmbedding(task.phase, task.title, message),
    });
    completedSources += 1;
    reportSource(task.phase, task.title, task.texts.length);
  }

  if (totalSources === 0) {
    onProgress?.({
      phase: "indexing-character",
      label: "RAG 缓存检查完成",
      detail: "角色卡和世界书索引已缓存，后台检查不阻塞进入会话",
      progressCurrent: 1,
      progressTotal: 1,
    });
  }
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getRecentMessagesForQuery(messages: Message[], turnLimit: number) {
  const limit = Math.max(1, turnLimit);
  const result: Message[] = [];
  let turns = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    result.unshift(messages[i]);
    if (messages[i].role === "user") turns += 1;
    if (turns >= limit) break;
  }
  return result;
}

function buildRecallQuery(userInput: string, recentMessages: Message[], settings: RagMemorySettings) {
  const recent = getRecentMessagesForQuery(recentMessages, settings.queryRecentTurns)
    .map((message) => {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "AI" : "系统";
      return `${role}: ${capText(message.content, 500)}`;
    })
    .join("\n");

  return [
    "为当前剧情召回相关记忆、动态事实、世界书细节和角色设定。",
    "重点关注人物、地点、关系、外貌/生理变化、规则、承诺、契约、物品、未完成事项。",
    "",
    "【最近剧情】",
    recent,
    "",
    "【当前用户输入】",
    userInput,
  ].join("\n");
}

function parseRewriteQueries(content: string): string[] {
  const cleaned = content
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const parsedObject = parsed && typeof parsed === "object" ? (parsed as { queries?: unknown }) : null;
    const values: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsedObject?.queries)
        ? parsedObject.queries
        : [];
    const queries = values.map((value: unknown) => String(value ?? "").trim()).filter(Boolean);
    if (queries.length > 0) return Array.from(new Set(queries)).slice(0, 5);
  } catch {
    /* Fall back to line parsing. */
  }

  return Array.from(
    new Set(
      cleaned
        .split(/\r?\n/g)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、:：])\s*/u, "").trim())
        .map((line) => line.replace(/^["'“”]+|["'“”]+$/g, "").trim())
        .filter((line) => line.length >= 2 && line.length <= 160),
    ),
  ).slice(0, 5);
}

async function resolveRagModelConfig(configId: string | null): Promise<ModelConfig | null> {
  if (configId) {
    return (
      useSettingsStore.getState().modelConfigs.find((config) => config.id === configId) ??
      settingsRepository.getModelConfig(configId)
    );
  }
  return useSettingsStore.getState().modelConfig;
}

async function rewriteRecallQueries(options: {
  chatId: string;
  character: Character;
  recentMessages: Message[];
  userInput: string;
  settings: RagMemorySettings;
}) {
  if (!options.settings.queryRewriteEnabled) return [];
  const config = await resolveRagModelConfig(options.settings.queryRewriteConfigId);
  if (!config) return [];

  const recent = getRecentMessagesForQuery(options.recentMessages, options.settings.queryRecentTurns)
    .map((message) => {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "AI" : "系统";
      return `${role}: ${capText(message.content, 700)}`;
    })
    .join("\n");
  const provider = createModelProvider(config);
  const result = await provider.generate({
    model: config.model,
    omitTemperature: shouldOmitTemperatureForModel(config),
    temperature: Math.min(config.temperature ?? 0.2, 0.3),
    maxTokens: Math.min(Math.max(300, config.maxTokens || 600), 1200),
    reasoningEffort: config.reasoningEffort || undefined,
    userId: getChatScopedDeepSeekUserId(config, options.chatId),
    messages: [
      {
        role: "system",
        content: [
          "你是 Whale Play 的 RAG 查询改写器。",
          "只根据输入改写检索查询，不续写剧情，不解释。",
          "输出 JSON 数组，包含 2 到 5 条短查询。",
          "每条查询应尽量短，保留人物名、地点、物品、规则、关系变化、承诺、外貌/生理变化等关键词。",
          "不要输出完整对话，不要输出 Markdown。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `角色：${options.character.name}`,
          `请基于最近 ${options.settings.queryRecentTurns} 轮和当前用户输入，生成适合向量检索/关键词检索的短查询。`,
          "",
          "【最近剧情】",
          recent || "（无）",
          "",
          "【当前用户输入】",
          options.userInput,
          "",
          '输出示例：["玛丽 长发变短发","玛丽 马克 承诺","地下室 规则"]',
        ].join("\n"),
      },
    ],
  });

  return parseRewriteQueries(result.content);
}

const KEYWORD_RECALL_MIN_SCORE = 0.16;
const COMMON_RECALL_TERMS = new Set([
  "什么",
  "怎么",
  "哪里",
  "在哪",
  "现在",
  "当前",
  "这个",
  "那个",
  "一些",
  "已经",
  "正在",
  "可以",
  "需要",
  "剧情",
  "角色",
  "回复",
  "继续",
  "开始",
  "the",
  "and",
  "you",
  "she",
  "him",
  "her",
  "what",
  "where",
  "when",
  "now",
]);

function normalizeSearchText(text: unknown) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasCjk(text: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

function isUsefulRecallTerm(term: string) {
  const normalized = normalizeSearchText(term);
  if (!normalized || COMMON_RECALL_TERMS.has(normalized)) return false;
  if (hasCjk(normalized)) return normalized.length >= 2;
  return normalized.length >= 3;
}

function splitRecallTerms(value: unknown) {
  return normalizeSearchText(value)
    .split(/[\s,，、;；|/\\()[\]{}"'“”‘’<>《》:：.!?！？\r\n\t]+/g)
    .map((term) => term.trim())
    .filter(isUsefulRecallTerm);
}

function addCjkNgrams(source: string, terms: Set<string>) {
  const runs = normalizeSearchText(source).match(/[\u3400-\u9fff\uf900-\ufaff]{2,}/g) ?? [];
  for (const run of runs) {
    if (run.length <= 4) {
      if (isUsefulRecallTerm(run)) terms.add(run);
      continue;
    }
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index++) {
        const term = run.slice(index, index + size);
        if (isUsefulRecallTerm(term)) terms.add(term);
        if (terms.size >= 160) return;
      }
    }
  }
}

function extractQueryRecallTerms(userInput: string, recentMessages: Message[], settings: RagMemorySettings) {
  const source = [
    userInput,
    ...getRecentMessagesForQuery(recentMessages, settings.queryRecentTurns).map((message) => message.content),
  ].join("\n");
  const terms = new Set<string>();
  for (const term of splitRecallTerms(source)) {
    terms.add(term);
    if (terms.size >= 160) break;
  }
  if (terms.size < 160) addCjkNgrams(source, terms);
  return Array.from(terms);
}

function getMetadataRecallTerms(chunk: RagChunkRecord) {
  const fact = chunk.metadata.fact && typeof chunk.metadata.fact === "object" ? (chunk.metadata.fact as DynamicFact) : null;
  const rawTerms = [
    chunk.title,
    chunk.metadata.entryTitle,
    chunk.metadata.entryKeys,
    chunk.metadata.entrySecondaryKeys,
    chunk.metadata.worldbookName,
    chunk.metadata.characterName,
    fact?.subject,
    fact?.predicate,
    fact?.object,
  ];
  const terms = new Set<string>();
  for (const value of rawTerms) {
    const normalized = normalizeSearchText(value);
    if (isUsefulRecallTerm(normalized)) terms.add(normalized);
    for (const term of splitRecallTerms(value)) terms.add(term);
  }
  return Array.from(terms);
}

function scoreKeywordRecall(chunk: RagChunkRecord, queryHaystack: string, queryTerms: string[]) {
  const matches = new Set<string>();
  let strongScore = 0;
  for (const term of getMetadataRecallTerms(chunk)) {
    if (!term || !queryHaystack.includes(term)) continue;
    matches.add(term);
    strongScore += term.length >= 4 ? 0.65 : 0.52;
  }

  const chunkHaystack = normalizeSearchText([chunk.title, chunk.content].join("\n"));
  let weakScore = 0;
  for (const term of queryTerms) {
    if (!chunkHaystack.includes(term)) continue;
    matches.add(term);
    weakScore += hasCjk(term) && term.length === 2 ? 0.16 : 0.22;
    if (weakScore >= 0.42) break;
  }

  return {
    keywordScore: Math.min(0.95, strongScore + Math.min(0.42, weakScore)),
    keywordMatches: Array.from(matches).slice(0, 5),
  };
}

function formatChunkForPrompt(chunk: RagChunkRecord) {
  const kind = String(chunk.metadata.kind ?? "");
  if (kind === "worldbook_entry") {
    return [`【世界书：${chunk.metadata.entryTitle ?? chunk.title}】`, chunk.content].join("\n");
  }
  if (kind === "dynamic_fact") {
    return [`【动态事实：${chunk.title}】`, chunk.content].join("\n");
  }
  if (kind === "character_profile") {
    return [`【角色设定：${chunk.title}】`, chunk.content].join("\n");
  }
  return [`【剧情记忆：${chunk.title}】`, chunk.content].join("\n");
}

function createRagRun(chatId: string, operation: "initialization" | "retrieval" | "memory", settings: RagMemorySettings) {
  return useRagStatusStore.getState().begin(chatId, {
    operation,
    phase: operation === "retrieval" ? "retrieving" : operation === "memory" ? "summarizing" : "initializing",
    label:
      operation === "retrieval" ? "RAG 正在检索参考资料" : operation === "memory" ? "RAG 正在整理剧情记忆" : "RAG 初始化中",
    detail: "正在检查角色卡、世界书和剧情记忆索引",
    progressCurrent: 0,
    progressTotal: 1,
    model: settings.embeddingModel,
  });
}

function updateRagRunFromIndexProgress(chatId: string, runId: string, progress: RagIndexProgress) {
  useRagStatusStore.getState().update(chatId, runId, {
    phase: progress.phase,
    label: progress.label,
    detail: progress.detail,
    progressCurrent: progress.progressCurrent,
    progressTotal: progress.progressTotal,
  });
}

export async function initializeRagForChat(options: {
  chatId: string;
  character: Character;
  worldbook: Worldbook | null;
}) {
  const settings = getRagSettings();
  if (!settings.enabled) {
    useRagStatusStore.getState().clear(options.chatId);
    return;
  }

  const runId = createRagRun(options.chatId, "initialization", settings);
  try {
    await ensureRagStaticIndex(options.character, options.worldbook, settings, (progress) =>
      updateRagRunFromIndexProgress(options.chatId, runId, progress),
    );
    useRagStatusStore.getState().finish(options.chatId, runId, {
      phase: "ready",
      label: "RAG 已就绪",
      detail: options.worldbook ? "角色卡和世界书索引已检查完成" : "角色卡索引已检查完成",
      progressCurrent: 1,
      progressTotal: 1,
    });
  } catch (error) {
    useRagStatusStore.getState().fail(options.chatId, runId, error, {
      label: "RAG 初始化失败",
      detail: "请检查本地 embedding 模型或数据库状态",
    });
    console.warn("[rag] failed to initialize", error);
  }
}

export async function buildRagContextBlock(options: {
  chatId: string;
  character: Character;
  worldbook: Worldbook | null;
  recentMessages: Message[];
  userInput: string;
}): Promise<ContextBlock | null> {
  const settings = getRagSettings();
  if (!settings.enabled) return null;

  const runId = createRagRun(options.chatId, "retrieval", settings);

  try {
    await ensureRagStaticIndex(options.character, options.worldbook, settings, (progress) =>
      updateRagRunFromIndexProgress(options.chatId, runId, {
        ...progress,
        label: "RAG 正在准备检索",
      }),
    );

    useRagStatusStore.getState().update(options.chatId, runId, {
      phase: "retrieving",
      label: "RAG 正在检索参考资料",
      detail: "正在读取候选记忆块",
      progressCurrent: 0,
      progressTotal: 3,
    });

    const ownerIds = [options.chatId, options.character.id, options.worldbook?.id].filter(Boolean) as string[];
    const storedCandidates = await ragRepository.listByOwners(ownerIds, settings.embeddingModel);
    const liveWorldbookCandidates = createLiveWorldbookCandidateChunks(options.worldbook, settings, storedCandidates);
    const candidates = [...storedCandidates, ...liveWorldbookCandidates];
    const searchable = candidates.filter(
      (chunk) =>
        chunk.status !== "deleted" &&
        chunk.status !== "skipped_too_long" &&
        (chunk.embedding.length > 0 || chunk.content.trim().length > 0),
    );
    const vectorReadyCount = searchable.filter((chunk) => chunk.embedding.length > 0).length;
    if (searchable.length === 0) {
      useRagStatusStore.getState().finish(options.chatId, runId, {
        phase: "ready",
        label: "RAG 暂无可召回资料",
        detail: `候选 0；${options.worldbook ? `世界书 ${options.worldbook.name}` : "未加载世界书"}；模型 ${settings.embeddingModel}`,
        progressCurrent: 3,
        progressTotal: 3,
        recalledCount: 0,
      });
      return null;
    }

    const baseQuery = buildRecallQuery(options.userInput, options.recentMessages, settings);
    let rewrittenQueries: string[] = [];
    if (settings.queryRewriteEnabled) {
      useRagStatusStore.getState().update(options.chatId, runId, {
        phase: "retrieving",
        label: "RAG 正在改写查询",
        detail: "副 AI 正在生成短查询",
        progressCurrent: 1,
        progressTotal: 3,
      });
      try {
        rewrittenQueries = await rewriteRecallQueries({
          chatId: options.chatId,
          character: options.character,
          recentMessages: options.recentMessages,
          userInput: options.userInput,
          settings,
        });
      } catch (error) {
        console.warn("[rag] query rewrite failed, falling back to base query", error);
        rewrittenQueries = [];
      }
    }
    const queryTexts = Array.from(new Set([baseQuery, ...rewrittenQueries].map((query) => query.trim()).filter(Boolean)));
    useRagStatusStore.getState().update(options.chatId, runId, {
      phase: "retrieving",
      label: "RAG 正在生成查询向量",
      detail: `基础查询 1 条${rewrittenQueries.length ? ` / AI 改写 ${rewrittenQueries.length} 条` : ""}`,
      progressCurrent: 1,
      progressTotal: 3,
    });
    let queryEmbeddings: number[][] = [];
    try {
      queryEmbeddings = await embedTexts(settings, queryTexts, (message) => {
        useRagStatusStore.getState().update(options.chatId, runId, {
          phase: "embedding",
          label: "RAG 正在生成查询向量",
          detail: message,
          progressCurrent: 1,
          progressTotal: 3,
        });
      });
    } catch (error) {
      console.warn("[rag] query embedding failed, falling back to keyword recall", error);
      useRagStatusStore.getState().update(options.chatId, runId, {
        phase: "retrieving",
        label: "RAG 查询向量失败，尝试关键词召回",
        detail: "将使用世界书条目名、keys 和正文关键词继续筛选",
        progressCurrent: 2,
        progressTotal: 3,
      });
    }

    useRagStatusStore.getState().update(options.chatId, runId, {
      phase: "retrieving",
      label: queryEmbeddings.length ? "RAG 正在匹配相关记忆" : "RAG 正在关键词召回",
      detail: queryEmbeddings.length
        ? `候选 ${searchable.length} / 可向量 ${vectorReadyCount}${
            liveWorldbookCandidates.length ? ` / 实时世界书 ${liveWorldbookCandidates.length}` : ""
          } / 查询 ${queryTexts.length}，正在混合筛选`
        : `查询向量为空，正在从 ${searchable.length} 个候选块中按关键词筛选${
            liveWorldbookCandidates.length ? `（含实时世界书 ${liveWorldbookCandidates.length}）` : ""
          }`,
      progressCurrent: 2,
      progressTotal: 3,
    });

    const queryTerms = extractQueryRecallTerms(
      [options.userInput, ...rewrittenQueries].filter(Boolean).join("\n"),
      options.recentMessages,
      settings,
    );
    const keywordQueryHaystack = normalizeSearchText(
      [
        options.userInput,
        ...rewrittenQueries,
        ...getRecentMessagesForQuery(options.recentMessages, settings.queryRecentTurns).map((message) => message.content),
      ].join("\n"),
    );
    const scored = searchable
      .map((chunk) => {
        const vectorScore = queryEmbeddings.length
          ? Math.max(...queryEmbeddings.map((embedding) => cosineSimilarity(embedding, chunk.embedding)))
          : 0;
        const { keywordScore, keywordMatches } = scoreKeywordRecall(chunk, keywordQueryHaystack, queryTerms);
        const matchedByVector = vectorScore >= settings.similarityThreshold;
        const matchedByKeyword = keywordScore >= KEYWORD_RECALL_MIN_SCORE;
        return {
          chunk,
          vectorScore,
          keywordScore,
          keywordMatches,
          matchedByVector,
          matchedByKeyword,
          score: Math.max(vectorScore, keywordScore) + (matchedByVector && matchedByKeyword ? 0.08 : 0),
        };
      })
      .filter((item) => item.matchedByVector || item.matchedByKeyword)
      .sort((a, b) => b.score - a.score || b.vectorScore - a.vectorScore || b.keywordScore - a.keywordScore);

    const selected: typeof scored = [];
    const seenSources = new Set<string>();
    for (const item of scored) {
      const key = `${item.chunk.scope}:${item.chunk.sourceId}`;
      if (seenSources.has(key) && selected.length >= Math.ceil(settings.maxRecallChunks / 2)) continue;
      seenSources.add(key);
      selected.push(item);
      if (selected.length >= settings.maxRecallChunks) break;
    }

    if (selected.length === 0) {
      const queryTermPreview = queryTerms.slice(0, 8).join(" / ") || "无";
      useRagStatusStore.getState().finish(options.chatId, runId, {
        phase: "ready",
        label: "RAG 未召回参考资料",
        detail: `候选 ${searchable.length} / 可向量 ${vectorReadyCount}${
          liveWorldbookCandidates.length ? ` / 实时世界书 ${liveWorldbookCandidates.length}` : ""
        }；查询 ${queryTexts.length}${rewrittenQueries.length ? ` / AI 改写 ${rewrittenQueries.length}` : ""}；查询词 ${queryTermPreview}`,
        progressCurrent: 3,
        progressTotal: 3,
        recalledCount: 0,
      });
      return null;
    }

    useRagStatusStore.getState().finish(options.chatId, runId, {
      phase: "ready",
      label: `RAG 已召回 ${selected.length} 条参考资料`,
      detail: `向量命中 ${selected.filter((item) => item.matchedByVector).length} / 关键词命中 ${
        selected.filter((item) => item.matchedByKeyword).length
      }；查询 ${queryTexts.length}${rewrittenQueries.length ? ` / AI 改写 ${rewrittenQueries.length}` : ""}；候选 ${
        searchable.length
      }${liveWorldbookCandidates.length ? ` / 实时世界书 ${liveWorldbookCandidates.length}` : ""}`,
      progressCurrent: 3,
      progressTotal: 3,
      recalledCount: selected.length,
    });

    return {
      id: `rag-reference-${options.chatId}`,
      source: "memory",
      title: "本轮参考资料",
      role: "system",
      position: "afterHistory",
      priority: -100,
      content: [
        "以下资料由 RAG 记忆系统自动召回，仅作为这一轮回复的底部参考资料。",
        "部分参考资料可能与当前剧情不相关；如果与最近完整对话、角色当前状态或用户输入冲突，请以最近完整对话为准，并无视不相关资料。",
        "",
        ...selected.map(({ chunk }) => formatChunkForPrompt(chunk)),
      ].join("\n\n"),
    };
  } catch (error) {
    useRagStatusStore.getState().fail(options.chatId, runId, error, {
      label: "RAG 检索失败",
      detail: "本轮将不插入 RAG 参考资料",
    });
    console.warn("[rag] failed to build context block", error);
    return null;
  }
}

async function resolveSummarizerConfig(settings: RagMemorySettings): Promise<ModelConfig | null> {
  if (settings.summarizerConfigId) {
    return (
      useSettingsStore.getState().modelConfigs.find((config) => config.id === settings.summarizerConfigId) ??
      settingsRepository.getModelConfig(settings.summarizerConfigId)
    );
  }
  return useSettingsStore.getState().modelConfig;
}

function parseJsonFromModel(content: string) {
  const jsonText =
    content.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? content.match(/```\s*([\s\S]*?)```/)?.[1] ?? content;
  return JSON.parse(jsonText);
}

async function summarizePlotAndFacts(options: {
  chatId: string;
  character: Character;
  messages: Message[];
  assistantContent: string;
  settings: RagMemorySettings;
}) {
  const config = await resolveSummarizerConfig(options.settings);
  if (!config) {
    return {
      summary: capText(
        options.messages.map((message) => `${message.role}: ${message.content}`).join("\n"),
        options.settings.maxChunkChars,
      ),
      facts: [] as DynamicFact[],
    };
  }

  const source = options.messages
    .map((message) => {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "AI" : "系统";
      return [`--- ${role} ---`, capText(message.content, 4000)].join("\n");
    })
    .join("\n\n");
  const provider = createModelProvider(config);
  const result = await provider.generate({
    model: config.model,
    omitTemperature: shouldOmitTemperatureForModel(config),
    temperature: Math.min(config.temperature ?? 0.2, 0.3),
    maxTokens: Math.min(Math.max(1200, config.maxTokens || 2048), 4096),
    reasoningEffort: config.reasoningEffort || undefined,
    userId: getChatScopedDeepSeekUserId(config, options.chatId),
    messages: [
      {
        role: "system",
        content: [
          "你是 Whale Play 的长期剧情记忆整理器。",
          "你只根据本轮提供的聊天片段提取信息，不要添加未出现的设定。",
          "输出 JSON，不要解释。",
          "summary 要保留剧情细节、人物状态、地点、行动、心理、关系变化、物品和伏笔。",
          "facts 只提取之后会持续成立的动态事实，例如关系变化、外貌/生理变化、规则、承诺、契约、地点状态、重要物品归属。",
          "不确定的事实可以降低 confidence；临时动作不要写入 facts。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `角色：${options.character.name}`,
          '请输出 JSON：{"summary":"...","facts":[{"type":"relationship_change","subject":"玛丽","predicate":"爱上","object":"马克","evidence":"...","confidence":0.9}]}',
          "",
          "【聊天片段】",
          source,
        ].join("\n"),
      },
    ],
  });

  try {
    const data = parseJsonFromModel(result.content);
    return {
      summary: String(data.summary ?? "").trim() || capText(options.assistantContent, options.settings.maxChunkChars),
      facts: Array.isArray(data.facts) ? (data.facts as DynamicFact[]) : [],
    };
  } catch {
    return { summary: capText(result.content || options.assistantContent, options.settings.maxChunkChars), facts: [] as DynamicFact[] };
  }
}

function takeSummarySourceMessages(history: Message[], userMessage: Message, assistantMessage: Message, turnLimit: number) {
  const recent = getRecentMessagesForQuery(history, turnLimit);
  return [...recent, userMessage, assistantMessage].filter((message) => message.content.trim());
}

function dynamicFactText(fact: Record<string, unknown>) {
  const subject = String(fact.subject ?? "").trim();
  const predicate = String(fact.predicate ?? "").trim();
  const object = String(fact.object ?? "").trim();
  const evidence = String(fact.evidence ?? "").trim();
  return [
    subject || predicate || object ? `事实：${[subject, predicate, object].filter(Boolean).join(" ")}` : "",
    evidence ? `依据：${evidence}` : "",
    fact.type ? `类型：${String(fact.type)}` : "",
    typeof fact.confidence === "number" ? `置信度：${fact.confidence}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateRagMemoryAfterAssistant(options: {
  chatId: string;
  character: Character;
  historyBeforeUser: Message[];
  userMessage: Message;
  assistantId: string;
  assistantContent: string;
}) {
  const settings = getRagSettings();
  if (!settings.enabled || !settings.indexChatMemory) return;

  const runId = createRagRun(options.chatId, "memory", settings);

  try {
    const sourceHash = hashText(options.assistantContent);
    const assistantTokens = estimateTokens(options.assistantContent);
    const createdAt = nowIso();

    await ragRepository.deleteBySourceIds([options.assistantId]);

    if (assistantTokens > settings.maxAssistantTokensForIndex) {
      await ragRepository.upsertChunks([
        {
          id: makeChunkId("chat", options.chatId, options.assistantId, 0, settings.embeddingModel),
          scope: "chat",
          ownerId: options.chatId,
          sourceId: options.assistantId,
          sourceHash,
          chunkIndex: 0,
          title: `超长回复占位：${options.character.name}`,
          content: "",
          embeddingModel: settings.embeddingModel,
          embedding: [],
          status: "skipped_too_long",
          metadata: {
            kind: "placeholder" as RagChunkKind,
            reason: "assistant_tokens_exceeded_limit",
            assistantTokens,
            maxAssistantTokensForIndex: settings.maxAssistantTokensForIndex,
            sourceMessageIds: [options.userMessage.id, options.assistantId],
          },
          createdAt,
          updatedAt: createdAt,
        },
      ]);
      useRagStatusStore.getState().finish(options.chatId, runId, {
        phase: "skipped",
        label: "RAG 已跳过超长回复",
        detail: "已写入占位，避免超长内容拖慢向量化",
        progressCurrent: 1,
        progressTotal: 1,
        recalledCount: 0,
      });
      return;
    }

    const assistantMessage: Message = {
      id: options.assistantId,
      chatId: options.chatId,
      parentId: options.userMessage.id,
      role: "assistant",
      content: options.assistantContent,
      createdAt,
    };
    const sourceMessages = takeSummarySourceMessages(
      options.historyBeforeUser,
      options.userMessage,
      assistantMessage,
      settings.summarySourceTurns,
    );
    useRagStatusStore.getState().update(options.chatId, runId, {
      phase: "summarizing",
      label: "RAG 正在整理剧情记忆",
      detail: `正在小结最近 ${settings.summarySourceTurns} 轮剧情`,
      progressCurrent: 0,
      progressTotal: 2,
    });
    const modelResult = await summarizePlotAndFacts({
      chatId: options.chatId,
      character: options.character,
      messages: sourceMessages,
      assistantContent: options.assistantContent,
      settings,
    });

    const currentMessages = await messageRepository.listByChatId(options.chatId);
    const currentAssistant = currentMessages.find((message) => message.id === options.assistantId);
    if (!currentAssistant || hashText(currentAssistant.content) !== sourceHash) {
      useRagStatusStore.getState().finish(options.chatId, runId, {
        phase: "skipped",
        label: "RAG 记忆写入已取消",
        detail: "AI 回复已被删除或重新生成",
        progressCurrent: 2,
        progressTotal: 2,
      });
      return;
    }

    const texts = [modelResult.summary];
    const factTexts = settings.extractDynamicFacts
      ? modelResult.facts.map((fact) => dynamicFactText(fact)).filter(Boolean)
      : [];
    texts.push(...factTexts);

    useRagStatusStore.getState().update(options.chatId, runId, {
      phase: "embedding",
      label: "RAG 正在写入剧情记忆",
      detail: `正在向量化 ${texts.length} 条小结/动态事实`,
      progressCurrent: 1,
      progressTotal: 2,
    });
    const embeddings = await embedTexts(settings, texts, (message) => {
      useRagStatusStore.getState().update(options.chatId, runId, {
        phase: "embedding",
        label: "RAG 正在写入剧情记忆",
        detail: message,
        progressCurrent: 1,
        progressTotal: 2,
      });
    });
    const updatedAt = nowIso();
    const chunks: RagChunkRecord[] = texts.map((text, index) => {
      const isFact = index > 0;
      const fact = isFact ? modelResult.facts[index - 1] : null;
      return {
        id: makeChunkId("chat", options.chatId, options.assistantId, index, settings.embeddingModel),
        scope: "chat",
        ownerId: options.chatId,
        sourceId: options.assistantId,
        sourceHash,
        chunkIndex: index,
        title: isFact
          ? [String(fact?.subject ?? "").trim(), String(fact?.predicate ?? "").trim(), String(fact?.object ?? "").trim()]
              .filter(Boolean)
              .join(" ") || "动态事实"
          : `剧情小结：${options.character.name}`,
        content: text,
        embeddingModel: settings.embeddingModel,
        embedding: embeddings[index] ?? [],
        status: embeddings[index]?.length ? "indexed" : "failed",
        metadata: {
          kind: (isFact ? "dynamic_fact" : "plot_summary") as RagChunkKind,
          characterId: options.character.id,
          characterName: options.character.name,
          sourceMessageIds: [options.userMessage.id, options.assistantId],
          sourceMessageHash: hashMessages(sourceMessages),
          ...(isFact ? { fact } : {}),
        },
        createdAt,
        updatedAt,
      };
    });

    await ragRepository.upsertChunks(chunks);
    useRagStatusStore.getState().finish(options.chatId, runId, {
      phase: "ready",
      label: `RAG 已写入 ${chunks.length} 条剧情记忆`,
      detail: settings.extractDynamicFacts ? "包含剧情小结和可持续动态事实" : "包含剧情小结",
      progressCurrent: 2,
      progressTotal: 2,
    });
  } catch (error) {
    useRagStatusStore.getState().fail(options.chatId, runId, error, {
      label: "RAG 记忆写入失败",
      detail: "本轮剧情小结没有写入向量库",
    });
    console.warn("[rag] failed to update assistant memory", error);
  }
}
