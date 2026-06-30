import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat, Message, MessageImage } from "@neo-tavern/shared";
import {
  createGeneratingImages,
  extractImageMarkers,
  generateComfyImage,
  normalizeImageSettings,
  planImageMarkersWithModel,
  type ImagePlannerWorldbookReference,
} from "@/features/image-generation/image-generation";
import { withDeepSeekUsageCost } from "@/features/billing/deepseek-billing";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { getChatScopedDeepSeekUserId } from "@/features/settings/model-capabilities";
import { secondaryApiUsageRepository } from "@/db/repositories";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { getImagePlannerWorldbookReferences as getChatImagePlannerWorldbookReferences } from "@/features/chat/worldbook-context";
import { toast } from "@/utils/toast";
import { ensureImageSlots, resolveImagePlannerConfig } from "../ImageBlocks";

interface UseChatImagesParams {
  currentChat: Chat | null;
  character: { id: string; worldbookId?: string | null } | null | undefined;
  messages: Message[];
  getLatestMessage: (messageId: string) => Message | null;
  patchMessage: (messageId: string, patch: Partial<Message>) => Promise<void>;
}

/**
 * Encapsulates every manual image generation flow on a message:
 * - busy-state tracking per message
 * - marker planning via secondary API
 * - ComfyUI generation with per-slot status updates
 * - prompt edit dialog state
 * - regenerate / delete handlers
 *
 * Extracted verbatim from ChatPage (Phase 1 UI split). The handlers keep the
 * same call signatures so `MessageList` / `ImagePromptDialog` wiring is stable.
 */
export function useChatImages({
  currentChat,
  character,
  messages,
  getLatestMessage,
  patchMessage,
}: UseChatImagesParams) {
  const { t } = useTranslation("chat");
  const [imageGenerationBusy, setImageGenerationBusy] = useState<Record<string, boolean>>({});
  const [imagePromptEditTarget, setImagePromptEditTarget] = useState<{
    messageId: string;
    imageIndex: number;
    fallbackPrompt: string;
  } | null>(null);
  const [imagePromptDraft, setImagePromptDraft] = useState("");

  const setMessageImageBusy = useCallback((messageId: string, busy: boolean) => {
    setImageGenerationBusy((prev) => {
      if (busy) return { ...prev, [messageId]: true };
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  const updateImageSlot = useCallback(
    async (
      messageId: string,
      imageIndex: number,
      fallbackPrompt: string,
      updater: (image: MessageImage) => MessageImage,
    ) => {
      const message = getLatestMessage(messageId);
      if (!message) return null;
      const images = ensureImageSlots(message.images, imageIndex, fallbackPrompt);
      images[imageIndex] = updater(images[imageIndex]);
      await patchMessage(messageId, { images });
      return images[imageIndex];
    },
    [getLatestMessage, patchMessage],
  );

  const getImagePlannerWorldbookReferences = useCallback(
    async (content: string): Promise<ImagePlannerWorldbookReference[]> => {
      const settings = useSettingsStore.getState().imageGeneration;
      if (!settings.worldbookReferenceEnabled || !character) return [];

      const { worldbooks, activeWorldbookId } = useWorldbookStore.getState();
      return getChatImagePlannerWorldbookReferences({
        activeWorldbookId,
        character,
        content,
        recentMessages: messages,
        worldbooks,
      });
    },
    [character, messages],
  );

  const handleGenerateMessageImages = useCallback(
    async (message: Message) => {
      if (!currentChat || message.role !== "assistant") return;
      if (imageGenerationBusy[message.id]) return;

      const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
      if (!settings.enabled) {
        toast("error", t("toast.imageGenerationEnableRequired"));
        return;
      }
      if (settings.maxImages <= 0) {
        toast("error", t("toast.imageGenerationTriggerRequired"));
        return;
      }
      if (!settings.comfyWorkflowJson.trim()) {
        toast("error", t("toast.imageGenerationWorkflowRequired"));
        return;
      }

      setMessageImageBusy(message.id, true);
      try {
        let nextContent = message.content;
        let markers = extractImageMarkers(nextContent, settings.maxImages);

        if (markers.length === 0) {
          const plannerConfig = await resolveImagePlannerConfig(settings.plannerConfigId);
          if (!plannerConfig) {
            toast("error", t("toast.imagePlanningApiRequired"));
            return;
          }

          const planned = await planImageMarkersWithModel({
            content: nextContent,
            settings,
            plannerConfig,
            worldbookReferences: await getImagePlannerWorldbookReferences(nextContent),
            userId: getChatScopedDeepSeekUserId(plannerConfig, message.chatId),
          });
          const plannedUsage = withDeepSeekUsageCost(planned.usage, plannerConfig);
          void secondaryApiUsageRepository.create({
            chatId: message.chatId,
            source: "image-planner",
            label: t("imageGeneration.manualPlanningLabel"),
            modelConfigId: plannerConfig.id,
            model: plannerConfig.model,
            usage: plannedUsage,
          });
          void recordUsageCostAndWarn(plannedUsage);

          nextContent = planned.content;
          markers = extractImageMarkers(nextContent, settings.maxImages);
          if (nextContent !== message.content) {
            await patchMessage(message.id, { content: nextContent });
          }
        }

        if (markers.length === 0) {
          toast("info", t("toast.imagePlanningNoScene"));
          return;
        }

        let images = createGeneratingImages(markers);
        await patchMessage(message.id, { images });

        for (let i = 0; i < markers.length; i++) {
          const marker = markers[i];
          try {
            const src = await generateComfyImage(marker.prompt, settings);
            const latestImages = getLatestMessage(message.id)?.images ?? images;
            images = latestImages.map((image, index) => {
              if (index !== i) return image;
              if (image.status === "deleted") return image;
              return { ...image, status: "done" as const, src, error: undefined, updatedAt: new Date().toISOString() };
            });
          } catch (err) {
            const latestImages = getLatestMessage(message.id)?.images ?? images;
            images = latestImages.map((image, index) => {
              if (index !== i) return image;
              if (image.status === "deleted") return image;
              return {
                ...image,
                status: "error" as const,
                error: (err as Error).message || t("toast.imageGenerationFailed"),
                updatedAt: new Date().toISOString(),
              };
            });
          }
          await patchMessage(message.id, { images });
        }
        toast("success", t("toast.imageGenerationComplete"));
      } catch (err) {
        toast("error", (err as Error).message || t("toast.imageGenerationFailed"));
      } finally {
        setMessageImageBusy(message.id, false);
      }
    },
    [
      currentChat,
      getImagePlannerWorldbookReferences,
      getLatestMessage,
      imageGenerationBusy,
      patchMessage,
      setMessageImageBusy,
      t,
    ],
  );

  const openImagePromptEditor = useCallback((message: Message, imageIndex: number, fallbackPrompt: string) => {
    const prompt = message.images?.[imageIndex]?.prompt || fallbackPrompt;
    setImagePromptEditTarget({ messageId: message.id, imageIndex, fallbackPrompt });
    setImagePromptDraft(prompt);
  }, []);

  const closeImagePromptEditor = useCallback(() => {
    setImagePromptEditTarget(null);
    setImagePromptDraft("");
  }, []);

  const handleDeleteImage = useCallback(
    async (messageId: string, imageIndex: number, fallbackPrompt: string) => {
      await updateImageSlot(messageId, imageIndex, fallbackPrompt, (image) => ({
        ...image,
        prompt: image.prompt || fallbackPrompt,
        status: "deleted",
        src: undefined,
        error: undefined,
        updatedAt: new Date().toISOString(),
      }));
      toast("info", t("toast.imageDeleted"));
    },
    [t, updateImageSlot],
  );

  const handleRegenerateImage = useCallback(
    async (messageId: string, imageIndex: number, fallbackPrompt: string, overridePrompt?: string) => {
      const latest = getLatestMessage(messageId);
      const prompt = (overridePrompt ?? latest?.images?.[imageIndex]?.prompt ?? fallbackPrompt).trim();
      if (!prompt) {
        toast("error", t("toast.imagePromptEmpty"));
        return;
      }

      const settings = normalizeImageSettings(useSettingsStore.getState().imageGeneration);
      if (!settings.comfyWorkflowJson.trim()) {
        toast("error", t("toast.imageGenerationWorkflowRequired"));
        return;
      }

      await updateImageSlot(messageId, imageIndex, prompt, (image) => ({
        ...image,
        prompt,
        status: "generating",
        src: undefined,
        error: undefined,
        updatedAt: new Date().toISOString(),
      }));

      try {
        const src = await generateComfyImage(prompt, settings);
        await updateImageSlot(messageId, imageIndex, prompt, (image) => {
          if (image.status === "deleted") return image;
          return {
            ...image,
            prompt,
            status: "done",
            src,
            error: undefined,
            updatedAt: new Date().toISOString(),
          };
        });
        toast("success", t("toast.imageRegenerated"));
      } catch (err) {
        await updateImageSlot(messageId, imageIndex, prompt, (image) => {
          if (image.status === "deleted") return image;
          return {
            ...image,
            prompt,
            status: "error",
            src: undefined,
            error: (err as Error).message || t("toast.imageGenerationFailed"),
            updatedAt: new Date().toISOString(),
          };
        });
        toast("error", (err as Error).message || t("toast.imageRegenerateFailed"));
      }
    },
    [getLatestMessage, t, updateImageSlot],
  );

  const saveImagePromptEdit = useCallback(
    async (regenerateAfterSave = false) => {
      if (!imagePromptEditTarget) return;
      const prompt = imagePromptDraft.trim();
      if (!prompt) {
        toast("error", t("toast.imagePromptEmpty"));
        return;
      }

      const target = imagePromptEditTarget;
      await updateImageSlot(target.messageId, target.imageIndex, target.fallbackPrompt, (image) => ({
        ...image,
        prompt,
        updatedAt: new Date().toISOString(),
      }));
      closeImagePromptEditor();
      toast("success", t("toast.imagePromptUpdated"));
      if (regenerateAfterSave) {
        void handleRegenerateImage(target.messageId, target.imageIndex, target.fallbackPrompt, prompt);
      }
    },
    [closeImagePromptEditor, handleRegenerateImage, imagePromptDraft, imagePromptEditTarget, t, updateImageSlot],
  );

  return {
    imageGenerationBusy,
    imagePromptEditTarget,
    imagePromptDraft,
    setImagePromptDraft,
    handleGenerateMessageImages,
    openImagePromptEditor,
    closeImagePromptEditor,
    handleDeleteImage,
    handleRegenerateImage,
    saveImagePromptEdit,
  };
}
