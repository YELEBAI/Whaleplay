import { applyRegexRules } from "@neo-tavern/core";
import { useTranslation } from "react-i18next";
import type { Message, RegexRule } from "@neo-tavern/shared";
import type { AgenticActionOption } from "@/features/agentic-play/agentic-play";
import type { ChoiceInputPanelChoice } from "@/components/ChoiceInputPanel";
import type { RenderedMessage } from "../types";

interface UseChatMessagesParams {
  visibleMessages: Message[];
  activeRegexRules: RegexRule[];
  agenticPlayEnabled: boolean;
  /** ID of the latest assistant message in the visible branch. */
  lastAssistantId: string | null;
  isGeneratingCurrentChat: boolean;
  streamingMessageId: string | null;
  /** When the choice panel for a message is dismissed, its id lands here. */
  dismissedAgenticChoiceMessageId: string | null;
}

export interface ActiveAgenticChoice {
  /** The rendered message that currently shows the choice panel. */
  rendered: RenderedMessage;
  /** Translated options ready for `ChoiceInputPanel`. */
  panelChoices: ChoiceInputPanelChoice[];
}

/**
 * Derives the per-message rendering data (regex splits, streaming flags,
 * agentic options) and resolves which assistant message — if any — should
 * currently show the agentic `ChoiceInputPanel`.
 *
 * Extracted verbatim from ChatPage (Phase 1 UI split).
 */
export function useChatMessages({
  visibleMessages,
  activeRegexRules,
  agenticPlayEnabled,
  lastAssistantId,
  isGeneratingCurrentChat,
  streamingMessageId,
  dismissedAgenticChoiceMessageId,
}: UseChatMessagesParams) {
  const { t } = useTranslation("chat");

  // React Compiler auto-memoises these derived values.
  const renderedMessages: RenderedMessage[] = visibleMessages.map((msg) => {
    const isUser = msg.role === "user";
    const isFinalAi = !isUser && msg.id === lastAssistantId;
    const split =
      !isUser && (agenticPlayEnabled || activeRegexRules.length > 0 || /\[image\]/i.test(msg.content))
        ? applyRegexRules(msg.content, activeRegexRules)
        : null;
    const rawDisplayContent = split?.displayContent ?? split?.promptContent ?? msg.content;
    const structuredAgenticOptions: AgenticActionOption[] =
      !isUser && agenticPlayEnabled ? (msg.agenticOptions ?? []) : [];
    const displayContent = rawDisplayContent;
    const displaySplit = split;
    const isStreamingAi = !isUser && isGeneratingCurrentChat && msg.id === streamingMessageId;
    const hasDisplayContent = displayContent.trim().length > 0;

    return {
      msg,
      isUser,
      isFinalAi,
      split: displaySplit,
      displayContent,
      agenticOptions: structuredAgenticOptions,
      isStreamingAi,
      hasDisplayContent,
    };
  });

  let activeAgenticChoiceBlock: ActiveAgenticChoice | null = null;
  {
    const latest = renderedMessages[renderedMessages.length - 1];
    if (
      agenticPlayEnabled &&
      latest &&
      !latest.isUser &&
      latest.msg.id === lastAssistantId &&
      !latest.isStreamingAi &&
      !isGeneratingCurrentChat &&
      latest.agenticOptions.length > 0 &&
      dismissedAgenticChoiceMessageId !== latest.msg.id
    ) {
      const panelChoices: ChoiceInputPanelChoice[] = latest.agenticOptions.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.action,
        description: [
          option.probability !== undefined ? t("choicePanel.successRate", { rate: option.probability }) : "",
          option.difficulty !== undefined ? `DC ${option.difficulty}` : "",
          option.description ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
        meta: { agenticOption: option },
      }));
      activeAgenticChoiceBlock = { rendered: latest, panelChoices };
    }
  }

  return { renderedMessages, activeAgenticChoiceBlock };
}
