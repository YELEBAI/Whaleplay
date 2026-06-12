import type { CreateCharacterInput, CreateWorldbookEntryInput, MessageUsage } from "@neo-tavern/shared";
import type {
  NeoBuilderChoice,
  NeoBuilderEvaluationReport,
  NeoBuilderQuestion,
  NeoBuilderToolEvent,
  NeoBuilderTurnResult,
  NeoCreationPlan,
  NeoMvuConfig,
  NeoStatusBarConfig,
  NeoPersonalityPalette,
} from "@/features/character/neo-character-builder";

// ── NeoBuilderPage-local constants ───────────────────

export const NEW_TARGET = "__new__";
export const BUILDER_WORKSPACE_STORAGE_KEY = "neo:character-builder:workspace:v1";
export const BUILDER_WORKSPACE_RECORDS_STORAGE_KEY = "neo:character-builder:workspace-records:v1";

// ── NeoBuilderPage-local types ───────────────────────

export type BuilderTarget = typeof NEW_TARGET | string;

export type WorldbookDraft = {
  name?: string;
  description?: string;
  entries: CreateWorldbookEntryInput[];
};

export type BuilderMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  choices?: NeoBuilderChoice[];
  questions?: NeoBuilderQuestion[];
  reasoningContent?: string;
  toolEvents?: NeoBuilderToolEvent[];
  usage?: MessageUsage;
  pending?: boolean;
  hidden?: boolean;
  backgroundCreation?: boolean;
  startedAt?: number;
  completedAt?: number;
};

export type ArtifactView = "character" | "worldbook" | "plan" | "palette" | "statusBars" | "evaluation" | null;

export type BuilderWorkspaceSnapshot = {
  targetId: BuilderTarget;
  messages: BuilderMessage[];
  input: string;
  webSearchEnabled: boolean;
  lastResult: NeoBuilderTurnResult | null;
  draft: CreateCharacterInput | null;
  worldbookDraft: WorldbookDraft | null;
  creationPlan: NeoCreationPlan | null;
  personalityPalette: NeoPersonalityPalette | null;
  evaluationReport: NeoBuilderEvaluationReport | null;
  mvu: NeoMvuConfig | null;
  statusBars: NeoStatusBarConfig | null;
  savedCharacterId: string | null;
  builderSessionId: string;
};

export type BuilderWorkspaceRecord = BuilderWorkspaceSnapshot & {
  id: string;
  title: string;
  updatedAt: string;
};

// ── Re-exports from shared packages ──────────────────
export type {
  Character,
  CreateCharacterInput,
  CreateWorldbookEntryInput,
  MessageUsage,
  Worldbook,
} from "@neo-tavern/shared";
export type {
  NeoBuilderEvaluationReport,
  NeoBuilderChoice,
  NeoBuilderQuestion,
  NeoBuilderConversationMessage,
  NeoBuilderToolEvent,
  NeoBuilderTurnResult,
  NeoCreationPlan,
  NeoCreationPlanEntry,
  NeoPersonalityPalette,
  NeoMvuConfig,
  NeoStatusBarConfig,
} from "@/features/character/neo-character-builder";
