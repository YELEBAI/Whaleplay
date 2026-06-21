import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, CreateMessageInput, Message } from "@neo-tavern/shared";
import { useChatStore } from "./chat.store";

const repositoryState = vi.hoisted(() => ({
  chats: new Map<string, Chat>(),
  messages: [] as Message[],
  nextMessageId: 1,
}));

function makeChat(id: string): Chat {
  return {
    id,
    characterId: `${id}-character`,
    title: id,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

function buildMessagePath(allMessages: Message[], leafId: string): Message[] {
  const byId = new Map(allMessages.map((message) => [message.id, message]));
  const path: Message[] = [];
  let current = byId.get(leafId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function collectDescendantIds(allMessages: Message[], rootId: string): Set<string> {
  const byParentId = new Map<string, Message[]>();
  for (const message of allMessages) {
    if (!message.parentId) continue;
    byParentId.set(message.parentId, [...(byParentId.get(message.parentId) ?? []), message]);
  }

  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of byParentId.get(id) ?? []) {
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

vi.mock("@/db/repositories", () => ({
  chatRepository: {
    list: vi.fn(async () => [...repositoryState.chats.values()]),
    getById: vi.fn(async (id: string) => repositoryState.chats.get(id) ?? null),
    getByCharacterId: vi.fn(async () => []),
    create: vi.fn(async (input: { characterId: string; title: string }) => {
      const chat = makeChat(`chat-${repositoryState.chats.size + 1}`);
      repositoryState.chats.set(chat.id, { ...chat, ...input });
      return repositoryState.chats.get(chat.id)!;
    }),
    update: vi.fn(async (id: string) => {
      const chat = repositoryState.chats.get(id);
      if (!chat) throw new Error(`Chat not found: ${id}`);
      const updated = { ...chat, updatedAt: "2024-01-01T00:00:01.000Z" };
      repositoryState.chats.set(id, updated);
      return updated;
    }),
    delete: vi.fn(async (id: string) => {
      repositoryState.chats.delete(id);
    }),
  },
  messageRepository: {
    listByChatId: vi.fn(async (chatId: string) =>
      repositoryState.messages.filter((message) => message.chatId === chatId),
    ),
    listRecentByChatId: vi.fn(async (chatId: string, limit: number) =>
      repositoryState.messages.filter((message) => message.chatId === chatId).slice(-limit),
    ),
    listRecentTurnsByChatId: vi.fn(async (chatId: string) =>
      repositoryState.messages.filter((message) => message.chatId === chatId),
    ),
    create: vi.fn(async (input: CreateMessageInput) => {
      const message: Message = {
        id: `message-${repositoryState.nextMessageId++}`,
        parentId: input.parentId ?? null,
        createdAt: `2024-01-01T00:00:${String(repositoryState.nextMessageId).padStart(2, "0")}.000Z`,
        ...input,
      };
      repositoryState.messages.push(message);
      return message;
    }),
    patch: vi.fn(async (id: string, patch: Partial<Message>) => {
      const index = repositoryState.messages.findIndex((message) => message.id === id);
      if (index === -1) throw new Error(`Message not found: ${id}`);
      repositoryState.messages[index] = { ...repositoryState.messages[index], ...patch };
      return repositoryState.messages[index];
    }),
    deleteMessages: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      repositoryState.messages = repositoryState.messages.filter((message) => !idSet.has(message.id));
    }),
    deleteByChatId: vi.fn(async (chatId: string) => {
      repositoryState.messages = repositoryState.messages.filter((message) => message.chatId !== chatId);
    }),
  },
  chatMemoryRepository: { delete: vi.fn() },
  chatSavepointRepository: { deleteByChatId: vi.fn() },
  agenticPlayStateRepository: { delete: vi.fn() },
  secondaryApiUsageRepository: { deleteByChatId: vi.fn() },
  buildMessagePath,
  collectDescendantIds,
}));

function resetChatStore() {
  useChatStore.setState({
    chats: [],
    currentChat: null,
    messages: [],
    messagesHydrated: true,
    loading: false,
    sending: false,
    sendingChatId: null,
    streamingMessageId: null,
    generationPhase: null,
    activeGenerations: {},
    liveMessageDrafts: {},
    activeLeafId: null,
    error: null,
    lastDiceResult: null,
  });
}

describe("chat store live message drafts", () => {
  beforeEach(() => {
    repositoryState.chats.clear();
    repositoryState.messages = [];
    repositoryState.nextMessageId = 1;
    repositoryState.chats.set("chat-a", makeChat("chat-a"));
    repositoryState.chats.set("chat-b", makeChat("chat-b"));
    resetChatStore();
  });

  it("keeps streaming drafts available after switching away and back", async () => {
    await useChatStore.getState().loadChat("chat-a");
    useChatStore.getState().beginSending("chat-a");

    const user = await useChatStore.getState().addMessage({
      chatId: "chat-a",
      role: "user",
      content: "hello",
    });
    const assistant = await useChatStore.getState().addMessage({
      chatId: "chat-a",
      parentId: user.id,
      role: "assistant",
      content: "",
    });
    useChatStore.getState().setStreamingMessageId("chat-a", assistant.id);

    await useChatStore.getState().loadChat("chat-b");
    await useChatStore.getState().patchMessage(assistant.id, { content: "partial output" }, { persist: false });

    expect(useChatStore.getState().currentChat?.id).toBe("chat-b");
    expect(useChatStore.getState().messages.some((message) => message.id === assistant.id)).toBe(false);

    await useChatStore.getState().loadChat("chat-a");

    expect(useChatStore.getState().messages.find((message) => message.id === assistant.id)?.content).toBe(
      "partial output",
    );
  });
});
