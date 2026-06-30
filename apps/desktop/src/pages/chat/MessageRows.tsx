import { Brain, Bot, ChevronRight, CircleDashed, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, cn } from "@neo-tavern/ui";
import type { Character } from "@neo-tavern/shared";
import { Avatar } from "./ChatDisplay";
import { ChatActivityTimeline } from "./ChatActivityTimeline";
import { MessageEditBox } from "./MessageEditBox";
import { replaceUserPlaceholders } from "./utils";
import { MessageDisplayBlocks, MessageSideBlocks } from "./MessageDisplayBlocks";
import { MessageToolbar } from "./MessageToolbar";
import type { GenerationStatus, MessageListActions, MessageListImageState, RenderedMessage } from "./types";

interface EmptyTranscriptProps {
  character: Character | null | undefined;
  personaName: string;
  fontSize: number;
  firstMessageWidthClass: string;
}

export function EmptyTranscript({ character, personaName, fontSize, firstMessageWidthClass }: EmptyTranscriptProps) {
  const { t } = useTranslation("chat");

  if (!character) {
    return <p className="text-muted-foreground mt-8 text-center text-sm">{t("noCharSelected")}</p>;
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <Avatar name={character.name} src={character.avatar} />
        <span className="text-muted-foreground text-xs font-medium">{character.name}</span>
      </div>
      <div className="flex gap-3">
        <div className={cn(firstMessageWidthClass, "min-w-0")}>
          <Card>
            <CardContent className="p-3">
              <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
                {replaceUserPlaceholders(
                  character.firstMessage || t("startConversation", { name: character.name }),
                  personaName,
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface UserMessageRowProps {
  item: RenderedMessage;
  fontSize: number;
  userBubbleWidthClass: string;
  copied: boolean;
  editing: boolean;
  actions: MessageListActions;
}

export function UserMessageRow({
  item,
  fontSize,
  userBubbleWidthClass,
  copied,
  editing,
  actions,
}: UserMessageRowProps) {
  const { msg, displayContent } = item;

  return (
    <div className="group flex min-w-0 justify-end gap-3 pb-5" style={{ overflowAnchor: "none" }}>
      <div className={cn("min-w-0 overflow-hidden", userBubbleWidthClass)}>
        <MessageToolbar
          message={msg}
          actions={actions}
          copied={copied}
          className="mb-1.5 justify-end opacity-0 transition-opacity group-hover:opacity-100"
        />
        <div className="bg-primary text-primary-foreground rounded-lg border p-4">
          {editing ? (
            <MessageEditBox
              initialContent={msg.content}
              fontSize={fontSize}
              onCancel={actions.cancelEdit}
              onSave={actions.saveEdit}
            />
          ) : (
            <p className="leading-relaxed wrap-break-word whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
              {displayContent}
            </p>
          )}
        </div>
      </div>
      <div className="bg-muted mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        <UserIcon className="h-4 w-4" />
      </div>
    </div>
  );
}

interface AssistantMessageRowProps {
  item: RenderedMessage;
  assistantName: string;
  fontSize: number;
  chatContentWidthClass: string;
  copied: boolean;
  editing: boolean;
  canRegenerate: boolean;
  image: MessageListImageState;
  generationStatus: GenerationStatus;
  statusLabel: string;
  statusDetail: string;
  actions: MessageListActions;
}

export function AssistantMessageRow({
  item,
  assistantName,
  fontSize,
  chatContentWidthClass,
  copied,
  editing,
  canRegenerate,
  image,
  generationStatus,
  statusLabel,
  statusDetail,
  actions,
}: AssistantMessageRowProps) {
  const { msg, isFinalAi, isStreamingAi, hasDisplayContent } = item;
  const isMessageImageBusy =
    !!image.busyByMessageId[msg.id] || !!msg.images?.some((messageImage) => messageImage.status === "generating");

  return (
    <div className="flex min-w-0 justify-start gap-3 pb-5" style={{ overflowAnchor: "none" }}>
      <div className="bg-primary text-primary-foreground mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        <Bot className="h-4 w-4" />
      </div>
      <div className={cn("group w-full min-w-0 overflow-hidden py-1", chatContentWidthClass)}>
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <span className="text-muted-foreground min-w-0 truncate text-xs font-medium">{assistantName}</span>
          <MessageToolbar
            message={msg}
            actions={actions}
            copied={copied}
            canEdit
            canShowPrompt
            canViewReasoning={!!msg.reasoningContent}
            canGenerateImage={image.enabled && image.mode === "manual" && hasDisplayContent && !isStreamingAi}
            imageBusy={isMessageImageBusy}
            canRegenerate={isFinalAi}
            regenerateDisabled={!canRegenerate}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>

        <ChatActivityTimeline message={msg} active={isStreamingAi} generationStatus={generationStatus} />

        {editing ? (
          <MessageEditBox
            initialContent={msg.content}
            fontSize={fontSize}
            onCancel={actions.cancelEdit}
            onSave={actions.saveEdit}
          />
        ) : isStreamingAi && !hasDisplayContent ? (
          <StreamingPlaceholder statusLabel={statusLabel} statusDetail={statusDetail} />
        ) : (
          <MessageDisplayBlocks item={item} fontSize={fontSize} actions={actions} />
        )}

        <MessageSideBlocks message={item} fontSize={fontSize} actions={actions} />
      </div>
    </div>
  );
}

function StreamingPlaceholder({ statusLabel, statusDetail }: { statusLabel: string; statusDetail: string }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{statusDetail}</p>
      <ThinkingDots label={statusLabel} />
    </div>
  );
}

export function PendingAssistantRow({
  chatContentWidthClass,
  statusLabel,
  statusDetail,
}: {
  chatContentWidthClass: string;
  statusLabel: string;
  statusDetail: string;
}) {
  const { t } = useTranslation("chat");

  return (
    <div className="flex min-w-0 justify-start gap-3 pb-5">
      <div className="bg-primary text-primary-foreground mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        <Bot className="h-4 w-4" />
      </div>
      <div className={cn("w-full min-w-0 py-1", chatContentWidthClass)}>
        <div className="border-border/80 mb-3 min-w-0 border-l">
          <div className="relative pb-3">
            <span className="bg-background text-primary absolute top-1 left-0 flex h-3 w-3 items-center justify-center rounded-full">
              <CircleDashed className="h-3.5 w-3.5 animate-spin" />
            </span>
            <div className="flex min-w-0 items-center gap-1 overflow-hidden text-sm font-medium">
              <Brain className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">{t("activity.thinking")}</span>
              <span className="text-muted-foreground min-w-0 truncate">· {statusDetail}</span>
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            </div>
          </div>
        </div>
        <ThinkingDots label={statusLabel} />
      </div>
    </div>
  );
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <div className="flex gap-1" aria-label={label}>
      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
      <span className="bg-primary/50 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
    </div>
  );
}
