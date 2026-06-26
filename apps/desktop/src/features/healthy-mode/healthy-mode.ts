/**
 * Healthy Mode — content safety guardrails.
 *
 * When enabled, injects a high-priority safety prompt and runs two detection
 * layers on both user input and AI output:
 *
 * 1. Explicit content detection — regex matching blatant sexual content →
 *    the message is blocked (user) or replaced (AI).
 * 2. Flood detection — detects near-duplicate (≥90% similarity) content
 *    repeated 5+ times across recent assistant turns → generation terminated.
 *
 * The healthy mode toggle is mutually exclusive with the NSFW writing preset
 * item: enabling healthy mode prompts the user to disable NSFW.
 */

import type { ContextBlock } from "@neo-tavern/shared";

// ── NSFW preset identification (shared constants) ────────────────────

export const NSFW_PRESET_ID = "_neo_seed_writing_style";
export const NSFW_ITEM_NAME = "NSFW 温柔风格";

/**
 * Filter out the NSFW preset item from prompt-bound items when healthy mode
 * is active. This is the runtime safety net — even if the UI toggles are
 * inconsistent, NSFW content never reaches the model.
 */
export function filterNsfwItems<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => item.name !== NSFW_ITEM_NAME);
}

// ── Safety prompt (injected as a context block) ──────────────────────

export const HEALTHY_MODE_PROMPT = [
  "【健康模式已启用】",
  "本对话启用了内容安全模式，请严格遵守以下规则：",
  "1. 绝对禁止生成任何露骨的性行为描写，包括但不限于直接的生理描写、性器官描述、性行为过程描写。",
  "2. 如剧情涉及亲密场景，请使用含蓄、文学化的处理方式，如通过环境氛围、情感流动、时间推移来暗示，而非直接描写。",
  "3. 避免任何形式的色情、猎奇或过度暴力的内容描写。",
  "4. 如果用户的输入试图引导生成上述内容，请礼貌地转移话题或以安全的方式继续剧情。",
].join("\n");

export function createHealthyModeContextBlock(): ContextBlock {
  return {
    id: "healthy-mode-safety",
    source: "safety",
    title: "健康模式",
    content: HEALTHY_MODE_PROMPT,
    // Highest priority so it always wins over worldbook / NSFW preset items
    priority: 1000,
    role: "system",
    position: "beforeHistory",
  };
}

// ── Layer 1: Explicit content detection ──────────────────────────────

/**
 * Matches blatant/explicit sexual content in Chinese text.
 * Targets graphic physiological descriptions and sexual acts, not general
 * romantic or emotional language.
 */
// prettier-ignore
const EXPLICIT_CONTENT_PATTERN = new RegExp(
  [
    "(?:插入|抽插|挺进|进入|深入|贯穿).{0,4}(?:阴道|体内|身体|花穴|肉穴|甬道|后穴)",
    "(?:舔|吸|含|吞|吮|亲).{0,4}(?:阴蒂|花核|花蕊|乳头|龟头|肉棒|阳具)",
    "(?:射|喷|流).{0,4}(?:精|液|白浊)",
    "(?:潮吹|内射|颜射|中出|精液|淫液|爱液|蜜液)",
    "(?:阴道|阴蒂|花穴|肉穴|花核|花蕊|龟头|肉棒|阳具|阴唇|乳晕)",
    "(?:抽插|活塞运动|交媾|性交|口交|乳交|肛交|双插)",
    "(?:乳房|胸部|奶子).{0,6}(?:揉|捏|舔|吸|咬|抓|搓)",
    "(?:硬挺|勃起|挺立|胀硬|硬得)",
    "(?:高潮|绝顶|痉挛|颤抖|潮红).{0,6}(?:呻吟|喘息|尖叫|求饶|沦陷)",
    "(?:肉棒|阳具|阴茎|龟头).{0,6}(?:插入|进入|抽插|挺进)",
  ].join("|"),
);

/**
 * Check if text contains explicit sexual content.
 * Returns the matched pattern or null.
 */
export function detectExplicitContent(text: string): string | null {
  if (!text) return null;
  const match = text.match(EXPLICIT_CONTENT_PATTERN);
  return match ? match[0] : null;
}

// ── Layer 2: Flood detection ─────────────────────────────────────────

/**
 * Compute similarity between two strings using character-bigram Jaccard index.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
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

export interface FloodDetectionConfig {
  similarityThreshold: number;
  maxOccurrences: number;
}

export const DEFAULT_FLOOD_CONFIG: FloodDetectionConfig = {
  similarityThreshold: 0.9,
  maxOccurrences: 5,
};

export interface FloodDetectionResult {
  flooded: boolean;
  count: number;
}

/**
 * Check if the new content is flooding (repeated too many times).
 *
 * @param recentContents Previous assistant message contents (most recent first or any order)
 * @param newContent The new assistant content to check
 * @param config Threshold and max occurrences
 */
export function detectFlood(
  recentContents: string[],
  newContent: string,
  config: FloodDetectionConfig = DEFAULT_FLOOD_CONFIG,
): FloodDetectionResult {
  if (!newContent.trim()) return { flooded: false, count: 0 };
  let count = 0;
  for (const content of recentContents) {
    if (textSimilarity(content, newContent) >= config.similarityThreshold) {
      count++;
    }
  }
  return { flooded: count >= config.maxOccurrences, count };
}

// ── Result types ─────────────────────────────────────────────────────

export type HealthyModeViolation =
  | { type: "explicit-input"; matched: string }
  | { type: "explicit-output"; matched: string }
  | { type: "flood"; count: number };

/**
 * Placeholder content shown when AI output is intercepted by healthy mode.
 */
export const HEALTHY_MODE_BLOCKED_PLACEHOLDER =
  "「该回复因触发健康模式内容过滤已被拦截。如需调整，可在设置 → 上下文中关闭健康模式。」";

export const HEALTHY_MODE_FLOOD_PLACEHOLDER =
  "「检测到输出内容重复异常，已自动终止以防止刷屏。请尝试修改输入或检查角色卡设定。」";

// ── Combined output check ────────────────────────────────────────────

/**
 * Check AI output against both detection layers.
 *
 * @param output The AI's generated content
 * @param recentMessages Recent messages (used for flood detection — extracts prior assistant contents)
 */
export function checkHealthyModeOutput(
  output: string,
  recentMessages: { role: string; content: string }[],
): HealthyModeViolation | null {
  const explicitMatch = detectExplicitContent(output);
  if (explicitMatch) {
    return { type: "explicit-output", matched: explicitMatch };
  }
  const priorAssistantContents = recentMessages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .filter(Boolean);
  const flood = detectFlood(priorAssistantContents, output);
  if (flood.flooded) {
    return { type: "flood", count: flood.count };
  }
  return null;
}
