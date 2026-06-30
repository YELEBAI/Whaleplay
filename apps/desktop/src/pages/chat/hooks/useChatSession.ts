import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { Chat } from "@neo-tavern/shared";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { chatRepository } from "@/db/repositories";
import { device, prefs } from "@/db/kv";
import { readOptional } from "@/db/storage/repository-helpers";
import { CHAT_FONT_SIZE_KEY, clampChatFontSize, getChatDraftKey } from "../utils";

interface UseChatSessionParams {
  /** Called once the font-size preference has been read from storage. */
  onFontSizeLoaded?: (size: number) => void;
}

/**
 * Owns the chat-level session: route params, character resolution, chat
 * loading/creation, font-size + draft persistence, chat-list state, and the
 * records that feed the sidebar.
 *
 * Returns the raw store handles so callers can read `currentChat`, `messages`,
 * `loading`, etc. without re-destructuring the store themselves.
 *
 * Extracted from ChatPage (Phase 1 UI split).
 */
export function useChatSession({ onFontSizeLoaded }: UseChatSessionParams = {}) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initRef = useRef<string | null>(null);
  const draftReadyChatRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const currentChatIdRef = useRef<string | null>(null);

  const { characters, loadCharacters } = useCharacterStore();
  const {
    currentChat,
    messages,
    loading,
    messagesHydrated,
    error: chatError,
    loadChat,
    createOrGetChat,
    addMessage,
    clearError,
    updateMessage,
    patchMessage,
    deleteMessages,
    lastDiceResult,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [fontSize, setFontSize] = useState(15);
  const [chatListCollapsed, setChatListCollapsed] = useState(false);
  const [chatRecords, setChatRecords] = useState<Chat[]>([]);

  const characterId = searchParams.get("characterId");
  const character = characters.find((c) => c.id === (currentChat?.characterId ?? characterId));

  useEffect(() => {
    currentChatIdRef.current = currentChat?.id ?? null;
  }, [currentChat?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    useChatStore.getState().setLastDiceResult(null);
  }, [currentChat?.id]);

  // Font size: load once, persist on change.
  useEffect(() => {
    let cancelled = false;
    readOptional(prefs, CHAT_FONT_SIZE_KEY).then((raw) => {
      if (cancelled || raw == null) return;
      const next = clampChatFontSize(Number(raw));
      setFontSize(next);
      onFontSizeLoaded?.(next);
    });
    return () => {
      cancelled = true;
    };
  }, [onFontSizeLoaded]);

  useEffect(() => {
    if (currentChat?.id) {
      void device.set("last-chat-id", currentChat.id);
    }
  }, [currentChat?.id]);

  // Sidebar records: refresh whenever the chat changes or messages/sending shift.
  useEffect(() => {
    let cancelled = false;
    chatRepository.list().then((records) => {
      if (cancelled) return;
      const byId = new Map(records.map((chat) => [chat.id, chat]));
      if (currentChat) {
        byId.set(currentChat.id, currentChat);
      }
      setChatRecords([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    });
    return () => {
      cancelled = true;
    };
  }, [currentChat, currentChat?.id, currentChat?.updatedAt, messages.length, loading]);

  // Load existing chat or create one for a character.
  useEffect(() => {
    if (id && id !== "new") {
      loadChat(id);
      return;
    }
    if (!characterId || id !== "new") return;
    if (characters.length === 0) return;
    if (initRef.current === characterId) return;
    initRef.current = characterId;

    const charName = characters.find((c) => c.id === characterId)?.name ?? "Chat";
    createOrGetChat({ characterId, title: charName }).catch(() => {});
  }, [id, characterId, characters.length, characters, createOrGetChat, loadChat]);

  // Activate the character's worldbook / regex preset.
  useEffect(() => {
    if (!character) return;
    const settingsState = useSettingsStore.getState();
    const wbState = useWorldbookStore.getState();
    if (character.regexPresetId && character.regexPresetId !== settingsState.activeRegexPresetId) {
      settingsState.setActiveRegexPreset(character.regexPresetId);
    }
    if (character.worldbookId && character.worldbookId !== wbState.activeWorldbookId) {
      wbState.setActiveWorldbook(character.worldbookId);
    }
  }, [character?.id, character?.regexPresetId, character?.worldbookId, character]);

  // Draft restore / persist.
  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId) {
      draftReadyChatRef.current = null;
      const timeout = window.setTimeout(() => setInput(""), 0);
      return () => window.clearTimeout(timeout);
    }

    draftReadyChatRef.current = null;
    let cancelled = false;
    readOptional(device, getChatDraftKey(chatId)).then((draft) => {
      if (cancelled) return;
      const next = draft ?? "";
      draftReadyChatRef.current = chatId;
      setInput(next);
    });
    return () => {
      cancelled = true;
      if (draftReadyChatRef.current === chatId) draftReadyChatRef.current = null;
    };
  }, [currentChat?.id]);

  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId) return;
    if (draftReadyChatRef.current !== chatId) return;

    const timeout = window.setTimeout(() => {
      const key = getChatDraftKey(chatId);
      if (input) void device.set(key, input);
      else void device.remove(key);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [currentChat?.id, input]);

  const handleSelectCharacterChat = useCallback(
    (chatId: string) => {
      if (chatId === currentChat?.id) return;
      navigate(`/chat/${chatId}`);
    },
    [currentChat?.id, navigate],
  );

  const handleFontSizeChange = useCallback((value: number) => {
    const next = clampChatFontSize(value);
    setFontSize(next);
    void prefs.set(CHAT_FONT_SIZE_KEY, String(next));
  }, []);

  return {
    // route
    id,
    searchParams,
    navigate,
    // store handles
    characters,
    currentChat,
    messages,
    loading,
    messagesHydrated,
    chatError,
    loadChat,
    createOrGetChat,
    addMessage,
    clearError,
    updateMessage,
    patchMessage,
    deleteMessages,
    lastDiceResult,
    // refs (for guards used by send/agentic effects)
    mountedRef,
    currentChatIdRef,
    // derived
    characterId,
    character,
    // UI state
    input,
    setInput,
    fontSize,
    chatListCollapsed,
    setChatListCollapsed,
    chatRecords,
    // handlers
    handleSelectCharacterChat,
    handleFontSizeChange,
    setFontSize,
  };
}

export type UseChatSessionReturn = ReturnType<typeof useChatSession>;
