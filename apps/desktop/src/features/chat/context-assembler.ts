import {
  buildChatPrompt,
  createFloodInspectOutput,
  type GenerationHooks,
  type PromptPresetItem,
} from "@neo-tavern/core";
import type { BuiltPrompt, Character, ContextBlock, Message, ModelConfig, PresetItem } from "@neo-tavern/shared";
import { agenticPlayStateRepository, presetRepository, type AgenticPlayStateRecord } from "@/db/repositories";
import { createAgenticPlayContextBlock } from "@/features/agentic-play/agentic-play";
import { getAgenticPlayPresetItems } from "@/features/agentic-play/agentic-preset";
import { useSettingsStore } from "@/features/settings/settings.store";
import { createHealthyModeContextBlock } from "@/features/content-policy/healthy-mode";
import { filterNsfwItems, type ContentPolicySnapshot } from "@/features/content-policy/content-policy";

export type MemoryPromptPlan = {
  recentMessages: Message[];
  memoryBlock: ContextBlock | null;
};

export interface AssembleChatContextParams {
  chatId: string;
  character: Character;
  userInput: string;
  promptMessages: Message[];
  contentPolicy: ContentPolicySnapshot;
  agenticPlayEnabled: boolean;
  signal?: AbortSignal;
  getMemoryPromptPlan: (historyMessages: Message[], chatId: string, signal?: AbortSignal) => Promise<MemoryPromptPlan>;
  getWorldbookContextBlocks: (userInput: string, recentMessages: Message[]) => Promise<ContextBlock[]>;
  stripMessages: (messages: Message[]) => Message[];
}

export interface ChatContextAssembly {
  built: BuiltPrompt;
  modelConfig: ModelConfig;
  contextTokens: number;
  agenticRecord: AgenticPlayStateRecord | null;
  generationHooks: Pick<GenerationHooks, "inspectOutput">;
  historyMessages: Message[];
}

export function buildPolicyPresetItems(items: PresetItem[], policy: ContentPolicySnapshot): PromptPresetItem[] {
  const enabledItems = items.filter((item) => item.enabled);
  const policyItems = policy.filterNsfwPresetItems ? filterNsfwItems(enabledItems) : enabledItems;
  return policyItems.map((item) => ({
    role: item.role,
    content: item.content,
    injectionOrder: item.injectionOrder,
  }));
}

export function createOutputQualityHooks(sourceMessages: Message[]): Pick<GenerationHooks, "inspectOutput"> {
  const recentAssistantContents = sourceMessages
    .filter((message) => message.role === "assistant" && message.content.trim())
    .slice(-8)
    .map((message) => message.content);
  return {
    inspectOutput: createFloodInspectOutput(recentAssistantContents),
  };
}

export async function assembleChatContext({
  chatId,
  character,
  userInput,
  promptMessages,
  contentPolicy,
  agenticPlayEnabled,
  signal,
  getMemoryPromptPlan,
  getWorldbookContextBlocks,
  stripMessages,
}: AssembleChatContextParams): Promise<ChatContextAssembly> {
  const settings = useSettingsStore.getState();
  const contextTokens = settings.contextTokens ?? 64000;
  const historyMessages = promptMessages.slice(0, -1);
  const generationHooks = createOutputQualityHooks(historyMessages);

  const activePresetId = await presetRepository.getActivePresetId();
  let presetItems: PromptPresetItem[] | undefined;
  if (activePresetId) {
    const preset = await presetRepository.getById(activePresetId);
    if (preset) {
      presetItems = buildPolicyPresetItems(preset.items, contentPolicy);
    }
  }

  const memoryPlan = await getMemoryPromptPlan(historyMessages, chatId, signal);
  const worldbookBlocks = await getWorldbookContextBlocks(userInput, stripMessages(promptMessages));
  const agenticRecord =
    agenticPlayEnabled && character ? await agenticPlayStateRepository.getOrCreate(chatId, character, true) : null;
  const agenticBlock = agenticRecord ? createAgenticPlayContextBlock(agenticRecord.gameState) : null;
  const contextBlocks = [memoryPlan.memoryBlock, agenticBlock, ...worldbookBlocks].filter(Boolean) as ContextBlock[];
  if (contentPolicy.injectHealthyPrompt) {
    contextBlocks.push(createHealthyModeContextBlock());
  }

  const effectivePresetItems = agenticRecord ? await getAgenticPlayPresetItems() : presetItems;
  const built = buildChatPrompt({
    character,
    recentMessages: stripMessages(memoryPlan.recentMessages) as Message[],
    userInput,
    maxTotalTokens: contextTokens,
    presetItems: effectivePresetItems,
    contextBlocks,
    userName: settings.personaName,
  });

  const modelConfig = useSettingsStore.getState().modelConfig;
  if (!modelConfig) {
    throw new Error("Model not configured. Please set up API settings first.");
  }

  return {
    built,
    modelConfig,
    contextTokens,
    agenticRecord,
    generationHooks,
    historyMessages,
  };
}
