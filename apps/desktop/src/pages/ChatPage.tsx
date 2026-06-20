import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import {
  ChevronRight,
  Copy,
  Pencil,
  ScrollText,
  RotateCcw,
  CheckCheck,
  Trash2,
  Brain,
  Image as ImageIcon,
  User as UserIcon,
  CircleDashed,
} from "lucide-react";
import { Button, Card, CardContent, cn } from "@neo-tavern/ui";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useSendMessage } from "@/features/chat/hooks/useSendMessage";
import {
  buildStoredContextCompressionPromptPlan,
  compressChatHistoryForPrompt,
  stripContextCompressionMessages,
} from "@/features/chat/context-compression";
import {
  chatRepository,
  agenticPlayStateRepository,
  presetRepository,
  secondaryApiUsageRepository,
} from "@/db/repositories";
import type { SecondaryApiUsageRecord } from "@/db/repositories";
import { getStorageItem, removeStorageItem, setStorageItem } from "@/db/storage";
import {
  buildChatPrompt,
  formatPreview,
  applyRegexRules,
  getWorldbookEntryInsertPosition,
  resolveWorldbookEntries,
} from "@neo-tavern/core";
import type { DisplayBlock } from "@neo-tavern/core";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { buildRagContextBlock, initializeRagForChat } from "@/features/rag/rag-memory";
import { useRagStatusStore, type RagTaskStatus } from "@/features/rag/rag-status.store";
import { ChoiceInputPanel, type ChoiceInputPanelChoice } from "@/components/ChoiceInputPanel";
import { type BuiltPrompt, type Chat, type ContextBlock, type Message, type MessageImage } from "@neo-tavern/shared";
import {
  createGeneratingImages,
  extractImageMarkers,
  generateComfyImage,
  normalizeImageSettings,
  planImageMarkersWithModel,
  type ImagePlannerWorldbookReference,
} from "@/features/image-generation/image-generation";
import { selectWorldbookReferenceEntries } from "@/features/image-generation/worldbook-references";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { getChatScopedDeepSeekUserId } from "@/features/settings/model-capabilities";
import {
  AGENTIC_PLAY_OPENING_PROMPT,
  createAgenticPlayContextBlock,
  rollDice,
  type AgenticActionOption,
  type AgenticGameState,
  type DiceRollResult,
} from "@/features/agentic-play/agentic-play";
import { getAgenticPlayPresetItems } from "@/features/agentic-play/agentic-preset";
import {
  ChatSidebar,
  ChatRightPanel,
  ChatInputArea,
  useBranchNavigation,
  useSavepointManager,
  ChatActivityTimeline,
  ImageDisplayBlockView,
  ensureImageSlots,
  clipImageReference,
  resolveImagePlannerConfig,
  Avatar,
  SideBlockView,
  TemplateDisplayBlockView,
} from "@/pages/chat";
import { toast } from "@/utils/toast";
import {
  CONTINUE_PROMPT,
  DEEPSEEK_CONTEXT_LIMIT,
  CHAT_FONT_SIZE_KEY,
  clampChatFontSize,
  getChatDraftKey,
  getGenerationStatus,
  replaceUserPlaceholders,
  type PendingSendItem,
  type TokenUsageView,
  MessageEditBox,
  ImagePromptDialog,
  PromptDialog,
  SaveDialog,
  LoadDialog,
  TokenDialog,
  DeleteMessageDialog,
  ThinkingDialog,
  RegenerateDialog,
} from "@/pages/chat";

function getChoiceAgenticOption(choice?: ChoiceInputPanelChoice): AgenticActionOption | null {
  const raw = choice?.meta?.agenticOption;
  if (!raw || typeof raw !== "object") return null;
  return raw as AgenticActionOption;
}

function buildAgenticChoicePayload(option: AgenticActionOption, roll: DiceRollResult) {
  return JSON.stringify(
    {
      type: "agentic_player_action",
      source: "structured_option",
      label: option.label,
      action: option.action,
      success_probability: option.probability,
      difficulty: option.difficulty,
      dice_result: roll,
      continuity_guard:
        "Only the selected action and dice_result are authoritative. Do not treat unselected option descriptions or internal reasoning as history. Do not reference prior NPC speech unless it exists in visible chat history as dialogue JSON; if an NPC provides information now, output that dialogue JSON first.",
    },
    null,
    2,
  );
}

const INITIAL_RENDER_TURN_LIMIT = 10;
const LAZY_RENDER_TURN_BATCH = 20;
const LOAD_OLDER_SCROLL_THRESHOLD = 80;
const CHAT_BOOT_MIN_MS = 360;
const RAG_BLOCKING_COVER_DELAY_MS = 700;

function getRecentAssistantTurnStartIndex(messages: Message[], turnLimit: number) {
  const limit = Math.max(1, Math.floor(turnLimit || INITIAL_RENDER_TURN_LIMIT));
  const indexedAssistantMessages = messages.filter(
    (message) => message.role === "assistant" && typeof message.roundIndex === "number" && message.roundIndex > 0,
  );

  if (indexedAssistantMessages.length > 0) {
    const latestRoundIndex = Math.max(...indexedAssistantMessages.map((message) => message.roundIndex ?? 0));
    if (latestRoundIndex <= limit) return 0;

    const preserveFromRoundIndex = latestRoundIndex - limit + 1;
    const firstAssistantToKeep = messages.findIndex(
      (message) =>
        message.role === "assistant" &&
        typeof message.roundIndex === "number" &&
        message.roundIndex >= preserveFromRoundIndex,
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

function ChatLoadingCover({
  character,
  progress,
  ragStatus,
}: {
  character?: { name: string; avatar?: string; description?: string };
  progress: number;
  ragStatus?: RagTaskStatus | null;
}) {
  const name = character?.name ?? "Whale Play";
  const initial = name.charAt(0).toUpperCase();
  const ragProgress =
    ragStatus?.progressTotal && ragStatus.progressTotal > 0
      ? `${Math.min(ragStatus.progressTotal, Math.max(0, ragStatus.progressCurrent ?? 0))}/${ragStatus.progressTotal}`
      : "";
  const loadingText = ragStatus
    ? [ragStatus.label, ragProgress, ragStatus.detail].filter(Boolean).join(" · ")
    : "正在载入最新消息...";

  return (
    <div className="flex h-full min-h-[420px] items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-card shadow-sm">
          {character?.avatar ? (
            <img src={character.avatar} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-primary">{initial}</span>
          )}
        </div>
        <div className="text-sm font-semibold">{name}</div>
        <p className="text-muted-foreground mt-1 truncate text-xs" title={loadingText}>
          {loadingText}
        </p>
        <div className="bg-muted mt-5 h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(8, Math.min(progress, 96))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatScrollFrameRef = useRef<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const renderedMessageNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const isNearBottomRef = useRef(true);
  const initRef = useRef<string | null>(null);
  const lastOpenedChatRef = useRef<string | null>(null);
  const draftReadyChatRef = useRef<string | null>(null);
  const skipNextMessageAutoScrollRef = useRef<string | null>(null);
  const wasGeneratingCurrentChatRef = useRef(false);
  const activeStreamingMessageRef = useRef<string | null>(null);
  const completedScrollMessageRef = useRef<string | null>(null);
  const streamAutoScrollPausedRef = useRef(false);
  const lastChatScrollTopRef = useRef(0);
  const olderMessagesLoadingRef = useRef(false);
  const pendingPrependAdjustmentRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const agenticOpeningStartedRef = useRef<string | null>(null);
  const presetItemsRef = useRef<{ role: "system" | "user"; content: string; injectionOrder: number }[]>([]);
  const lastRagInitKeyRef = useRef<string | null>(null);

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
    ensureMessagesHydrated,
    clearError,
    updateMessage,
    patchMessage,
    deleteMessages,
    lastDiceResult,
  } = useChatStore();

  const branch = useBranchNavigation(currentChat?.id);
  const regexPresets = useSettingsStore((s) => s.regexPresets);
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId);
  const imageGeneration = useSettingsStore((s) => s.imageGeneration);
  const ragMemorySettings = useSettingsStore((s) => s.ragMemory);
  const worldbooks = useWorldbookStore((s) => s.worldbooks);
  const activeWorldbookId = useWorldbookStore((s) => s.activeWorldbookId);
  const ragStatus = useRagStatusStore((s) => (currentChat?.id ? (s.statusByChatId[currentChat.id] ?? null) : null));
  const activeRegexRules = useMemo(() => {
    const rules: (typeof regexPresets)[0]["rules"] = [];
    for (const p of regexPresets) {
      if (p.isGlobal) rules.push(...p.rules.filter((r) => r.enabled));
    }
    if (activeRegexPresetId) {
      const preset = regexPresets.find((p) => p.id === activeRegexPresetId);
      if (preset) rules.push(...preset.rules.filter((r) => r.enabled));
    }
    const seen = new Set<string>();
    return rules.filter((r) => {
      if (seen.has(r.pattern)) return false;
      seen.add(r.pattern);
      return true;
    });
  }, [regexPresets, activeRegexPresetId]);
  const [input, setInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [pendingSendQueue, setPendingSendQueue] = useState<PendingSendItem[]>([]);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [imagePromptEditTarget, setImagePromptEditTarget] = useState<{
    messageId: string;
    imageIndex: number;
    fallbackPrompt: string;
  } | null>(null);
  const [imagePromptDraft, setImagePromptDraft] = useState("");
  const [imageGenerationBusy, setImageGenerationBusy] = useState<Record<string, boolean>>({});
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const personaName = useSettingsStore((s) => s.personaName);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenUsageView, setTokenUsageView] = useState<TokenUsageView>("main");
  const [secondaryUsageRecords, setSecondaryUsageRecords] = useState<SecondaryApiUsageRecord[]>([]);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<Message | null>(null);
  const [fontSize, setFontSize] = useState(15);
  const [chatListCollapsed, setChatListCollapsed] = useState(false);
  const [thinkingMsg, setThinkingMsg] = useState<Message | null>(null);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [contextCompressionRunning, setContextCompressionRunning] = useState(false);
  const [renderedTurnLimit, setRenderedTurnLimit] = useState(INITIAL_RENDER_TURN_LIMIT);
  const [chatBooting, setChatBooting] = useState(false);
  const [showRagBlockingCover, setShowRagBlockingCover] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [agenticPlayEnabled, setAgenticPlayEnabled] = useState(false);
  const [agenticGameState, setAgenticGameState] = useState<AgenticGameState | null>(null);
  const [dismissedAgenticChoiceMessageId, setDismissedAgenticChoiceMessageId] = useState<string | null>(null);
  const [chatRecords, setChatRecords] = useState<Chat[]>([]);

  const characterId = searchParams.get("characterId");
  const character = characters.find((c) => c.id === (currentChat?.characterId ?? characterId));
  const ragWorldbook = useMemo(() => {
    const worldbookId = character?.worldbookId || activeWorldbookId;
    return worldbookId ? (worldbooks.find((worldbook) => worldbook.id === worldbookId) ?? null) : null;
  }, [activeWorldbookId, character?.worldbookId, worldbooks]);
  const smartStreamingScrollEnabled = useSettingsStore((s) => s.smartStreamingScrollEnabled);

  const handleSelectCharacterChat = useCallback(
    (chatId: string) => {
      if (chatId === currentChat?.id) return;
      navigate(`/chat/${chatId}`);
    },
    [currentChat?.id, navigate],
  );

  const handleFontSizeChange = (value: number) => {
    const next = clampChatFontSize(value);
    setFontSize(next);
    void setStorageItem(CHAT_FONT_SIZE_KEY, String(next));
  };

  const {
    sendMessage,
    regenerate,
    abort,
    sending,
    sendingChatId,
    streamingMessageId,
    generationPhase,
    error: sendError,
    clearError: clearSendError,
  } = useSendMessage({
    character,
    chatId: currentChat?.id,
    agenticPlayEnabled,
    onAgenticPlayStateUpdated: setAgenticGameState,
    onPromptBuilt: (built: BuiltPrompt) => {
      setPreviewText(formatPreview(built));
    },
  });

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    const worldbookState = useWorldbookStore.getState();
    if (worldbookState.worldbooks.length === 0 && !worldbookState.loading) {
      void worldbookState.loadWorldbooks();
    }
  }, []);

  useEffect(() => {
    useChatStore.getState().setLastDiceResult(null);
  }, [currentChat?.id]);

  useEffect(() => {
    let cancelled = false;
    getStorageItem(CHAT_FONT_SIZE_KEY).then((raw) => {
      if (cancelled || raw == null) return;
      setFontSize(clampChatFontSize(Number(raw)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentChat?.id) {
      localStorage.setItem("neo:last-chat-id", currentChat.id);
    }
  }, [currentChat?.id]);

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
  }, [currentChat, currentChat?.id, currentChat?.updatedAt, messages.length, sending]);

  useEffect(() => {
    presetRepository.getActivePresetId().then(async (activeId) => {
      if (activeId) {
        const preset = await presetRepository.getById(activeId);
        if (preset) {
          presetItemsRef.current = preset.items
            .filter((i) => i.enabled)
            .map((i) => ({ role: i.role, content: i.content, injectionOrder: i.injectionOrder }));
        }
      } else {
        presetItemsRef.current = [];
      }
    });
  }, []);

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

  useEffect(() => {
    wasGeneratingCurrentChatRef.current = false;
    activeStreamingMessageRef.current = null;
    completedScrollMessageRef.current = null;
    isNearBottomRef.current = true;
  }, [currentChat?.id]);

  useEffect(() => {
    let cancelled = false;
    const chatId = currentChat?.id;
    if (!chatId) {
      setSecondaryUsageRecords([]);
      return;
    }
    if (!tokenDialogOpen) return;
    secondaryApiUsageRepository.listByChatId(chatId).then((records) => {
      if (!cancelled) setSecondaryUsageRecords(records);
    });
    return () => {
      cancelled = true;
    };
  }, [currentChat?.id, tokenDialogOpen, tokenUsageView, messages]);

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

  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId || !character) {
      lastRagInitKeyRef.current = null;
      return;
    }

    if (!ragMemorySettings.enabled) {
      useRagStatusStore.getState().clear(chatId);
      lastRagInitKeyRef.current = null;
      return;
    }

    const initKey = [
      chatId,
      character.id,
      character.updatedAt,
      ragWorldbook?.id ?? "no-worldbook",
      ragWorldbook?.updatedAt ?? "",
      ragMemorySettings.embeddingProvider,
      ragMemorySettings.embeddingModel,
      ragMemorySettings.builtinModel,
      ragMemorySettings.indexCharacter ? "character" : "no-character",
      ragMemorySettings.indexWorldbook ? "worldbook" : "no-worldbook-index",
      ragMemorySettings.maxChunkChars,
    ].join("|");

    if (lastRagInitKeyRef.current === initKey) return;
    lastRagInitKeyRef.current = initKey;
    void initializeRagForChat({ chatId, character, worldbook: ragWorldbook });
  }, [
    currentChat?.id,
    character,
    ragWorldbook,
    ragMemorySettings.enabled,
    ragMemorySettings.embeddingProvider,
    ragMemorySettings.embeddingModel,
    ragMemorySettings.builtinModel,
    ragMemorySettings.indexCharacter,
    ragMemorySettings.indexWorldbook,
    ragMemorySettings.maxChunkChars,
  ]);

  useEffect(() => {
    let cancelled = false;
    const chatId = currentChat?.id;
    if (!chatId || !character) {
      setAgenticPlayEnabled(false);
      setAgenticGameState(null);
      return;
    }

    agenticPlayStateRepository.get(chatId, character).then((record) => {
      if (cancelled) return;
      setAgenticPlayEnabled(record?.enabled ?? false);
      setAgenticGameState(record?.gameState ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [currentChat?.id, character]);

  const updatePreview = useCallback(
    async (userInput: string) => {
      if (!character) return;
      const settingsState = useSettingsStore.getState();
      const cs = settingsState.contextTokens ?? 64000;
      const promptSourceMessages = currentChat?.id ? useChatStore.getState().getActivePath(currentChat.id) : messages;
      const promptMessages = stripContextCompressionMessages(promptSourceMessages);
      const memoryPlan = currentChat?.id
        ? await buildStoredContextCompressionPromptPlan(currentChat.id, promptMessages)
        : { recentMessages: promptMessages, memoryBlock: null };
      let wbState = useWorldbookStore.getState();
      if (wbState.worldbooks.length === 0 && !wbState.loading) {
        await wbState.loadWorldbooks();
        wbState = useWorldbookStore.getState();
      }
      let contextBlocks: ContextBlock[] | undefined;
      const worldbookId = character.worldbookId || wbState.activeWorldbookId;
      const previewWorldbook = worldbookId ? (wbState.worldbooks.find((w) => w.id === worldbookId) ?? null) : null;
      if (worldbookId) {
        if (previewWorldbook && previewWorldbook.entries.length > 0) {
          const { matched } = resolveWorldbookEntries(previewWorldbook.entries, userInput || "", promptMessages);
          contextBlocks = matched.map((e) => ({
            id: e.id,
            source: "worldbook" as const,
            title: e.title,
            content: e.content,
            priority: e.priority,
            role: e.role ?? "system",
            position: getWorldbookEntryInsertPosition(e),
            depth: e.depth ?? 0,
          }));
        }
      }
      const previewUserInput = userInput || "(your message)";
      const ragBlock = currentChat?.id
        ? await buildRagContextBlock({
            chatId: currentChat.id,
            character,
            worldbook: previewWorldbook,
            recentMessages: stripContextCompressionMessages(memoryPlan.recentMessages),
            userInput: previewUserInput,
          })
        : null;
      const agenticBlock =
        agenticPlayEnabled && agenticGameState ? createAgenticPlayContextBlock(agenticGameState) : null;
      const allContextBlocks = [memoryPlan.memoryBlock, agenticBlock, ...(contextBlocks ?? []), ragBlock].filter(Boolean);
      const presetItems = agenticPlayEnabled ? await getAgenticPlayPresetItems() : presetItemsRef.current;
      const built = buildChatPrompt({
        character,
        recentMessages: memoryPlan.recentMessages,
        userInput: previewUserInput,
        maxTotalTokens: cs,
        presetItems,
        contextBlocks: allContextBlocks as ContextBlock[],
        userName: settingsState.personaName,
      });
      setPreviewText(formatPreview(built));
    },
    [character, currentChat?.id, messages, agenticPlayEnabled, agenticGameState],
  );

  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId) {
      draftReadyChatRef.current = null;
      setInput("");
      return;
    }

    draftReadyChatRef.current = null;
    let cancelled = false;
    getStorageItem(getChatDraftKey(chatId)).then((draft) => {
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
      if (input) void setStorageItem(key, input);
      else void removeStorageItem(key);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [currentChat?.id, input]);

  useEffect(() => {
    if (!previewOpen && !promptDialogOpen) return;

    const timeout = window.setTimeout(() => {
      updatePreview(input);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [input, previewOpen, promptDialogOpen, updatePreview]);

  const submitContent = useCallback(
    async (content: string, options: Pick<PendingSendItem, "hiddenUserMessage" | "label" | "metadata"> = {}) => {
      if (!content.trim() || !currentChat) return;
      const trimmedContent = content.trim();
      if (sending) {
        setPendingSendQueue((queue) => [...queue, { chatId: currentChat.id, content: trimmedContent, ...options }]);
        return;
      }
      if (branch.visibleMessages.length === 0 && character?.firstMessage.trim()) {
        await addMessage({
          chatId: currentChat.id,
          parentId: null,
          role: "assistant",
          content: replaceUserPlaceholders(character.firstMessage, personaName).trim(),
        });
      }
      await sendMessage(trimmedContent, {
        hiddenUserMessage: options.hiddenUserMessage,
        hiddenReason: options.label,
        metadata: options.metadata,
      });
    },
    [
      currentChat,
      sending,
      branch.visibleMessages.length,
      character?.firstMessage,
      addMessage,
      personaName,
      sendMessage,
    ],
  );

  const handleAgenticChoiceSubmit = (value: string, choice?: ChoiceInputPanelChoice) => {
    if (lastAssistantId) setDismissedAgenticChoiceMessageId(lastAssistantId);
    const option = getChoiceAgenticOption(choice);
    if (option) {
      const roll = rollDice({
        dice: "1d20",
        difficulty: option.difficulty,
        success_probability: option.probability,
        reason: option.action,
      });
      useChatStore.getState().setLastDiceResult(roll);
      const payload = buildAgenticChoicePayload(option, roll);
      void submitContent(payload, {
        hiddenUserMessage: true,
        label: choice?.label ?? option.label,
        metadata: {
          hiddenReason: "agentic_choice",
          agenticAction: {
            label: option.label,
            action: option.action,
            success_probability: option.probability,
            difficulty: option.difficulty,
            dice_result: roll,
          },
        },
      });
      return;
    }
    void submitContent(value, {
      hiddenUserMessage: true,
      label: choice?.label ?? "自定义行动",
      metadata: { hiddenReason: "agentic_custom_action" },
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !currentChat) return;
    const content = input.trim();
    setInput("");
    if (currentChat?.id) void removeStorageItem(getChatDraftKey(currentChat.id));
    await submitContent(content);
  };

  const handleContinue = async () => {
    await submitContent(CONTINUE_PROMPT, { hiddenUserMessage: true, label: "续写" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    setInput(next);
  };

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast("error", "Failed to copy");
    }
  };

  const startEdit = (msg: Message) => {
    setEditingMsgId(msg.id);
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
  };

  const saveEdit = async (content: string) => {
    if (!editingMsgId || !content.trim()) return;
    try {
      await updateMessage(editingMsgId, content.trim());
      setEditingMsgId(null);
      toast("success", "Message updated");
    } catch {
      toast("error", "Failed to update");
    }
  };

  const getLatestMessage = useCallback(
    (messageId: string) =>
      useChatStore.getState().messages.find((message) => message.id === messageId) ??
      messages.find((message) => message.id === messageId) ??
      null,
    [messages],
  );

  const updateImageSlot = useCallback(
    async (
      messageId: string,
      imageIndex: number,
      fallbackPrompt: string,
      updater: (image: MessageImage) => MessageImage,
    ) => {
      const message = getLatestMessage(messageId);
      if (!message) return null;
      const images = ensureImageSlots(message.images, imageIndex, fallbackPrompt);
      images[imageIndex] = updater(images[imageIndex]);
      await patchMessage(messageId, { images });
      return images[imageIndex];
    },
    [getLatestMessage, patchMessage],
  );

  const setMessageImageBusy = useCallback((messageId: string, busy: boolean) => {
    setImageGenerationBusy((prev) => {
      if (busy) return { ...prev, [messageId]: true };
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  const getImagePlannerWorldbookReferences = useCallback(
    async (content: string): Promise<ImagePlannerWorldbookReference[]> => {
      if (!content.trim() || !currentChat?.worldbookReferenceEntryIds?.length) return [];

      const { worldbooks } = useWorldbookStore.getState();
      const entries = selectWorldbookReferenceEntries(worldbooks, currentChat.worldbookReferenceEntryIds);
      return entries.map((entry) => ({
        title: entry.title,
        content: clipImageReference(entry.content, 1200),
      }));
    },
    [currentChat],
  );

  const handleGenerateMessageImages = useCallback(
    async (message: Message) => {
      if (!currentChat || message.role !== "assistant") return;
      if (imageGenerationBusy[message.id]) return;

      const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
      if (!settings.enabled) {
        toast("error", "请先在 Image Gen 设置里开启生图功能");
        return;
      }
      if (settings.maxImages <= 0) {
        toast("error", "Images / Trigger 不能为 0");
        return;
      }
      if (!settings.comfyWorkflowJson.trim()) {
        toast("error", "请先在 Image Gen 设置里导入 ComfyUI workflow JSON");
        return;
      }

      setMessageImageBusy(message.id, true);
      try {
        let nextContent = message.content;
        let markers = extractImageMarkers(nextContent, settings.maxImages);

        if (markers.length === 0) {
          const plannerConfig = await resolveImagePlannerConfig(settings.plannerConfigId);
          if (!plannerConfig) {
            toast("error", "请先在 Image Gen 设置里选择 Secondary API for Image Planning");
            return;
          }

          const planned = await planImageMarkersWithModel({
            content: nextContent,
            settings,
            plannerConfig,
            worldbookReferences: await getImagePlannerWorldbookReferences(nextContent),
            userId: getChatScopedDeepSeekUserId(plannerConfig, message.chatId),
          });
          const plannedUsage = withDeepSeekUsageCost(planned.usage, plannerConfig);
          void secondaryApiUsageRepository.create({
            chatId: message.chatId,
            source: "image-planner",
            label: "Manual Image Planning",
            modelConfigId: plannerConfig.id,
            model: plannerConfig.model,
            usage: plannedUsage,
          });
          void recordUsageCostAndWarn(plannedUsage);

          nextContent = planned.content;
          markers = extractImageMarkers(nextContent, settings.maxImages);
          if (nextContent !== message.content) {
            await patchMessage(message.id, { content: nextContent });
          }
        }

        if (markers.length === 0) {
          toast("info", "副 API 没有找到适合生图的可见画面");
          return;
        }

        let images = createGeneratingImages(markers);
        await patchMessage(message.id, { images });

        for (let i = 0; i < markers.length; i++) {
          const marker = markers[i];
          try {
            const src = await generateComfyImage(marker.prompt, settings);
            const latestImages = getLatestMessage(message.id)?.images ?? images;
            images = latestImages.map((image, index) => {
              if (index !== i) return image;
              if (image.status === "deleted") return image;
              return { ...image, status: "done" as const, src, error: undefined, updatedAt: new Date().toISOString() };
            });
          } catch (err) {
            const latestImages = getLatestMessage(message.id)?.images ?? images;
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
          await patchMessage(message.id, { images });
        }
        toast("success", "图片生成完成");
      } catch (err) {
        toast("error", (err as Error).message || "图片生成失败");
      } finally {
        setMessageImageBusy(message.id, false);
      }
    },
    [
      currentChat,
      getImagePlannerWorldbookReferences,
      getLatestMessage,
      imageGenerationBusy,
      patchMessage,
      setMessageImageBusy,
    ],
  );

  const openImagePromptEditor = useCallback((message: Message, imageIndex: number, fallbackPrompt: string) => {
    const prompt = message.images?.[imageIndex]?.prompt || fallbackPrompt;
    setImagePromptEditTarget({ messageId: message.id, imageIndex, fallbackPrompt });
    setImagePromptDraft(prompt);
  }, []);

  const closeImagePromptEditor = () => {
    setImagePromptEditTarget(null);
    setImagePromptDraft("");
  };

  const handleDeleteImage = useCallback(
    async (messageId: string, imageIndex: number, fallbackPrompt: string) => {
      await updateImageSlot(messageId, imageIndex, fallbackPrompt, (image) => ({
        ...image,
        prompt: image.prompt || fallbackPrompt,
        status: "deleted",
        src: undefined,
        error: undefined,
        updatedAt: new Date().toISOString(),
      }));
      toast("info", "图片已删除");
    },
    [updateImageSlot],
  );

  const handleRegenerateImage = useCallback(
    async (messageId: string, imageIndex: number, fallbackPrompt: string, overridePrompt?: string) => {
      const latest = getLatestMessage(messageId);
      const prompt = (overridePrompt ?? latest?.images?.[imageIndex]?.prompt ?? fallbackPrompt).trim();
      if (!prompt) {
        toast("error", "图片提示词为空");
        return;
      }

      const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
      if (!settings.comfyWorkflowJson.trim()) {
        toast("error", "请先在 Image Gen 设置里导入 ComfyUI workflow JSON");
        return;
      }

      await updateImageSlot(messageId, imageIndex, prompt, (image) => ({
        ...image,
        prompt,
        status: "generating",
        src: undefined,
        error: undefined,
        updatedAt: new Date().toISOString(),
      }));

      try {
        const src = await generateComfyImage(prompt, settings);
        await updateImageSlot(messageId, imageIndex, prompt, (image) => {
          if (image.status === "deleted") return image;
          return {
            ...image,
            prompt,
            status: "done",
            src,
            error: undefined,
            updatedAt: new Date().toISOString(),
          };
        });
        toast("success", "图片已重新生成");
      } catch (err) {
        await updateImageSlot(messageId, imageIndex, prompt, (image) => {
          if (image.status === "deleted") return image;
          return {
            ...image,
            prompt,
            status: "error",
            src: undefined,
            error: (err as Error).message || "Image generation failed",
            updatedAt: new Date().toISOString(),
          };
        });
        toast("error", (err as Error).message || "图片重新生成失败");
      }
    },
    [getLatestMessage, updateImageSlot],
  );

  const saveImagePromptEdit = async (regenerateAfterSave = false) => {
    if (!imagePromptEditTarget) return;
    const prompt = imagePromptDraft.trim();
    if (!prompt) {
      toast("error", "图片提示词为空");
      return;
    }

    const target = imagePromptEditTarget;
    await updateImageSlot(target.messageId, target.imageIndex, target.fallbackPrompt, (image) => ({
      ...image,
      prompt,
      updatedAt: new Date().toISOString(),
    }));
    closeImagePromptEditor();
    toast("success", "图片提示词已更新");
    if (regenerateAfterSave) {
      void handleRegenerateImage(target.messageId, target.imageIndex, target.fallbackPrompt, prompt);
    }
  };

  const showPromptDialog = () => {
    setPromptDialogOpen(true);
    if (input.trim() || !previewText) {
      void updatePreview(input);
    }
  };

  const isGeneratingCurrentChat = sending && !!currentChat?.id && sendingChatId === currentChat.id;
  const savepoint = useSavepointManager(currentChat, isGeneratingCurrentChat);
  const handleCompressContext = useCallback(async () => {
    if (!currentChat || contextCompressionRunning || isGeneratingCurrentChat) return;

    setContextCompressionRunning(true);
    try {
      await useChatStore.getState().ensureMessagesHydrated(currentChat.id);
      const activePath = useChatStore.getState().getActivePath(currentChat.id);
      const result = await compressChatHistoryForPrompt(currentChat.id, activePath);

      if (result.status === "skipped") {
        toast("info", "当前聊天还没有超过最近 5 轮，无需压缩");
      } else {
        const modeHint =
          result.compressionMode === "model"
            ? "已由 AI 压缩"
            : result.compressionMode === "fallback"
              ? "AI 压缩失败，已使用本地摘要"
              : "已使用本地摘要";
        toast("success", `${modeHint}：${result.compressedMessageCount} 条旧消息，最近 5 轮保持原文`);
        if (tokenDialogOpen) {
          const records = await secondaryApiUsageRepository.listByChatId(currentChat.id);
          setSecondaryUsageRecords(records);
        }
        if (previewOpen || promptDialogOpen) {
          void updatePreview(input.trim());
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast("error", "上下文压缩已取消");
      } else {
        toast("error", (err as Error).message || "上下文压缩失败");
      }
    } finally {
      setContextCompressionRunning(false);
    }
  }, [
    currentChat,
    contextCompressionRunning,
    input,
    isGeneratingCurrentChat,
    previewOpen,
    promptDialogOpen,
    tokenDialogOpen,
    updatePreview,
  ]);
  const hasStreamingMessage =
    isGeneratingCurrentChat && !!streamingMessageId && messages.some((m) => m.id === streamingMessageId);
  const generationStatus = getGenerationStatus(generationPhase);
  const pendingSendCount = useMemo(
    () => (currentChat ? pendingSendQueue.filter((item) => item.chatId === currentChat.id).length : 0),
    [currentChat, pendingSendQueue],
  );

  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId || !character || !agenticPlayEnabled) return;
    if (loading || !messagesHydrated || branch.visibleMessages.length !== 0) return;
    if (sending || isGeneratingCurrentChat) return;
    if (agenticOpeningStartedRef.current === chatId) return;

    agenticOpeningStartedRef.current = chatId;
    void submitContent(AGENTIC_PLAY_OPENING_PROMPT, { hiddenUserMessage: true, label: "开局选项" });
  }, [
    currentChat?.id,
    character,
    agenticPlayEnabled,
    loading,
    messagesHydrated,
    branch.visibleMessages.length,
    sending,
    isGeneratingCurrentChat,
    submitContent,
  ]);

  useEffect(() => {
    if (sending || pendingSendQueue.length === 0 || !currentChat) return;
    const nextIndex = pendingSendQueue.findIndex((item) => item.chatId === currentChat.id);
    if (nextIndex < 0) return;
    const next = pendingSendQueue[nextIndex];
    setPendingSendQueue((queue) => queue.filter((_, index) => index !== nextIndex));
    void sendMessage(next.content, {
      hiddenUserMessage: next.hiddenUserMessage,
      hiddenReason: next.label,
      metadata: next.metadata,
    });
  }, [sending, pendingSendQueue, currentChat, sendMessage]);

  const lastAssistantId = useMemo(() => {
    for (let i = branch.visibleMessages.length - 1; i >= 0; i--) {
      if (branch.visibleMessages[i].role === "assistant") return branch.visibleMessages[i].id;
    }
    return null;
  }, [branch.visibleMessages]);

  const handleDeleteMessage = async () => {
    if (!deleteMsgTarget) return;
    try {
      const ids = [deleteMsgTarget.id];
      if (deleteMsgTarget.role === "user") {
        const activePath = currentChat?.id ? useChatStore.getState().getActivePath(currentChat.id) : messages;
        const idx = activePath.findIndex((m) => m.id === deleteMsgTarget.id);
        const next = idx >= 0 ? activePath[idx + 1] : undefined;
        if (next?.role === "assistant") ids.push(next.id);
      }
      await deleteMessages(ids);
      setDeleteMsgTarget(null);
      toast("info", ids.length > 1 ? "Messages deleted" : "Message deleted");
    } catch {
      toast("error", "Failed to delete");
    }
  };

  const { usageMessages, totalPrompt, totalCompletion, totalCacheHit, totalCostCny, hasMainCost } = useMemo(() => {
    const usageMessages = messages.filter((m) => m.role === "assistant" && m.usage);
    return {
      usageMessages,
      totalPrompt: usageMessages.reduce((s, m) => s + (m.usage?.promptTokens || 0), 0),
      totalCompletion: usageMessages.reduce((s, m) => s + (m.usage?.completionTokens || 0), 0),
      totalCacheHit: usageMessages.reduce((s, m) => s + (m.usage?.cacheHitTokens || 0), 0),
      totalCostCny: usageMessages.reduce((s, m) => s + (m.usage?.costCny || 0), 0),
      hasMainCost: usageMessages.some((m) => typeof m.usage?.costCny === "number"),
    };
  }, [messages]);
  const { secondaryPrompt, secondaryCompletion, secondaryCacheHit, secondaryCostCny, hasSecondaryCost } = useMemo(
    () => ({
      secondaryPrompt: secondaryUsageRecords.reduce((s, record) => s + (record.usage.promptTokens || 0), 0),
      secondaryCompletion: secondaryUsageRecords.reduce((s, record) => s + (record.usage.completionTokens || 0), 0),
      secondaryCacheHit: secondaryUsageRecords.reduce((s, record) => s + (record.usage.cacheHitTokens || 0), 0),
      secondaryCostCny: secondaryUsageRecords.reduce((s, record) => s + (record.usage.costCny || 0), 0),
      hasSecondaryCost: secondaryUsageRecords.some((record) => typeof record.usage.costCny === "number"),
    }),
    [secondaryUsageRecords],
  );
  const cacheRate = totalPrompt > 0 ? ((totalCacheHit / totalPrompt) * 100).toFixed(1) : "-";
  const secondaryCacheRate = secondaryPrompt > 0 ? ((secondaryCacheHit / secondaryPrompt) * 100).toFixed(1) : "-";
  const tokenDialogRows =
    tokenUsageView === "main"
      ? usageMessages.map((message, index) => ({
          id: message.id,
          index: index + 1,
          label: `#${message.usage?.debugRound ?? index + 1}`,
          model: undefined,
          source: undefined,
          usage: message.usage,
          debugTrigger: message.usage?.debugTrigger,
          debugBaseTrigger: message.usage?.debugBaseTrigger,
          debugAttempt: message.usage?.debugAttempt,
          debugPromptFilename: message.usage?.debugPromptFilename,
          debugPromptPath: message.usage?.debugPromptPath,
        }))
      : secondaryUsageRecords.map((record, index) => ({
          id: record.id,
          index: index + 1,
          label: record.label,
          model: record.model,
          source: record.source,
          usage: record.usage,
          debugTrigger: undefined,
          debugBaseTrigger: undefined,
          debugAttempt: undefined,
          debugPromptFilename: undefined,
          debugPromptPath: undefined,
        }));
  const tokenDialogTotals =
    tokenUsageView === "main"
      ? {
          prompt: totalPrompt,
          completion: totalCompletion,
          cacheHit: totalCacheHit,
          cacheRate,
          costCny: hasMainCost ? totalCostCny : undefined,
        }
      : {
          prompt: secondaryPrompt,
          completion: secondaryCompletion,
          cacheHit: secondaryCacheHit,
          cacheRate: secondaryCacheRate,
          costCny: hasSecondaryCost ? secondaryCostCny : undefined,
        };
  const latestUsage = usageMessages[usageMessages.length - 1]?.usage;
  const currentContextTokens = latestUsage
    ? latestUsage.totalTokens || (latestUsage.promptTokens || 0) + (latestUsage.completionTokens || 0)
    : 0;
  const contextUsageRate =
    currentContextTokens > 0 ? ((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100).toFixed(1) : "-";
  const contextUsageDisplay = contextUsageRate === "-" ? "-" : `${contextUsageRate}%`;
  const contextUsageTone =
    currentContextTokens >= 900_000
      ? "text-orange-500"
      : currentContextTokens >= 750_000
        ? "text-yellow-500"
        : "text-emerald-500";
  const contextUsageBarTone =
    currentContextTokens >= 900_000
      ? "bg-orange-500"
      : currentContextTokens >= 750_000
        ? "bg-yellow-500"
        : "bg-emerald-500";
  const contextUsagePercent =
    currentContextTokens > 0 ? Math.min((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100, 100) : 0;
  const contextUsageTitle =
    currentContextTokens > 0
      ? `${currentContextTokens.toLocaleString()} / ${DEEPSEEK_CONTEXT_LIMIT.toLocaleString()} current conversation context tokens`
      : "No context usage data yet";

  const getRenderedMessage = useCallback(
    (msg: Message) => {
      const isUser = msg.role === "user";
      const isFinalAi = !isUser && msg.id === lastAssistantId;
      const split =
        !isUser && (agenticPlayEnabled || activeRegexRules.length > 0 || /\[image\]/i.test(msg.content))
          ? applyRegexRules(msg.content, activeRegexRules)
          : null;
      const displayContent = split?.displayContent ?? split?.promptContent ?? msg.content;
      const isStreamingAi = !isUser && isGeneratingCurrentChat && msg.id === streamingMessageId;

      return {
        msg,
        isUser,
        isFinalAi,
        split,
        displayContent,
        isStreamingAi,
        hasDisplayContent: displayContent.trim().length > 0,
      };
    },
    [activeRegexRules, agenticPlayEnabled, isGeneratingCurrentChat, lastAssistantId, streamingMessageId],
  );

  const renderedMessageStartIndex = useMemo(
    () => getRecentAssistantTurnStartIndex(branch.visibleMessages, renderedTurnLimit),
    [branch.visibleMessages, renderedTurnLimit],
  );
  const renderedMessages = useMemo(
    () => branch.visibleMessages.slice(renderedMessageStartIndex),
    [branch.visibleMessages, renderedMessageStartIndex],
  );
  const hasOlderRenderedMessages = renderedMessageStartIndex > 0;
  const ragBlockingInitializationActive =
    !!ragStatus?.active && ragStatus.operation === "initialization" && ragStatus.phase === "embedding";
  const showChatLoadingScreen = loading || chatBooting || showRagBlockingCover;

  useEffect(() => {
    if (!ragBlockingInitializationActive) {
      setShowRagBlockingCover(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowRagBlockingCover(true);
    }, RAG_BLOCKING_COVER_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [ragBlockingInitializationActive]);

  const latestVisibleMessage = branch.visibleMessages.at(-1) ?? null;
  const activeAgenticChoiceBlock = useMemo(() => {
    if (!agenticPlayEnabled || !latestVisibleMessage || latestVisibleMessage.role === "user") return null;
    if (latestVisibleMessage.id !== lastAssistantId) return null;
    if (isGeneratingCurrentChat || latestVisibleMessage.id === streamingMessageId) return null;
    const agenticOptions = latestVisibleMessage.agenticOptions ?? [];
    if (!agenticOptions.length) return null;
    if (dismissedAgenticChoiceMessageId === latestVisibleMessage.id) return null;
    return { msg: latestVisibleMessage, agenticOptions };
  }, [
    agenticPlayEnabled,
    dismissedAgenticChoiceMessageId,
    isGeneratingCurrentChat,
    lastAssistantId,
    latestVisibleMessage,
    streamingMessageId,
  ]);
  const activeAgenticPanelChoices: ChoiceInputPanelChoice[] =
    activeAgenticChoiceBlock?.agenticOptions.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.action,
      description: [
        option.probability !== undefined ? `成功率 ${option.probability}%` : "",
        option.difficulty !== undefined ? `DC ${option.difficulty}` : "",
        option.description ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
      meta: { agenticOption: option },
    })) ?? [];

  useEffect(() => {
    streamAutoScrollPausedRef.current = false;
    olderMessagesLoadingRef.current = false;
    pendingPrependAdjustmentRef.current = null;
    lastChatScrollTopRef.current = 0;
    setOlderMessagesLoading(false);
    setRenderedTurnLimit(INITIAL_RENDER_TURN_LIMIT);
    setChatBooting(!!currentChat?.id);
  }, [currentChat?.id]);

  const setMessagesContainerNode = useCallback(
    (el: HTMLDivElement | null) => {
      messagesContainerRef.current = el;
    },
    [],
  );

  const setRenderedMessageNode = useCallback((messageId: string, el: HTMLDivElement | null) => {
    if (el) renderedMessageNodeRefs.current.set(messageId, el);
    else renderedMessageNodeRefs.current.delete(messageId);
  }, []);

  const loadOlderRenderedMessages = useCallback(async () => {
    if (!currentChat?.id) return;
    if (olderMessagesLoadingRef.current) return;
    if (messagesHydrated && !hasOlderRenderedMessages) return;

    const el = messagesContainerRef.current;
    pendingPrependAdjustmentRef.current = el ? { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop } : null;
    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);

    try {
      if (!messagesHydrated) await ensureMessagesHydrated(currentChat.id);
      setRenderedTurnLimit((limit) => limit + LAZY_RENDER_TURN_BATCH);
    } catch {
      olderMessagesLoadingRef.current = false;
      pendingPrependAdjustmentRef.current = null;
      setOlderMessagesLoading(false);
    }
  }, [currentChat?.id, ensureMessagesHydrated, hasOlderRenderedMessages, messagesHydrated]);

  const handleChatScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const previousTop = lastChatScrollTopRef.current;
    const scrollingUp = el.scrollTop < previousTop - 2;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
    lastChatScrollTopRef.current = el.scrollTop;

    if (smartStreamingScrollEnabled && isGeneratingCurrentChat && scrollingUp && !nearBottom) {
      streamAutoScrollPausedRef.current = true;
    }
    if (nearBottom) {
      streamAutoScrollPausedRef.current = false;
    }
    isNearBottomRef.current =
      nearBottom && !(smartStreamingScrollEnabled && isGeneratingCurrentChat && streamAutoScrollPausedRef.current);

    if (scrollingUp && el.scrollTop <= LOAD_OLDER_SCROLL_THRESHOLD) {
      void loadOlderRenderedMessages();
    }
  }, [isGeneratingCurrentChat, loadOlderRenderedMessages, smartStreamingScrollEnabled]);

  const scheduleChatScrollToBottom = useCallback(() => {
    if (chatScrollFrameRef.current !== null) cancelAnimationFrame(chatScrollFrameRef.current);
    chatScrollFrameRef.current = requestAnimationFrame(() => {
      chatScrollFrameRef.current = requestAnimationFrame(() => {
        chatScrollFrameRef.current = null;
        const el = messagesContainerRef.current;
        if (!el) return;
        chatBottomRef.current?.scrollIntoView?.({ block: "end" });
        el.scrollTop = el.scrollHeight;
        lastChatScrollTopRef.current = el.scrollTop;
        isNearBottomRef.current = true;
      });
    });
  }, []);

  useEffect(() => {
    if (!isGeneratingCurrentChat || !streamingMessageId) return;
    streamAutoScrollPausedRef.current = false;
    isNearBottomRef.current = true;
    scheduleChatScrollToBottom();
  }, [isGeneratingCurrentChat, streamingMessageId, scheduleChatScrollToBottom]);

  useEffect(
    () => () => {
      if (chatScrollFrameRef.current !== null) cancelAnimationFrame(chatScrollFrameRef.current);
      chatScrollFrameRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (!chatBooting || loading) return;
    const timeout = window.setTimeout(() => {
      setChatBooting(false);
    }, CHAT_BOOT_MIN_MS);
    return () => window.clearTimeout(timeout);
  }, [chatBooting, loading]);

  useLayoutEffect(() => {
    const pending = pendingPrependAdjustmentRef.current;
    if (!pending) return;
    pendingPrependAdjustmentRef.current = null;
    const frame = requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = Math.max(0, el.scrollHeight - pending.scrollHeight + pending.scrollTop);
        lastChatScrollTopRef.current = el.scrollTop;
      }
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [renderedMessageStartIndex, renderedMessages.length]);

  useLayoutEffect(() => {
    if (smartStreamingScrollEnabled && isGeneratingCurrentChat && streamAutoScrollPausedRef.current) return;
    if (isNearBottomRef.current) scheduleChatScrollToBottom();
  }, [
    fontSize,
    chatListCollapsed,
    renderedMessages,
    scheduleChatScrollToBottom,
    smartStreamingScrollEnabled,
    isGeneratingCurrentChat,
  ]);

  const scrollToRenderedMessageStart = useCallback(
    (messageId: string) => {
      const node = renderedMessageNodeRefs.current.get(messageId);
      if (!node) return false;
      requestAnimationFrame(() => {
        node.scrollIntoView({ block: "start" });
        const el = messagesContainerRef.current;
        if (el) lastChatScrollTopRef.current = el.scrollTop;
      });
      return true;
    },
    [],
  );

  useEffect(() => {
    const lastMsg = branch.visibleMessages[branch.visibleMessages.length - 1];
    if (!lastMsg) return;

    const isGeneratingThisChat = sending && !!currentChat?.id && sendingChatId === currentChat.id;
    if (isGeneratingThisChat && streamingMessageId) {
      activeStreamingMessageRef.current = streamingMessageId;
    }

    if (skipNextMessageAutoScrollRef.current === currentChat?.id) {
      skipNextMessageAutoScrollRef.current = null;
      wasGeneratingCurrentChatRef.current = isGeneratingThisChat;
      return;
    }

    const justFinishedGenerating = wasGeneratingCurrentChatRef.current && !isGeneratingThisChat;
    const completedMessageId = activeStreamingMessageRef.current;

    if (
      justFinishedGenerating &&
      completedMessageId &&
      lastMsg.role === "assistant" &&
      lastMsg.id === completedMessageId &&
      completedScrollMessageRef.current !== completedMessageId
    ) {
      if (smartStreamingScrollEnabled) {
        const didScroll = scrollToRenderedMessageStart(completedMessageId);
        if (!didScroll && isNearBottomRef.current) scheduleChatScrollToBottom();
        isNearBottomRef.current = false;
        streamAutoScrollPausedRef.current = false;
      } else if (isNearBottomRef.current) {
        scheduleChatScrollToBottom();
      }
      completedScrollMessageRef.current = completedMessageId;
      activeStreamingMessageRef.current = null;
    } else if (lastMsg.role === "user") {
      streamAutoScrollPausedRef.current = false;
      isNearBottomRef.current = true;
      scheduleChatScrollToBottom();
    }

    wasGeneratingCurrentChatRef.current = isGeneratingThisChat;
  }, [
    branch.visibleMessages,
    branch.visibleMessages.length,
    sending,
    sendingChatId,
    streamingMessageId,
    currentChat?.id,
    scheduleChatScrollToBottom,
    scrollToRenderedMessageStart,
    smartStreamingScrollEnabled,
  ]);

  useLayoutEffect(() => {
    if (showChatLoadingScreen || !currentChat?.id || renderedMessages.length === 0) return;
    const listKey = `${currentChat.id}:${branch.activeLeafId ?? "default"}`;
    if (lastOpenedChatRef.current === listKey) return;
    skipNextMessageAutoScrollRef.current = currentChat.id;

    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        lastChatScrollTopRef.current = el.scrollTop;
        isNearBottomRef.current = true;
        lastOpenedChatRef.current = listKey;
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [
    currentChat?.id,
    branch.activeLeafId,
    showChatLoadingScreen,
    renderedMessages.length,
  ]);

  const chatLayoutColumns = chatListCollapsed
    ? "lg:grid-cols-[48px_minmax(0,1fr)] xl:grid-cols-[48px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_320px]";
  const chatContentWidthClass = chatListCollapsed ? "max-w-6xl" : "max-w-4xl";
  const userBubbleWidthClass = chatListCollapsed ? "max-w-[min(88%,60rem)]" : "max-w-[min(82%,48rem)]";
  const firstMessageWidthClass = chatListCollapsed ? "max-w-[min(82%,54rem)]" : "max-w-[75%]";
  const assistantName = character?.name ?? "AI";
  const loadingChatRecord = id && id !== "new" ? (chatRecords.find((chat) => chat.id === id) ?? currentChat) : currentChat;
  const loadingCharacter =
    characters.find((candidate) => candidate.id === loadingChatRecord?.characterId) ?? character ?? undefined;
  const ragLoadingRatio =
    ragStatus?.progressTotal && ragStatus.progressTotal > 0
      ? Math.min(1, Math.max(0, (ragStatus.progressCurrent ?? 0) / ragStatus.progressTotal))
      : 0;
  const loadingProgress = loading
    ? 46
    : showRagBlockingCover
      ? 72 + Math.round(ragLoadingRatio * 22)
      : messagesHydrated
        ? 92
        : 72;

  return (
    <div className="flex h-full flex-col" style={{ "--chat-font-size": fontSize + "px" } as React.CSSProperties}>
      <div
        className={cn(
          "grid flex-1 grid-cols-1 gap-3 overflow-hidden p-4 transition-[grid-template-columns] duration-200",
          chatLayoutColumns,
        )}
      >
        <ChatSidebar
          chats={chatRecords}
          characters={characters}
          currentChatId={currentChat?.id}
          collapsed={chatListCollapsed}
          onBack={() => navigate("/")}
          onSelectChat={handleSelectCharacterChat}
          onToggleCollapsed={() => setChatListCollapsed((value) => !value)}
        />

        <section className="chat-grid-cell bg-background flex flex-col rounded-lg border">
          <div
            ref={setMessagesContainerNode}
            onScroll={handleChatScroll}
            className="border-border/40 bg-background/50 mx-3 my-2 flex-1 overflow-y-auto rounded-xl border p-5"
            style={{ overflowAnchor: "none" }}
          >
            {showChatLoadingScreen ? (
              <ChatLoadingCover
                character={loadingCharacter}
                progress={loadingProgress}
                ragStatus={showRagBlockingCover ? ragStatus : null}
              />
            ) : (
              <>
                {branch.visibleMessages.length === 0 && !isGeneratingCurrentChat && (
                  <div className={cn(chatContentWidthClass, "mx-auto")}>
                    {character ? (
                      <div>
                        <div className="mb-1.5 flex items-center gap-2 px-1">
                          <Avatar name={character.name} src={character.avatar} />
                          <span className="text-muted-foreground text-xs font-medium">{character.name}</span>
                        </div>
                        <div className="flex gap-3">
                          <div className={cn(firstMessageWidthClass, "min-w-0")}>
                            <Card>
                              <CardContent className="p-3">
                                <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
                                  {replaceUserPlaceholders(
                                    character.firstMessage || `Start a conversation with ${character.name}`,
                                    personaName,
                                  )}
                                </p>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground mt-8 text-center text-sm">
                        Select a character to start chatting
                      </p>
                    )}
                  </div>
                )}
                <div className={cn(chatContentWidthClass, "mx-auto")} style={{ overflowAnchor: "none" }}>
                  {olderMessagesLoading && (
                    <div className="text-muted-foreground mb-3 flex items-center justify-center gap-2 text-xs">
                      <CircleDashed className="h-3.5 w-3.5 animate-spin" />
                      <span>正在加载更早消息...</span>
                    </div>
                  )}
              <div style={{ overflowAnchor: "none" }}>
                {renderedMessages.map((message, index) => {
                  const item = getRenderedMessage(message);
                  const { msg, isUser, isFinalAi, split, displayContent, isStreamingAi, hasDisplayContent } = item;
                  let imageBlockIndex = 0;
                  const isMessageImageBusy =
                    !!imageGenerationBusy[msg.id] || !!msg.images?.some((image) => image.status === "generating");

                  return (
                    <div
                      key={message.id}
                      data-index={index}
                      data-message-id={message.id}
                      ref={(el) => setRenderedMessageNode(message.id, el)}
                      style={{ overflowAnchor: "none" }}
                    >
                      {isUser ? (
                        <div className="flex min-w-0 justify-end gap-3 pb-5">
                          <div className={cn("min-w-0 overflow-hidden", userBubbleWidthClass)}>
                            <div className="mb-1.5 flex items-center justify-end gap-1 opacity-0 transition-opacity hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-foreground h-6 w-6"
                                title="Copy"
                                onClick={() => handleCopy(msg.content, msg.id)}
                              >
                                {copiedId === msg.id ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive h-6 w-6"
                                title="Delete"
                                onClick={() => setDeleteMsgTarget(msg)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="bg-primary text-primary-foreground rounded-lg border p-4">
                              {editingMsgId === msg.id ? (
                                <MessageEditBox
                                  initialContent={msg.content}
                                  fontSize={fontSize}
                                  onCancel={cancelEdit}
                                  onSave={saveEdit}
                                />
                              ) : (
                                <p
                                  className="leading-relaxed wrap-break-word whitespace-pre-wrap"
                                  style={{ fontSize: `${fontSize}px` }}
                                >
                                  {displayContent}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="bg-muted mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                            <UserIcon className="h-4 w-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-w-0 justify-start gap-3 pb-5">
                          <div className="mt-1 shrink-0">
                            <Avatar name={assistantName} src={character?.avatar} />
                          </div>
                          <div className={cn("group w-full min-w-0 overflow-hidden py-1", chatContentWidthClass)}>
                            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                              <span className="text-muted-foreground min-w-0 truncate text-xs font-medium">
                                {assistantName}
                              </span>
                              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-foreground h-6 w-6"
                                  title="Copy"
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                >
                                  {copiedId === msg.id ? (
                                    <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-foreground h-6 w-6"
                                  title="Edit"
                                  onClick={() => startEdit(msg)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-foreground h-6 w-6"
                                  title="View full prompt"
                                  onClick={showPromptDialog}
                                >
                                  <ScrollText className="h-3.5 w-3.5" />
                                </Button>
                                {msg.reasoningContent && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground h-6 w-6 hover:text-purple-400"
                                    title="查看创作过程"
                                    onClick={() => setThinkingMsg(msg)}
                                  >
                                    <Brain className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {imageGeneration.enabled &&
                                  imageGeneration.mode === "manual" &&
                                  hasDisplayContent &&
                                  !isStreamingAi && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-muted-foreground hover:text-foreground h-6 w-6"
                                      title={isMessageImageBusy ? "图片生成中" : "生成图片"}
                                      onClick={() => void handleGenerateMessageImages(msg)}
                                      disabled={isMessageImageBusy}
                                    >
                                      <ImageIcon className={cn("h-3.5 w-3.5", isMessageImageBusy && "animate-pulse")} />
                                    </Button>
                                  )}
                                {isFinalAi && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-foreground h-6 w-6"
                                    title="Regenerate"
                                    onClick={() => {
                                      if (!sending) setRegenerateDialogOpen(true);
                                    }}
                                    disabled={sending}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive h-6 w-6"
                                  title="Delete"
                                  onClick={() => setDeleteMsgTarget(msg)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            <ChatActivityTimeline
                              message={msg}
                              active={isStreamingAi}
                              generationStatus={generationStatus}
                              ragStatus={isStreamingAi || isFinalAi ? ragStatus : null}
                            />

                            {editingMsgId === msg.id ? (
                              <MessageEditBox
                                initialContent={msg.content}
                                fontSize={fontSize}
                                onCancel={cancelEdit}
                                onSave={saveEdit}
                              />
                            ) : split?.displayBlocks && split.displayBlocks.length > 0 && hasDisplayContent ? (
                              <div className="space-y-2">
                                {split.displayBlocks.map((block: DisplayBlock, bi: number) =>
                                  block.type === "image" ? (
                                    (() => {
                                      const currentImageIndex = imageBlockIndex++;
                                      return (
                                        <ImageDisplayBlockView
                                          key={bi}
                                          prompt={block.content}
                                          image={msg.images?.[currentImageIndex]}
                                          fontSize={fontSize}
                                          onDelete={() =>
                                            void handleDeleteImage(msg.id, currentImageIndex, block.content)
                                          }
                                          onEditPrompt={() =>
                                            openImagePromptEditor(msg, currentImageIndex, block.content)
                                          }
                                          onRegenerate={() =>
                                            void handleRegenerateImage(msg.id, currentImageIndex, block.content)
                                          }
                                        />
                                      );
                                    })()
                                  ) : block.type === "template" ? (
                                    <TemplateDisplayBlockView key={bi} block={block} fontSize={fontSize} />
                                  ) : block.type === "dialogue" ? (
                                    <div
                                      key={bi}
                                      className="bg-accent/40 relative mt-3 rounded-md border p-3 first:mt-0"
                                    >
                                      <span className="bg-primary text-primary-foreground absolute -top-2.5 left-3 rounded px-2 py-0.5 text-[10px] font-semibold">
                                        {block.speaker}
                                      </span>
                                      <p
                                        className="pt-0.5 wrap-break-word whitespace-pre-wrap"
                                        style={{ fontSize: `${fontSize}px` }}
                                      >
                                        {block.content}
                                      </p>
                                    </div>
                                  ) : (
                                    <p
                                      key={bi}
                                      className="leading-relaxed wrap-break-word whitespace-pre-wrap"
                                      style={{ fontSize: `${fontSize}px` }}
                                    >
                                      {block.content}
                                    </p>
                                  ),
                                )}
                              </div>
                            ) : isStreamingAi && !hasDisplayContent ? (
                              <div className="space-y-2">
                                <p className="text-muted-foreground text-sm">{generationStatus.detail}</p>
                                <div className="flex gap-1" aria-label={generationStatus.label}>
                                  <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
                                  <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                                  <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                                </div>
                              </div>
                            ) : (
                              <p
                                className="leading-relaxed wrap-break-word whitespace-pre-wrap"
                                style={{ fontSize: `${fontSize}px` }}
                              >
                                {displayContent}
                              </p>
                            )}

                            {split?.sideBlocks.map((side, si) => (
                              <div key={si} style={{ fontSize: `${fontSize}px` }}>
                                <SideBlockView side={side} fontSize={fontSize} onAction={setInput} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {isGeneratingCurrentChat && !hasStreamingMessage && (
                <div className="flex min-w-0 justify-start gap-3 pb-5">
                  <div className="mt-1 shrink-0">
                    <Avatar name={assistantName} src={character?.avatar} />
                  </div>
                  <div className={cn("w-full min-w-0 py-1", chatContentWidthClass)}>
                    <div className="border-border/80 mb-3 min-w-0 border-l">
                      <div className="relative pb-3">
                        <span className="bg-background text-primary absolute top-1 left-0 flex h-3 w-3 items-center justify-center rounded-full">
                          <CircleDashed className="h-3.5 w-3.5 animate-spin" />
                        </span>
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-sm font-medium">
                          <Brain className="h-3.5 w-3.5 shrink-0" />
                          <span className="shrink-0">正在思考</span>
                          <span className="text-muted-foreground min-w-0 truncate">· {generationStatus.detail}</span>
                          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1" aria-label={generationStatus.label}>
                      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
                      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} aria-hidden="true" />
            </div>
              </>
            )}
          </div>

          {activeAgenticChoiceBlock && activeAgenticPanelChoices.length > 0 ? (
            <div className="bg-card shrink-0 border-t p-4">
              <div className={cn("mx-auto w-full min-w-0", chatContentWidthClass)}>
                <ChoiceInputPanel
                  key={activeAgenticChoiceBlock.msg.id}
                  title={character ? `你要在 ${character.name} 的场景里采取什么行动？` : "你下一步要怎么做？"}
                  choices={activeAgenticPanelChoices}
                  disabled={!currentChat || isGeneratingCurrentChat}
                  onSubmit={handleAgenticChoiceSubmit}
                  onCancel={() => setDismissedAgenticChoiceMessageId(activeAgenticChoiceBlock.msg.id)}
                />
              </div>
            </div>
          ) : (
            <ChatInputArea
              displayError={sendError || chatError}
              onDismissError={() => {
                clearSendError();
                clearError();
              }}
              pendingSendCount={pendingSendCount}
              hasChat={!!currentChat}
              pendingSendQueue={pendingSendQueue}
              currentChatId={currentChat?.id}
              onCancelPending={(queueIndex) =>
                setPendingSendQueue((queue) => queue.filter((_, index) => index !== queueIndex))
              }
              fontSize={fontSize}
              onFontSizeChange={handleFontSizeChange}
              previewOpen={previewOpen}
              onTogglePreview={() => {
                const nextOpen = !previewOpen;
                setPreviewOpen(nextOpen);
                if (nextOpen) updatePreview(input.trim());
              }}
              onContinue={handleContinue}
              messagesLength={branch.visibleMessages.length}
              input={input}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                character
                  ? agenticPlayEnabled
                    ? `Action in ${character.name}'s scene...`
                    : `Message ${character.name}...`
                  : "Type a message..."
              }
              onSend={handleSend}
              isSending={sending}
              onAbort={abort}
              onSave={() => savepoint.setSaveDialogOpen(true)}
              onLoad={savepoint.openLoadDialog}
              onCompressContext={handleCompressContext}
              isCompressingContext={contextCompressionRunning}
              isGenerating={isGeneratingCurrentChat}
              previewText={previewText}
              wide={chatListCollapsed}
            />
          )}
        </section>

        <div className="hidden xl:contents">
          <ChatRightPanel
            messagesCount={branch.visibleMessages.length}
            usageMessagesCount={usageMessages.length}
            totalPrompt={totalPrompt}
            totalCompletion={totalCompletion}
            cacheRate={cacheRate}
            contextUsageDisplay={contextUsageDisplay}
            contextUsagePercent={contextUsagePercent}
            contextUsageBarTone={contextUsageBarTone}
            onTokenDialogOpen={() => setTokenDialogOpen(true)}
            agenticPlayEnabled={agenticPlayEnabled}
            agenticGameState={agenticGameState}
            isGeneratingCurrentChat={isGeneratingCurrentChat}
            lastDiceResult={lastDiceResult}
            hasBranches={branch.hasBranches}
            branchSummaries={branch.branchSummaries}
            onSwitchBranch={branch.switchBranch}
          />
        </div>
      </div>

      <ImagePromptDialog
        open={!!imagePromptEditTarget}
        onOpenChange={(open) => {
          if (!open) closeImagePromptEditor();
        }}
        draft={imagePromptDraft}
        onDraftChange={setImagePromptDraft}
        onCancel={closeImagePromptEditor}
        onSave={() => {
          void saveImagePromptEdit(false);
        }}
        onSaveAndRegenerate={() => {
          void saveImagePromptEdit(true);
        }}
      />

      <PromptDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} previewText={previewText} />

      <SaveDialog
        open={savepoint.saveDialogOpen}
        onOpenChange={(v) => {
          if (!v) savepoint.closeSaveDialog();
        }}
        savepointName={savepoint.savepointName}
        onSavepointNameChange={savepoint.setSavepointName}
        onCancel={savepoint.closeSaveDialog}
        onSave={savepoint.handleCreateSavepoint}
        isSaving={savepoint.savingSavepoint}
        hasCurrentChat={!!currentChat}
      />

      <LoadDialog
        open={savepoint.loadDialogOpen}
        onOpenChange={savepoint.setLoadDialogOpen}
        savepoints={savepoint.savepoints}
        isLoading={savepoint.loadingSavepoints}
        restoringSavepointId={savepoint.restoringSavepointId}
        importingSavepointId={savepoint.importingSavepointId}
        isGenerating={isGeneratingCurrentChat}
        onRestore={savepoint.handleRestoreSavepoint}
        onImportAsBranch={savepoint.handleImportSavepointAsBranch}
        onDelete={savepoint.handleDeleteSavepoint}
        onRefresh={savepoint.refreshSavepoints}
      />

      <TokenDialog
        open={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
        tokenUsageView={tokenUsageView}
        onTokenUsageViewChange={setTokenUsageView}
        rows={tokenDialogRows}
        totals={tokenDialogTotals}
        secondaryUsageRecordsCount={secondaryUsageRecords.length}
        contextUsageTitle={contextUsageTitle}
        contextUsageTone={contextUsageTone}
        contextUsageDisplay={contextUsageDisplay}
      />

      <DeleteMessageDialog
        open={!!deleteMsgTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteMsgTarget(null);
        }}
        onDelete={handleDeleteMessage}
      />

      <RegenerateDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
        onConfirm={() => {
          setRegenerateDialogOpen(false);
          void regenerate();
        }}
      />

      <ThinkingDialog
        open={!!thinkingMsg}
        onOpenChange={(v) => {
          if (!v) setThinkingMsg(null);
        }}
        reasoningContent={thinkingMsg?.reasoningContent}
      />
    </div>
  );
}
