import { create } from "zustand";
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
  getActivePath: (_chatId: string) => Message[];
  switchBranch: (leafId: string) => void;
  createBranch: (parentId: string, branchName?: string) => Promise<Message>;
  getBranchName: (leafId: string) => string;
  setBranchName: (leafId: string, name: string) => void;
  mergeFromSavepoint: (chatId: string, savepointMessages: Message[]) => Promise<{ imported: number; skipped: number }>;
  beginSending: (chatId: string) => void;
  setStreamingMessageId: (chatId: string, id: string | null) => void;
  setGenerationPhase: (chatId: string, phase: GenerationPhase) => void;
  finishSending: (chatId?: string) => void;
  setSending: (sending: boolean) => void;
  setLastDiceResult: (result: DiceRollResult | null) => void;
  clearError: () => void;
}

const CHAT_INITIAL_MESSAGE_LIMIT = 80;

let chatLoadSequence = 0;
let activeHydration: { chatId: string; promise: Promise<Message[]> } | null = null;

// ── Branch name storage ──
const BRANCH_NAMES_KEY = "neotavern_branch_names";

function loadBranchNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BRANCH_NAMES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBranchName(leafId: string, name: string) {
  const names = loadBranchNames();
  names[leafId] = name;
  try { localStorage.setItem(BRANCH_NAMES_KEY, JSON.stringify(names)); } catch { /* noop */ }
}

function getAutoBranchName(leafId: string, siblings: string[]): string {
  const idx = siblings.indexOf(leafId);
  return idx >= 0 ? `分支 ${idx + 1}` : `分支`;
}

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

      const merged = mergeHydratedMessages(fullMessages, state.messages);
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
        set({ currentChat: chat, messages, loading: false, messagesHydrated: false });
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
        set({ currentChat: inMemory, messages, loading: false, messagesHydrated: false });
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
        set({ currentChat: chat, messages, chats: state.chats, loading: false, messagesHydrated: false });
        void hydrateMessages(chat.id, set, get);
        return chat;
      }
      const chat = await chatRepository.create(input);
      if (loadId !== chatLoadSequence) return chat;
      set((state) => ({
        chats: [chat, ...state.chats],
        currentChat: chat,
        messages: [],
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
        return {
          chats: state.chats.filter((c) => c.id !== id),
          currentChat: state.currentChat?.id === id ? null : state.currentChat,
          messages: state.currentChat?.id === id ? [] : state.messages,
          messagesHydrated: state.currentChat?.id === id ? true : state.messagesHydrated,
          activeGenerations,
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
      set({ messages, messagesHydrated: true });
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
        ...applyTouchedChat(state, chat),
      }));
      return message;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),

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
        ...legacyGenerationSnapshot(activeGenerations, state.sendingChatId === chatId ? null : state.sendingChatId),
      };
    }),

  setSending: (sending: boolean) =>
    set((state) => {
      if (!sending) {
        return {
          activeGenerations: {},
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
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    if (!persist) return;
    try {
      const updated = await messageRepository.patch(id, patch);
      set((state) => ({
        messages: state.messages.map((m) => (m.id === id ? updated : m)),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteMessage: async (id: string) => {
    try {
      const target = get().messages.find((m) => m.id === id);
      if (!target) return;

      // Cascade: collect all descendant ids
      const descendantIds = collectDescendantIds(get().messages, id);
      const allIds = [id, ...descendantIds];

      await messageRepository.deleteMessages(allIds);
      const chat = await chatRepository.update(target.chatId, {});
      const idSet = new Set(allIds);
      set((state) => ({
        messages: state.messages.filter((m) => !idSet.has(m.id)),
        ...applyTouchedChat(state, chat),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  getActivePath: (_chatId: string) => {
    const { messages, activeLeafId } = get();
    if (messages.length === 0) return [];

    // Use active leaf if set, otherwise fall back to the latest message
    const leafId = activeLeafId ?? (() => {
      const sorted = [...messages].sort((a, b) => {
        const byTime = b.createdAt.localeCompare(a.createdAt);
        return byTime === 0 ? b.id.localeCompare(a.id) : byTime;
      });
      return sorted[0].id;
    })();

    return buildMessagePath(messages, leafId);
  },

  switchBranch: (leafId: string) => {
    set({ activeLeafId: leafId });
  },

  createBranch: async (parentId: string, branchName?: string) => {
    // Create an empty assistant message as the branch head
    const msg = await messageRepository.create({
      chatId: get().currentChat?.id ?? "",
      parentId,
      role: "assistant",
      content: "",
    });

    if (branchName) saveBranchName(msg.id, branchName);

    set((state) => ({
      messages: [...state.messages, msg],
      activeLeafId: msg.id,
    }));

    return msg;
  },

  getBranchName: (leafId: string) => {
    const names = loadBranchNames();
    if (names[leafId]) return names[leafId];

    // Auto-generate name from sibling order
    const msg = get().messages.find((m) => m.id === leafId);
    if (!msg?.parentId) return "主分支";

    const siblings = get().messages
      .filter((m) => m.parentId === msg.parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => m.id);

    return getAutoBranchName(leafId, siblings);
  },

  setBranchName: (leafId: string, name: string) => {
    saveBranchName(leafId, name);
  },

  mergeFromSavepoint: async (chatId: string, savepointMessages: Message[]) => {
    const result = await messageRepository.mergeFromSavepoint(chatId, savepointMessages);
    // Reload the chat to pick up the merged messages
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
