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
