import { generateId } from "@neo-tavern/shared";
import type { Message, CreateMessageInput } from "@neo-tavern/shared";
const { invoke } = await import("@tauri-apps/api/core");
import { getStorageItem, removeStorageItem, setStorageItem } from "../storage";

const STORAGE_KEY = "neotavern_messages";

let sqliteReady: Promise<boolean> | null = null;

async function loadAll(): Promise<Message[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
async function saveAll(msgs: Message[]) {
  await setStorageItem(STORAGE_KEY, JSON.stringify(msgs));
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
  return messages.map((message) => ({
    ...message,
    id: idMap.get(message.id) ?? message.id,
    parentId: message.parentId ? (idMap.get(message.parentId) ?? message.parentId) : null,
    chatId,
  }));
}

async function canUseSqliteMessages() {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      try {
        const legacyMessagesJson = await getStorageItem(STORAGE_KEY);
        await invoke("sqlite_init_messages", { legacyMessagesJson });
        if (legacyMessagesJson) {
          await removeStorageItem(STORAGE_KEY);
        }
        return true;
      } catch {
        return false;
      }
    })();
  }

  return sqliteReady;
}

export const messageRepository = {
  async listByChatId(chatId: string): Promise<Message[]> {
    if (await canUseSqliteMessages()) {
      return invoke<Message[]>("sqlite_list_messages_by_chat_id", { chatId });
    }
    return (await loadAll()).filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getChildren(parentId: string): Promise<Message[]> {
    if (await canUseSqliteMessages()) {
      return invoke<Message[]>("sqlite_list_child_messages", { parentId });
    }
    return (await loadAll()).filter((m) => m.parentId === parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getDescendantIds(chatId: string, rootId: string): Promise<Set<string>> {
    const all = await this.listByChatId(chatId);
    return collectDescendantIds(all, rootId);
  },

  async listRecentByChatId(chatId: string, limit: number): Promise<Message[]> {
    const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit || 1)));
    if (await canUseSqliteMessages()) {
      return invoke<Message[]>("sqlite_list_recent_messages_by_chat_id", { chatId, limit: cappedLimit });
    }
    return (await loadAll())
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-cappedLimit);
  },

  async create(input: CreateMessageInput): Promise<Message> {
    const msg = makeMessage(input);
    if (await canUseSqliteMessages()) {
      return invoke<Message>("sqlite_create_message", { message: msg });
    }
    const all = await loadAll();
    all.push(msg);
    await saveAll(all);
    return msg;
  },

  async deleteByChatId(chatId: string): Promise<void> {
    if (await canUseSqliteMessages()) {
      await invoke("sqlite_delete_messages_by_chat_id", { chatId });
      return;
    }
    await saveAll((await loadAll()).filter((m) => m.chatId !== chatId));
  },

  async replaceByChatId(chatId: string, messages: Message[]): Promise<Message[]> {
    const restored = makeRestoredMessages(chatId, messages);
    if (await canUseSqliteMessages()) {
      const saved = await invoke<Message[]>("sqlite_replace_messages_by_chat_id", { chatId, messages: restored });
      return saved.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const all = await loadAll();
    await saveAll([...all.filter((m) => m.chatId !== chatId), ...restored]);
    return restored.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async update(id: string, content: string): Promise<Message> {
    if (await canUseSqliteMessages()) {
      return invoke<Message>("sqlite_update_message", { id, content });
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
      return invoke<Message>("sqlite_patch_message", { id, patch });
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
      await invoke("sqlite_delete_message", { id });
      return;
    }
    await saveAll((await loadAll()).filter((m) => m.id !== id));
  },

  async deleteMessages(ids: string[]): Promise<void> {
    if (await canUseSqliteMessages()) {
      await invoke("sqlite_delete_messages", { ids });
      return;
    }
    const idSet = new Set(ids);
    await saveAll((await loadAll()).filter((m) => !idSet.has(m.id)));
  },

  async migrateParentIds(): Promise<number> {
    if (await canUseSqliteMessages()) {
      return invoke<number>("sqlite_migrate_parent_ids", {});
    }
    // localStorage path: compute parentId from chronological order
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
};
