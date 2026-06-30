import { resolveWorldbookEntries, WorldbookContributor } from "@neo-tavern/core";
import type { Character, ContextBlock, Message, Worldbook } from "@neo-tavern/shared";
import type { ImagePlannerWorldbookReference } from "@/features/image-generation/image-generation";

interface ChatWorldbookCharacter {
  worldbookId?: string | null;
}

interface ResolveChatWorldbookParams {
  character?: ChatWorldbookCharacter | null;
  worldbooks: Worldbook[];
  activeWorldbookId: string | null;
}

interface GetChatWorldbookContextBlocksParams extends ResolveChatWorldbookParams {
  character: Character;
  userInput: string;
  recentMessages: Message[];
}

interface GetImagePlannerWorldbookReferencesParams extends ResolveChatWorldbookParams {
  content: string;
  recentMessages?: Message[];
  maxReferences?: number;
  maxContentChars?: number;
}

export function resolveChatWorldbook({
  activeWorldbookId,
  character,
  worldbooks,
}: ResolveChatWorldbookParams): Worldbook | null {
  const worldbookId = character?.worldbookId || activeWorldbookId;
  if (!worldbookId) return null;
  return worldbooks.find((worldbook) => worldbook.id === worldbookId) ?? null;
}

export async function getChatWorldbookContextBlocks({
  activeWorldbookId,
  character,
  recentMessages,
  userInput,
  worldbooks,
}: GetChatWorldbookContextBlocksParams): Promise<ContextBlock[]> {
  const worldbook = resolveChatWorldbook({ activeWorldbookId, character, worldbooks });
  if (!worldbook || worldbook.entries.length === 0) return [];

  const contributor = new WorldbookContributor();
  contributor.setEntries(worldbook.entries);
  return contributor.contribute({
    character,
    recentMessages,
    userInput,
  });
}

export function getImagePlannerWorldbookReferences({
  activeWorldbookId,
  character,
  content,
  maxContentChars = 1200,
  maxReferences = 8,
  recentMessages = [],
  worldbooks,
}: GetImagePlannerWorldbookReferencesParams): ImagePlannerWorldbookReference[] {
  const worldbook = resolveChatWorldbook({ activeWorldbookId, character, worldbooks });
  if (!worldbook || worldbook.entries.length === 0) return [];

  const { matched } = resolveWorldbookEntries(worldbook.entries, content, recentMessages);
  return matched.slice(0, maxReferences).map((entry) => ({
    title: entry.title,
    content: clipWorldbookReference(entry.content, maxContentChars),
  }));
}

function clipWorldbookReference(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
