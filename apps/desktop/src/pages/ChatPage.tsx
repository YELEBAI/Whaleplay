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
  Bot,
  User as UserIcon,
  CircleDashed,
} from "lucide-react";
import { Button, Card, CardContent, cn } from "@neo-tavern/ui";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useSendMessage } from "@/features/chat/hooks/useSendMessage";
import {
  buildLightweightMemorySummary,
  createMemoryContextBlock,
  splitMessagesByRecentTurns,
} from "@/features/chat/memory";
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
  stripPromptContent,
} from "@neo-tavern/core";
import type { DisplayBlock } from "@neo-tavern/core";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
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
import { useVirtualizer } from "@tanstack/react-virtual";
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

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef<string | null>(null);
  const lastOpenedChatRef = useRef<string | null>(null);
  const draftReadyChatRef = useRef<string | null>(null);
  const skipNextMessageAutoScrollRef = useRef<string | null>(null);
  const wasGeneratingCurrentChatRef = useRef(false);
  const activeStreamingMessageRef = useRef<string | null>(null);
  const completedScrollMessageRef = useRef<string | null>(null);
  const agenticOpeningStartedRef = useRef<string | null>(null);
  const presetItemsRef = useRef<{ role: "system" | "user"; content: string; injectionOrder: number }[]>([]);

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

  const branch = useBranchNavigation(currentChat?.id);
  const regexPresets = useSettingsStore((s) => s.regexPresets);
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId);
  const imageGeneration = useSettingsStore((s) => s.imageGeneration);
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
  const [agenticPlayEnabled, setAgenticPlayEnabled] = useState(false);
  const [agenticGameState, setAgenticGameState] = useState<AgenticGameState | null>(null);
  const [dismissedAgenticChoiceMessageId, setDismissedAgenticChoiceMessageId] = useState<string | null>(null);
  const [chatRecords, setChatRecords] = useState<Chat[]>([]);

  const characterId = searchParams.get("characterId");
  const character = characters.find((c) => c.id === (currentChat?.characterId ?? characterId));

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
      const promptRules = settingsState.getActiveRegexRules() ?? [];
      const promptMessages = messages.map((message) =>
        message.role === "assistant"
          ? { ...message, content: stripPromptContent(message.content, promptRules) }
          : message,
      );
      const memorySplit = settingsState.lightweightMemoryEnabled
        ? splitMessagesByRecentTurns(promptMessages, settingsState.promptRecentTurns)
        : { memoryMessages: [] as Message[], recentMessages: promptMessages };
      const memorySummary = settingsState.lightweightMemoryEnabled
        ? buildLightweightMemorySummary(memorySplit.memoryMessages, settingsState.memorySummaryMaxChars)
        : "";
      const memoryBlock = settingsState.lightweightMemoryEnabled ? createMemoryContextBlock(memorySummary) : null;
      const wbState = useWorldbookStore.getState();
      let contextBlocks: ContextBlock[] | undefined;
      const worldbookId = character.worldbookId || wbState.activeWorldbookId;
      if (worldbookId) {
        const wb = wbState.worldbooks.find((w) => w.id === worldbookId);
        if (wb && wb.entries.length > 0) {
          const { matched } = resolveWorldbookEntries(wb.entries, userInput || "", promptMessages);
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
      const agenticBlock =
        agenticPlayEnabled && agenticGameState ? createAgenticPlayContextBlock(agenticGameState) : null;
      const allContextBlocks = [memoryBlock, agenticBlock, ...(contextBlocks ?? [])].filter(Boolean);
      const presetItems = agenticPlayEnabled ? await getAgenticPlayPresetItems() : presetItemsRef.current;
      const built = buildChatPrompt({
        character,
        recentMessages: memorySplit.recentMessages,
        userInput: userInput || "(your message)",
        maxTotalTokens: cs,
        presetItems,
        contextBlocks: allContextBlocks as ContextBlock[],
        userName: settingsState.personaName,
      });
      setPreviewText(formatPreview(built));
    },
    [character, messages, agenticPlayEnabled, agenticGameState],
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
      const settings = useSettingsStore.getState().imageGeneration;
      if (!settings.worldbookReferenceEnabled || !character) return [];

      const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
      if (!activeWorldbookId) return [];

      const wb = worldbooks.find((w) => w.id === activeWorldbookId);
      if (!wb || wb.entries.length === 0) return [];

      const { matched } = resolveWorldbookEntries(wb.entries, content, messages);
      return matched.slice(0, 8).map((entry) => ({
        title: entry.title,
        content: clipImageReference(entry.content, 1200),
      }));
    },
    [character, messages],
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
    updatePreview(input);
    setPromptDialogOpen(true);
  };

  const isGeneratingCurrentChat = sending && !!currentChat?.id && sendingChatId === currentChat.id;
  const savepoint = useSavepointManager(currentChat, isGeneratingCurrentChat);
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
        const idx = messages.findIndex((m) => m.id === deleteMsgTarget.id);
        const next = idx >= 0 ? messages[idx + 1] : undefined;
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

  const renderedMessages = useMemo(
    () =>
      branch.visibleMessages.map((msg) => {
        const isUser = msg.role === "user";
        const isFinalAi = !isUser && msg.id === lastAssistantId;
        const split =
          !isUser && (agenticPlayEnabled || activeRegexRules.length > 0 || /\[image\]/i.test(msg.content))
            ? applyRegexRules(msg.content, activeRegexRules)
            : null;
        const rawDisplayContent = split?.displayContent ?? split?.promptContent ?? msg.content;
        const structuredAgenticOptions = !isUser && agenticPlayEnabled ? (msg.agenticOptions ?? []) : [];
        const displayContent = rawDisplayContent;
        const displaySplit = split;
        const isStreamingAi = !isUser && isGeneratingCurrentChat && msg.id === streamingMessageId;
        const hasDisplayContent = displayContent.trim().length > 0;

        return {
          msg,
          isUser,
          isFinalAi,
          split: displaySplit,
          displayContent,
          agenticOptions: structuredAgenticOptions,
          isStreamingAi,
          hasDisplayContent,
        };
      }),
    [
      activeRegexRules,
      agenticPlayEnabled,
      isGeneratingCurrentChat,
      lastAssistantId,
      streamingMessageId,
      branch.visibleMessages,
    ],
  );
  const activeAgenticChoiceBlock = useMemo(() => {
    const latest = renderedMessages[renderedMessages.length - 1];
    if (!agenticPlayEnabled || !latest || latest.isUser) return null;
    if (latest.msg.id !== lastAssistantId) return null;
    if (latest.isStreamingAi || isGeneratingCurrentChat) return null;
    if (!latest.agenticOptions.length) return null;
    if (dismissedAgenticChoiceMessageId === latest.msg.id) return null;
    return latest;
  }, [agenticPlayEnabled, dismissedAgenticChoiceMessageId, isGeneratingCurrentChat, lastAssistantId, renderedMessages]);
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

  const isNearBottomRef = useRef(true);

  const handleChatScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }, []);

  const chatVirtualizer = useVirtualizer({
    count: renderedMessages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: () => 260,
    getItemKey: (index) => renderedMessages[index]?.msg.id ?? `msg-${index}`,
    overscan: 8,
  });

  useLayoutEffect(() => {
    chatVirtualizer.measure();
  }, [fontSize, chatVirtualizer]);

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
      const completedIndex = renderedMessages.findIndex((m) => m.msg.id === completedMessageId);
      if (completedIndex >= 0 && isNearBottomRef.current) {
        chatVirtualizer.scrollToIndex(completedIndex, { align: "start" });
      }
      completedScrollMessageRef.current = completedMessageId;
      activeStreamingMessageRef.current = null;
    } else if (lastMsg.role === "user") {
      if (isNearBottomRef.current) {
        chatVirtualizer.scrollToIndex(renderedMessages.length - 1, { align: "end" });
      }
    }

    wasGeneratingCurrentChatRef.current = isGeneratingThisChat;
  }, [
    branch.visibleMessages,
    branch.visibleMessages.length,
    sending,
    sendingChatId,
    streamingMessageId,
    currentChat?.id,
    renderedMessages,
    chatVirtualizer,
  ]);

  useLayoutEffect(() => {
    if (loading || !currentChat?.id || branch.visibleMessages.length === 0) return;
    if (lastOpenedChatRef.current === currentChat.id) return;
    lastOpenedChatRef.current = currentChat.id;
    skipNextMessageAutoScrollRef.current = currentChat.id;
    requestAnimationFrame(() => {
      chatVirtualizer.scrollToIndex(renderedMessages.length - 1, { align: "end" });
    });
  }, [currentChat?.id, loading, branch.visibleMessages.length, renderedMessages.length, chatVirtualizer]);

  const chatLayoutColumns = chatListCollapsed
    ? "lg:grid-cols-[48px_minmax(0,1fr)] xl:grid-cols-[48px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_320px]";
  const chatContentWidthClass = chatListCollapsed ? "max-w-6xl" : "max-w-4xl";
  const userBubbleWidthClass = chatListCollapsed ? "max-w-[min(88%,60rem)]" : "max-w-[min(82%,48rem)]";
  const firstMessageWidthClass = chatListCollapsed ? "max-w-[min(82%,54rem)]" : "max-w-[75%]";

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
            ref={messagesContainerRef}
            onScroll={handleChatScroll}
            className="border-border/40 bg-background/50 mx-3 my-2 flex-1 overflow-y-auto rounded-xl border p-5"
          >
            {loading && <p className="text-muted-foreground text-center text-sm">Loading...</p>}
            {!loading && branch.visibleMessages.length === 0 && !isGeneratingCurrentChat && (
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
                  <p className="text-muted-foreground mt-8 text-center text-sm">Select a character to start chatting</p>
                )}
              </div>
            )}
            <div className={cn(chatContentWidthClass, "mx-auto")}>
              <div
                style={{
                  height: `${chatVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {chatVirtualizer.getVirtualItems().map((virtualItem) => {
                  const { msg, isUser, isFinalAi, split, displayContent, isStreamingAi, hasDisplayContent } =
                    renderedMessages[virtualItem.index];
                  const aiName = character?.name ?? "AI";
                  let imageBlockIndex = 0;
                  const isMessageImageBusy =
                    !!imageGenerationBusy[msg.id] || !!msg.images?.some((image) => image.status === "generating");

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={chatVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
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
                          <div className="bg-primary text-primary-foreground mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className={cn("group w-full min-w-0 overflow-hidden py-1", chatContentWidthClass)}>
                            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                              <span className="text-muted-foreground min-w-0 truncate text-xs font-medium">
                                {aiName}
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
                  <div className="bg-primary text-primary-foreground mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                    <Bot className="h-4 w-4" />
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
            </div>
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
            allMessages={messages}
            forkParentIds={branch.forkParents}
            activeLeafId={branch.activeLeafId}
            onSwitchBranch={branch.switchBranch}
            onCreateBranch={(parentId) => {
              void branch.createBranch(parentId);
            }}
            onExploreAgenticOption={
              agenticPlayEnabled
                ? (option, parentId) => {
                    // Switch to the parent message branch first, then submit
                    branch.switchBranch(parentId);
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
                      label: option.label,
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
                  }
                : undefined
            }
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
        onConfirm={(mode) => {
          setRegenerateDialogOpen(false);
          void regenerate(mode);
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
