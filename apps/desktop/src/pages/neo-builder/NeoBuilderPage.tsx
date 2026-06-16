import { startTransition, useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, Globe2, Send, StopCircle } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from "@neo-tavern/ui";
import { useVirtualList, VirtualList } from "@/components";
import { generateId } from "@neo-tavern/shared";
import {
  ChoiceInputPanel,
  type ChoiceInputPanelChoice,
  type ChoiceInputPanelQuestion,
} from "@/components/ChoiceInputPanel";

import { builderSessions, useBuilderSession } from "@/features/character/builder-session.store";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { deleteWorkspaceDir } from "@/features/character/builder/workspace-files";
import { useCharacterStore } from "@/features/character/character.store";

import { BuilderWorkspaceList } from "./WorkspaceList";
import { BuilderChatMessage } from "./ChatMessage";
import { ArtifactsPanel } from "./ArtifactsPanel";
import {
  PlanDialog,
  PaletteDialog,
  StatusBarsDialog,
  EvaluationDialog,
  CharacterDialog,
  WorldbookDialog,
} from "./dialogs";
import { useBuilderGeneration } from "./hooks/useBuilderGeneration";
import { useBuilderSave } from "./hooks/useBuilderSave";
import { useBuilderExport } from "./hooks/useBuilderExport";

import type {
  BuilderMessage,
  BuilderTarget,
  BuilderWorkspaceRecord,
  BuilderWorkspaceSnapshot,
  WorldbookDraft,
  ArtifactView,
} from "./types";
import type { CreateCharacterInput } from "./types";
import type {
  NeoBuilderEvaluationReport,
  NeoBuilderTurnResult,
  NeoCreationPlan,
  NeoPersonalityPalette,
  NeoMvuConfig,
  NeoStatusBarConfig,
} from "./types";

import {
  NEW_TARGET,
  normalizeRestoredMessages,
  readInitialBuilderSnapshot,
  readInitialBuilderRecords,
  initialMessages,
  createWorkspaceRecord,
  upsertWorkspaceRecord,
  hasWorkspaceProgress,
  writeBuilderWorkspaceSnapshot,
  writeBuilderWorkspaceRecords,
  getChoicePanelTitle,
} from "./utils";

/** NeoBuilderPage — the main page for the AI-driven character creation workflow (Whale Builder). */
export function NeoBuilderPage() {
  const { t } = useTranslation("neo-builder");
  const navigate = useNavigate();
  const { loadCharacters, createCharacter, updateCharacter } = useCharacterStore();
  const [initialSnapshot] = useState(() => readInitialBuilderSnapshot());
  const [targetId, setTargetId] = useState<BuilderTarget>(() => initialSnapshot?.targetId ?? NEW_TARGET);
  const [builderSessionId, setBuilderSessionId] = useState(() => initialSnapshot?.builderSessionId ?? generateId());
  const session = useBuilderSession(builderSessionId);
  const { messages } = session;

  const gen = useBuilderGeneration(builderSessionId);
  const builderBusy = gen.isBusy || session.running;
  const builderError = gen.genState.errorMessage ?? session.error;
  const [input, setInput] = useState(() => initialSnapshot?.input ?? "");
  const [saving, setSaving] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => initialSnapshot?.webSearchEnabled ?? false);
  const [dismissedChoiceMessageId, setDismissedChoiceMessageId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<NeoBuilderTurnResult | null>(() => initialSnapshot?.lastResult ?? null);
  const [draft, setDraft] = useState<CreateCharacterInput | null>(() => initialSnapshot?.draft ?? null);
  const [worldbookDraft, setWorldbookDraft] = useState<WorldbookDraft | null>(
    () => initialSnapshot?.worldbookDraft ?? null,
  );
  const [creationPlan, setCreationPlan] = useState<NeoCreationPlan | null>(() => initialSnapshot?.creationPlan ?? null);
  const [personalityPalette, setPersonalityPalette] = useState<NeoPersonalityPalette | null>(
    () => initialSnapshot?.personalityPalette ?? null,
  );
  const [evaluationReport, setEvaluationReport] = useState<NeoBuilderEvaluationReport | null>(
    () => initialSnapshot?.evaluationReport ?? null,
  );
  const [mvu, setMvu] = useState<NeoMvuConfig | null>(() => initialSnapshot?.mvu ?? null);
  const [statusBars, setStatusBars] = useState<NeoStatusBarConfig | null>(
    () => initialSnapshot?.statusBars ?? initialSnapshot?.draft?.statusBars ?? null,
  );
  const [artifactView, setArtifactView] = useState<ArtifactView>(null);
  const [savedCharacterId, setSavedCharacterId] = useState<string | null>(
    () => initialSnapshot?.savedCharacterId ?? null,
  );
  const [workspaceRecords, setWorkspaceRecords] = useState<BuilderWorkspaceRecord[]>(() =>
    readInitialBuilderRecords(initialSnapshot ?? null),
  );

  // Restore snapshot messages into the persistent session store on mount
  const restoredRef = useRef(false);
  const appliedResultVersionRef = useRef(0);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const currentSession = builderSessions.getSnapshot(builderSessionId);
    if (initialSnapshot?.messages?.length && currentSession.messages.length === 0 && !currentSession.running) {
      builderSessions.restore(builderSessionId, initialSnapshot.messages, initialSnapshot.lastResult);
    }
  }, [builderSessionId, initialSnapshot]);

  useEffect(
    () => () => {
      builderSessions.abort(builderSessionId);
    },
    [builderSessionId],
  );

  const visibleMessages = messages.filter((message) => !message.hidden);

  const handleBuilderScroll = useCallback(() => {
    const el = builderScrollRef.current;
    if (!el) return;
    isBuilderNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }, []);

  const scheduleBuilderScrollToBottom = useCallback(() => {
    if (builderScrollFrameRef.current !== null) cancelAnimationFrame(builderScrollFrameRef.current);
    builderScrollFrameRef.current = requestAnimationFrame(() => {
      builderScrollFrameRef.current = null;
      const el = builderScrollRef.current;
      if (!el) return;
      builderBottomRef.current?.scrollIntoView?.({ block: "end" });
      el.scrollTop = el.scrollHeight;
      isBuilderNearBottomRef.current = true;
    });
  }, []);

  useEffect(
    () => () => {
      if (builderScrollFrameRef.current !== null) cancelAnimationFrame(builderScrollFrameRef.current);
      builderScrollFrameRef.current = null;
    },
    [],
  );

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useLayoutEffect(() => {
    if (visibleMessages.length === 0) return;
    if (isBuilderNearBottomRef.current) scheduleBuilderScrollToBottom();
  }, [messages, visibleMessages.length, scheduleBuilderScrollToBottom]);

  useLayoutEffect(() => {
    isBuilderNearBottomRef.current = true;
    scheduleBuilderScrollToBottom();
  }, [builderSessionId, scheduleBuilderScrollToBottom]);

  useEffect(() => {
    writeBuilderWorkspaceRecords(workspaceRecords);
  }, [workspaceRecords]);

  useEffect(() => {
    const snapshot: BuilderWorkspaceSnapshot = {
      targetId,
      messages,
      input,
      webSearchEnabled,
      lastResult,
      draft,
      worldbookDraft,
      creationPlan,
      personalityPalette,
      evaluationReport,
      mvu,
      statusBars,
      savedCharacterId,
      builderSessionId,
    };
    writeBuilderWorkspaceSnapshot(snapshot);
    if (hasWorkspaceProgress(snapshot)) {
      startTransition(() => {
        setWorkspaceRecords((records) => upsertWorkspaceRecord(records, createWorkspaceRecord(snapshot)));
      });
    }
  }, [
    targetId,
    messages,
    input,
    webSearchEnabled,
    lastResult,
    draft,
    worldbookDraft,
    creationPlan,
    personalityPalette,
    evaluationReport,
    mvu,
    statusBars,
    savedCharacterId,
    builderSessionId,
  ]);

  const resetWorkspace = () => {
    setTargetId(NEW_TARGET);
    const newId = generateId();
    setBuilderSessionId(newId);
    builderSessions.restore(newId, initialMessages());
    setLastResult(null);
    setDraft(null);
    setWorldbookDraft(null);
    setCreationPlan(null);
    setPersonalityPalette(null);
    setEvaluationReport(null);
    setMvu(null);
    setStatusBars(null);
    setArtifactView(null);
    setSavedCharacterId(null);
    setInput("");
  };

  const handleNewWorkspace = () => {
    resetWorkspace();
  };

  const handleSelectWorkspace = (record: BuilderWorkspaceRecord) => {
    setTargetId(record.targetId);
    setBuilderSessionId(record.builderSessionId);
    builderSessions.restore(record.builderSessionId, normalizeRestoredMessages(record.messages), record.lastResult);
    setInput(record.input);
    setWebSearchEnabled(record.webSearchEnabled);
    setLastResult(record.lastResult);
    setDraft(record.draft);
    setWorldbookDraft(record.worldbookDraft);
    setCreationPlan(record.creationPlan);
    setPersonalityPalette(record.personalityPalette);
    setEvaluationReport(record.evaluationReport);
    setMvu(record.mvu);
    setStatusBars(record.statusBars ?? record.draft?.statusBars ?? null);
    setSavedCharacterId(record.savedCharacterId);
    setArtifactView(null);
  };

  const handleDeleteWorkspace = (record: BuilderWorkspaceRecord) => {
    builderSessions.abort(record.builderSessionId);
    setWorkspaceRecords((records) => records.filter((item) => item.id !== record.id));
    deleteWorkspaceDir(record.builderSessionId).catch(() => {});
    if (record.builderSessionId === builderSessionId) resetWorkspace();
  };

  const applyDraftFromResult = useCallback(
    (result: NeoBuilderTurnResult) => {
      if (result.creationPlan) setCreationPlan(result.creationPlan);
      if (result.personalityPalette) setPersonalityPalette(result.personalityPalette);
      if (result.evaluationReport) setEvaluationReport(result.evaluationReport);
      if (result.mvu) setMvu(result.mvu);
      if (result.statusBars) setStatusBars(result.statusBars);
      if (!result.draft) return;
      if (!savedCharacterId) setTargetId(NEW_TARGET);
      setDraft(result.draft.character);
      setCreationPlan(result.draft.creationPlan ?? result.creationPlan ?? creationPlan);
      setPersonalityPalette(result.draft.personalityPalette ?? result.personalityPalette ?? personalityPalette);
      setEvaluationReport(result.draft.evaluationReport ?? result.evaluationReport ?? evaluationReport);
      if (result.draft.mvu) setMvu(result.draft.mvu);
      setStatusBars(result.draft.statusBars ?? result.statusBars ?? statusBars);
      setWorldbookDraft(
        result.draft.worldbookEntries.length > 0
          ? {
              name: result.draft.worldbookName,
              description: result.draft.worldbookDescription,
              entries: result.draft.worldbookEntries,
            }
          : null,
      );
    },
    [creationPlan, evaluationReport, personalityPalette, savedCharacterId, statusBars],
  );

  useEffect(() => {
    appliedResultVersionRef.current = 0;
  }, [builderSessionId]);

  useEffect(() => {
    if (!session.lastResult || session.resultVersion <= 0) return;
    if (appliedResultVersionRef.current === session.resultVersion) return;
    appliedResultVersionRef.current = session.resultVersion;
    setLastResult(session.lastResult);
    applyDraftFromResult(session.lastResult);
    void recordUsageCostAndWarn(session.lastResult.usage);
  }, [applyDraftFromResult, session.lastResult, session.resultVersion]);

  /** Send a user message to the builder session and apply results. */
  const sendMessage = async (content: string, webSearchOverride = webSearchEnabled, hiddenUserMessage = false) => {
    if (builderBusy) return;

    if (hiddenUserMessage) {
      const userMsg: BuilderMessage = { id: generateId(), role: "user", content: content.trim(), hidden: true };
      builderSessions.setMessages(builderSessionId, [...messages, userMsg]);
    }

    await builderSessions.sendMessage(builderSessionId, content, webSearchOverride, {
      draft,
      worldbookDraft,
      creationPlan,
      personalityPalette,
      mvu,
      statusBars,
    });
  };

  const handleAbort = () => {
    builderSessions.abort(builderSessionId);
  };

  /** Handle a choice selection from the choice panel. */
  const handleChoice = (value: string, choice?: ChoiceInputPanelChoice) => {
    const shouldEnableSearch = /联网|搜索|查资料|真实资料/.test(`${choice?.label ?? ""} ${value}`);
    if (shouldEnableSearch) setWebSearchEnabled(true);
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.choices?.length || latestMessage?.questions?.length)
      setDismissedChoiceMessageId(latestMessage.id);
    void sendMessage(value, shouldEnableSearch ? true : webSearchEnabled, true);
  };

  const { handleSave } = useBuilderSave({
    draft,
    worldbookDraft,
    statusBars,
    savedCharacterId,
    targetId,
    setSaving,
    setTargetId,
    setSavedCharacterId,
    loadCharacters,
    createCharacter,
    updateCharacter,
  });

  const { handleExport } = useBuilderExport({
    draft,
    worldbookDraft,
    statusBars,
    personalityPalette,
    creationPlan,
    mvu,
    lastResult,
  });

  /** Trigger an AI evaluation of the current draft. */
  const handleEvaluate = () => {
    void sendMessage(t("evaluatePrompt"));
  };

  const allToolEvents = messages.flatMap((message) => message.toolEvents ?? []);
  const hasUserMessage = messages.some((message) => message.role === "user");
  const hasOptionPrompt = allToolEvents.some((event) => event.name === "ask_user_options" && event.status === "done");
  const hasCreationPlan = allToolEvents.some(
    (event) => event.name === "present_creation_plan" && event.status === "done",
  );
  const hasWebSearch = allToolEvents.some((event) => event.name === "web_search" && event.status === "done");
  const hasSavedDraftTool = allToolEvents.some(
    (event) => event.name === "save_character_draft" && event.status === "done",
  );
  const planEntries = creationPlan?.entries ?? [];
  const completedPlanEntries = planEntries.filter(
    (entry) => entry.status === "done" || entry.status === "skipped",
  ).length;
  const latestBuilderMessage = messages[messages.length - 1];
  const activeChoiceMessage: BuilderMessage | null =
    latestBuilderMessage?.role === "assistant" &&
    !latestBuilderMessage.pending &&
    (!!latestBuilderMessage.choices?.length || !!latestBuilderMessage.questions?.length) &&
    dismissedChoiceMessageId !== latestBuilderMessage.id
      ? latestBuilderMessage
      : null;
  const activeChoicePanelQuestions: ChoiceInputPanelQuestion[] = activeChoiceMessage?.questions?.length
    ? activeChoiceMessage.questions.map((question, index) => ({
        id: question.id || `question_${index + 1}`,
        title: question.question,
        description: question.reason,
        choices: question.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          value: choice.value,
          description: choice.description,
        })),
      }))
    : activeChoiceMessage?.choices?.length
      ? [
          {
            id: "question_1",
            title: getChoicePanelTitle(activeChoiceMessage.content),
            choices: activeChoiceMessage.choices.map((choice) => ({
              id: choice.id,
              label: choice.label,
              value: choice.value,
              description: choice.description,
            })),
          },
        ]
      : [];
  const steps = [
    { label: t("steps.gatherDirection"), done: hasUserMessage, active: builderBusy && !hasUserMessage },
    {
      label: t("steps.alignPlan"),
      done: !!creationPlan || hasOptionPrompt || hasCreationPlan || !!draft,
      active: builderBusy && hasUserMessage && !creationPlan && !draft,
    },
    {
      label: t("steps.searchReference"),
      done: hasWebSearch,
      active: builderBusy && webSearchEnabled && !hasWebSearch,
      optional: true,
    },
    {
      label: t("steps.generateEntries"),
      done: planEntries.length ? completedPlanEntries === planEntries.length : !!draft || hasSavedDraftTool,
      active: builderBusy && (!!creationPlan || hasUserMessage) && !draft,
    },
    { label: t("steps.generateCharacter"), done: !!draft || hasSavedDraftTool, active: builderBusy && !draft },
    { label: t("steps.saveToWhalePlay"), done: !!savedCharacterId, active: saving },
  ];

  return (
    // 标题和顶栏
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/character")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("backToCharacters")}
            </Button>
          </div>
        </div>
      </div>

      {/*主体内容*/}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px]">
        {/*工作区列表*/}
        <BuilderWorkspaceList
          records={workspaceRecords}
          activeWorkspaceId={builderSessionId}
          disabled={builderBusy || saving}
          onNew={handleNewWorkspace}
          onSelect={handleSelectWorkspace}
          onDelete={handleDeleteWorkspace}
        />

        {/*消息显示和选择区*/}
        <section className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
          <div
            ref={builderScrollRef}
            onScroll={handleBuilderScroll}
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5"
            style={{ overflowAnchor: "none" }}
          >
            <div className="mx-auto w-full max-w-4xl min-w-0" style={{ overflowAnchor: "none" }}>
              {visibleMessages.map((message) => (
                <div key={message.id} className="pb-5" style={{ overflowAnchor: "none" }}>
                  <BuilderChatMessage message={message} creationPlan={creationPlan} />
                </div>
              ))}
              <div ref={builderBottomRef} aria-hidden="true" />
            </div>
          </div>

          {builderError && (
            <div className="bg-destructive/10 text-destructive mx-5 mb-3 rounded-md p-3 text-sm">{builderError}</div>
          )}

          <div className="bg-card shrink-0 border-t p-4">
            <div className="mx-auto w-full max-w-4xl min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={webSearchEnabled ? "default" : "outline"}
                  onClick={() => setWebSearchEnabled((value) => !value)}
                  disabled={builderBusy}
                >
                  <Globe2 className="mr-1 h-3.5 w-3.5" />
                  {t("chat.webSearch")}
                </Button>
                {lastResult?.draft && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("chat.draftReady")}
                  </span>
                )}
                {running ? (
                  <Button type="button" size="sm" variant="outline" onClick={handleAbort}>
                    <StopCircle className="mr-1 h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : null}
              </div>
              {activeChoiceMessage && activeChoicePanelQuestions.length > 0 ? (
                <div className="mb-3">
                  <ChoiceInputPanel
                    key={activeChoiceMessage.id}
                    title={getChoicePanelTitle(activeChoiceMessage.content)}
                    questions={activeChoicePanelQuestions}
                    disabled={builderBusy || saving}
                    onSubmit={handleChoice}
                    onCancel={() => setDismissedChoiceMessageId(activeChoiceMessage.id)}
                  />
                </div>
              ) : null}
              {!activeChoiceMessage ? (
                <div className="flex min-w-0 items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
                    onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage(input);
                      }
                    }}
                    placeholder={t("chat.placeholder")}
                    rows={3}
                    disabled={builderBusy || saving}
                    className="min-w-0 flex-1 resize-none"
                  />
                  {builderBusy ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={gen.abort}
                    >
                      <StopCircle className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => sendMessage(input)}
                      disabled={saving || !input.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/*进度显示和产出区*/}
        <div className="hidden xl:contents">
          <ArtifactsPanel
            creationPlan={creationPlan}
            personalityPalette={personalityPalette}
            evaluationReport={evaluationReport}
            draft={draft}
            worldbookDraft={worldbookDraft}
            statusBars={statusBars}
            setArtifactView={setArtifactView}
            steps={steps}
            savedCharacterId={savedCharacterId}
            saving={saving}
            running={builderBusy}
            onSave={handleSave}
            onExport={handleExport}
            onEvaluate={handleEvaluate}
            t={t}
          />
        </div>
      </div>

      {/*独立弹窗*/}
      <PlanDialog
        open={artifactView === "plan"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        creationPlan={creationPlan}
        t={t}
      />
      <PaletteDialog
        open={artifactView === "palette"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        personalityPalette={personalityPalette}
        t={t}
      />
      <StatusBarsDialog
        open={artifactView === "statusBars"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        statusBars={statusBars}
      />
      <EvaluationDialog
        open={artifactView === "evaluation"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        evaluationReport={evaluationReport}
        t={t}
      />
      <CharacterDialog
        open={artifactView === "character"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        draft={draft}
        t={t}
      />
      <WorldbookDialog
        open={artifactView === "worldbook"}
        onOpenChange={(open) => {
          if (!open) setArtifactView(null);
        }}
        worldbookDraft={worldbookDraft}
        t={t}
      />
    </div>
  );
}
