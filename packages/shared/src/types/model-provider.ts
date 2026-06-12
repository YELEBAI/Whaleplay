export interface GenerateToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface GenerateToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type GenerateToolChoice =
  | "none"
  | "auto"
  | "required"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export type GenerateMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: GenerateToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      name?: string;
    };

export interface GenerateInput {
  messages: GenerateMessage[];
  model: string;
  temperature?: number;
  omitTemperature?: boolean;
  maxTokens?: number;
  reasoningEffort?: string;
  tools?: GenerateToolDefinition[];
  toolChoice?: GenerateToolChoice;
  userId?: string;
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  reasoningContent?: string;
  toolCalls?: GenerateToolCall[];
  finishReason?: string;
  raw?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  };
}

export interface GenerateChunk {
  contentDelta?: string;
  reasoningContentDelta?: string;
  toolCallDeltas?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
  finishReason?: string;
  usage?: GenerateResult["usage"];
  raw?: unknown;
}

export interface ModelProvider {
  id: string;
  name: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
  streamGenerate?(input: GenerateInput): AsyncIterable<GenerateChunk>;
  listModels?(baseUrl: string, apiKey: string): Promise<string[]>;
}
