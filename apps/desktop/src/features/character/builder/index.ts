// ── Agent entry points ──
export { runNeoCharacterBuilderTurn, buildNeoCharacterDraft } from "./agent";

// ── Tool Registry ──
export { WhaleBuilderToolRegistry, builderToolRegistry } from "./tool-registry";

// ── Types (re-export all public types) ──
export type {
  NeoCharacterBuilderOptions,
  NeoCharacterBuilderResult,
  NeoBuilderTurnOptions,
  NeoBuilderTurnResult,
  NeoBuilderConversationMessage,
  NeoBuilderToolEvent,
  NeoBuilderChoice,
  NeoBuilderWebSearchResult,
  NeoBuilderEvaluationReport,
  NeoCreationPlan,
  NeoCreationPlanEntry,
  NeoPersonalityPalette,
  NeoMvuConfig,
  ValidationResult,
} from "./types";

// ── Utilities (for tests and external consumers) ──
export { addUsage, parseToolArguments } from "./utils";
export { normalizeDraft, normalizePersonalityPalette, normalizeCreationPlan, normalizeWorldbookEntries, normalizeMvuConfig } from "./validation";
export { REFERENCE_TEXTS } from "./references";
