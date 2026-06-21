import { create } from "zustand";
import { generationTaskRunner } from "@/app/generation-task-runner";
import {
  chatMemoryRepository,
  chatRepository,
  chatSavepointRepository,
  agenticPlayStateRepository,
  messageRepository,
  buildMessagePath,
  collectDescendantIds,
  secondaryApiUsageRepository,
} from "@/db/repositories";
import type { Chat, Message, CreateChatInput, CreateMessageInput } from "@neo-tavern/shared";
import type { GenerationPhase } from "./chat.types";
import type { DiceRollResult } from "@/features/agentic-play/agentic-play";

interface ActiveGenerationState {
  streamingMessageId: string | null;
  generationPhase: GenerationPhase;
}

type LiveMessageDrafts = Record<string, Record<string, Message>>;

interface ChatState {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  messagesHydrated: boolean;
  loading: boolean;
  sending: boolean;
  sendingChatId: string | null;
  streamingMessageId: string | null;
  generationPhase: GenerationPhase | null;
  activeGenerations: Record<string, ActiveGenerationState>;
  liveMessageDrafts: LiveMessageDrafts;
  generationErrors: Record<string, string | null>;
  activeLeafId: string | null;
  error: string | null;
  lastDiceResult: DiceRollResult | null;

  loadChats: () => Promise<void>;
  loadChat: (id: string) => Promise<void>;
  createOrGetChat: (input: CreateChatInput) => Promise<Chat>;
  deleteChat: (id: string) => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  ensureMessagesHydrated: (chatId: string) => Promise<Message[]>;
  addMessage: (input: CreateMessageInput) => Promise<Message>;
  updateMessage: (id: string, content: string) => Promise<void>;
  patchMessage: (
    id: string,
    patch: Partial<
      Pick<
        Message,
        "content" | "reasoningContent" | "generateDuration" | "thinkingDuration" | "usage" | "images" | "agenticOptions"
      >
    >,
    options?: { persist?: boolean },
  ) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  deleteMessages: (ids: string[]) => Promise<void>;
  getActivePath: (chatId: string) => Message[];
  switchBranch: (leafId: string) => void;
  mergeFromSavepoint: (chatId: string, savepointMessages: Message[]) => Promise<{ imported: number; skipped: number }>;
  beginSending: (chatId: string) => void;
  setStreamingMessageId: (chatId: string, id: string | null) => void;
  setGenerationPhase: (chatId: string, phase: GenerationPhase) => void;
  finishSending: (chatId?: string) => void;
  setGenerationError: (chatId: string, message: string | null) => void;
  clearGenerationError: (chatId: string) => void;
  setSending: (sending: boolean) => void;
  setLastDiceResult: (result: DiceRollResult | null) => void;
  clearError: () => void;
}

const CHAT_INITIAL_MESSAGE_LIMIT = 80;

let chatLoadSequence = 0;
let activeHydration: { chatId: string; promise: Promise<Message[]> } | null = null;

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function applyTouchedChat(state: Pick<ChatState, "chats" | "currentChat">, chat: Chat) {
  return {
    chats: sortChats(state.chats.map((c) => (c.id === chat.id ? chat : c))),
    currentChat: state.currentChat?.id === chat.id ? chat : state.currentChat,
  };
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
  });
}

function mergeHydratedMessages(fullMessages: Message[], currentMessages: Message[]): Message[] {
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const seen = new Set<string>();
  const merged = fullMessages.map((message) => {
    seen.add(message.id);
    return currentById.get(message.id) ?? message;
  });

  for (const message of currentMessages) {
    if (!seen.has(message.id)) merged.push(message);
  }

  return sortMessages(merged);
}

function mergeMessagesWithLiveDrafts(messages: Message[], drafts: Record<string, Message> | undefined): Message[] {
  if (!drafts) return messages;

  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const draft of Object.values(drafts)) {
    byId.set(draft.id, draft);
  }
  return sortMessages([...byId.values()]);
}

function findLiveMessageDraft(
  liveMessageDrafts: LiveMessageDrafts,
  id: string,
): { chatId: string; message: Message } | null {
  for (const [chatId, drafts] of Object.entries(liveMessageDrafts)) {
    const message = drafts[id];
    if (message) return { chatId, message };
  }
  return null;
}

function rememberLiveMessageDraft(liveMessageDrafts: LiveMessageDrafts, message: Message): LiveMessageDrafts {
  const drafts = liveMessageDrafts[message.chatId] ?? {};
  return {
    ...liveMessageDrafts,
    [message.chatId]: {
      ...drafts,
      [message.id]: message,
    },
  };
}

function patchLiveMessageDraft(
  liveMessageDrafts: LiveMessageDrafts,
  id: string,
  patch: Partial<
    Pick<
      Message,
      "content" | "reasoningContent" | "generateDuration" | "thinkingDuration" | "usage" | "images" | "agenticOptions"
    >
  >,
  fallback?: Message,
): LiveMessageDrafts {
  const live = findLiveMessageDraft(liveMessageDrafts, id);
  const message = fallback ?? live?.message;
  if (!message) return liveMessageDrafts;
  return rememberLiveMessageDraft(liveMessageDrafts, { ...message, ...patch });
}

function removeLiveMessageDraft(liveMessageDrafts: LiveMessageDrafts, id: string): LiveMessageDrafts {
  const live = findLiveMessageDraft(liveMessageDrafts, id);
  if (!live) return liveMessageDrafts;

  const nextDrafts = { ...liveMessageDrafts[live.chatId] };
  delete nextDrafts[id];
  if (Object.keys(nextDrafts).length === 0) {
    const next = { ...liveMessageDrafts };
    delete next[live.chatId];
    return next;
  }
  return {
    ...liveMessageDrafts,
    [live.chatId]: nextDrafts,
  };
}

function clearLiveMessageDrafts(liveMessageDrafts: LiveMessageDrafts, chatId: string): LiveMessageDrafts {
  if (!liveMessageDrafts[chatId]) return liveMessageDrafts;
  const next = { ...liveMessageDrafts };
  delete next[chatId];
  return next;
}

function legacyGenerationSnapshot(
  activeGenerations: Record<string, ActiveGenerationState>,
  preferredChatId?: string | null,
) {
  const preferred = preferredChatId ? activeGenerations[preferredChatId] : null;
  const nextChatId = preferred ? preferredChatId! : (Object.keys(activeGenerations)[0] ?? null);
  const next = nextChatId ? activeGenerations[nextChatId] : null;
  return {
    sending: !!next,
    sendingChatId: nextChatId,
    streamingMessageId: next?.streamingMessageId ?? null,
    generationPhase: next?.generationPhase ?? null,
  };
}

function hydrateMessages(
  chatId: string,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  if (activeHydration?.chatId === chatId) return activeHydration.promise;

  const promise = messageRepository
    .listByChatId(chatId)
    .then((fullMessages) => {
      const state = get();
      if (state.currentChat?.id !== chatId) return fullMessages;

      const withDrafts = mergeMessagesWithLiveDrafts(fullMessages, state.liveMessageDrafts[chatId]);
      const merged = mergeHydratedMessages(withDrafts, state.messages);
      set({ messages: merged, messagesHydrated: true });
      return merged;
    })
    .catch((err) => {
      const state = get();
      if (state.currentChat?.id === chatId) {
        set({ error: (err as Error).message, messagesHydrated: true });
        return state.messages;
      }
      return [];
    })
    .finally(() => {
      if (activeHydration?.promise === promise) activeHydration = null;
    });

  activeHydration = { chatId, promise };
  return promise;
}

export const useChatStore = create<ChatState>((set, get) => ({
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
  generationErrors: {},
  activeLeafId: null,
  error: null,
  lastDiceResult: null,

  loadChats: async () => {
    set({ loading: true, error: null });
    try {
      const chats = await chatRepository.list();
      set({ chats, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loadChat: async (id: string) => {
    const loadId = ++chatLoadSequence;
    set({ loading: true, error: null });
    try {
      const chat = await chatRepository.getById(id);
      if (loadId !== chatLoadSequence) return;
      if (chat) {
        const messages = await messageRepository.listRecentByChatId(chat.id, CHAT_INITIAL_MESSAGE_LIMIT);
        if (loadId !== chatLoadSequence) return;
        const withDrafts = mergeMessagesWithLiveDrafts(messages, get().liveMessageDrafts[chat.id]);
        set({ currentChat: chat, messages: withDrafts, activeLeafId: null, loading: false, messagesHydrated: false });
        void hydrateMessages(chat.id, set, get);
      } else {
        set({ loading: false, messagesHydrated: true });
      }
    } catch (err) {
      if (loadId === chatLoadSequence) {
        set({ error: (err as Error).message, loading: false, messagesHydrated: true });
      }
    }
  },

  createOrGetChat: async (input: CreateChatInput) => {
    const loadId = ++chatLoadSequence;
    set({ loading: true, error: null });
    try {
      const inMemory = get().chats.find((c) => c.characterId === input.characterId);
      if (inMemory) {
        const messages = await messageRepository.listRecentByChatId(inMemory.id, CHAT_INITIAL_MESSAGE_LIMIT);
        if (loadId !== chatLoadSequence) return inMemory;
        const withDrafts = mergeMessagesWithLiveDrafts(messages, get().liveMessageDrafts[inMemory.id]);
        set({
          currentChat: inMemory,
          messages: withDrafts,
          activeLeafId: null,
          loading: false,
          messagesHydrated: false,
        });
        void hydrateMessages(inMemory.id, set, get);
        return inMemory;
      }
      const existing = await chatRepository.getByCharacterId(input.characterId);
      if (loadId !== chatLoadSequence) {
        if (existing.length > 0) return existing[0];
      }
      if (existing.length > 0) {
        const chat = existing[0];
        const messages = await messageRepository.listRecentByChatId(chat.id, CHAT_INITIAL_MESSAGE_LIMIT);
        if (loadId !== chatLoadSequence) return chat;
        const state = get();
        const withDrafts = mergeMessagesWithLiveDrafts(messages, state.liveMessageDrafts[chat.id]);
        set({
          currentChat: chat,
          messages: withDrafts,
          activeLeafId: null,
          chats: state.chats,
          loading: false,
          messagesHydrated: false,
        });
        void hydrateMessages(chat.id, set, get);
        return chat;
      }
      const chat = await chatRepository.create(input);
      if (loadId !== chatLoadSequence) return chat;
      set((state) => ({
        chats: [chat, ...state.chats],
        currentChat: chat,
        messages: [],
        activeLeafId: null,
        messagesHydrated: true,
        loading: false,
      }));
      return chat;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  deleteChat: async (id: string) => {
    generationTaskRunner.abort(`chat:${id}`);
    set({ loading: true, error: null });
    try {
      await chatRepository.delete(id);
      await messageRepository.deleteByChatId(id);
      await chatSavepointRepository.deleteByChatId(id);
      await chatMemoryRepository.delete(id);
      await agenticPlayStateRepository.delete(id);
      await secondaryApiUsageRepository.deleteByChatId(id);
      set((state) => {
        const activeGenerations = Object.fromEntries(
          Object.entries(state.activeGenerations).filter(([chatId]) => chatId !== id),
        );
        const generationErrors = { ...state.generationErrors };
        delete generationErrors[id];
        return {
          chats: state.chats.filter((c) => c.id !== id),
          currentChat: state.currentChat?.id === id ? null : state.currentChat,
          messages: state.currentChat?.id === id ? [] : state.messages,
          messagesHydrated: state.currentChat?.id === id ? true : state.messagesHydrated,
          activeGenerations,
          liveMessageDrafts: clearLiveMessageDrafts(state.liveMessageDrafts, id),
          generationErrors,
          ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId === id ? null : state.sendingChatId),
          loading: false,
        };
      });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  loadMessages: async (chatId: string) => {
    try {
      const messages = await messageRepository.listByChatId(chatId);
      set((state) => ({
        messages: mergeMessagesWithLiveDrafts(messages, state.liveMessageDrafts[chatId]),
        messagesHydrated: true,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  ensureMessagesHydrated: async (chatId: string) => {
    const state = get();
    const hydrated = state.currentChat?.id === chatId && state.messagesHydrated;
    if (!hydrated) await hydrateMessages(chatId, set, get);
    return get().messages.filter((m) => m.chatId === chatId);
  },

  addMessage: async (input: CreateMessageInput) => {
    try {
      const message = await messageRepository.create(input);
      const chat = await chatRepository.update(input.chatId, {});
      set((state) => ({
        messages: state.currentChat?.id === input.chatId ? [...state.messages, message] : state.messages,
        liveMessageDrafts: state.activeGenerations[input.chatId]
          ? rememberLiveMessageDraft(state.liveMessageDrafts, message)
          : state.liveMessageDrafts,
        ...applyTouchedChat(state, chat),
      }));
      return message;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  setGenerationError: (chatId, message) =>
    set((state) => {
      if ((state.generationErrors[chatId] ?? null) === message) return {};
      const generationErrors = { ...state.generationErrors };
      if (message === null) {
        delete generationErrors[chatId];
      } else {
        generationErrors[chatId] = message;
      }
      return { generationErrors };
    }),

  clearGenerationError: (chatId) =>
    set((state) => {
      if (!(chatId in state.generationErrors)) return {};
      const generationErrors = { ...state.generationErrors };
      delete generationErrors[chatId];
      return { generationErrors };
    }),

  beginSending: (chatId: string) =>
    set((state) => {
      const activeGenerations = {
        ...state.activeGenerations,
        [chatId]: { streamingMessageId: null, generationPhase: "thinking" as const },
      };
      return {
        activeGenerations,
        ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId ?? chatId),
      };
    }),

  setStreamingMessageId: (chatId: string, id: string | null) =>
    set((state) => {
      const current = state.activeGenerations[chatId];
      if (!current) return {};
      const activeGenerations = {
        ...state.activeGenerations,
        [chatId]: { ...current, streamingMessageId: id },
      };
      return {
        activeGenerations,
        ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId),
      };
    }),

  setGenerationPhase: (chatId: string, phase: GenerationPhase) =>
    set((state) => {
      const current = state.activeGenerations[chatId];
      if (!current) return {};
      const activeGenerations = {
        ...state.activeGenerations,
        [chatId]: { ...current, generationPhase: phase },
      };
      return {
        activeGenerations,
        ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId),
      };
    }),

  finishSending: (chatId?: string) =>
    set((state) => {
      if (!chatId)
        return {
          activeGenerations: {},
          liveMessageDrafts: {},
          sending: false,
          sendingChatId: null,
          streamingMessageId: null,
          generationPhase: null,
        };
      if (!state.activeGenerations[chatId]) return {};
      const activeGenerations = { ...state.activeGenerations };
      delete activeGenerations[chatId];
      return {
        activeGenerations,
        liveMessageDrafts: clearLiveMessageDrafts(state.liveMessageDrafts, chatId),
        ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId === chatId ? null : state.sendingChatId),
      };
    }),

  setSending: (sending: boolean) =>
    set((state) => {
      if (!sending) {
        return {
          activeGenerations: {},
          liveMessageDrafts: {},
          sending: false,
          sendingChatId: null,
          streamingMessageId: null,
          generationPhase: null,
        };
      }
      const chatId = state.sendingChatId ?? state.currentChat?.id;
      if (!chatId) {
        return {
          sending: true,
          sendingChatId: null,
          streamingMessageId: state.streamingMessageId,
          generationPhase: state.generationPhase ?? "thinking",
        };
      }
      const activeGenerations = {
        ...state.activeGenerations,
        [chatId]: state.activeGenerations[chatId] ?? {
          streamingMessageId: state.streamingMessageId,
          generationPhase: state.generationPhase ?? "thinking",
        },
      };
      return {
        activeGenerations,
        ...legacyGenerationSnapshot(activeGenerations, chatId),
      };
    }),

  setLastDiceResult: (result: DiceRollResult | null) => set({ lastDiceResult: result }),

  updateMessage: async (id: string, content: string) => {
    try {
      const updated = await messageRepository.update(id, content);
      const chat = await chatRepository.update(updated.chatId, {});
      set((state) => ({
        messages: state.messages.map((m) => (m.id === id ? updated : m)),
        ...applyTouchedChat(state, chat),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  patchMessage: async (id, patch, options = {}) => {
    const persist = options.persist ?? true;
    set((state) => {
      const fallback = state.messages.find((message) => message.id === id);
      return {
        messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        liveMessageDrafts: patchLiveMessageDraft(state.liveMessageDrafts, id, patch, fallback),
      };
    });
    if (!persist) return;
    try {
      const updated = await messageRepository.patch(id, patch);
      set((state) => ({
        messages: state.messages.map((m) => (m.id === id ? updated : m)),
        liveMessageDrafts: state.activeGenerations[updated.chatId]
          ? rememberLiveMessageDraft(state.liveMessageDrafts, updated)
          : removeLiveMessageDraft(state.liveMessageDrafts, updated.id),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteMessage: async (id: string) => {
    try {
      const state = get();
      const target =
        state.messages.find((m) => m.id === id) ?? findLiveMessageDraft(state.liveMessageDrafts, id)?.message;
      if (!target) return;

      // Cascade: collect all descendant ids
      const descendantIds = collectDescendantIds(
        mergeMessagesWithLiveDrafts(get().messages, get().liveMessageDrafts[target.chatId]),
        id,
      );
      const allIds = [id, ...descendantIds];

      await messageRepository.deleteMessages(allIds);
      const chat = await chatRepository.update(target.chatId, {});
      const idSet = new Set(allIds);
      set((state) => ({
        messages: state.messages.filter((m) => !idSet.has(m.id)),
        liveMessageDrafts: allIds.reduce(removeLiveMessageDraft, state.liveMessageDrafts),
        ...applyTouchedChat(state, chat),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  getActivePath: (chatId: string) => {
    const { messages, activeLeafId } = get();
    const chatMessages = messages.filter((message) => message.chatId === chatId);
    if (chatMessages.length === 0) return [];

    // Use active leaf if valid for this chat, otherwise fall back to the latest message.
    const leafId =
      activeLeafId && chatMessages.some((message) => message.id === activeLeafId)
        ? activeLeafId
        : (() => {
            const sorted = [...chatMessages].sort((a, b) => {
              const byTime = b.createdAt.localeCompare(a.createdAt);
              return byTime === 0 ? b.id.localeCompare(a.id) : byTime;
            });
            return sorted[0].id;
          })();

    return buildMessagePath(chatMessages, leafId);
  },

  switchBranch: (leafId: string) => {
    set({ activeLeafId: leafId });
  },

  mergeFromSavepoint: async (chatId: string, savepointMessages: Message[]) => {
    const result = await messageRepository.mergeFromSavepoint(chatId, savepointMessages);
    const messages = await messageRepository.listByChatId(chatId);
    set((state) => ({
      messages: state.currentChat?.id === chatId ? messages : state.messages,
    }));
    return result;
  },

  deleteMessages: async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const idSet = new Set(ids);
      const targets = get().messages.filter((m) => idSet.has(m.id));
      await messageRepository.deleteMessages(ids);
      const chatId = targets[0]?.chatId;
      const chat = chatId ? await chatRepository.update(chatId, {}) : null;
      set((state) => ({
        messages: state.messages.filter((m) => !idSet.has(m.id)),
        ...(chat ? applyTouchedChat(state, chat) : {}),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },
}));
