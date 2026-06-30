import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Message } from "@neo-tavern/shared";
import type { ContentPolicySnapshot } from "@/features/content-policy/content-policy";
import { checkHealthyModeOutput, HEALTHY_MODE_BLOCKED_PLACEHOLDER } from "@/features/content-policy/healthy-mode";
import { isFloodGuardError } from "./generation-runner";

export const FLOOD_GUARD_STOP_MESSAGE = "检测到模型重复输出，已自动停止生成。";

type AssistantOutputPatch = Partial<Pick<Message, "content" | "reasoningContent">>;

export interface FinalizeAssistantTurnParams {
  chatId: string;
  assistantId: string;
  characterName?: string;
  finalContent: string;
  contentPolicy: Pick<ContentPolicySnapshot, "checkExplicitOutput">;
  isCurrent: () => boolean;
  isGenerationActive: () => boolean;
  patchMessage: (id: string, patch: AssistantOutputPatch) => Promise<void>;
  removeEmptyStreamingDraft: (draftId: string | null) => Promise<void>;
  setChatError: (chatId: string, message: string | null) => void;
  runAutoImageGeneration: () => void;
  notifyComplete?: (characterName?: string) => void | Promise<void>;
}

export type FinalizeAssistantTurnStatus = "completed" | "stale" | "blocked";

export interface HandleTurnErrorParams {
  chatId: string;
  error: unknown;
  isCurrent: () => boolean;
  aborted: boolean;
  fallbackMessage: string;
  setChatError: (chatId: string, message: string | null) => void;
}

/**
 * Completion notification prefers native system notifications when the app is
 * backgrounded, then falls back to the in-app toast used elsewhere.
 */
export async function notifyAssistantOutputComplete(characterName?: string) {
  const toast = typeof window !== "undefined" ? window.__toast : null;
  const name = characterName?.trim();
  const message = name ? `${name} 的回复已生成` : "AI 回复已生成";
  const shouldUseSystemNotification =
    typeof document !== "undefined" && (document.visibilityState !== "visible" || !document.hasFocus());

  if (shouldUseSystemNotification) {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }
      if (permissionGranted) {
        sendNotification({
          title: "Whale Play",
          body: message,
        });
        return;
      }
    } catch {
      // Fall back to the in-app toast when native notifications are unavailable.
    }
  }

  if (toast) toast("success", message);
}

/**
 * Final gate after generation succeeds. It handles stale turns, healthy-mode
 * output blocking, completion notification, auto image trigger, and blank-draft
 * cleanup in one place.
 */
export async function finalizeAssistantTurn({
  chatId,
  assistantId,
  characterName,
  finalContent,
  contentPolicy,
  isCurrent,
  isGenerationActive,
  patchMessage,
  removeEmptyStreamingDraft,
  setChatError,
  runAutoImageGeneration,
  notifyComplete = notifyAssistantOutputComplete,
}: FinalizeAssistantTurnParams): Promise<FinalizeAssistantTurnStatus> {
  if (!isCurrent() || !isGenerationActive()) {
    await removeEmptyStreamingDraft(assistantId);
    return "stale";
  }

  // Output policy is checked after generation because the model can produce
  // unsafe text even if the user input was clean.
  const violation = contentPolicy.checkExplicitOutput ? checkHealthyModeOutput(finalContent) : null;
  if (violation) {
    await patchMessage(assistantId, {
      content: HEALTHY_MODE_BLOCKED_PLACEHOLDER,
      reasoningContent: undefined,
    });
    setChatError(chatId, "健康模式：检测到不当内容，回复已被拦截。");
    void notifyComplete(characterName);
    await removeEmptyStreamingDraft(assistantId);
    return "blocked";
  }

  void notifyComplete(characterName);
  // Auto image generation is intentionally fire-and-forget; the message itself
  // is already complete and should not wait on Comfy/planner work.
  runAutoImageGeneration();
  await removeEmptyStreamingDraft(assistantId);
  return "completed";
}

/**
 * Converts internal failure classes into user-facing chat errors. This keeps
 * flood stop, manual abort, and generic generation failure distinguishable.
 */
export function handleTurnError({
  chatId,
  error,
  isCurrent,
  aborted,
  fallbackMessage,
  setChatError,
}: HandleTurnErrorParams) {
  if (!isCurrent()) return;

  const err = error as Error;
  if (isFloodGuardError(error)) {
    setChatError(chatId, err.message || FLOOD_GUARD_STOP_MESSAGE);
  } else if (err.name === "AbortError" || aborted) {
    setChatError(chatId, "Generation stopped");
  } else {
    setChatError(chatId, err.message || fallbackMessage);
  }
}
