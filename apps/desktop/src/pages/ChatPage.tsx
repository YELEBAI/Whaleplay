import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Send,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowLeft,
  Copy,
  Pencil,
  Check,
  X,
  ScrollText,
  RotateCcw,
  CheckCheck,
  StopCircle,
  BarChart3,
  Trash2,
  Brain,
  Save,
  FolderOpen,
  Image as ImageIcon,
  Bot,
  User as UserIcon,
  CircleDashed,
  CheckCircle2,
  Dice5,
} from "lucide-react";
import {
  Button,
  Input,
  Card,
  CardContent,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@neo-tavern/ui";
import { useCharacterStore } from "@/features/character/character.store";
import { useChatStore } from "@/features/chat/chat.store";
import { useSendMessage } from "@/features/chat/hooks/useSendMessage";
import {
  buildLightweightMemorySummary,
  createMemoryContextBlock,
  splitMessagesByRecentTurns,
} from "@/features/chat/memory";
import type { GenerationPhase } from "@/features/chat/chat.types";
import {
  chatRepository,
  agenticPlayStateRepository,
  chatSavepointRepository,
  createDefaultSavepointName,
  messageRepository,
  presetRepository,
  secondaryApiUsageRepository,
  settingsRepository,
} from "@/db/repositories";
import type { ChatSavepoint, SecondaryApiUsageRecord } from "@/db/repositories";
import { getStorageItem, removeStorageItem, setStorageItem } from "@/db/storage";
import {
  buildChatPrompt,
  formatPreview,
  applyRegexRules,
  getWorldbookEntryInsertPosition,
  resolveWorldbookEntries,
  stripPromptContent,
} from "@neo-tavern/core";
import type { DisplayBlock, SideBlock } from "@neo-tavern/core";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import {
  generateId,
  type BuiltPrompt,
  type ContextBlock,
  type Message,
  type MessageImage,
  type ModelConfig,
} from "@neo-tavern/shared";
import {
  createGeneratingImages,
  extractImageMarkers,
  generateComfyImage,
  normalizeImageSettings,
  planImageMarkersWithModel,
  type ImagePlannerWorldbookReference,
} from "@/features/image-generation/image-generation";
import { formatCnyCost, formatCnyExact, withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { getChatScopedDeepSeekUserId } from "@/features/settings/model-capabilities";
import {
  AGENTIC_PLAY_OPENING_PROMPT,
  buildAgenticPlayPresetItems,
  createAgenticPlayContextBlock,
  type AgenticGameState,
} from "@/features/agentic-play/agentic-play";
import { extractAgenticOptions, type AgenticActionOption } from "@/features/agentic-play/agentic-options";
import { useVirtualizer } from "@tanstack/react-virtual";

function Avatar({ name, src, isUser }: { name: string; src?: string; isUser?: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  const bg = isUser ? "bg-blue-500" : "bg-emerald-500";
  if (src) {
    return <img src={src} alt={name} className="w-8 h-8 rounded-full object-cover border border-border/30 shrink-0" />;
  }
  return (
    <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0`}>
      <span className="text-white text-xs font-bold">{initial}</span>
    </div>
  );
}

function toast(type: "success" | "error" | "info", message: string) {
  const fn = (window as any).__toast;
  if (fn) fn(type, message);
}

const DEEPSEEK_CONTEXT_LIMIT = 1_000_000;
const CHAT_FONT_SIZE_KEY = "neotavern_chat_font_size";
const CHAT_DRAFT_KEY_PREFIX = "neotavern_chat_draft";
const CONTINUE_PROMPT = "续写剧情";
const CHAT_FONT_SIZE_MIN = 12;
const CHAT_FONT_SIZE_MAX = 22;

type PendingSendItem = {
  chatId: string;
  content: string;
  hiddenUserMessage?: boolean;
  label?: string;
};

type TokenUsageView = "main" | "secondary";

const compactTokenFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactToken(value: number) {
  return compactTokenFormatter.format(value);
}

function getChatDraftKey(chatId: string) {
  return `${CHAT_DRAFT_KEY_PREFIX}_${chatId}`;
}

function replaceUserPlaceholders(content: string, userName: string) {
  return content.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName);
}

function clampChatFontSize(value: number) {
  if (!Number.isFinite(value)) return 15;
  return Math.min(CHAT_FONT_SIZE_MAX, Math.max(CHAT_FONT_SIZE_MIN, Math.round(value)));
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function displayStateValue(value: unknown, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join("、") : fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatPlayerCondition(player: Record<string, unknown> | undefined) {
  if (!player) return "状态未初始化";
  const hp = player.hp;
  const maxHp = player.max_hp;
  const traits = Array.isArray(player.traits) ? player.traits.map((item) => String(item)).filter(Boolean) : [];
  const parts = [
    hp !== undefined && hp !== null ? `HP ${hp}${maxHp !== undefined && maxHp !== null ? `/${maxHp}` : ""}` : null,
    traits.length ? traits.join("、") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "状态平稳";
}

function formatSavepointDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getGenerationStatus(phase: GenerationPhase | null) {
  if (phase === "retrying") {
    return {
      label: "正文空白，重写中",
      tag: "retrying",
      detail: "上一版没有可显示正文，正在重新整理剧情并补写角色回复",
    };
  }

  if (phase === "writing") {
    return {
      label: "正文落笔中",
      tag: "writing",
      detail: "正在把这一幕写成角色回复",
    };
  }

  return {
    label: "剧情构思中",
    tag: "thinking",
    detail: "正在整理角色动机、场景节奏与下一步推进",
  };
}

function parseSafeDetails(
  content: string,
): { className: "neo-summary" | "neo-thoughts"; open: boolean; summary: string; body: string } | null {
  const trimmed = content.trim();
  const match = trimmed.match(/^<details([^>]*)><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>$/);
  if (!match) return null;

  const attrs = match[1];
  const className = attrs.match(/\bclass="([^"]*)"/)?.[1];
  const unsupportedAttrs = attrs
    .replace(/\bopen\b/g, "")
    .replace(/\bclass="(?:neo-summary|neo-thoughts)"/g, "")
    .trim();
  if ((className && className !== "neo-summary" && className !== "neo-thoughts") || unsupportedAttrs) return null;

  return {
    className: className === "neo-thoughts" ? "neo-thoughts" : "neo-summary",
    open: /\bopen\b/.test(attrs),
    summary: match[2],
    body: match[3].trim(),
  };
}

function SideBlockView({
  side,
  fontSize,
  onAction,
}: {
  side: SideBlock;
  fontSize: number;
  onAction: (action: string) => void;
}) {
  if (side.actions) {
    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {side.actions.map((action, ai) => (
          <button
            key={ai}
            onClick={() => onAction(action)}
            className="px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-sm hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
            style={{ fontSize: `${fontSize}px` }}
          >
            {action}
          </button>
        ))}
      </div>
    );
  }

  const details = parseSafeDetails(side.content);
  if (details) {
    return (
      <details className={details.className} open={details.open || undefined}>
        <summary>{details.summary}</summary>
        <p className="whitespace-pre-wrap">{details.body}</p>
      </details>
    );
  }

  return <p className="whitespace-pre-wrap text-muted-foreground mt-1">{side.content}</p>;
}

function TemplateDisplayBlockView({ block, fontSize }: { block: DisplayBlock; fontSize: number }) {
  const details = parseSafeDetails(block.content);
  if (details) {
    return (
      <details className={details.className} open={details.open || undefined} style={{ fontSize: `${fontSize}px` }}>
        <summary>{details.summary}</summary>
        <p className="whitespace-pre-wrap">{details.body}</p>
      </details>
    );
  }

  return (
    <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
      {block.content}
    </p>
  );
}

function ChatActivityTimeline({
  message,
  active,
  generationStatus,
}: {
  message: Message;
  active: boolean;
  generationStatus: ReturnType<typeof getGenerationStatus>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const startedAt = new Date(message.createdAt).getTime();
  const activeElapsed = active && Number.isFinite(startedAt) ? now - startedAt : null;
  const finalElapsed = message.generateDuration ?? message.thinkingDuration ?? null;
  const elapsed = activeElapsed ?? finalElapsed;

  const reasoningLines = (message.reasoningContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const reasoningPreview = reasoningLines.length
    ? reasoningLines[reasoningLines.length - 1]
    : active
      ? generationStatus.detail
      : "回复已生成";

  return (
    <div className="mb-3 min-w-0">
      {elapsed != null && (
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-center tabular-nums">任务耗时 {formatDuration(Math.max(0, elapsed))}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className="min-w-0 border-l border-border/80">
        <div className="relative pb-3 pl-5">
          <span
            className={`absolute left-[-6px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ${
              active ? "text-primary" : "text-emerald-500"
            }`}
          >
            {active ? (
              <CircleDashed className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
          </span>
          <button
            type="button"
            className="flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden text-left text-sm font-medium disabled:cursor-default"
            onClick={() => setThinkingOpen((open) => !open)}
            disabled={!message.reasoningContent}
          >
            <Brain className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">{active ? "正在思考" : "已完成思考"}</span>
            {!thinkingOpen && reasoningPreview ? (
              <span className="min-w-0 truncate text-muted-foreground">· {reasoningPreview}</span>
            ) : null}
            {thinkingOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          {thinkingOpen && message.reasoningContent ? (
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {message.reasoningContent}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgenticOptionsView({
  options,
  disabled,
  onChoose,
}: {
  options: AgenticActionOption[];
  disabled: boolean;
  onChoose: (option: AgenticActionOption) => void;
}) {
  if (!options.length) return null;

  return (
    <div className="mt-3 flex min-w-0 flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="outline"
          size="sm"
          className="max-w-full justify-start whitespace-normal break-words text-left [overflow-wrap:anywhere]"
          onClick={() => onChoose(option)}
          disabled={disabled}
        >
          <span className="min-w-0">{option.label}</span>
          {option.probability !== undefined && (
            <span className="ml-2 shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {option.probability}%
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

function ImageDisplayBlockView({
  prompt,
  image,
  fontSize,
  onDelete,
  onEditPrompt,
  onRegenerate,
}: {
  prompt: string;
  image?: MessageImage;
  fontSize: number;
  onDelete: () => void;
  onEditPrompt: () => void;
  onRegenerate: () => void;
}) {
  const displayPrompt = image?.prompt?.trim() || prompt;
  const isGenerating = image?.status === "generating";
  const isDeleted = image?.status === "deleted";
  const statusText = isDeleted
    ? "图片已删除"
    : image?.status === "error"
      ? "图片生成失败"
      : isGenerating
        ? "ComfyUI 生图中"
        : "图片尚未生成";

  return (
    <div className="group relative rounded-lg border border-primary/20 bg-primary/5 p-2">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 shadow-sm backdrop-blur"
          onClick={onEditPrompt}
          title="修改图片提示词"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 shadow-sm backdrop-blur"
          onClick={onRegenerate}
          disabled={isGenerating}
          title="重新生成图片"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 text-destructive shadow-sm backdrop-blur hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleted}
          title="删除图片"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {image?.status === "done" && image.src ? (
        <img
          src={image.src}
          alt={displayPrompt}
          className="max-h-[520px] w-full rounded-md object-contain bg-background"
        />
      ) : (
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed bg-background/50">
          <div className="space-y-2 text-center">
            <ImageIconSpinner status={image?.status} />
            <p className="text-xs text-muted-foreground">{statusText}</p>
          </div>
        </div>
      )}
      <details className="mt-2 text-muted-foreground">
        <summary className="cursor-pointer text-xs">Image prompt</summary>
        <p className="mt-1 whitespace-pre-wrap text-xs" style={{ fontSize: `${Math.max(11, fontSize - 3)}px` }}>
          {displayPrompt}
        </p>
        {image?.error && <p className="mt-1 whitespace-pre-wrap text-xs text-destructive">{image.error}</p>}
      </details>
    </div>
  );
}

function ImageIconSpinner({ status }: { status?: MessageImage["status"] }) {
  if (status === "deleted") return <Trash2 className="mx-auto h-5 w-5 text-muted-foreground" />;
  if (status === "error") return <X className="mx-auto h-5 w-5 text-destructive" />;
  if (status === "done") return <Check className="mx-auto h-5 w-5 text-green-500" />;
  return <ImageIcon className="mx-auto h-5 w-5 animate-pulse text-primary" />;
}

function ensureImageSlots(images: MessageImage[] | undefined, imageIndex: number, prompt: string) {
  const now = new Date().toISOString();
  const next = [...(images ?? [])];

  while (next.length <= imageIndex) {
    next.push({
      id: generateId(),
      prompt,
      status: "deleted",
      createdAt: now,
      updatedAt: now,
    });
  }

  return next;
}

function clipImageReference(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

async function resolveImagePlannerConfig(configId: string | null): Promise<ModelConfig | null> {
  if (!configId) return null;
  const stateConfig = useSettingsStore.getState().modelConfigs.find((config) => config.id === configId);
  return stateConfig ?? settingsRepository.getModelConfig(configId);
}

function MessageEditBox({
  initialContent,
  fontSize,
  onCancel,
  onSave,
}: {
  initialContent: string;
  fontSize: number;
  onCancel: () => void;
  onSave: (content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [prevInitial, setPrevInitial] = useState(initialContent);

  if (initialContent !== prevInitial) {
    setPrevInitial(initialContent);
    setDraft(initialContent);
  }

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="w-full rounded-lg border bg-card p-3 shadow-sm">
      <Textarea
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[260px] max-h-[60vh] resize-y overflow-y-auto leading-relaxed"
        style={{ fontSize: `${fontSize}px` }}
        autoFocus
      />
      <div className="mt-2 flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !draft.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? "Saving..." : "Save (Ctrl+Enter)"}
        </Button>
      </div>
    </div>
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
    messagesHydrated,
    loading,
    error: chatError,
    loadChat,
    createOrGetChat,
    addMessage,
    clearError,
    updateMessage,
    patchMessage,
    deleteMessages,
  } = useChatStore();
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
  const [thinkingMsg, setThinkingMsg] = useState<Message | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savepointName, setSavepointName] = useState("");
  const [savepoints, setSavepoints] = useState<ChatSavepoint[]>([]);
  const [savingSavepoint, setSavingSavepoint] = useState(false);
  const [loadingSavepoints, setLoadingSavepoints] = useState(false);
  const [restoringSavepointId, setRestoringSavepointId] = useState<string | null>(null);
  const [agenticPlayEnabled, setAgenticPlayEnabled] = useState(false);
  const [agenticGameState, setAgenticGameState] = useState<AgenticGameState | null>(null);

  const characterId = searchParams.get("characterId");
  const character = characters.find((c) => c.id === (currentChat?.characterId ?? characterId));

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

    agenticPlayStateRepository.get(chatId).then((record) => {
      if (cancelled) return;
      setAgenticPlayEnabled(record?.enabled ?? false);
      setAgenticGameState(record?.gameState ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [currentChat?.id, character]);

  const updatePreview = useCallback(
    (userInput: string) => {
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
      const built = buildChatPrompt({
        character,
        recentMessages: memorySplit.recentMessages,
        userInput: userInput || "(your message)",
        maxTotalTokens: cs,
        presetItems: agenticPlayEnabled ? buildAgenticPlayPresetItems(character.name) : presetItemsRef.current,
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

  const submitContent = async (content: string, options: Pick<PendingSendItem, "hiddenUserMessage" | "label"> = {}) => {
    if (!content.trim() || !currentChat) return;
    const trimmedContent = content.trim();
    if (sending) {
      setPendingSendQueue((queue) => [...queue, { chatId: currentChat.id, content: trimmedContent, ...options }]);
      return;
    }
    if (messages.length === 0 && character?.firstMessage.trim()) {
      await addMessage({
        chatId: currentChat.id,
        role: "assistant",
        content: replaceUserPlaceholders(character.firstMessage, personaName).trim(),
      });
    }
    await sendMessage(trimmedContent, { hiddenUserMessage: options.hiddenUserMessage });
  };

  const handleAgenticOptionChoice = (option: AgenticActionOption) => {
    void submitContent(option.action, { label: option.label });
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

  const displayError = sendError || chatError;
  const isGeneratingCurrentChat = sending && !!currentChat?.id && sendingChatId === currentChat.id;
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
    if (loading || !messagesHydrated || messages.length !== 0) return;
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
    messages.length,
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
    void sendMessage(next.content, { hiddenUserMessage: next.hiddenUserMessage });
  }, [sending, pendingSendQueue, currentChat, sendMessage]);

  const refreshSavepoints = async () => {
    if (!currentChat) {
      setSavepoints([]);
      return;
    }
    setLoadingSavepoints(true);
    try {
      setSavepoints(await chatSavepointRepository.listByChatId(currentChat.id));
    } finally {
      setLoadingSavepoints(false);
    }
  };

  const closeSaveDialog = () => {
    setSaveDialogOpen(false);
    setSavepointName("");
    setSavingSavepoint(false);
  };

  const handleCreateSavepoint = async () => {
    if (!currentChat) return;
    setSavingSavepoint(true);
    try {
      const latestMessages = await messageRepository.listByChatId(currentChat.id);
      await chatSavepointRepository.create({
        chatId: currentChat.id,
        characterId: currentChat.characterId,
        name: savepointName,
        messages: latestMessages,
      });
      toast("success", "存档已创建");
      closeSaveDialog();
      if (loadDialogOpen) void refreshSavepoints();
    } catch {
      toast("error", "创建存档失败");
      setSavingSavepoint(false);
    }
  };

  const openLoadDialog = async () => {
    if (!currentChat) return;
    setLoadDialogOpen(true);
    await refreshSavepoints();
  };

  const handleRestoreSavepoint = async (savepoint: ChatSavepoint) => {
    if (!currentChat || isGeneratingCurrentChat) return;
    setRestoringSavepointId(savepoint.id);
    try {
      await messageRepository.replaceByChatId(currentChat.id, savepoint.messages);
      await chatRepository.update(currentChat.id, {});
      await loadChat(currentChat.id);
      setLoadDialogOpen(false);
      toast("success", "存档已加载");
    } catch {
      toast("error", "加载存档失败");
    } finally {
      setRestoringSavepointId(null);
    }
  };

  const handleDeleteSavepoint = async (savepointId: string) => {
    await chatSavepointRepository.delete(savepointId);
    if (currentChat) {
      setSavepoints(await chatSavepointRepository.listByChatId(currentChat.id));
    }
    toast("info", "存档已删除");
  };

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

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
      messages.map((msg) => {
        const isUser = msg.role === "user";
        const isFinalAi = !isUser && msg.id === lastAssistantId;
        const split =
          !isUser && (activeRegexRules.length > 0 || /\[image\]/i.test(msg.content))
            ? applyRegexRules(msg.content, activeRegexRules)
            : null;
        const rawDisplayContent = split?.displayContent ?? split?.promptContent ?? msg.content;
        const agenticChoiceBlock = !isUser && agenticPlayEnabled ? extractAgenticOptions(rawDisplayContent) : null;
        const displayContent = agenticChoiceBlock?.content ?? rawDisplayContent;
        const displaySplit = agenticChoiceBlock?.options.length ? null : split;
        const isStreamingAi = !isUser && isGeneratingCurrentChat && msg.id === streamingMessageId;
        const hasDisplayContent = displayContent.trim().length > 0;

        return {
          msg,
          isUser,
          isFinalAi,
          split: displaySplit,
          displayContent,
          agenticOptions: agenticChoiceBlock?.options ?? [],
          isStreamingAi,
          hasDisplayContent,
        };
      }),
    [activeRegexRules, agenticPlayEnabled, isGeneratingCurrentChat, lastAssistantId, streamingMessageId, messages],
  );

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
    const lastMsg = messages[messages.length - 1];
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
  }, [messages, messages.length, sending, sendingChatId, streamingMessageId, currentChat?.id, renderedMessages, chatVirtualizer]);

  useLayoutEffect(() => {
    if (loading || !currentChat?.id || messages.length === 0) return;
    if (lastOpenedChatRef.current === currentChat.id) return;
    lastOpenedChatRef.current = currentChat.id;
    skipNextMessageAutoScrollRef.current = currentChat.id;
    requestAnimationFrame(() => {
      chatVirtualizer.scrollToIndex(renderedMessages.length - 1, { align: "end" });
    });
  }, [currentChat?.id, loading, messages.length, renderedMessages.length, chatVirtualizer]);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      style={{ "--chat-font-size": fontSize + "px" } as React.CSSProperties}
    >
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{character?.name || "Whale Play"}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {agenticPlayEnabled ? "Agentic Play experimental session" : "Character chat session"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Home
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-h-0 min-w-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[230px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="shrink-0 border-b p-4">
              <h2 className="truncate font-semibold">{character?.name || "No character"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {agenticPlayEnabled ? "实验模式" : "普通模式"}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {character ? (
                <div className="space-y-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Avatar name={character.name} src={character.avatar} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{character.name}</p>
                      <p className="text-xs text-muted-foreground">Character anchor</p>
                    </div>
                  </div>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Description</h3>
                    <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {character.description || "-"}
                    </p>
                  </section>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Personality</h3>
                    <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {character.personality || "-"}
                    </p>
                  </section>
                  {agenticPlayEnabled && (
                    <section className="rounded-md border bg-background p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Brain className="h-3.5 w-3.5" />
                        Agentic
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        使用专用主持人提示词模块，不读取普通 preset 组。
                      </p>
                    </section>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a character to start chatting</p>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="flex items-center justify-end gap-2 border-b px-4 py-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTokenDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground text-xs gap-1"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {usageMessages.length > 0 ? (
              <span>
                P:{totalPrompt} C:{totalCompletion} | 🔥 {cacheRate}%
              </span>
            ) : (
              <span>Token Stats</span>
            )}
          </Button>
          {usageMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setTokenDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={contextUsageTitle}
            >
              <span className="text-[10px] font-medium">1M</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full transition-[width] ${contextUsageBarTone}`}
                  style={{ width: `${contextUsagePercent}%` }}
                />
              </span>
              <span className={`w-10 text-right tabular-nums ${contextUsageTone}`}>{contextUsageDisplay}</span>
            </button>
          )}
        </div>
        <div
          ref={messagesContainerRef}
          onScroll={handleChatScroll}
          className="flex-1 overflow-y-auto p-5 mx-3 my-2 rounded-xl border border-border/40 bg-background/50"
        >
          {loading && <p className="text-sm text-muted-foreground text-center">Loading...</p>}
          {!loading && messages.length === 0 && !isGeneratingCurrentChat && (
            <div className="max-w-4xl mx-auto">
              {character ? (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Avatar name={character.name} src={character.avatar} />
                    <span className="text-xs font-medium text-muted-foreground">{character.name}</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="max-w-[75%] min-w-0">
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
                <p className="text-sm text-muted-foreground text-center mt-8">Select a character to start chatting</p>
              )}
            </div>
          )}
          <div className="max-w-4xl mx-auto">
            <div
              style={{
                height: `${chatVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {chatVirtualizer.getVirtualItems().map((virtualItem) => {
                const { msg, isUser, isFinalAi, split, displayContent, agenticOptions, isStreamingAi, hasDisplayContent } =
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
                        <div className="min-w-0 max-w-[min(82%,48rem)] overflow-hidden rounded-lg border bg-primary p-4 text-primary-foreground">
                          <div className="mb-1.5 flex items-center justify-end gap-1 opacity-0 transition-opacity hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground"
                              title="Copy"
                              onClick={() => handleCopy(msg.content, msg.id)}
                            >
                              {copiedId === msg.id ? (
                                <CheckCheck className="h-3.5 w-3.5 text-green-300" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground"
                              title="Delete"
                              onClick={() => setDeleteMsgTarget(msg)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {editingMsgId === msg.id ? (
                            <MessageEditBox
                              initialContent={msg.content}
                              fontSize={fontSize}
                              onCancel={cancelEdit}
                              onSave={saveEdit}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]" style={{ fontSize: `${fontSize}px` }}>
                              {displayContent}
                            </p>
                          )}
                        </div>
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <UserIcon className="h-4 w-4" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-w-0 justify-start gap-3 pb-5">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="group min-w-0 w-full max-w-4xl overflow-hidden py-1">
                          <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{aiName}</span>
                            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title="Edit"
                                onClick={() => startEdit(msg)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title="View full prompt"
                                onClick={showPromptDialog}
                              >
                                <ScrollText className="h-3.5 w-3.5" />
                              </Button>
                              {msg.reasoningContent && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-purple-400"
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
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    title={isMessageImageBusy ? "图片生成中" : "生成图片"}
                                    onClick={() => void handleGenerateMessageImages(msg)}
                                    disabled={isMessageImageBusy}
                                  >
                                    <ImageIcon className={`h-3.5 w-3.5 ${isMessageImageBusy ? "animate-pulse" : ""}`} />
                                  </Button>
                                )}
                              {isFinalAi && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  title="Regenerate"
                                  onClick={() => {
                                    if (!sending) regenerate();
                                  }}
                                  disabled={sending}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteMsgTarget(msg)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <ChatActivityTimeline message={msg} active={isStreamingAi} generationStatus={generationStatus} />

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
                                    className="relative mt-3 rounded-md border bg-accent/40 p-3 first:mt-0"
                                  >
                                    <span className="absolute -top-2.5 left-3 rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                      {block.speaker}
                                    </span>
                                    <p className="whitespace-pre-wrap break-words pt-0.5 [overflow-wrap:anywhere]" style={{ fontSize: `${fontSize}px` }}>
                                      {block.content}
                                    </p>
                                  </div>
                                ) : (
                                  <p key={bi} className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]" style={{ fontSize: `${fontSize}px` }}>
                                    {block.content}
                                  </p>
                                ),
                              )}
                            </div>
                          ) : isStreamingAi && !hasDisplayContent ? (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">{generationStatus.detail}</p>
                              <div className="flex gap-1" aria-label={generationStatus.label}>
                                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "0ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "150ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "300ms" }} />
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]" style={{ fontSize: `${fontSize}px` }}>
                              {displayContent}
                            </p>
                          )}

                          <AgenticOptionsView
                            options={isFinalAi ? agenticOptions : []}
                            disabled={!currentChat || isGeneratingCurrentChat}
                            onChoose={handleAgenticOptionChoice}
                          />

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
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 w-full max-w-4xl py-1">
                  <div className="mb-3 min-w-0 border-l border-border/80">
                    <div className="relative pb-3 pl-5">
                      <span className="absolute left-[-6px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background text-primary">
                        <CircleDashed className="h-3.5 w-3.5 animate-spin" />
                      </span>
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden text-sm font-medium">
                        <Brain className="h-3.5 w-3.5 shrink-0" />
                        <span className="shrink-0">正在思考</span>
                        <span className="min-w-0 truncate text-muted-foreground">· {generationStatus.detail}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1" aria-label={generationStatus.label}>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {displayError && (
          <div className="px-4 py-2 mx-4 mb-2 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
            <span className="truncate">{displayError}</span>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearSendError();
                  clearError();
                }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="shrink-0 border-t bg-card p-4">
          <div className="mx-auto w-full min-w-0 max-w-4xl space-y-2">
            {pendingSendCount > 0 && currentChat && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">待发送 {pendingSendCount}</span>
                </div>
                <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                  {pendingSendQueue
                    .map((item, index) => ({ ...item, index }))
                    .filter((item) => item.chatId === currentChat.id)
                    .map((item) => (
                      <div
                        key={`${item.chatId}-${item.index}`}
                        className="flex items-start gap-2 rounded-md border bg-background/85 px-2 py-1.5"
                      >
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                          {item.label ?? item.content}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          title="取消待发送"
                          onClick={() =>
                            setPendingSendQueue((queue) => queue.filter((_, index) => index !== item.index))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-background/75 p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border bg-background/70 px-2">
                    <span className="text-[10px] text-muted-foreground leading-none">A</span>
                    <input
                      type="range"
                      min="12"
                      max="22"
                      value={fontSize}
                      onInput={(e) => handleFontSizeChange(Number(e.currentTarget.value))}
                      onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                      className="h-1 w-12 accent-primary cursor-pointer"
                      title={`Font size: ${fontSize}px`}
                    />
                    <span className="text-[13px] font-bold text-muted-foreground leading-none">A</span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const nextOpen = !previewOpen;
                      setPreviewOpen(nextOpen);
                      if (nextOpen) updatePreview(input.trim());
                    }}
                    className="h-10 w-10 shrink-0"
                    title="Preview prompt"
                  >
                    {previewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleContinue}
                    disabled={!currentChat || messages.length === 0}
                    className="h-10 w-10 shrink-0"
                    title="隐藏发送续写请求"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSaveDialogOpen(true)}
                    disabled={!currentChat || isGeneratingCurrentChat}
                    className="h-10 w-10 shrink-0"
                    title="创建当前聊天存档"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={openLoadDialog}
                    disabled={!currentChat || isGeneratingCurrentChat}
                    className="h-10 w-10 shrink-0"
                    title="加载聊天存档"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex min-w-0 items-end gap-2">
                <Textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    character
                      ? agenticPlayEnabled
                        ? `Action in ${character.name}'s scene...`
                        : `Message ${character.name}...`
                      : "Type a message..."
                  }
                  disabled={!currentChat}
                  rows={3}
                  className="min-h-[76px] min-w-0 flex-1 resize-none"
                />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || !currentChat}
                    size="icon"
                    title={sending ? "Add to pending send" : "Send"}
                    className="h-10 w-10 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  {sending && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={abort}
                      title="Stop generating"
                      className="h-10 w-10 shrink-0"
                    >
                      <StopCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
            </div>
          </div>
        </div>

        {previewOpen && (
          <div className="border-t p-4 bg-muted/30">
            <div className="max-w-3xl mx-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground max-h-64 overflow-auto">
                {previewText || "Type a message to see prompt preview"}
              </pre>
            </div>
          </div>
        )}
          </section>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="shrink-0 border-b p-4">
            <h2 className="font-semibold">会话状态</h2>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4" />
                运行概览
              </div>
              <div className="space-y-2">
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">消息</div>
                  <div className="mt-1 text-sm font-medium">{messages.length} messages</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTokenDialogOpen(true)}
                  className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="text-xs text-muted-foreground">Token</div>
                  <div className="mt-1 text-sm font-medium">
                    {usageMessages.length > 0 ? `P:${totalPrompt} C:${totalCompletion} | cache ${cacheRate}%` : "暂无统计"}
                  </div>
                  {usageMessages.length > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-[width] ${contextUsageBarTone}`}
                        style={{ width: `${contextUsagePercent}%` }}
                      />
                    </div>
                  )}
                </button>
              </div>
            </section>

            {agenticPlayEnabled && (
              <section className="mt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Brain className="h-4 w-4" />
                  场景状态
                </div>
                <div className="space-y-2">
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">玩家</div>
                    <div className="mt-1 break-words text-sm font-medium">
                      {displayStateValue(agenticGameState?.player?.name, "玩家")}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">所在地点</div>
                    <div className="mt-1 break-words text-sm font-medium">
                      {agenticGameState?.location || "未初始化"}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">玩家状态</div>
                    <div className="mt-1 break-words text-sm">
                      {formatPlayerCondition(agenticGameState?.player)}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">当前局势</div>
                    <div className="mt-1 break-words text-sm">
                      {displayStateValue(agenticGameState?.scene?.active_conflict, "暂无冲突")}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">目标</div>
                    <div className="mt-1 break-words text-sm">
                      {agenticGameState?.quest
                        ? String(agenticGameState.quest.current_objective ?? agenticGameState.quest.main ?? "-")
                        : "-"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">时间</div>
                      <div className="mt-1 break-words text-sm">
                        {displayStateValue(agenticGameState?.scene?.time, "unknown")}
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">危险等级</div>
                      <div className="mt-1 text-sm">
                        {displayStateValue(agenticGameState?.scene?.danger_level, "-")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">物品 / Flags</div>
                    <div className="mt-1 text-sm">
                      {(agenticGameState?.inventory?.length ?? 0)} items ·{" "}
                      {agenticGameState ? Object.keys(agenticGameState.flags).length : 0} flags
                    </div>
                  </div>
                </div>

                <section className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Dice5 className="h-4 w-4" />
                    判定
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-card">
                        <Dice5
                          className={`h-6 w-6 text-primary ${
                            isGeneratingCurrentChat ? "animate-spin" : "animate-pulse"
                          }`}
                        />
                        <span className="absolute inset-1 rounded-md border border-primary/20" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {isGeneratingCurrentChat ? "判定进行中" : "等待行动判定"}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {isGeneratingCurrentChat
                            ? "主持人正在判断风险、调用骰子或整理结果。"
                            : "玩家选择行动后，风险动作会触发骰子判定。"}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </section>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={!!imagePromptEditTarget}
        onOpenChange={(open) => {
          if (!open) closeImagePromptEditor();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>修改图片提示词</DialogTitle>
            <DialogDescription>保存后会更新这张图片的提示词；也可以直接保存并重新生成。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={imagePromptDraft}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setImagePromptDraft(event.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder="English image prompt..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeImagePromptEditor}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void saveImagePromptEdit(false)}
              disabled={!imagePromptDraft.trim()}
            >
              保存提示词
            </Button>
            <Button onClick={() => void saveImagePromptEdit(true)} disabled={!imagePromptDraft.trim()}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              保存并重新生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Full Prompt</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
              {previewText || "(no prompt data)"}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(previewText);
                toast("success", "Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDialogOpen} onOpenChange={(open) => (open ? setSaveDialogOpen(true) : closeSaveDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建存档点</DialogTitle>
            <DialogDescription>保存当前聊天的消息快照。名字可以留空，系统会自动生成。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={savepointName}
              onChange={(event) => setSavepointName(event.target.value)}
              placeholder={createDefaultSavepointName()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSaveDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreateSavepoint} disabled={savingSavepoint || !currentChat}>
              {savingSavepoint ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>加载存档</DialogTitle>
            <DialogDescription>加载后会用存档内容替换当前聊天消息。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {loadingSavepoints && <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>}
            {!loadingSavepoints && savepoints.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有存档点。</p>
            )}
            {!loadingSavepoints &&
              savepoints.map((savepoint) => (
                <div key={savepoint.id} className="flex items-center gap-3 rounded-lg border bg-card/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{savepoint.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSavepointDate(savepoint.createdAt)} · {savepoint.messageCount} messages
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreSavepoint(savepoint)}
                    disabled={!!restoringSavepointId || isGeneratingCurrentChat}
                  >
                    {restoringSavepointId === savepoint.id ? "Loading..." : "加载"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteSavepoint(savepoint.id)}
                    disabled={!!restoringSavepointId}
                    title="删除存档"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={refreshSavepoints} disabled={loadingSavepoints || !currentChat}>
              Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Token Usage &amp; Cache Hit
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 rounded-md border bg-background p-1">
            <button
              type="button"
              onClick={() => setTokenUsageView("main")}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${tokenUsageView === "main" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Main API
            </button>
            <button
              type="button"
              onClick={() => setTokenUsageView("secondary")}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${tokenUsageView === "secondary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Secondary API
            </button>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {tokenDialogRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {tokenUsageView === "main"
                  ? "No main API usage data yet. Send a message to see stats."
                  : "No secondary API usage data yet. It appears after memory compression or image planning uses a secondary model."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-4">
                  <div
                    className="min-w-0 bg-accent/50 rounded-lg p-3 text-center"
                    title={tokenDialogTotals.prompt.toLocaleString()}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">
                      {formatCompactToken(tokenDialogTotals.prompt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Prompt</p>
                  </div>
                  <div
                    className="min-w-0 bg-accent/50 rounded-lg p-3 text-center"
                    title={tokenDialogTotals.completion.toLocaleString()}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">
                      {formatCompactToken(tokenDialogTotals.completion)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Completion</p>
                  </div>
                  <div
                    className="min-w-0 bg-accent/50 rounded-lg p-3 text-center"
                    title={(tokenDialogTotals.prompt + tokenDialogTotals.completion).toLocaleString()}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">
                      {formatCompactToken(tokenDialogTotals.prompt + tokenDialogTotals.completion)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div
                    className="min-w-0 bg-emerald-500/10 rounded-lg p-3 text-center"
                    title={tokenDialogTotals.cacheHit.toLocaleString()}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate text-emerald-600">
                      {formatCompactToken(tokenDialogTotals.cacheHit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Cache Hit</p>
                  </div>
                  <div
                    className="min-w-0 bg-blue-500/10 rounded-lg p-3 text-center"
                    title={`${tokenDialogTotals.cacheRate}%`}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate text-blue-600">
                      {tokenDialogTotals.cacheRate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">Hit Rate</p>
                  </div>
                  <div
                    className="min-w-0 bg-purple-500/10 rounded-lg p-3 text-center"
                    title={
                      tokenUsageView === "main"
                        ? contextUsageTitle
                        : `${secondaryUsageRecords.length} secondary API calls`
                    }
                  >
                    <p
                      className={`text-lg font-bold tabular-nums leading-tight truncate ${tokenUsageView === "main" ? contextUsageTone : "text-purple-600"}`}
                    >
                      {tokenUsageView === "main" ? contextUsageDisplay : secondaryUsageRecords.length.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tokenUsageView === "main" ? "1M Context" : "Calls"}
                    </p>
                  </div>
                  <div
                    className="min-w-0 bg-amber-500/10 rounded-lg p-3 text-center"
                    title={formatCnyExact(tokenDialogTotals.costCny)}
                  >
                    <p className="text-lg font-bold tabular-nums leading-tight truncate text-amber-600">
                      {formatCnyCost(tokenDialogTotals.costCny)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Cost (RMB)</p>
                  </div>
                </div>
                {tokenDialogTotals.cacheRate === "-" && (
                  <p className="text-xs text-muted-foreground mb-2 px-1">
                    ⚠ Cache hit data unavailable — your API may not support prompt caching (Ollama/vLLM most instances
                    do not). Supported by DeepSeek, OpenAI recent models, Anthropic.
                  </p>
                )}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2">{tokenUsageView === "main" ? "Round" : "Call"}</th>
                        {tokenUsageView === "secondary" && <th className="text-left p-2">Model</th>}
                        <th className="text-right p-2">Prompt</th>
                        <th className="text-right p-2">Completion</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">🔥 Hit</th>
                        <th className="text-right p-2">📉 Miss</th>
                        <th className="text-right p-2">Rate</th>
                        <th className="text-right p-2">Cost (RMB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenDialogRows.map((row) => {
                        const p = row.usage?.promptTokens || 0;
                        const c = row.usage?.completionTokens || 0;
                        const t = row.usage?.totalTokens || 0;
                        const h = row.usage?.cacheHitTokens || 0;
                        const ms = row.usage?.cacheMissTokens ?? p - h;
                        const r = p > 0 ? ((h / p) * 100).toFixed(1) : "-";
                        const cost = row.usage?.costCny;
                        return (
                          <tr key={row.id} className="border-t">
                            <td
                              className="p-2 text-muted-foreground"
                              title={row.debugPromptPath || row.debugPromptFilename || undefined}
                            >
                              <div>{row.label}</div>
                              {tokenUsageView === "main" && row.debugTrigger && (
                                <div className="text-[10px] leading-tight">
                                  {row.debugTrigger === "retry" && row.debugBaseTrigger
                                    ? `${row.debugBaseTrigger}->retry`
                                    : row.debugTrigger}
                                  {row.debugAttempt && row.debugAttempt > 1 ? ` a${row.debugAttempt}` : ""}
                                </div>
                              )}
                            </td>
                            {tokenUsageView === "secondary" && (
                              <td className="p-2 text-muted-foreground">{row.model || "-"}</td>
                            )}
                            <td className="p-2 text-right">{p.toLocaleString()}</td>
                            <td className="p-2 text-right">{c.toLocaleString()}</td>
                            <td className="p-2 text-right">{t.toLocaleString()}</td>
                            <td className="p-2 text-right text-emerald-600">{h > 0 ? h.toLocaleString() : "-"}</td>
                            <td className="p-2 text-right text-orange-500">{ms > 0 ? ms.toLocaleString() : "-"}</td>
                            <td className="p-2 text-right">
                              {r}
                              {r !== "-" ? "%" : ""}
                            </td>
                            <td
                              className="p-2 text-right tabular-nums"
                              title={
                                [row.usage?.costPricingName || row.usage?.costModel, formatCnyExact(cost)]
                                  .filter(Boolean)
                                  .join(" · ") || undefined
                              }
                            >
                              {formatCnyCost(cost)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteMsgTarget} onOpenChange={() => setDeleteMsgTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete this message? If it's a user message followed by an AI reply, the AI reply will also be deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMsgTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMessage}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!thinkingMsg} onOpenChange={() => setThinkingMsg(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-400" />
              创作过程
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground bg-muted/40 p-4 rounded-lg">
              {thinkingMsg?.reasoningContent || "(暂无创作过程数据)"}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThinkingMsg(null)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(thinkingMsg?.reasoningContent || "");
                toast("success", "Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
