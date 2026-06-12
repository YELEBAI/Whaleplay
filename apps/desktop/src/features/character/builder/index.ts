// ── Agent entry points ──
export { runNeoCharacterBuilderTurn, buildNeoCharacterDraft } from "./agent";

// ── Tool Registry ──
export { WhaleBuilderToolRegistry, builderToolRegistry } from "./tool-registry";

// ── Pack export ──
export { exportPackToFolder } from "./pack";
export type { CharacterCardPack } from "./pack";

// ── Types (re-export all public types) ──
export type {
  NeoCharacterBuilderOptions,
  NeoCharacterBuilderResult,
  NeoBuilderTurnOptions,
  NeoBuilderTurnResult,
  NeoBuilderConversationMessage,
  NeoBuilderToolEvent,
  NeoBuilderChoice,
  NeoBuilderQuestion,
  NeoBuilderWebSearchResult,
  NeoBuilderEvaluationReport,
  NeoCreationPlan,
  NeoCreationPlanEntry,
  NeoPersonalityPalette,
  NeoMvuConfig,
  NeoStatusBarConfig,
  ValidationResult,
} from "./types";

// ── Utilities (for tests and external consumers) ──
export { addUsage, parseToolArguments } from "./utils";
export {
  normalizeDraft,
  normalizePersonalityPalette,
  normalizeCreationPlan,
  normalizeWorldbookEntries,
  normalizeMvuConfig,
  normalizeStatusBarConfig,
} from "./validation";
export { REFERENCE_TEXTS } from "./references";
