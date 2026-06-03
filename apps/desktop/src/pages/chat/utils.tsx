import type { Message } from "@neo-tavern/shared";
import type { SideBlock, DisplayBlock } from "@neo-tavern/core";
import type { GenerationPhase } from "@/features/chat/chat.types";

// ── Constants ─────────────────────────────────────────
export const DEEPSEEK_CONTEXT_LIMIT = 1_000_000;
export const CHAT_FONT_SIZE_KEY = "neotavern_chat_font_size";
export const CHAT_DRAFT_KEY_PREFIX = "neotavern_chat_draft";
export const CONTINUE_PROMPT = "继续";
export const CHAT_VISIBLE_TURN_LIMIT = 20;
export const CHAT_FONT_SIZE_MIN = 12;
export const CHAT_FONT_SIZE_MAX = 22;

export type PendingSendItem = {
  chatId: string;
  content: string;
  hiddenUserMessage?: boolean;
  label?: string;
};

// ── Pure helpers ──────────────────────────────────────
const compactTokenFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompactToken(value: number) {
  return compactTokenFormatter.format(value);
}

export function getChatDraftKey(chatId: string) {
  return `${CHAT_DRAFT_KEY_PREFIX}_${chatId}`;
}

export function clampChatFontSize(value: number) {
  if (!Number.isFinite(value)) return 15;
  return Math.min(CHAT_FONT_SIZE_MAX, Math.max(CHAT_FONT_SIZE_MIN, Math.round(value)));
}

export function countUserTurns(messages: Message[]) {
  return messages.filter((m) => m.role === "user").length;
}

export function getRecentTurnStartIndex(messages: Message[], turnLimit: number) {
  if (turnLimit <= 0) return messages.length;
  let turns = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    turns += 1;
    if (turns > turnLimit) {
      let start = i + 1;
      while (start < messages.length && messages[start].role !== "user") start += 1;
      return start;
    }
  }
  return 0;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatSavepointDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getGenerationStatus(phase: GenerationPhase | null) {
  if (phase === "retrying") {
    return {
      label: "正文空白，重写中",
      tag: "retrying",
      detail: "上一版没有可显示正文，正在重新整理剧情并补写角色回复",
    };
  }
  if (phase === "writing") {
    return { label: "正文落笔中", tag: "writing", detail: "正在把这一幕写成角色回复" };
  }
  return { label: "剧情构思中", tag: "thinking", detail: "正在整理角色动机、场景节奏与下一步推进" };
}

export function replaceUserPlaceholders(content: string, userName: string) {
  return content.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName);
}

// ── Small presentational components ───────────────────
export function Avatar({ name, src, isUser }: { name: string; src?: string; isUser?: boolean }) {
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

function parseSafeDetails(content: string) {
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
    className: (className === "neo-thoughts" ? "neo-thoughts" : "neo-summary") as "neo-summary" | "neo-thoughts",
    open: /\bopen\b/.test(attrs),
    summary: match[2],
    body: match[3].trim(),
  };
}

export function SideBlockView({
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

export function TemplateDisplayBlockView({ block, fontSize }: { block: DisplayBlock; fontSize: number }) {
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
