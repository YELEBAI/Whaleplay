/**
 * Flood guard for generation quality control.
 *
 * This is intentionally independent from content safety / healthy mode:
 * flooding is a bad-generation pattern, not a content-mode policy.
 */

export interface FloodDetectionConfig {
  similarityThreshold: number;
  maxOccurrences: number;
  minContentChars: number;
  windowChars: number;
  minSegmentChars: number;
}

export const DEFAULT_FLOOD_CONFIG: FloodDetectionConfig = {
  similarityThreshold: 0.9,
  maxOccurrences: 5,
  minContentChars: 160,
  windowChars: 1600,
  minSegmentChars: 12,
};

export interface FloodDetectionResult {
  flooded: boolean;
  count: number;
  reason?: string;
}

export function textSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.replace(/\s+/g, "").replace(/[<>/[\]【】*#\-_~，。！？、；：”“‘’（）《》—…·]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const sa = bigrams(na);
  const sb = bigrams(nb);
  let intersection = 0;
  for (const bg of sa) {
    if (sb.has(bg)) intersection++;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectFlood(
  recentContents: string[],
  newContent: string,
  config: Partial<FloodDetectionConfig> = {},
): FloodDetectionResult {
  const effective = { ...DEFAULT_FLOOD_CONFIG, ...config };
  if (!newContent.trim()) return { flooded: false, count: 0 };
  let count = 0;
  for (const content of recentContents) {
    if (textSimilarity(content, newContent) >= effective.similarityThreshold) {
      count++;
    }
  }
  return {
    flooded: count >= effective.maxOccurrences,
    count,
    reason: count >= effective.maxOccurrences ? "similar-to-recent-messages" : undefined,
  };
}

function normalizeSegment(value: string) {
  return value.replace(/\s+/g, "").replace(/[<>/[\]【】*#\-_~，。！？、；：”“‘’（）《》—…·]/g, "");
}

function splitFloodSegments(content: string, minSegmentChars: number) {
  return content
    .split(/[\r\n。！？!?；;]+/)
    .map((segment) => segment.trim())
    .filter((segment) => normalizeSegment(segment).length >= minSegmentChars);
}

export function detectSelfFlood(content: string, config: Partial<FloodDetectionConfig> = {}): FloodDetectionResult {
  const effective = { ...DEFAULT_FLOOD_CONFIG, ...config };
  const trimmed = content.trim();
  if (trimmed.length < effective.minContentChars) return { flooded: false, count: 0 };

  const windowed = trimmed.slice(-effective.windowChars);
  const exactCounts = new Map<string, number>();
  for (const segment of splitFloodSegments(windowed, effective.minSegmentChars)) {
    const key = normalizeSegment(segment);
    const count = (exactCounts.get(key) ?? 0) + 1;
    exactCounts.set(key, count);
    if (count >= effective.maxOccurrences) {
      return { flooded: true, count, reason: "repeated-segment" };
    }
  }

  const normalized = normalizeSegment(windowed);
  for (let length = effective.minSegmentChars; length <= Math.min(80, Math.floor(normalized.length / 2)); length++) {
    const tail = normalized.slice(-length);
    if (!tail) continue;
    let count = 0;
    for (let offset = normalized.length - length; offset >= 0; offset -= length) {
      if (normalized.slice(offset, offset + length) !== tail) break;
      count++;
    }
    if (count >= effective.maxOccurrences) {
      return { flooded: true, count, reason: "repeated-tail" };
    }
  }

  return { flooded: false, count: 0 };
}

export function createFloodInspectOutput(recentContents: string[] = [], config: Partial<FloodDetectionConfig> = {}) {
  return (accumulated: string): { pass: true } | { pass: false; reason: string; terminate: true } => {
    const selfFlood = detectSelfFlood(accumulated, config);
    if (selfFlood.flooded) {
      return {
        pass: false,
        reason: `Flood guard stopped repeated output (${selfFlood.reason}, count=${selfFlood.count}).`,
        terminate: true,
      };
    }

    const recentFlood = detectFlood(recentContents, accumulated, config);
    if (recentFlood.flooded) {
      return {
        pass: false,
        reason: `Flood guard stopped output similar to recent messages (count=${recentFlood.count}).`,
        terminate: true,
      };
    }

    return { pass: true };
  };
}
