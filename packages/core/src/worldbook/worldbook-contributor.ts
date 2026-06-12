import type { ContextContributor, ContextInput, ContextBlock } from "@neo-tavern/shared";
import type { WorldbookEntry } from "@neo-tavern/shared";

function extractKeywords(keys: string): string[] {
  return keys
    .split(/[,;，；]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiWord(text: string) {
  return /^[a-z0-9_]+$/i.test(text);
}

function keywordInText(text: string, keyword: string, matchWholeWords: boolean): boolean {
  if (!matchWholeWords || !isAsciiWord(keyword)) return text.includes(keyword);
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(text);
}

function matchKeywords(
  text: string,
  keywords: string[],
  mode: "and" | "or",
  options: { caseSensitive?: boolean; matchWholeWords?: boolean } = {},
): boolean {
  if (keywords.length === 0) return false;
  const source = options.caseSensitive ? text : text.toLowerCase();
  const normalizedKeywords = options.caseSensitive ? keywords : keywords.map((kw) => kw.toLowerCase());
  if (mode === "or") {
    return normalizedKeywords.some((kw) => keywordInText(source, kw, options.matchWholeWords ?? false));
  }
  return normalizedKeywords.every((kw) => keywordInText(source, kw, options.matchWholeWords ?? false));
}

function stableScore(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function passesProbability(entry: WorldbookEntry, scanText: string) {
  if (!entry.useProbability) return true;
  const probability = Math.max(0, Math.min(100, entry.probability ?? 100));
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return stableScore(`${entry.id}:${scanText}`) < probability;
}

function getScanText(userInput: string, recent: string | { content: string }[], scanDepth: number) {
  const recentText = Array.isArray(recent)
    ? (scanDepth > 0 ? recent.slice(-scanDepth) : recent).map((m) => m.content).join("\n")
    : recent;
  return (userInput + "\n" + recentText).slice(-8000);
}

export function resolveWorldbookEntries(
  entries: WorldbookEntry[],
  userInput: string,
  recentText: string | { content: string }[],
): { matched: WorldbookEntry[] } {
  const enabled = entries.filter((e) => e.enabled);
  const alwaysEntries = enabled.filter((e) => {
    const scanText = getScanText(userInput, recentText, e.scanDepth ?? 8);
    return e.type === "always" && passesProbability(e, scanText);
  });
  const triggerEntries = enabled.filter((e) => e.type === "trigger");

  const matchedTriggers = triggerEntries.filter((e) => {
    const scanText = getScanText(userInput, recentText, e.scanDepth ?? 8);
    if (!passesProbability(e, scanText)) return false;
    const keywords = extractKeywords(e.keys);
    if (keywords.length === 0) return false;
    const primaryMatched = matchKeywords(scanText, keywords, e.triggerMode, {
      caseSensitive: e.caseSensitive,
      matchWholeWords: e.matchWholeWords,
    });
    if (!primaryMatched) return false;

    const secondaryKeywords = extractKeywords(e.secondaryKeys ?? "");
    if (secondaryKeywords.length === 0) return true;
    return matchKeywords(scanText, secondaryKeywords, e.selectiveLogic ?? "or", {
      caseSensitive: e.caseSensitive,
      matchWholeWords: e.matchWholeWords,
    });
  });

  const all = [...alwaysEntries, ...matchedTriggers].sort(
    (a, b) => b.priority - a.priority || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );

  return { matched: all };
}

export function getWorldbookEntryInsertPosition(entry: WorldbookEntry): ContextBlock["position"] {
  if (entry.type === "trigger") return "afterHistory";
  return entry.position ?? "beforeHistory";
}

export class WorldbookContributor implements ContextContributor {
  id = "worldbook";
  name = "Worldbook";

  private entries: WorldbookEntry[] = [];

  setEntries(entries: WorldbookEntry[]) {
    this.entries = entries;
  }

  async contribute(input: ContextInput): Promise<ContextBlock[]> {
    const { matched } = resolveWorldbookEntries(this.entries, input.userInput, input.recentMessages);

    return matched.map((e) => ({
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
