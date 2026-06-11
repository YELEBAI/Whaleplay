import { startTransition, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowLeft, CheckCircle2, Globe2, Send } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from "@neo-tavern/ui";
import { useVirtualList, VirtualList } from "@/components";
import { generateId } from "@neo-tavern/shared";
import {
  ChoiceInputPanel,
  type ChoiceInputPanelChoice,
  type ChoiceInputPanelQuestion,
} from "@/components/ChoiceInputPanel";
import { characterRepository, worldbookRepository } from "@/db/repositories";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { runNeoCharacterBuilderTurn } from "@/features/character/neo-character-builder";
import { exportPackToFolder, type CharacterCardPack } from "@/features/character/neo-character-builder";
import { deleteWorkspaceDir } from "@/features/character/builder/workspace-files";
import { searchWeb } from "@/features/character/web-search";
import { toast } from "@/utils/toast";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";

import { BuilderWorkspaceList } from "./neo-builder/WorkspaceList";
import { BuilderChatMessage } from "./neo-builder/ChatMessage";
import { ArtifactsPanel } from "./neo-builder/ArtifactsPanel";

import type {
  BuilderMessage,
  BuilderTarget,
  BuilderWorkspaceRecord,
  BuilderWorkspaceSnapshot,
  WorldbookDraft,
  ArtifactView,
} from "./neo-builder/types";
import type { Character, CreateCharacterInput, Worldbook } from "./neo-builder/types";
import type {
  NeoBuilderEvaluationReport,
  NeoBuilderTurnResult,
  NeoCreationPlan,
  NeoPersonalityPalette,
  NeoMvuConfig,
  NeoStatusBarConfig,
} from "./neo-builder/types";

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
  applyEntryProgressEvent,
  shouldRunBuilderTurnInBackground,
  getBackgroundResultContent,
  toConversation,
  upsertToolEvent,
  getChoicePanelTitle,
  formatCharacterUpdatedAt,
} from "./neo-builder/utils";

export function NeoBuilderPage() {
  const { t } = useTranslation("neo-builder");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const { loadCharacters, createCharacter, updateCharacter } = useCharacterStore();
  const [initialSnapshot] = useState(() => readInitialBuilderSnapshot());
  const [targetId, setTargetId] = useState<BuilderTarget>(() => initialSnapshot?.targetId ?? NEW_TARGET);
  const [messages, setMessages] = useState<BuilderMessage[]>(() => initialSnapshot?.messages ?? initialMessages());
  const [input, setInput] = useState(() => initialSnapshot?.input ?? "");
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => initialSnapshot?.webSearchEnabled ?? false);
  const [error, setError] = useState<string | null>(null);
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
  const [builderSessionId, setBuilderSessionId] = useState(() => initialSnapshot?.builderSessionId ?? generateId());
  const visibleMessages = messages.filter((message) => !message.hidden);

  const {
    virtualizer: builderVirtualizer,
    containerRef: builderScrollRef,
    isNearBottomRef,
    handleScroll: handleBuilderScroll,
    scrollToIndex: builderScrollToIndex,
  } = useVirtualList({
    count: visibleMessages.length,
    getItemKey: (index) => visibleMessages[index]?.id ?? `msg-${index}`,
    estimateSize: () => 240,
    overscan: 6,
  });

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useLayoutEffect(() => {
    if (visibleMessages.length === 0) return;
    if (isNearBottomRef.current) {
      builderScrollToIndex(visibleMessages.length - 1);
    }
    // isNearBottomRef is a ref — intentionally excluded from deps
  }, [visibleMessages.length, builderScrollToIndex, isNearBottomRef]);

  useLayoutEffect(() => {
    builderScrollToIndex(Math.max(0, visibleMessages.length - 1));
  }, [builderSessionId, builderScrollToIndex, visibleMessages.length]);

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
    setBuilderSessionId(generateId());
    setMessages(initialMessages());
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
    setError(null);
    setInput("");
  };

  const handleNewWorkspace = () => {
    resetWorkspace();
  };

  const handleSelectWorkspace = (record: BuilderWorkspaceRecord) => {
    setTargetId(record.targetId);
    setBuilderSessionId(record.builderSessionId);
    setMessages(normalizeRestoredMessages(record.messages));
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
    setError(null);
  };

  const handleDeleteWorkspace = (record: BuilderWorkspaceRecord) => {
    setWorkspaceRecords((records) => records.filter((item) => item.id !== record.id));
    deleteWorkspaceDir(record.builderSessionId).catch(() => {});
    if (record.id === builderSessionId) resetWorkspace();
  };

  const applyDraftFromResult = (result: NeoBuilderTurnResult) => {
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
  };

  const sendMessage = async (content: string, webSearchOverride = webSearchEnabled, hiddenUserMessage = false) => {
    const clean = content.trim();
    if (!clean || running) return;

    const config = useSettingsStore.getState().modelConfig;
    if (!config) {
      const message = tt("noApiConfig");
      setError(message);
      toast("error", message);
      return;
    }

    const userMessage: BuilderMessage = { id: generateId(), role: "user", content: clean, hidden: hiddenUserMessage };
    const assistantId = generateId();
    const backgroundCreation = shouldRunBuilderTurnInBackground(clean, creationPlan, draft, hiddenUserMessage);
    const assistantMessage: BuilderMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      backgroundCreation,
      startedAt: Date.now(),
    };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setInput("");
    setRunning(true);
    setError(null);

    try {
      const result = await runNeoCharacterBuilderTurn({
        conversation: toConversation(nextMessages),
        existingCharacter: null,
        currentDraft: draft,
        currentWorldbookEntries: worldbookDraft?.entries ?? [],
        creationPlan,
        personalityPalette,
        currentMvu: mvu,
        currentStatusBars: statusBars,
        modelConfig: config,
        scopeId: builderSessionId,
        webSearchEnabled: webSearchOverride,
        searchWeb,
        onContentDelta: (delta) => {
          if (backgroundCreation) return;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content: `${message.content}${delta}` } : message,
            ),
          );
        },
        onReasoningDelta: (delta) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, reasoningContent: `${message.reasoningContent ?? ""}${delta}` }
                : message,
            ),
          );
        },
        onToolEvent: (event) => {
          if (event.name === "record_entry_output") {
            setCreationPlan((prev) => applyEntryProgressEvent(prev, event));
          }
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, toolEvents: upsertToolEvent(message.toolEvents, event) }
                : message,
            ),
          );
        },
      });

      setLastResult(result);
      applyDraftFromResult(result);
      void recordUsageCostAndWarn(result.usage);
      const keepBackgroundCreation = backgroundCreation && !result.choices?.length && !result.questions?.length;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: keepBackgroundCreation ? getBackgroundResultContent(result) : result.content,
                choices: result.choices,
                questions: result.questions,
                backgroundCreation: keepBackgroundCreation,
                reasoningContent: result.reasoningContent,
                toolEvents: result.toolEvents,
                usage: result.usage,
                pending: false,
                completedAt: Date.now(),
              }
            : message,
        ),
      );
    } catch (err) {
      const message = (err as Error).message || tt("builderFailed");
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? { ...item, content: message, backgroundCreation: false, pending: false, completedAt: Date.now() }
            : item,
        ),
      );
      toast("error", message);
    } finally {
      setRunning(false);
    }
  };

  const handleChoice = (value: string, choice?: ChoiceInputPanelChoice) => {
    const shouldEnableSearch = /联网|搜索|查资料|真实资料/.test(`${choice?.label ?? ""} ${value}`);
    if (shouldEnableSearch) setWebSearchEnabled(true);
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.choices?.length || latestMessage?.questions?.length)
      setDismissedChoiceMessageId(latestMessage.id);
    void sendMessage(value, shouldEnableSearch ? true : webSearchEnabled, true);
  };

  const saveWorldbookForCharacter = async (character: Character, nextDraft: WorldbookDraft) => {
    const now = new Date().toISOString();
    const worldbooks = useWorldbookStore.getState().worldbooks;
    const existingWorldbook = character.worldbookId
      ? worldbooks.find((worldbook) => worldbook.id === character.worldbookId)
      : null;
    const worldbookId = existingWorldbook?.id || generateId();
    const worldbook: Worldbook = {
      id: worldbookId,
      name: nextDraft.name || `${character.name} Worldbook`,
      description: nextDraft.description || `Generated by Whale Builder for ${character.name}`,
      entries: nextDraft.entries.map((entry) => ({
        ...entry,
        id: generateId(),
        worldbookId,
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: existingWorldbook?.createdAt || now,
      updatedAt: now,
    };

    const nextWorldbooks = existingWorldbook
      ? worldbooks.map((item) => (item.id === worldbookId ? worldbook : item))
      : [...worldbooks, worldbook];

    await worldbookRepository.save(nextWorldbooks);
    useWorldbookStore.getState().loadWorldbooks();
    useWorldbookStore.getState().setActiveWorldbook(worldbookId);
    return updateCharacter(character.id, { worldbookId });
  };

  const findExistingCharacterIdForSave = async (nextDraft: CreateCharacterInput) => {
    const candidateIds = [savedCharacterId, targetId !== NEW_TARGET ? targetId : null, nextDraft.id]
      .filter((id): id is string => !!id)
      .filter((id, index, array) => array.indexOf(id) === index);

    for (const id of candidateIds) {
      if (await characterRepository.getById(id)) return id;
    }

    const normalizedName = nextDraft.name.trim();
    if (!normalizedName) return null;
    const sameName = (await characterRepository.list(true)).filter((character) => character.name.trim() === normalizedName);
    return sameName.length === 1 ? sameName[0].id : null;
  };

  const handleSave = async () => {
    if (!draft?.name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const nextDraft = { ...draft, statusBars: statusBars ?? draft.statusBars };
      const existingCharacterId = await findExistingCharacterIdForSave(nextDraft);
      let saved = existingCharacterId
        ? await updateCharacter(existingCharacterId, nextDraft)
        : await createCharacter(nextDraft);
      setTargetId(saved.id);

      if (worldbookDraft?.entries.length) {
        saved = await saveWorldbookForCharacter(saved, worldbookDraft);
        setTargetId(saved.id);
      }

      setSavedCharacterId(saved.id);
      await loadCharacters();
      toast("success", tt("saveSuccess", { name: saved.name }));
    } catch (err) {
      const message = (err as Error).message || tt("saveFailed");
      setError(message);
      toast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!draft?.name.trim()) return;
    const pack: CharacterCardPack = {
      project: {
        name: draft.name,
        worldbookName: worldbookDraft?.name,
        form: "charactercard",
        mvu: !!mvu,
      },
      character: {
        name: draft.name,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        firstMessage: draft.firstMessage,
        exampleDialogues: draft.exampleDialogues,
        tags: draft.tags,
        statusBars: statusBars ?? draft.statusBars,
      },
      personalityPalette: personalityPalette ?? undefined,
      worldbook: worldbookDraft?.entries.length
        ? {
            name: worldbookDraft.name,
            description: worldbookDraft.description,
            entries: worldbookDraft.entries.map((e) => ({
              ...e,
              position: e.position ?? (e.type === "always" ? "beforeHistory" : "afterHistory"),
              role: e.role ?? "system",
            })),
          }
        : undefined,
      mvu: mvu ?? lastResult?.mvu ?? undefined,
      statusBars: statusBars ?? draft.statusBars ?? undefined,
      creationPlan: creationPlan ?? undefined,
    };

    try {
      const folder = await exportPackToFolder(pack);
      if (folder) toast("success", t("export.success", { folder: folder }));
    } catch (err) {
      toast("error", (err as Error).message || t("export.failed"));
    }
  };

  const handleEvaluate = () => {
    void sendMessage(
      "请评估当前 Whale Builder 草稿，检查角色卡、性格调色盘、世界书条目、创作规划.yaml 是否完整，并给出可执行修改建议。",
    );
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
    { label: t("steps.gatherDirection"), done: hasUserMessage, active: running && !hasUserMessage },
    {
      label: t("steps.alignPlan"),
      done: !!creationPlan || hasOptionPrompt || hasCreationPlan || !!draft,
      active: running && hasUserMessage && !creationPlan && !draft,
    },
    {
      label: t("steps.searchReference"),
      done: hasWebSearch,
      active: running && webSearchEnabled && !hasWebSearch,
      optional: true,
    },
    {
      label: t("steps.generateEntries"),
      done: planEntries.length ? completedPlanEntries === planEntries.length : !!draft || hasSavedDraftTool,
      active: running && (!!creationPlan || hasUserMessage) && !draft,
    },
    { label: t("steps.generateCharacter"), done: !!draft || hasSavedDraftTool, active: running && !draft },
    { label: t("steps.saveToWhalePlay"), done: !!savedCharacterId, active: saving },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/character")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("backToCharacters")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px] gap-4 p-4 flex-1 overflow-hidden">
        <BuilderWorkspaceList
          records={workspaceRecords}
          activeWorkspaceId={builderSessionId}
          disabled={running || saving}
          onNew={handleNewWorkspace}
          onSelect={handleSelectWorkspace}
          onDelete={handleDeleteWorkspace}
        />

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
          <VirtualList
            virtualizer={builderVirtualizer}
            containerRef={builderScrollRef}
            onScroll={handleBuilderScroll}
            containerClassName="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5"
            renderItem={(index) => {
              const message = visibleMessages[index];
              if (!message) return null;
              return (
                <div className="mx-auto w-full min-w-0 max-w-4xl pb-5">
                  <BuilderChatMessage message={message} creationPlan={creationPlan} />
                </div>
              );
            }}
          />

          {error && <div className="mx-5 mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <div className="shrink-0 border-t bg-card p-4">
            <div className="mx-auto w-full min-w-0 max-w-4xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={webSearchEnabled ? "default" : "outline"}
                  onClick={() => setWebSearchEnabled((value) => !value)}
                  disabled={running}
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
              </div>
              {activeChoiceMessage && activeChoicePanelQuestions.length > 0 ? (
                <div className="mb-3">
                  <ChoiceInputPanel
                    key={activeChoiceMessage.id}
                    title={getChoicePanelTitle(activeChoiceMessage.content)}
                    questions={activeChoicePanelQuestions}
                    disabled={running || saving}
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
                    disabled={running || saving}
                    className="min-w-0 flex-1 resize-none"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => sendMessage(input)}
                    disabled={running || saving || !input.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

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
            running={running}
            onSave={handleSave}
            onExport={handleExport}
            onEvaluate={handleEvaluate}
            t={t}
          />
        </div>
      </div>

      <Dialog
        open={artifactView === "plan"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.creationPlan.title")}</DialogTitle>
            <DialogDescription>{t("dialogs.creationPlan.description")}</DialogDescription>
          </DialogHeader>
          {creationPlan ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
                <span>项目：{creationPlan.project.name}</span>
                <span>条目：{creationPlan.entries.length}</span>
                <span>更新：{formatCharacterUpdatedAt(creationPlan.updatedAt)}</span>
              </div>
              <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {creationPlan.yaml}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "palette"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.palette.title")}</DialogTitle>
            <DialogDescription>{t("dialogs.palette.description")}</DialogDescription>
          </DialogHeader>
          {personalityPalette ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">底色</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.base || "-"}</p>
                </section>
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">主色调</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.main.join("、") || "-"}</p>
                </section>
                <section className="rounded-md border bg-background p-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">点缀</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.accents.join("、") || "-"}</p>
                </section>
              </div>
              {personalityPalette.derivatives.map((derivative) => (
                <section key={derivative.color} className="rounded-md border bg-background p-4">
                  <h3 className="mb-2 text-sm font-semibold">{derivative.color}衍生</h3>
                  <div className="space-y-2">
                    {derivative.items.map((item, index) => (
                      <p
                        key={`${derivative.color}-${index}`}
                        className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed"
                      >
                        {index + 1}. {item}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
              {personalityPalette.futureDerivatives?.length ? (
                <section className="rounded-md border bg-background p-4">
                  <h3 className="mb-2 text-sm font-semibold">未来衍生</h3>
                  <div className="space-y-2">
                    {personalityPalette.futureDerivatives.map((item, index) => (
                      <p key={`${item}-${index}`} className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
              {personalityPalette.compiledText ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Compiled Personality</h3>
                  <p className="whitespace-pre-wrap wrap-break-word rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                    {personalityPalette.compiledText}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "statusBars"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>状态栏</DialogTitle>
            <DialogDescription>Agentic Play 新会话会用这份配置初始化右侧动态状态栏。</DialogDescription>
          </DialogHeader>
          {statusBars?.bars.length ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                {statusBars.bars.map((bar) => (
                  <section key={bar.id} className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold">{bar.label}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {bar.assetId} · {bar.id}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs">
                        {bar.value ?? "-"} / {bar.max}
                      </span>
                    </div>
                    {bar.description ? (
                      <p className="mt-3 whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
                        {bar.description}
                      </p>
                    ) : null}
                  </section>
                ))}
              </div>
              <pre className="max-h-[38vh] overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(statusBars, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "evaluation"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogs.evaluation.title")}</DialogTitle>
            <DialogDescription>{t("dialogs.evaluation.description")}</DialogDescription>
          </DialogHeader>
          {evaluationReport ? (
            <div className="space-y-4 text-sm">
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">摘要</h3>
                <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{evaluationReport.summary}</p>
                {typeof evaluationReport.score === "number" ? (
                  <p className="mt-2 text-xs text-muted-foreground">Score {evaluationReport.score}/100</p>
                ) : null}
              </section>
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">问题</h3>
                {evaluationReport.issues.length ? (
                  <div className="space-y-2">
                    {evaluationReport.issues.map((issue, index) => (
                      <div key={`${issue.target}-${index}`} className="rounded-md border bg-muted/20 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{issue.severity}</span>
                          <span>{issue.target}</span>
                        </div>
                        <p className="whitespace-pre-wrap wrap-break-word">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无问题</p>
                )}
              </section>
              <section className="rounded-md border bg-background p-4">
                <h3 className="mb-2 text-sm font-semibold">修改建议</h3>
                <div className="space-y-2">
                  {evaluationReport.suggestions.map((item, index) => (
                    <p key={`${item}-${index}`} className="whitespace-pre-wrap wrap-break-word">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "character"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.name || t("dialogs.characterCard.defaultTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.characterCard.description")}</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-5 text-sm">
              {draft.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Description</h3>
                <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{draft.description || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Personality</h3>
                <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{draft.personality || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Scenario</h3>
                <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{draft.scenario || "-"}</p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">First Message</h3>
                <p className="whitespace-pre-wrap wrap-break-word rounded-md border bg-muted/30 p-3 leading-relaxed">
                  {draft.firstMessage || "-"}
                </p>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Example Dialogues</h3>
                <p className="whitespace-pre-wrap wrap-break-word rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">
                  {draft.exampleDialogues || "-"}
                </p>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={artifactView === "worldbook"}
        onOpenChange={(open: boolean) => {
          if (!open) setArtifactView(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{worldbookDraft?.name || t("dialogs.worldbook.defaultTitle")}</DialogTitle>
            <DialogDescription>{worldbookDraft?.description || t("dialogs.worldbook.description")}</DialogDescription>
          </DialogHeader>
          {worldbookDraft?.entries.length ? (
            <div className="space-y-4">
              {worldbookDraft.entries.map((entry, index) => (
                <section key={`${entry.title}-${index}`} className="rounded-md border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 wrap-break-word text-sm font-semibold">{entry.title}</h3>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-2 py-1">{entry.type}</span>
                      <span className="rounded bg-muted px-2 py-1">{entry.position || "afterHistory"}</span>
                      <span className="rounded bg-muted px-2 py-1">priority {entry.priority}</span>
                      <span className="rounded bg-muted px-2 py-1">{entry.triggerMode}</span>
                    </div>
                  </div>
                  {entry.keys ? (
                    <p className="mt-3 wrap-break-word text-xs text-muted-foreground">Keys: {entry.keys}</p>
                  ) : null}
                  {entry.secondaryKeys ? (
                    <p className="mt-1 wrap-break-word text-xs text-muted-foreground">Secondary: {entry.secondaryKeys}</p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">{entry.content}</p>
                </section>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
