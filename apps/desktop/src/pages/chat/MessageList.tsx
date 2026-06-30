import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@neo-tavern/ui";
import type { Character } from "@neo-tavern/shared";
import { AssistantMessageRow, EmptyTranscript, PendingAssistantRow, UserMessageRow } from "./MessageRows";
import type {
  GenerationStatus,
  MessageListActions,
  MessageListImageState,
  MessageListLayout,
  MessageListState,
  RenderedMessage,
} from "./types";

export interface MessageListProps {
  scroll: {
    containerRef: RefObject<HTMLDivElement | null>;
    bottomSentinelRef: RefObject<HTMLDivElement | null>;
    onScroll: () => void;
  };
  state: MessageListState;
  layout: MessageListLayout;
  image: MessageListImageState;
  character: Character | null | undefined;
  personaName: string;
  renderedMessages: RenderedMessage[];
  generationStatus: GenerationStatus;
  actions: MessageListActions;
}

/**
 * Renders the scrollable transcript shell. Message row details live in
 * MessageRows so this component stays focused on list-level concerns.
 */
export function MessageList({
  scroll,
  state,
  layout,
  image,
  character,
  personaName,
  renderedMessages,
  generationStatus,
  actions,
}: MessageListProps) {
  const { t } = useTranslation("chat");
  const { containerRef, bottomSentinelRef, onScroll } = scroll;
  const { loading, visibleMessagesLength, isGeneratingCurrentChat, hasStreamingMessage, copiedId, editingMsgId } =
    state;
  const { fontSize, chatContentWidthClass, userBubbleWidthClass, firstMessageWidthClass } = layout;
  const statusLabel = t(generationStatus.labelKey, generationStatus.label);
  const statusDetail = t(generationStatus.detailKey, generationStatus.detail);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="border-border/40 bg-background/50 mx-3 my-2 flex-1 overflow-y-auto rounded-xl border p-5"
      style={{ overflowAnchor: "none" }}
    >
      {loading && <p className="text-muted-foreground text-center text-sm">{t("messageList.loading")}</p>}
      {!loading && visibleMessagesLength === 0 && !isGeneratingCurrentChat && (
        <div className={cn(chatContentWidthClass, "mx-auto")}>
          <EmptyTranscript
            character={character}
            personaName={personaName}
            fontSize={fontSize}
            firstMessageWidthClass={firstMessageWidthClass}
          />
        </div>
      )}
      <div className={cn(chatContentWidthClass, "mx-auto")} style={{ overflowAnchor: "none" }}>
        {renderedMessages.map((item) => {
          const { msg, isUser } = item;
          const aiName = character?.name ?? t("messageList.assistantFallback");

          if (isUser) {
            return (
              <UserMessageRow
                key={msg.id}
                item={item}
                fontSize={fontSize}
                userBubbleWidthClass={userBubbleWidthClass}
                copied={copiedId === msg.id}
                editing={editingMsgId === msg.id}
                actions={actions}
              />
            );
          }

          return (
            <AssistantMessageRow
              key={msg.id}
              item={item}
              assistantName={aiName}
              fontSize={fontSize}
              chatContentWidthClass={chatContentWidthClass}
              copied={copiedId === msg.id}
              editing={editingMsgId === msg.id}
              canRegenerate={state.canRegenerate}
              image={image}
              generationStatus={generationStatus}
              statusLabel={statusLabel}
              statusDetail={statusDetail}
              actions={actions}
            />
          );
        })}
        {isGeneratingCurrentChat && !hasStreamingMessage && (
          <PendingAssistantRow
            chatContentWidthClass={chatContentWidthClass}
            statusLabel={statusLabel}
            statusDetail={statusDetail}
          />
        )}
        <div ref={bottomSentinelRef} aria-hidden="true" />
      </div>
    </div>
  );
}
