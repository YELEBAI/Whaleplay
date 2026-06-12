import type { Character } from "./character";
import type { Message } from "./message";
import type { GenerateMessage } from "./model-provider";

export type PromptMessageRole = "system" | "user" | "assistant";

export interface ContextBlock {
  id: string;
  source: "character" | "worldbook" | "memory" | "agentic" | "persona" | "system" | "safety";
  title: string;
  content: string;
  priority: number;
  role?: PromptMessageRole;
  position?: "beforeHistory" | "afterHistory" | "atDepth";
  depth?: number;
}

export interface ContextInput {
  character: Character;
  recentMessages: Message[];
  userInput: string;
}

export interface ContextContributor {
  id: string;
  name: string;
  contribute(input: ContextInput): Promise<ContextBlock[]>;
}

export interface BuildPromptInput {
  character: Character;
  recentMessages: Message[];
  userInput: string;
  maxTotalTokens?: number;
  systemRules?: string;
  userPersona?: string;
  userName?: string;
  contextBlocks?: ContextBlock[];
  presetItems?: { role: "system" | "user"; content: string; injectionOrder: number }[];
}

export interface BuiltPrompt {
  messages: GenerateMessage[];
  previewText: string;
  tokenEstimate: number;
  includedContextBlocks: ContextBlock[];
}
