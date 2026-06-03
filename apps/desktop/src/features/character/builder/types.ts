import type {
  CreateCharacterInput,
  CreateWorldbookEntryInput,
  MessageUsage,
  ModelConfig,
} from "@neo-tavern/shared";

// ── Options ──

export interface NeoCharacterBuilderOptions {
  concept: string;
  existingCharacter?: CreateCharacterInput | null;
  modelConfig: ModelConfig;
  scopeId?: string | null;
  signal?: AbortSignal;
}

export interface NeoBuilderTurnOptions {
  conversation: NeoBuilderConversationMessage[];
  existingCharacter?: CreateCharacterInput | null;
  currentDraft?: CreateCharacterInput | null;
  currentWorldbookEntries?: CreateWorldbookEntryInput[];
  creationPlan?: NeoCreationPlan | null;
  personalityPalette?: NeoPersonalityPalette | null;
  currentMvu?: NeoMvuConfig | null;
  modelConfig: ModelConfig;
  scopeId?: string | null;
  webSearchEnabled?: boolean;
  searchWeb?: (query: string, limit?: number) => Promise<NeoBuilderWebSearchResult[]>;
  onToolEvent?: (event: NeoBuilderToolEvent) => void;
  onContentDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface NeoBuilderConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface NeoBuilderWebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── MVU ──

export interface NeoMvuConfig {
  /** TypeScript Zod schema (schema.ts content). */
  schemaTs: string;
  /** YAML initial variable values (initvar.yaml content). */
  initvarYaml?: string;
  /** YAML variable update rules (变量更新规则.yaml content). */
  updateRulesYaml?: string;
}

// ── Results ──

export interface NeoCharacterBuilderResult {
  character: CreateCharacterInput;
  worldbookName?: string;
  worldbookDescription?: string;
  worldbookEntries: CreateWorldbookEntryInput[];
  personalityPalette?: NeoPersonalityPalette;
  creationPlan?: NeoCreationPlan;
  evaluationReport?: NeoBuilderEvaluationReport;
  mvu?: NeoMvuConfig;
  notes?: string;
  usage?: MessageUsage;
  toolLog: string[];
}

export interface NeoBuilderTurnResult {
  content: string;
  choices?: NeoBuilderChoice[];
  draft?: Omit<NeoCharacterBuilderResult, "usage" | "toolLog">;
  creationPlan?: NeoCreationPlan;
  personalityPalette?: NeoPersonalityPalette;
  evaluationReport?: NeoBuilderEvaluationReport;
  mvu?: NeoMvuConfig;
  usage?: MessageUsage;
  reasoningContent?: string;
  toolEvents: NeoBuilderToolEvent[];
  toolLog: string[];
}

export interface NeoBuilderChoice {
  id: string;
  label: string;
  value: string;
  description?: string;
}

// ── Tool Events ──

export interface NeoBuilderToolEvent {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

// ── Personality Palette ──

export interface NeoPersonalityPalette {
  base: string;
  main: string[];
  accents: string[];
  derivatives: Array<{
    color: string;
    items: string[];
  }>;
  futureDerivatives?: string[];
  notes?: string;
  compiledText?: string;
}

// ── Creation Plan ──

export interface NeoCreationPlanEntry {
  id: string;
  name: string;
  type: string;
  path?: string;
  part?: string;
  scope?: string;
  purpose?: string;
  keys?: string[];
  sourceChapters?: string[];
  status: "planned" | "in_progress" | "done" | "skipped";
  outputRef?: string;
  skipReason?: string;
}

export interface NeoCreationPlan {
  project: {
    name: string;
    worldbookName?: string;
    form: "charactercard" | "worldbook";
    sourceType?: string;
    planningMode?: string;
  };
  world?: {
    overview?: string;
    regions?: string[];
    factions?: string[];
  };
  characters: Array<{
    name: string;
    identity?: string;
    relationship?: string;
    palette?: {
      base?: string;
      main?: string[];
      accents?: string[];
    };
  }>;
  style?: {
    perspective?: string;
    tone?: string;
    mood?: string;
  };
  entries: NeoCreationPlanEntry[];
  firstMessage?: {
    format?: string;
    scene?: string;
    openingSituation?: string;
    wordCount?: string;
  };
  openQuestions?: string[];
  yaml: string;
  updatedAt: string;
}

// ── Evaluation ──

export interface NeoBuilderEvaluationReport {
  summary: string;
  issues: Array<{
    severity: "high" | "medium" | "low";
    target: string;
    message: string;
  }>;
  suggestions: string[];
  score?: number;
}

// ── Validation ──

export interface ValidationResult {
  draft: Omit<NeoCharacterBuilderResult, "usage" | "toolLog">;
  issues: string[];
}

// ── Internal ──

export type DraftPayload = {
  character?: Partial<CreateCharacterInput>;
  worldbookName?: unknown;
  worldbookDescription?: unknown;
  worldbookEntries?: unknown;
  personalityPalette?: unknown;
  creationPlan?: unknown;
  mvu?: unknown;
  notes?: unknown;
};

export type ToolCallPart = {
  id?: string;
  type: "function";
  function: {
    name?: string;
    arguments: string;
  };
};
