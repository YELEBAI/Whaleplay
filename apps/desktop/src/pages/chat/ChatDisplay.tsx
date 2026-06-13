import type { SideBlock, DisplayBlock } from "@neo-tavern/core";
import { cn } from "@neo-tavern/ui";

// ── Internal helpers ─────────────────────────────────

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

// ── Components ───────────────────────────────────────

export function Avatar({ name, src, isUser }: { name: string; src?: string; isUser?: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  const bg = isUser ? "bg-blue-500" : "bg-emerald-500";
  if (src) {
    return <img src={src} alt={name} className="border-border/30 h-8 w-8 shrink-0 rounded-full border object-cover" />;
  }
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", bg)}>
      <span className="text-xs font-bold text-white">{initial}</span>
    </div>
  );
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
      <div className="mt-1 flex flex-wrap gap-2">
        {side.actions.map((action, ai) => (
          <button
            key={ai}
            onClick={() => onAction(action)}
            className="border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors"
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
  return <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{side.content}</p>;
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
