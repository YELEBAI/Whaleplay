import type { Character, ContextBlock, Message, ModelConfig, PresetItem, RegexRule } from "@neo-tavern/shared";

export type ChatMode = "normal" | "agentic" | "builder" | (string & {});

export type PromptPresetItem = Pick<PresetItem, "role" | "content" | "injectionOrder">;

export type TurnPhase = "idle" | "preparing" | "streaming" | "postprocessing";

export type GenerationPhase = "thinking" | "writing" | "retrying";

export interface TurnContext<TModeState = unknown> {
  chatId: string;
  character: Character;
  messages: Message[];
  userInput: string;
  modelConfig: ModelConfig;
  personaName: string;
  activeRegexRules: RegexRule[];
  worldbookEntries: ContextBlock[];
  memoryBlock: ContextBlock | null;
  modeState?: TModeState | null;
  presetItems?: PromptPresetItem[] | null;
  contextBlocks?: ContextBlock[];
}

export interface TurnResult<TSideEffects extends Record<string, unknown> = Record<string, unknown>> {
  userMessage?: Message;
  assistantMessage?: Message;
  content: string;
  usage?: Message["usage"];
  sideEffects: TSideEffects;
}

export type TurnEvent<TSideEffects extends Record<string, unknown> = Record<string, unknown>> =
  | { type: "turn.started" }
  | { type: "turn.phase"; phase: TurnPhase }
  | { type: "generation.phase"; phase: GenerationPhase }
  | { type: "content.delta"; delta: string; accumulated: string }
  | { type: "reasoning.delta"; delta: string; accumulated: string }
  | { type: "tool.event"; toolName: string }
  | { type: "turn.completed"; result: TurnResult<TSideEffects> }
  | { type: "turn.failed"; error: Error };

export interface GenerationHooks {
  signal?: AbortSignal;
  onContentDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  inspectOutput?: (accumulated: string) => { pass: true } | { pass: false; reason: string; terminate?: boolean };
  onPhaseChange?: (phase: GenerationPhase) => void;
  onToolEvent?: (toolName: string) => void;
}

export interface ChatStrategy<
  TModeState = unknown,
  TSideEffects extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly mode: ChatMode;
  buildExtraContextBlocks(ctx: TurnContext<TModeState>): ContextBlock[];
  resolvePresetItems(ctx: TurnContext<TModeState>): PromptPresetItem[] | null;
  generate(ctx: TurnContext<TModeState>, hooks: GenerationHooks): Promise<TurnResult<TSideEffects>>;
  onTurnComplete(result: TurnResult<TSideEffects>, ctx: TurnContext<TModeState>): Promise<void>;
}

export interface ChatPlugin<
  TModeState = unknown,
  TSideEffects extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  priority?: number;
  onBeforePromptBuild?: (ctx: TurnContext<TModeState>) => void | Promise<void>;
  onContextBlocks?: (blocks: ContextBlock[], ctx: TurnContext<TModeState>) => ContextBlock[];
  onContentDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  inspectOutput?: GenerationHooks["inspectOutput"];
  onAfterTurn?: (result: TurnResult<TSideEffects>, ctx: TurnContext<TModeState>) => void | Promise<void>;
}
