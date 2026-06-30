export const CONTENT_MODES = ["normal", "healthy", "adultLimited"] as const;

export type ContentMode = (typeof CONTENT_MODES)[number];

export const DEFAULT_CONTENT_MODE: ContentMode = "normal";

// ── Built-in NSFW preset identity ─────────────────────────────────────

export const NSFW_PRESET_ID = "_neo_seed_writing_style";
export const NSFW_ITEM_NAME = "NSFW 温柔风格";
export const NSFW_ITEM_KIND = "neo:nsfw-soft";

export interface PolicyPresetItemIdentity {
  name: string;
  builtinKind?: string | null;
}

export function normalizeContentMode(value: unknown): ContentMode | null {
  return typeof value === "string" && (CONTENT_MODES as readonly string[]).includes(value)
    ? (value as ContentMode)
    : null;
}

/**
 * Stable NSFW item detection.
 *
 * `builtinKind` is the durable marker. The name fallback keeps existing stores
 * working until seed/repair code has tagged old built-in items.
 */
export function isNsfwPresetItem(item: PolicyPresetItemIdentity): boolean {
  return item.builtinKind === NSFW_ITEM_KIND || item.name === NSFW_ITEM_NAME;
}

export function filterNsfwItems<T extends PolicyPresetItemIdentity>(items: T[]): T[] {
  return items.filter((item) => !isNsfwPresetItem(item));
}

export interface ContentPolicySnapshot {
  mode: ContentMode;
  healthyMode: boolean;
  adultLimited: boolean;
  blockExplicitInput: boolean;
  injectHealthyPrompt: boolean;
  filterNsfwPresetItems: boolean;
  checkExplicitOutput: boolean;
}

/**
 * Capture the generation policy once per turn so a mid-stream settings change
 * cannot make one response use mixed prompt/checking rules.
 */
export function createContentPolicySnapshot(mode: ContentMode): ContentPolicySnapshot {
  const healthyMode = mode === "healthy";
  return {
    mode,
    healthyMode,
    adultLimited: mode === "adultLimited",
    blockExplicitInput: healthyMode,
    injectHealthyPrompt: healthyMode,
    // Normal and healthy modes never send the built-in soft-NSFW prompt.
    filterNsfwPresetItems: mode !== "adultLimited",
    checkExplicitOutput: healthyMode,
  };
}
