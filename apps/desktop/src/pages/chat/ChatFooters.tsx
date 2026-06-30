import { useTranslation } from "react-i18next";
import { Brain, StopCircle } from "lucide-react";
import { Button, cn } from "@neo-tavern/ui";
import {
  ChoiceInputPanel,
  type ChoiceInputPanelAnswer,
  type ChoiceInputPanelChoice,
} from "@/components/ChoiceInputPanel";
import { ChatInputArea } from "./ChatInputArea";
import type { ActiveAgenticChoice } from "./hooks";
import type { GenerationStatus, PendingSendItem } from "./types";

export interface NormalChatFooterProps {
  displayError: string | null;
  onDismissError: () => void;
  pendingSendCount: number;
  hasChat: boolean;
  pendingSendQueue: PendingSendItem[];
  currentChatId: string | undefined;
  onCancelPending: (queueIndex: number) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onContinue: () => void;
  messagesLength: number;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  characterName?: string;
  agenticPlayEnabled: boolean;
  onSend: () => void;
  isSending: boolean;
  onAbort: () => void;
  onSave: () => void;
  onLoad: () => void;
  isGenerating: boolean;
  previewText: string;
  wide?: boolean;
}

export function NormalChatFooter({ characterName, agenticPlayEnabled, ...props }: NormalChatFooterProps) {
  const { t } = useTranslation("chat");
  const placeholder = characterName
    ? agenticPlayEnabled
      ? t("inputPlaceholderAgenticWithChar", { name: characterName })
      : t("inputPlaceholderWithChar", { name: characterName })
    : t("inputPlaceholder");

  return <ChatInputArea {...props} placeholder={placeholder} />;
}

export interface AgenticChatFooterProps {
  choiceBlock: ActiveAgenticChoice;
  characterName?: string;
  chatContentWidthClass: string;
  disabled: boolean;
  onSubmit: (value: string, choice?: ChoiceInputPanelChoice, answers?: ChoiceInputPanelAnswer[]) => void;
  onCancel: () => void;
}

export function AgenticChatFooter({
  choiceBlock,
  characterName,
  chatContentWidthClass,
  disabled,
  onSubmit,
  onCancel,
}: AgenticChatFooterProps) {
  const { t } = useTranslation("chat");
  const title = characterName
    ? t("choicePanel.agenticTitleWithCharacter", { name: characterName })
    : t("choicePanel.agenticTitle");

  return (
    <div className="bg-card shrink-0 border-t p-4">
      <div className={cn("mx-auto w-full min-w-0", chatContentWidthClass)}>
        <ChoiceInputPanel
          key={choiceBlock.rendered.msg.id}
          title={title}
          choices={choiceBlock.panelChoices}
          disabled={disabled}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

export function AgenticGeneratingFooter({
  generationStatus,
  onAbort,
}: {
  generationStatus: GenerationStatus;
  onAbort: () => void;
}) {
  const { t } = useTranslation("chat");
  const statusDetail = t(generationStatus.detailKey, generationStatus.detail);

  return (
    <div className="bg-card shrink-0 border-t px-4 py-3">
      <div className="text-muted-foreground mx-auto flex w-full max-w-4xl min-w-0 items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Brain className="text-primary h-4 w-4 shrink-0 animate-pulse" />
          <span className="shrink-0">{t("activity.thinking")}</span>
          <span className="min-w-0 truncate">· {statusDetail}</span>
        </div>
        <Button variant="destructive" size="sm" onClick={onAbort} title={t("stopTitle")} aria-label={t("stopTitle")}>
          <StopCircle className="h-4 w-4" />
          {t("stopTitle")}
        </Button>
      </div>
    </div>
  );
}
