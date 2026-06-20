import { generateId } from "@neo-tavern/shared";
import type { Message, CreateMessageInput } from "@neo-tavern/shared";
import { getBackend } from "@/platform";
import { mergeMessagesByContent } from "@neo-tavern/core/tree";
const EMBEDDED_IMAGE_SRC_PREFIX = "data:image/";
const COMPACTED_EMBEDDED_IMAGE_ERROR = "旧版内嵌图片已清理，请重新生成。";
import { data } from "../kv";
import { dataKeys } from "../storage/keys";
import { loadArray, readOptional } from "../storage/repository-helpers";

let sqliteReady: Promise<boolean> | null = null;

async function loadAll(): Promise<Message[]> {
  return loadArray<Message>(data, dataKeys.messages);
}
async function saveAll(msgs: Message[]) {
  await data.setJson(dataKeys.messages, compactMessagesForKeyValueStorage(msgs));
}

function compactMessagesForKeyValueStorage(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (!message.images?.some((image) => image.src?.toLowerCase().startsWith(EMBEDDED_IMAGE_SRC_PREFIX))) {
      return message;
    }

    return {
      ...message,
      images: message.images.map((image) => {
        if (!image.src?.toLowerCase().startsWith(EMBEDDED_IMAGE_SRC_PREFIX)) return image;
        return {
          ...image,
          status: "error" as const,
          src: undefined,
          error: image.error || COMPACTED_EMBEDDED_IMAGE_ERROR,
        };
      }),
    };
  });
}

function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function isPositiveRoundIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function inferMaxRoundIndex(messages: Message[]) {
  const byTime = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let inferred = 0;
  let max = 0;

  for (const message of byTime) {
    if (message.role !== "assistant") continue;
    inferred += 1;
    max = Math.max(max, isPositiveRoundIndex(message.roundIndex) ? message.roundIndex : inferred);
  }

  return max;
}

function ensureAssistantRoundIndexes(messages: Message[]) {
  const byChat = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byChat.get(message.chatId) ?? [];
    list.push(message);
    byChat.set(message.chatId, list);
  }

  const nextByChat = new Map<string, number>();
  for (const [chatId, chatMessages] of byChat) {
    nextByChat.set(chatId, 0);
    chatMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const message of chatMessages) {
      if (message.role !== "assistant") continue;
      const current = nextByChat.get(chatId) ?? 0;
      if (isPositiveRoundIndex(message.roundIndex)) {
        nextByChat.set(chatId, Math.max(current, message.roundIndex));
        continue;
      }
      const next = current + 1;
      message.roundIndex = next;
      nextByChat.set(chatId, next);
    }
  }

  return messages;
}

function getRecentAssistantTurnStartIndex(messages: Message[], turnLimit: number) {
  const limit = Math.max(1, Math.floor(turnLimit || 1));
  const indexedAssistantMessages = messages.filter(
    (message) => message.role === "assistant" && isPositiveRoundIndex(message.roundIndex),
  );

  if (indexedAssistantMessages.length > 0) {
    const latestRoundIndex = Math.max(...indexedAssistantMessages.map((message) => message.roundIndex ?? 0));
    if (latestRoundIndex <= limit) return 0;

    const preserveFromRoundIndex = latestRoundIndex - limit + 1;
    const firstAssistantToKeep = messages.findIndex(
      (message) => message.role === "assistant" && (message.roundIndex ?? 0) >= preserveFromRoundIndex,
    );
    if (firstAssistantToKeep < 0) return 0;

    let start = firstAssistantToKeep;
    while (start > 0 && messages[start - 1].role !== "assistant") start -= 1;
    return start;
  }

  const assistantIndexes: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") assistantIndexes.push(i);
  }
  if (assistantIndexes.length <= limit) return 0;

  let start = assistantIndexes[assistantIndexes.length - limit];
  while (start > 0 && messages[start - 1].role !== "assistant") start -= 1;
  return start;
}

function takeRecentAssistantTurns(messages: Message[], turnLimit: number) {
  const sorted = sortMessages(messages);
  return sorted.slice(getRecentAssistantTurnStartIndex(sorted, turnLimit));
}

function makeMessage(input: CreateMessageInput): Message {
  return {
    id: generateId(),
    chatId: input.chatId,
    parentId: input.parentId ?? null,
    role: input.role,
    content: input.content,
    reasoningContent: input.reasoningContent,
    generateDuration: input.generateDuration,
    thinkingDuration: input.thinkingDuration,
    usage: input.usage,
    images: input.images,
    agenticOptions: input.agenticOptions,
    hidden: input.hidden,
    metadata: input.metadata,
    roundIndex: input.role === "assistant" ? input.roundIndex : undefined,
    createdAt: new Date().toISOString(),
  };
}

/** Build a linear path from leaf to root via parentId chain */
export function buildMessagePath(allMessages: Message[], leafId: string): Message[] {
  const byId = new Map(allMessages.map((m) => [m.id, m]));
  const path: Message[] = [];
  let current: Message | undefined = byId.get(leafId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Collect all descendant ids for a node (used for cascade delete) */
export function collectDescendantIds(allMessages: Message[], rootId: string): Set<string> {
  const byParentId = new Map<string, Message[]>();
  for (const m of allMessages) {
    if (m.parentId) {
      const list = byParentId.get(m.parentId) ?? [];
      list.push(m);
      byParentId.set(m.parentId, list);
    }
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const children = byParentId.get(id) ?? [];
    for (const child of children) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

function makeRestoredMessages(chatId: string, messages: Message[]): Message[] {
  const idMap = new Map<string, string>();
  for (const m of messages) {
    idMap.set(m.id, generateId());
  }
  return ensureAssistantRoundIndexes(
    messages.map((message) => ({
      ...message,
      id: idMap.get(message.id) ?? message.id,
      parentId: message.parentId ? (idMap.get(message.parentId) ?? message.parentId) : null,
      chatId,
    })),
  );
}

async function canUseSqliteMessages() {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      try {
        const legacyMessagesJson = await readOptional(data, dataKeys.messages);
        await getBackend().db.initMessages(legacyMessagesJson);
        // Keep the canonical KV source until a later cleanup migration. This
        // makes SQLite import retryable after interruption or partial failure.
        return true;
      } catch (error) {
        console.warn("[messages] SQLite message store unavailable; falling back to key-value storage.", error);
        return false;
      }
    })();
  }

  return sqliteReady;
}

export const messageRepository = {
  async listByChatId(chatId: string): Promise<Message[]> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.listMessages(chatId);
    }
    return (await loadAll()).filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getChildren(parentId: string): Promise<Message[]> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.listChildMessages(parentId);
    }
    return (await loadAll())
      .filter((m) => m.parentId === parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getDescendantIds(chatId: string, rootId: string): Promise<Set<string>> {
    const all = await this.listByChatId(chatId);
    return collectDescendantIds(all, rootId);
  },

  async listRecentByChatId(chatId: string, limit: number): Promise<Message[]> {
    const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit || 1)));
    if (await canUseSqliteMessages()) {
      return getBackend().db.listRecentMessages(chatId, cappedLimit);
    }
    return (await loadAll())
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-cappedLimit);
  },

  async listRecentTurnsByChatId(chatId: string, turnLimit: number): Promise<Message[]> {
    const cappedTurnLimit = Math.max(1, Math.min(100, Math.floor(turnLimit || 1)));
    if (await canUseSqliteMessages()) {
      return getBackend().db.listRecentTurnMessages(chatId, cappedTurnLimit);
    }
    return takeRecentAssistantTurns(
      (await loadAll()).filter((m) => m.chatId === chatId),
      cappedTurnLimit,
    );
  },

  async create(input: CreateMessageInput): Promise<Message> {
    const msg = makeMessage(input);
    if (msg.role === "assistant" && !isPositiveRoundIndex(msg.roundIndex)) {
      msg.roundIndex = inferMaxRoundIndex(await this.listByChatId(input.chatId)) + 1;
    }
    if (await canUseSqliteMessages()) {
      return getBackend().db.createMessage(msg);
    }
    const all = await loadAll();
    all.push(msg);
    await saveAll(all);
    return msg;
  },

  async deleteByChatId(chatId: string): Promise<void> {
    if (await canUseSqliteMessages()) {
      await getBackend().db.deleteByChatId(chatId);
      return;
    }
    await saveAll((await loadAll()).filter((m) => m.chatId !== chatId));
  },

  async replaceByChatId(chatId: string, messages: Message[]): Promise<Message[]> {
    const restored = makeRestoredMessages(chatId, messages);
    if (await canUseSqliteMessages()) {
      const saved = await getBackend().db.replaceByChatId(chatId, restored);
      return saved.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const all = await loadAll();
    await saveAll([...all.filter((m) => m.chatId !== chatId), ...restored]);
    return restored.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * Merge savepoint messages into the current tree as a new branch.
   * Unlike replaceByChatId, this does NOT delete existing messages.
   * Uses content merging to skip already-present messages and remap
   * imported children onto matched current parents when a branch diverges.
   */
  async mergeFromSavepoint(
    chatId: string,
    savepointMessages: Message[],
  ): Promise<{
    imported: number;
    skipped: number;
    divergencePoints: string[];
  }> {
    const current = await this.listByChatId(chatId);
    const restored = makeRestoredMessages(chatId, savepointMessages);
    const merged = mergeMessagesByContent(current, restored);

    if (merged.imported.length === 0) {
      return { imported: 0, skipped: merged.shared.length, divergencePoints: [] };
    }

    if (await canUseSqliteMessages()) {
      for (const msg of merged.imported) {
        await getBackend().db.createMessage(msg);
      }
    } else {
      const all = await loadAll();
      await saveAll([...all, ...merged.imported]);
    }

    return {
      imported: merged.imported.length,
      skipped: merged.shared.length,
      divergencePoints: merged.divergencePoints,
    };
  },

  async update(id: string, content: string): Promise<Message> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.updateMessage(id, content);
    }
    const all = await loadAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error(`Message not found: ${id}`);
    all[idx].content = content;
    await saveAll(all);
    return all[idx];
  },

  async patch(
    id: string,
    patch: Partial<
      Pick<
        Message,
        "content" | "reasoningContent" | "generateDuration" | "thinkingDuration" | "usage" | "images" | "agenticOptions"
      >
    >,
  ): Promise<Message> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.patchMessage(id, patch);
    }
    const all = await loadAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error(`Message not found: ${id}`);
    all[idx] = { ...all[idx], ...patch };
    await saveAll(all);
    return all[idx];
  },

  async deleteMessage(id: string): Promise<void> {
    if (await canUseSqliteMessages()) {
      await getBackend().db.deleteMessage(id);
      return;
    }
    await saveAll((await loadAll()).filter((m) => m.id !== id));
  },

  async deleteMessages(ids: string[]): Promise<void> {
    if (await canUseSqliteMessages()) {
      await getBackend().db.deleteMessages(ids);
      return;
    }
    const idSet = new Set(ids);
    await saveAll((await loadAll()).filter((m) => !idSet.has(m.id)));
  },

  async migrateParentIds(): Promise<number> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.migrateParentIds();
    }
    // Browser KV fallback: compute parentId from chronological order.
    const all = await loadAll();
    if (all.every((m) => m.parentId != null)) return 0;

    const chatGroups = new Map<string, Message[]>();
    for (const m of all) {
      const list = chatGroups.get(m.chatId) ?? [];
      list.push(m);
      chatGroups.set(m.chatId, list);
    }

    let count = 0;
    let changed = false;
    for (const [, msgs] of chatGroups) {
      msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i].parentId !== msgs[i - 1].id) {
          msgs[i].parentId = msgs[i - 1].id;
          count++;
          changed = true;
        }
      }
    }
    if (changed) await saveAll(all);
    return count;
  },

  async migrateRoundIndexes(): Promise<number> {
    if (await canUseSqliteMessages()) {
      return getBackend().db.migrateRoundIndexes();
    }

    const all = await loadAll();
    const before = new Map(all.map((message) => [message.id, message.roundIndex]));
    ensureAssistantRoundIndexes(all);
    const count = all.filter(
      (message) =>
        message.role === "assistant" &&
        isPositiveRoundIndex(message.roundIndex) &&
        !isPositiveRoundIndex(before.get(message.id)),
    ).length;
    await saveAll(all);
    return count;
  },
};
