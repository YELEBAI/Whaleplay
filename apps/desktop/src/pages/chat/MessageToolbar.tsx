import { Brain, CheckCheck, Copy, Image as ImageIcon, Pencil, RotateCcw, ScrollText, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@neo-tavern/ui";
import type { Message } from "@neo-tavern/shared";
import type { MessageListActions } from "./types";

interface MessageToolbarProps {
  message: Message;
  actions: MessageListActions;
  copied: boolean;
  canEdit?: boolean;
  canShowPrompt?: boolean;
  canViewReasoning?: boolean;
  canGenerateImage?: boolean;
  imageBusy?: boolean;
  canRegenerate?: boolean;
  regenerateDisabled?: boolean;
  className?: string;
}

const buttonClass = "text-muted-foreground h-6 w-6";
const iconClass = "h-3.5 w-3.5";

export function MessageToolbar({
  message,
  actions,
  copied,
  canEdit = false,
  canShowPrompt = false,
  canViewReasoning = false,
  canGenerateImage = false,
  imageBusy = false,
  canRegenerate = false,
  regenerateDisabled = false,
  className,
}: MessageToolbarProps) {
  const { t } = useTranslation("chat");
  const copyLabel = copied ? t("messageActions.copied") : t("messageActions.copy");
  const imageLabel = imageBusy ? t("messageActions.generatingImage") : t("messageActions.generateImage");

  return (
    <div className={cn("flex shrink-0 gap-0.5", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(buttonClass, "hover:text-foreground")}
        title={copyLabel}
        aria-label={copyLabel}
        onClick={() => actions.copy(message.content, message.id)}
      >
        {copied ? <CheckCheck className={cn(iconClass, "text-green-500")} /> : <Copy className={iconClass} />}
      </Button>

      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(buttonClass, "hover:text-foreground")}
          title={t("messageActions.edit")}
          aria-label={t("messageActions.edit")}
          onClick={() => actions.startEdit(message)}
        >
          <Pencil className={iconClass} />
        </Button>
      )}

      {canShowPrompt && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(buttonClass, "hover:text-foreground")}
          title={t("messageActions.viewFullPrompt")}
          aria-label={t("messageActions.viewFullPrompt")}
          onClick={actions.showPromptDialog}
        >
          <ScrollText className={iconClass} />
        </Button>
      )}

      {canViewReasoning && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(buttonClass, "hover:text-purple-400")}
          title={t("messageActions.viewReasoning")}
          aria-label={t("messageActions.viewReasoning")}
          onClick={() => actions.viewReasoning(message)}
        >
          <Brain className={iconClass} />
        </Button>
      )}

      {canGenerateImage && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(buttonClass, "hover:text-foreground")}
          title={imageLabel}
          aria-label={imageLabel}
          onClick={() => actions.generateImages(message)}
          disabled={imageBusy}
        >
          <ImageIcon className={cn(iconClass, imageBusy && "animate-pulse")} />
        </Button>
      )}

      {canRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(buttonClass, "hover:text-foreground")}
          title={t("messageActions.regenerate")}
          aria-label={t("messageActions.regenerate")}
          onClick={actions.regenerate}
          disabled={regenerateDisabled}
        >
          <RotateCcw className={iconClass} />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className={cn(buttonClass, "hover:text-destructive")}
        title={t("messageActions.delete")}
        aria-label={t("messageActions.delete")}
        onClick={() => actions.deleteMessage(message)}
      >
        <Trash2 className={iconClass} />
      </Button>
    </div>
  );
}
