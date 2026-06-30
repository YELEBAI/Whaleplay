import { useCallback, useState } from "react";
import { cn } from "@neo-tavern/ui";
import type { AgenticGameState } from "@/features/agentic-play/agentic-play";
import { useSettingsStore } from "@/features/settings/settings.store";
import { ChatSidebar } from "./ChatSidebar";
import { ChatRightPanel } from "./ChatRightPanel";
import { AgenticChatFooter, AgenticGeneratingFooter, NormalChatFooter } from "./ChatFooters";
import { MessageList } from "./MessageList";
import {
  ImagePromptDialog,
  PromptDialog,
  SaveDialog,
  LoadDialog,
  TokenDialog,
  DeleteMessageDialog,
  ThinkingDialog,
} from "./dialogs";
import {
  useAgenticChat,
  useBranchNavigation,
  useChatCost,
  useChatImages,
  useChatMessageActions,
  useChatMessages,
  useChatScroll,
  useChatSession,
  useNormalChat,
  useSavepointManager,
  useSecondaryUsage,
} from "./hooks";
import type { PendingSendItem, TokenUsageView } from "./types";
import { getGenerationStatus } from "./utils";

/**
 * Thin orchestrator for the chat page. All concerns are delegated to hooks:
 * session (`useChatSession`), message rendering (`useChatMessages`), scroll
 * (`useChatScroll`), cost (`useChatCost`), images (`useChatImages`), the
 * normal send/preview/queue flow (`useNormalChat`), and agentic-play
 * (`useAgenticChat`).
 *
 * The mode difference (normal vs agentic) only surfaces in which footer is
 * rendered — no `if (agenticPlayEnabled)` ternaries are scattered through the
 * message list.
 */
export function ChatPage() {
  const session = useChatSession();
  const {
    characters,
    currentChat,
    messages,
    loading,
    messagesHydrated,
    chatError,
    character,
    navigate,
    updateMessage,
    patchMessage,
    deleteMessages,
    lastDiceResult,
    input,
    setInput,
    fontSize,
    chatListCollapsed,
    setChatListCollapsed,
    chatRecords,
    handleSelectCharacterChat,
    handleFontSizeChange,
    clearError,
  } = session;

  const branch = useBranchNavigation(currentChat?.id);
  const imageGeneration = useSettingsStore((s) => s.imageGeneration);
  const regexPresets = useSettingsStore((s) => s.regexPresets);
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId);
  const personaName = useSettingsStore((s) => s.personaName);

  // ── Derived: active regex rules (React Compiler auto-memoises) ──
  const activeRegexRules = (() => {
    const rules: (typeof regexPresets)[0]["rules"] = [];
    for (const p of regexPresets) {
      if (p.isGlobal) rules.push(...p.rules.filter((r) => r.enabled));
    }
    if (activeRegexPresetId) {
      const preset = regexPresets.find((p) => p.id === activeRegexPresetId);
      if (preset) rules.push(...preset.rules.filter((r) => r.enabled));
    }
    const seen = new Set<string>();
    return rules.filter((r) => {
      if (seen.has(r.pattern)) return false;
      seen.add(r.pattern);
      return true;
    });
  })();

  // ── Agentic state lifted here to break the normal↔agentic cycle ──
  const [agenticPlayEnabled, setAgenticPlayEnabled] = useState(false);
  const [agenticGameState, setAgenticGameState] = useState<AgenticGameState | null>(null);
  const [dismissedAgenticChoiceMessageId, setDismissedAgenticChoiceMessageId] = useState<string | null>(null);

  const messageUi = useChatMessageActions({ messages, updateMessage, deleteMessages });

  // ── Chat UI-only state ──
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenUsageView, setTokenUsageView] = useState<TokenUsageView>("main");

  // ── Normal chat: send / continue / abort / preview / queue ──
  const normal = useNormalChat({
    session,
    visibleMessagesLength: branch.visibleMessages.length,
    agenticPlayEnabled,
    agenticGameState,
    setAgenticGameState,
  });

  const isGeneratingCurrentChat = normal.sending && !!currentChat?.id && normal.sendingChatId === currentChat.id;

  // ── Agentic chat: opening prompt, choice submit, dice ──
  const lastAssistantId = (() => {
    for (let i = branch.visibleMessages.length - 1; i >= 0; i--) {
      if (branch.visibleMessages[i].role === "assistant") return branch.visibleMessages[i].id;
    }
    return null;
  })();

  // ── Message rendering + active agentic choice block ──
  const { renderedMessages, activeAgenticChoiceBlock } = useChatMessages({
    visibleMessages: branch.visibleMessages,
    activeRegexRules,
    agenticPlayEnabled,
    lastAssistantId,
    isGeneratingCurrentChat,
    streamingMessageId: normal.streamingMessageId,
    dismissedAgenticChoiceMessageId,
  });

  // ── Agentic lifecycle (needs submitContent from normal) ──
  const agentic = useAgenticChat({
    agenticPlayEnabled,
    setAgenticPlayEnabled,
    setAgenticGameState,
    setDismissedAgenticChoiceMessageId,
    submitContent: normal.submitContent,
    sending: normal.sending,
    character,
    currentChat,
    loading,
    messagesHydrated,
    visibleMessagesLength: branch.visibleMessages.length,
    isGeneratingCurrentChat,
    lastAssistantId,
    activeAgenticChoice: activeAgenticChoiceBlock,
  });

  // ── Scroll ──
  const { messagesContainerRef, chatBottomRef, handleChatScroll } = useChatScroll({
    renderedMessages,
    visibleMessages: branch.visibleMessages,
    visibleMessagesLength: branch.visibleMessages.length,
    currentChatId: currentChat?.id,
    activeLeafId: branch.activeLeafId,
    sending: normal.sending,
    sendingChatId: normal.sendingChatId,
    streamingMessageId: normal.streamingMessageId,
    loading,
    fontSize,
    chatListCollapsed,
  });

  // ── Images ──
  const getLatestMessage = useCallback(
    (messageId: string) =>
      branch.visibleMessages.find((m) => m.id === messageId) ?? messages.find((m) => m.id === messageId) ?? null,
    [branch.visibleMessages, messages],
  );
  const images = useChatImages({
    currentChat,
    character,
    messages,
    getLatestMessage,
    patchMessage,
  });

  // ── Cost ──
  const { secondaryUsageRecords } = useSecondaryUsage({
    currentChatId: currentChat?.id,
    tokenDialogOpen,
    tokenUsageView,
    messages,
  });
  const cost = useChatCost({ messages, secondaryUsageRecords, tokenUsageView });

  // ── Savepoint ──
  const savepoint = useSavepointManager(currentChat, isGeneratingCurrentChat);

  // ── Misc derived values ──
  const hasStreamingMessage =
    isGeneratingCurrentChat && !!normal.streamingMessageId && messages.some((m) => m.id === normal.streamingMessageId);
  const generationStatus = getGenerationStatus(normal.generationPhase);
  const showAgenticGeneratingFooter = agenticPlayEnabled && isGeneratingCurrentChat && !activeAgenticChoiceBlock;

  const onCancelPending = useCallback(
    (queueIndex: number) => {
      normal.setPendingSendQueue((queue) => queue.filter((_, index) => index !== queueIndex));
    },
    [normal],
  );

  // ── Layout classes ──
  const chatLayoutColumns = chatListCollapsed
    ? "lg:grid-cols-[48px_minmax(0,1fr)] xl:grid-cols-[48px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_320px]";
  const chatContentWidthClass = chatListCollapsed ? "max-w-6xl" : "max-w-4xl";
  const userBubbleWidthClass = chatListCollapsed ? "max-w-[min(88%,60rem)]" : "max-w-[min(82%,48rem)]";
  const firstMessageWidthClass = chatListCollapsed ? "max-w-[min(82%,54rem)]" : "max-w-[75%]";

  return (
    <div className="flex h-full flex-col" style={{ "--chat-font-size": fontSize + "px" } as React.CSSProperties}>
      <div
        className={cn(
          "grid flex-1 grid-cols-1 gap-3 overflow-hidden p-4 transition-[grid-template-columns] duration-200",
          chatLayoutColumns,
        )}
      >
        <ChatSidebar
          chats={chatRecords}
          characters={characters}
          currentChatId={currentChat?.id}
          collapsed={chatListCollapsed}
          onBack={() => navigate("/")}
          onSelectChat={handleSelectCharacterChat}
          onToggleCollapsed={() => setChatListCollapsed((value) => !value)}
        />

        <section className="chat-grid-cell bg-background flex flex-col rounded-lg border">
          <MessageList
            scroll={{
              containerRef: messagesContainerRef,
              bottomSentinelRef: chatBottomRef,
              onScroll: handleChatScroll,
            }}
            state={{
              loading,
              visibleMessagesLength: branch.visibleMessages.length,
              isGeneratingCurrentChat,
              hasStreamingMessage,
              copiedId: messageUi.copiedId,
              editingMsgId: messageUi.editingMsgId,
              canRegenerate: !normal.sending,
            }}
            layout={{
              fontSize,
              chatContentWidthClass,
              userBubbleWidthClass,
              firstMessageWidthClass,
            }}
            image={{
              busyByMessageId: images.imageGenerationBusy,
              enabled: imageGeneration.enabled,
              mode: imageGeneration.mode,
            }}
            character={character}
            personaName={personaName}
            renderedMessages={renderedMessages}
            generationStatus={generationStatus}
            actions={{
              copy: messageUi.copyMessage,
              startEdit: messageUi.startEdit,
              cancelEdit: messageUi.cancelEdit,
              saveEdit: messageUi.saveEdit,
              showPromptDialog: normal.showPromptDialog,
              viewReasoning: messageUi.viewReasoning,
              generateImages: (msg) => void images.handleGenerateMessageImages(msg),
              regenerate: () => void normal.regenerate(),
              deleteMessage: messageUi.requestDelete,
              setInput,
              deleteImage: (...args) => void images.handleDeleteImage(...args),
              editImagePrompt: images.openImagePromptEditor,
              regenerateImage: (...args) => void images.handleRegenerateImage(...args),
            }}
          />

          {activeAgenticChoiceBlock && activeAgenticChoiceBlock.panelChoices.length > 0 ? (
            <AgenticChatFooter
              choiceBlock={activeAgenticChoiceBlock}
              characterName={character?.name}
              chatContentWidthClass={chatContentWidthClass}
              disabled={!currentChat || isGeneratingCurrentChat}
              onSubmit={agentic.handleAgenticChoiceSubmit}
              onCancel={() => setDismissedAgenticChoiceMessageId(activeAgenticChoiceBlock.rendered.msg.id)}
            />
          ) : showAgenticGeneratingFooter ? (
            <AgenticGeneratingFooter generationStatus={generationStatus} onAbort={normal.abort} />
          ) : (
            <NormalChatFooter
              displayError={chatError}
              onDismissError={() => {
                normal.clearSendError();
                clearError();
              }}
              pendingSendCount={normal.pendingSendCount}
              hasChat={!!currentChat}
              pendingSendQueue={normal.pendingSendQueue as PendingSendItem[]}
              currentChatId={currentChat?.id}
              onCancelPending={onCancelPending}
              fontSize={fontSize}
              onFontSizeChange={handleFontSizeChange}
              previewOpen={normal.previewOpen}
              onTogglePreview={() => {
                const nextOpen = !normal.previewOpen;
                normal.setPreviewOpen(nextOpen);
                if (nextOpen) normal.updatePreview(input.trim());
              }}
              onContinue={normal.handleContinue}
              messagesLength={branch.visibleMessages.length}
              input={input}
              onInputChange={normal.handleInputChange}
              onKeyDown={normal.handleKeyDown}
              characterName={character?.name}
              agenticPlayEnabled={agenticPlayEnabled}
              onSend={normal.handleSend}
              isSending={normal.sending}
              onAbort={normal.abort}
              onSave={() => savepoint.setSaveDialogOpen(true)}
              onLoad={savepoint.openLoadDialog}
              isGenerating={isGeneratingCurrentChat}
              previewText={normal.previewText}
              wide={chatListCollapsed}
            />
          )}
        </section>

        <div className="hidden xl:contents">
          <ChatRightPanel
            messagesCount={branch.visibleMessages.length}
            usageMessagesCount={cost.usageMessages.length}
            totalPrompt={cost.totalPrompt}
            totalCompletion={cost.totalCompletion}
            cacheRate={cost.cacheRate}
            contextUsageDisplay={cost.contextUsageDisplay}
            contextUsagePercent={cost.contextUsagePercent}
            contextUsageBarTone={cost.contextUsageBarTone}
            onTokenDialogOpen={() => setTokenDialogOpen(true)}
            agenticPlayEnabled={agenticPlayEnabled}
            agenticGameState={agenticGameState}
            isGeneratingCurrentChat={isGeneratingCurrentChat}
            lastDiceResult={lastDiceResult}
            hasBranches={branch.hasBranches}
            branchSummaries={branch.branchSummaries}
            onSwitchBranch={branch.switchBranch}
          />
        </div>
      </div>

      <ImagePromptDialog
        open={!!images.imagePromptEditTarget}
        onOpenChange={(open) => {
          if (!open) images.closeImagePromptEditor();
        }}
        draft={images.imagePromptDraft}
        onDraftChange={images.setImagePromptDraft}
        onCancel={images.closeImagePromptEditor}
        onSave={() => {
          void images.saveImagePromptEdit(false);
        }}
        onSaveAndRegenerate={() => {
          void images.saveImagePromptEdit(true);
        }}
      />

      <PromptDialog
        open={normal.promptDialogOpen}
        onOpenChange={normal.setPromptDialogOpen}
        previewText={normal.previewText}
      />

      <SaveDialog
        open={savepoint.saveDialogOpen}
        onOpenChange={(v) => {
          if (!v) savepoint.closeSaveDialog();
        }}
        savepointName={savepoint.savepointName}
        onSavepointNameChange={savepoint.setSavepointName}
        onCancel={savepoint.closeSaveDialog}
        onSave={savepoint.handleCreateSavepoint}
        isSaving={savepoint.savingSavepoint}
        hasCurrentChat={!!currentChat}
      />

      <LoadDialog
        open={savepoint.loadDialogOpen}
        onOpenChange={savepoint.setLoadDialogOpen}
        savepoints={savepoint.savepoints}
        isLoading={savepoint.loadingSavepoints}
        restoringSavepointId={savepoint.restoringSavepointId}
        importingSavepointId={savepoint.importingSavepointId}
        isGenerating={isGeneratingCurrentChat}
        onRestore={savepoint.handleRestoreSavepoint}
        onImportAsBranch={savepoint.handleImportSavepointAsBranch}
        onDelete={savepoint.handleDeleteSavepoint}
        onRefresh={savepoint.refreshSavepoints}
      />

      <TokenDialog
        open={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
        tokenUsageView={tokenUsageView}
        onTokenUsageViewChange={setTokenUsageView}
        rows={cost.tokenDialogRows}
        totals={cost.tokenDialogTotals}
        secondaryUsageRecordsCount={secondaryUsageRecords.length}
        contextUsageTitle={cost.contextUsageTitle}
        contextUsageTone={cost.contextUsageTone}
        contextUsageDisplay={cost.contextUsageDisplay}
      />

      <DeleteMessageDialog
        open={!!messageUi.deleteMsgTarget}
        onOpenChange={(v) => {
          if (!v) messageUi.clearDeleteTarget();
        }}
        onDelete={messageUi.deleteTarget}
      />

      <ThinkingDialog
        open={!!messageUi.thinkingMsg}
        onOpenChange={(v) => {
          if (!v) messageUi.clearThinkingMessage();
        }}
        reasoningContent={messageUi.thinkingMsg?.reasoningContent}
      />
    </div>
  );
}
