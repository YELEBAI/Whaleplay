import type { Message } from "@neo-tavern/shared";

// ── Types ─────────────────────────────────────────────

export interface TreeDiffResult {
  /** Messages present in both trees (matched by ID or content fingerprint) */
  shared: Message[];
  /** Messages only in tree A */
  onlyInA: Message[];
  /** Messages only in tree B */
  onlyInB: Message[];
  /**
   * parentIds in the shared tree where tree B has diverging children.
   * These are the natural merge / branch-attach points.
   */
  divergencePoints: string[];
}

export interface ContentMergeResult {
  /** Existing messages matched by content and therefore skipped during import. */
  shared: Message[];
  /** Current messages that did not match any incoming message. */
  onlyInCurrent: Message[];
  /** Incoming messages that should be persisted after parent remapping. */
  imported: Message[];
  /** Existing parent ids where imported messages attach as new branches. */
  divergencePoints: string[];
  /** Incoming message id -> final persisted/matched message id. */
  idMap: Record<string, string>;
}

// ── ID-based diff (sync) ──────────────────────────────

/**
 * Compare two message trees by stable message ID.
 * Use when IDs are shared across devices (sync scenario).
 * Messages with the same ID are considered the same logical message.
 */
export function diffTreesById(a: Message[], b: Message[]): TreeDiffResult {
  const idsA = new Set(a.map((m) => m.id));
  const idsB = new Set(b.map((m) => m.id));

  const shared = a.filter((m) => idsB.has(m.id));
  const onlyInA = a.filter((m) => !idsB.has(m.id));
  const onlyInB = b.filter((m) => !idsA.has(m.id));

  const divergencePoints = findDivergenceParents(idsA, b);

  return { shared, onlyInA, onlyInB, divergencePoints };
}

// ── Content-based diff (savepoint import) ─────────────

/**
 * Build a lightweight content fingerprint for a single message.
 * Matches messages whose role + content prefix are identical.
 */
export function fingerprintMessage(m: Message): string {
  // Normalize: chatId + role + first 300 chars of trimmed content
  const body = m.content.trim().slice(0, 300);
  return `${m.chatId}:${m.role}:${body}`;
}

export function normalizeMessageContentForMerge(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function fingerprintMessageForContentMerge(m: Pick<Message, "role" | "content">): string {
  return `${m.role}:${normalizeMessageContentForMerge(m.content)}`;
}

/**
 * Merge imported/exported messages by role + normalized content.
 *
 * This keeps the message tree model intact while allowing savepoint/import
 * flows to skip existing messages and attach new divergent messages under the
 * matching current parent instead of a temporary imported parent id.
 */
export function mergeMessagesByContent(current: Message[], incoming: Message[]): ContentMergeResult {
  const currentPools = new Map<string, Message[]>();
  for (const message of current) {
    const fingerprint = fingerprintMessageForContentMerge(message);
    currentPools.set(fingerprint, [...(currentPools.get(fingerprint) ?? []), message]);
  }

  const shared: Message[] = [];
  const imported: Message[] = [];
  const matchedCurrentIds = new Set<string>();
  const idMap = new Map<string, string>();
  const currentIds = new Set(current.map((message) => message.id));
  const divergencePoints = new Set<string>();

  for (const message of incoming) {
    const fingerprint = fingerprintMessageForContentMerge(message);
    const candidates = currentPools.get(fingerprint);
    const match = candidates?.shift();

    if (match) {
      shared.push(match);
      matchedCurrentIds.add(match.id);
      idMap.set(message.id, match.id);
      continue;
    }

    const mappedParentId = message.parentId ? (idMap.get(message.parentId) ?? message.parentId) : null;
    const remapped = { ...message, parentId: mappedParentId };
    imported.push(remapped);
    idMap.set(message.id, message.id);

    if (mappedParentId && currentIds.has(mappedParentId)) {
      divergencePoints.add(mappedParentId);
    }
  }

  return {
    shared,
    onlyInCurrent: current.filter((message) => !matchedCurrentIds.has(message.id)),
    imported,
    divergencePoints: [...divergencePoints],
    idMap: Object.fromEntries(idMap),
  };
}

/**
 * Compare two message trees by content fingerprint.
 * Use when IDs differ (savepoint import: IDs are remapped).
 * Messages are matched by {role, content prefix}.
 */
export function diffTreesByContent(current: Message[], incoming: Message[]): TreeDiffResult {
  const fpToCurrent = new Map<string, Message[]>();
  for (const m of current) {
    const fp = fingerprintMessage(m);
    const list = fpToCurrent.get(fp) ?? [];
    list.push(m);
    fpToCurrent.set(fp, list);
  }

  // Copy the candidate pools so we can consume matches
  const pool = new Map<string, Message[]>();
  for (const [fp, msgs] of fpToCurrent) {
    pool.set(fp, [...msgs]);
  }

  const shared: Message[] = [];
  const onlyInB: Message[] = [];
  const matchedCurrentIds = new Set<string>();

  for (const m of incoming) {
    const fp = fingerprintMessage(m);
    const candidates = pool.get(fp);
    if (candidates && candidates.length > 0) {
      const match = candidates.shift()!;
      shared.push(match);
      matchedCurrentIds.add(match.id);
    } else {
      onlyInB.push(m);
    }
  }

  const onlyInA = current.filter((m) => !matchedCurrentIds.has(m.id));
  const sharedIds = new Set(shared.map((m) => m.id));

  // Divergence: incoming messages whose parent is in shared tree
  const divergencePoints = new Set<string>();
  for (const m of onlyInB) {
    if (m.parentId && sharedIds.has(m.parentId)) {
      divergencePoints.add(m.parentId);
    }
  }

  return {
    shared,
    onlyInA,
    onlyInB,
    divergencePoints: [...divergencePoints],
  };
}

// ── Helpers ───────────────────────────────────────────

function findDivergenceParents(idsA: Set<string>, b: Message[]): string[] {
  const points = new Set<string>();
  for (const m of b) {
    if (!idsA.has(m.id) && m.parentId && idsA.has(m.parentId)) {
      points.add(m.parentId);
    }
  }
  return [...points];
}
