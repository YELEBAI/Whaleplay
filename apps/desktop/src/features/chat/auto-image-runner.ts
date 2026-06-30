import type { Message, ModelConfig } from "@neo-tavern/shared";
import { secondaryApiUsageRepository } from "@/db/repositories";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { getChatScopedDeepSeekUserId } from "@/features/settings/model-capabilities";
import {
  createGeneratingImages,
  extractImageMarkers,
  generateComfyImage,
  type ImageGenerationSettings,
  type ImageMarker,
  normalizeImageSettings,
  planImageMarkersWithModel,
  type ImagePlannerWorldbookReference,
} from "@/features/image-generation/image-generation";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useChatStore } from "./chat.store";

type ImagePatch = Partial<Pick<Message, "content" | "images">>;
type MessageImages = NonNullable<Message["images"]>;

export interface RunAutoImageGenerationParams {
  chatId: string;
  assistantId: string;
  content: string;
  patchMessage: (messageId: string, patch: ImagePatch) => Promise<void>;
  setChatError: (chatId: string, message: string | null) => void;
  resolvePlannerConfig: (configId: string | null) => Promise<ModelConfig | null>;
  getWorldbookReferences: (content: string) => Promise<ImagePlannerWorldbookReference[]>;
}

// Per-message image jobs are cancelable. Regenerate/delete must be able to stop
// an older Comfy/planner run before it writes stale image state back.
const activeImageGenerations = new Map<string, { controller: AbortController; token: string }>();

interface ImageGenerationRun {
  assistantId: string;
  settings: ImageGenerationSettings;
  imageSignal: AbortSignal;
  isCurrent: () => boolean;
  patchMessage: (messageId: string, patch: ImagePatch) => Promise<void>;
}

interface PlannedImageContent {
  content: string;
  markers: ImageMarker[];
}

function isAbortError(error: unknown) {
  return (error as Error).name === "AbortError";
}

function beginImageGeneration(messageId: string) {
  cancelAutoImageGeneration(messageId);
  const run = {
    controller: new AbortController(),
    token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  activeImageGenerations.set(messageId, run);
  return run;
}

// The token check prevents a slower previous image run from patching a message
// after a newer run has started for the same assistant reply.
function isCurrentImageGeneration(messageId: string, token: string) {
  const active = activeImageGenerations.get(messageId);
  return !!active && active.token === token && !active.controller.signal.aborted;
}

function finishImageGeneration(messageId: string, token: string) {
  if (activeImageGenerations.get(messageId)?.token === token) {
    activeImageGenerations.delete(messageId);
  }
}

export function cancelAutoImageGeneration(messageId: string) {
  const active = activeImageGenerations.get(messageId);
  if (!active) return;
  active.controller.abort();
  activeImageGenerations.delete(messageId);
}

function getLatestImages(assistantId: string, fallback: MessageImages): MessageImages {
  return useChatStore.getState().messages.find((message) => message.id === assistantId)?.images ?? fallback;
}

async function recordImagePlannerUsage(params: {
  chatId: string;
  plannerConfig: ModelConfig;
  usage: Message["usage"];
}) {
  try {
    const plannedUsage = withDeepSeekUsageCost(params.usage, params.plannerConfig);
    await secondaryApiUsageRepository.create({
      chatId: params.chatId,
      source: "image-planner",
      label: "Auto Image Planning",
      modelConfigId: params.plannerConfig.id,
      model: params.plannerConfig.model,
      usage: plannedUsage,
    });
    await recordUsageCostAndWarn(plannedUsage);
  } catch (err) {
    console.warn("[chat] Failed to record image planner usage:", err);
  }
}

/**
 * Finds image markers in the assistant text, or asks the secondary model to add
 * them. This keeps planner usage and worldbook references outside the UI hook.
 */
async function resolvePlannedImageContent({
  chatId,
  content,
  settings,
  imageSignal,
  resolvePlannerConfig,
  getWorldbookReferences,
}: Pick<RunAutoImageGenerationParams, "chatId" | "content" | "resolvePlannerConfig" | "getWorldbookReferences"> & {
  settings: ImageGenerationSettings;
  imageSignal: AbortSignal;
}): Promise<PlannedImageContent> {
  let nextContent = content;
  let markers = extractImageMarkers(nextContent, settings.maxImages);
  if (markers.length > 0) return { content: nextContent, markers };

  const plannerConfig = settings.plannerConfigId ? await resolvePlannerConfig(settings.plannerConfigId) : null;
  if (!plannerConfig) return { content: nextContent, markers };

  const planned = await planImageMarkersWithModel({
    content: nextContent,
    settings,
    plannerConfig,
    worldbookReferences: await getWorldbookReferences(nextContent),
    userId: getChatScopedDeepSeekUserId(plannerConfig, chatId),
    signal: imageSignal,
  });

  void recordImagePlannerUsage({ chatId, plannerConfig, usage: planned.usage });
  nextContent = planned.content;
  markers = extractImageMarkers(nextContent, settings.maxImages);
  return { content: nextContent, markers };
}

/**
 * Drives Comfy generation slot by slot. Each slot re-reads latest message
 * images before patching so user edits/deletes win over late image responses.
 */
async function generateImagesForMarkers(
  { assistantId, settings, imageSignal, isCurrent, patchMessage }: ImageGenerationRun,
  markers: ImageMarker[],
) {
  let images = createGeneratingImages(markers);
  await patchMessage(assistantId, { images });

  for (const [i, marker] of markers.entries()) {
    try {
      const src = await generateComfyImage(marker.prompt, settings, imageSignal);
      if (!isCurrent()) return;
      images = getLatestImages(assistantId, images).map((image, index) => {
        if (index !== i) return image;
        if (image.status === "deleted") return image;
        return { ...image, status: "done" as const, src, error: undefined, updatedAt: new Date().toISOString() };
      });
    } catch (err) {
      if (isAbortError(err) || !isCurrent()) return;
      images = getLatestImages(assistantId, images).map((image, index) => {
        if (index !== i) return image;
        if (image.status === "deleted") return image;
        return {
          ...image,
          status: "error" as const,
          error: (err as Error).message || "Image generation failed",
          updatedAt: new Date().toISOString(),
        };
      });
    }
    if (!isCurrent()) return;
    await patchMessage(assistantId, { images });
  }
}

/**
 * Auto image generation runs after assistant finalization. It is deliberately
 * best-effort: chat completion should stay valid even if planning or Comfy
 * generation fails.
 */
export async function runAutoImageGeneration({
  chatId,
  assistantId,
  content,
  patchMessage,
  setChatError,
  resolvePlannerConfig,
  getWorldbookReferences,
}: RunAutoImageGenerationParams) {
  const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
  if (!settings.enabled || settings.mode !== "auto" || settings.maxImages <= 0 || !settings.comfyWorkflowJson.trim()) {
    return;
  }

  const imageRun = beginImageGeneration(assistantId);
  const imageToken = imageRun.token;
  const imageSignal = imageRun.controller.signal;
  const isCurrent = () => isCurrentImageGeneration(assistantId, imageToken);

  try {
    const planned = await resolvePlannedImageContent({
      chatId,
      content,
      settings,
      imageSignal,
      resolvePlannerConfig,
      getWorldbookReferences,
    });
    if (!isCurrent()) return;

    if (planned.content !== content) {
      await patchMessage(assistantId, { content: planned.content });
    }
    if (planned.markers.length === 0 || !isCurrent()) return;

    await generateImagesForMarkers(
      {
        assistantId,
        settings,
        imageSignal,
        isCurrent,
        patchMessage,
      },
      planned.markers,
    );
  } catch (err) {
    if (isAbortError(err) || !isCurrent()) return;
    setChatError(chatId, (err as Error).message || "Image generation failed");
  } finally {
    finishImageGeneration(assistantId, imageToken);
  }
}
