import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Character, Chat } from "@neo-tavern/shared";
import type { Dispatch, SetStateAction } from "react";
import type { ChoiceInputPanelChoice } from "@/components/ChoiceInputPanel";
import { agenticPlayStateRepository } from "@/db/repositories";
import { useChatStore } from "@/features/chat/chat.store";
import {
  AGENTIC_PLAY_OPENING_PROMPT,
  rollDice,
  type AgenticActionOption,
  type AgenticGameState,
  type DiceRollResult,
} from "@/features/agentic-play/agentic-play";
import type { ActiveAgenticChoice } from "./useChatMessages";

interface UseAgenticChatParams {
  /** Lifted to ChatPage to break the normal↔agentic dependency cycle. */
  agenticPlayEnabled: boolean;
  setAgenticPlayEnabled: Dispatch<SetStateAction<boolean>>;
  setAgenticGameState: Dispatch<SetStateAction<AgenticGameState | null>>;
  setDismissedAgenticChoiceMessageId: Dispatch<SetStateAction<string | null>>;
  submitContent: (
    content: string,
    options?: {
      hiddenUserMessage?: boolean;
      label?: string;
      metadata?: import("@neo-tavern/shared").Message["metadata"];
    },
  ) => Promise<void>;
  sending: boolean;
  character: Character | null | undefined;
  currentChat: Chat | null;
  loading: boolean;
  messagesHydrated: boolean;
  visibleMessagesLength: number;
  isGeneratingCurrentChat: boolean;
  lastAssistantId: string | null;
  activeAgenticChoice: ActiveAgenticChoice | null;
}

function getChoiceAgenticOption(choice?: ChoiceInputPanelChoice): AgenticActionOption | null {
  const raw = choice?.meta?.agenticOption;
  if (!raw || typeof raw !== "object") return null;
  return raw as AgenticActionOption;
}

function buildAgenticChoicePayload(option: AgenticActionOption, roll: DiceRollResult) {
  return JSON.stringify(
    {
      type: "agentic_player_action",
      source: "structured_option",
      label: option.label,
      action: option.action,
      success_probability: option.probability,
      difficulty: option.difficulty,
      dice_result: roll,
      continuity_guard:
        "Only the selected action and dice_result are authoritative. Do not treat unselected option descriptions or internal reasoning as history. Do not reference prior NPC speech unless it exists in visible chat history as dialogue JSON; if an NPC provides information now, output that dialogue JSON first.",
    },
    null,
    2,
  );
}

/**
 * Drives the agentic-play lifecycle for a chat: loading the persisted
 * enabled/gameState, firing the one-shot opening prompt, and translating a
 * `ChoiceInputPanel` selection into a hidden user message with a dice roll.
 *
 * The agentic *state* (`agenticPlayEnabled` / `agenticGameState`) is lifted to
 * ChatPage so `useNormalChat` can read it before this hook runs — breaking what
 * would otherwise be a normal↔agentic dependency cycle.
 *
 * Extracted from ChatPage (Phase 1 UI split).
 */
export function useAgenticChat({
  agenticPlayEnabled,
  setAgenticPlayEnabled,
  setAgenticGameState,
  setDismissedAgenticChoiceMessageId,
  submitContent,
  sending,
  character,
  currentChat,
  loading,
  messagesHydrated,
  visibleMessagesLength,
  isGeneratingCurrentChat,
  lastAssistantId,
  activeAgenticChoice,
}: UseAgenticChatParams) {
  const { t } = useTranslation("chat");
  const agenticOpeningStartedRef = useRef<string | null>(null);

  // Load persisted agentic state when the chat / character changes.
  useEffect(() => {
    let cancelled = false;
    const chatId = currentChat?.id;
    if (!chatId || !character) {
      setAgenticPlayEnabled(false);
      setAgenticGameState(null);
      return;
    }

    agenticPlayStateRepository.get(chatId, character).then((record) => {
      if (cancelled) return;
      setAgenticPlayEnabled(record?.enabled ?? false);
      setAgenticGameState(record?.gameState ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [currentChat?.id, character, setAgenticPlayEnabled, setAgenticGameState]);

  // One-shot opening prompt when agentic mode is freshly enabled on an empty chat.
  useEffect(() => {
    const chatId = currentChat?.id;
    if (!chatId || !character || !agenticPlayEnabled) return;
    if (loading || !messagesHydrated || visibleMessagesLength !== 0) return;
    if (sending || isGeneratingCurrentChat) return;
    if (agenticOpeningStartedRef.current === chatId) return;

    agenticOpeningStartedRef.current = chatId;
    void submitContent(AGENTIC_PLAY_OPENING_PROMPT, { hiddenUserMessage: true, label: t("agentic.openingLabel") });
  }, [
    currentChat?.id,
    character,
    agenticPlayEnabled,
    loading,
    messagesHydrated,
    visibleMessagesLength,
    sending,
    isGeneratingCurrentChat,
    submitContent,
    t,
  ]);

  const handleAgenticChoiceSubmit = useCallback(
    (value: string, choice?: ChoiceInputPanelChoice) => {
      if (lastAssistantId) setDismissedAgenticChoiceMessageId(lastAssistantId);
      const option = getChoiceAgenticOption(choice);
      if (option) {
        const roll = rollDice({
          dice: "1d20",
          difficulty: option.difficulty,
          success_probability: option.probability,
          reason: option.action,
        });
        useChatStore.getState().setLastDiceResult(roll);
        const payload = buildAgenticChoicePayload(option, roll);
        void submitContent(payload, {
          hiddenUserMessage: true,
          label: choice?.label ?? option.label,
          metadata: {
            hiddenReason: "agentic_choice",
            agenticAction: {
              label: option.label,
              action: option.action,
              success_probability: option.probability,
              difficulty: option.difficulty,
              dice_result: roll,
            },
          },
        });
        return;
      }
      void submitContent(value, {
        hiddenUserMessage: true,
        label: choice?.label ?? t("agentic.customActionLabel"),
        metadata: { hiddenReason: "agentic_custom_action" },
      });
    },
    [lastAssistantId, setDismissedAgenticChoiceMessageId, submitContent, t],
  );

  const handleDismissChoice = useCallback(() => {
    if (activeAgenticChoice) setDismissedAgenticChoiceMessageId(activeAgenticChoice.rendered.msg.id);
  }, [activeAgenticChoice, setDismissedAgenticChoiceMessageId]);

  return {
    handleAgenticChoiceSubmit,
    handleDismissChoice,
  };
}
