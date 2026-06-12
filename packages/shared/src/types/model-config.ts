export type ModelProviderType = "openai-compatible";

export interface ModelConfig {
  id: string;
  provider: ModelProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: string;
  streamingEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModelConfigInput {
  provider: ModelProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  streamingEnabled?: boolean;
}

export interface UpdateModelConfigInput {
  provider?: ModelProviderType;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  streamingEnabled?: boolean;
}
