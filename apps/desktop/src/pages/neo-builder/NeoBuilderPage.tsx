import { startTransition, useEffect, useLayoutEffect, useState, useRef } from "react";
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
import { builderSessions, useBuilderSession } from "@/features/character/builder-session.store";
import { recordUsageCostAndWarn } from "@/features/billing/usage-cost";
import { exportPackToFolder, type CharacterCardPack } from "@/features/character/neo-character-builder";
import { deleteWorkspaceDir } from "@/features/character/builder/workspace-files";
import { toast } from "@/utils/toast";
import { useCharacterStore } from "@/features/character/character.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";

import { BuilderWorkspaceList } from "./WorkspaceList";
import { BuilderChatMessage } from "./ChatMessage";
import { ArtifactsPanel } from "./ArtifactsPanel";

import type {
  BuilderMessage,
  BuilderTarget,
  BuilderWorkspaceRecord,
  BuilderWorkspaceSnapshot,
  WorldbookDraft,
  ArtifactView,
} from "./types";
import type { Character, CreateCharacterInput, Worldbook } from "./types";
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
  formatCharacterUpdatedAt,
} from "./utils";

export function NeoBuilderPage() {
  const { t } = useTranslation("neo-builder");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const { loadCharacters, createCharacter, updateCharacter } = useCharacterStore();
  const [initialSnapshot] = useState(() => readInitialBuilderSnapshot());
  const [targetId, setTargetId] = useState<BuilderTarget>(() => initialSnapshot?.targetId ?? NEW_TARGET);
  const [builderSessionId, setBuilderSessionId] = useState(() => initialSnapshot?.builderSessionId ?? generateId());
  const session = useBuilderSession(builderSessionId);
  const { messages, running, error } = session;
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
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (initialSnapshot?.messages?.length) {
      builderSessions.restore(builderSessionId, initialSnapshot.messages);
    }
  }, [builderSessionId, initialSnapshot]);

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
    builderSessions.restore(record.builderSessionId, normalizeRestoredMessages(record.messages));
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
    if (hiddenUserMessage) {
      // Hidden user messages bypass the store — they're added locally for context
      const userMsg: BuilderMessage = { id: generateId(), role: "user", content: content.trim(), hidden: true };
      builderSessions.setMessages(builderSessionId, [...messages, userMsg]);
    }
    const result = await builderSessions.sendMessage(builderSessionId, content, webSearchOverride, {
      draft,
      worldbookDraft,
      creationPlan,
      personalityPalette,
      mvu,
      statusBars,
    });
    if (!result) return;
    setLastResult(result);
    applyDraftFromResult(result);
    void recordUsageCostAndWarn(result.usage);
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
    const sameName = (await characterRepository.list(true)).filter(
      (character) => character.name.trim() === normalizedName,
    );
    return sameName.length === 1 ? sameName[0].id : null;
  };

  const handleSave = async () => {
    if (!draft?.name.trim()) return;

    setSaving(true);
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

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px]">
        <BuilderWorkspaceList
          records={workspaceRecords}
          activeWorkspaceId={builderSessionId}
          disabled={running || saving}
          onNew={handleNewWorkspace}
          onSelect={handleSelectWorkspace}
          onDelete={handleDeleteWorkspace}
        />

        <section className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border">
          <VirtualList
            virtualizer={builderVirtualizer}
            containerRef={builderScrollRef}
            onScroll={handleBuilderScroll}
            containerClassName="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5"
            renderItem={(index) => {
              const message = visibleMessages[index];
              if (!message) return null;
              return (
                <div className="mx-auto w-full max-w-4xl min-w-0 pb-5">
                  <BuilderChatMessage message={message} creationPlan={creationPlan} />
                </div>
              );
            }}
          />

          {error && <div className="bg-destructive/10 text-destructive mx-5 mb-3 rounded-md p-3 text-sm">{error}</div>}

          <div className="bg-card shrink-0 border-t p-4">
            <div className="mx-auto w-full max-w-4xl min-w-0">
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
              <div className="bg-background text-muted-foreground grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-3">
                <span>项目：{creationPlan.project.name}</span>
                <span>条目：{creationPlan.entries.length}</span>
                <span>更新：{formatCharacterUpdatedAt(creationPlan.updatedAt)}</span>
              </div>
              <pre className="bg-muted/30 max-h-[58vh] overflow-auto rounded-md border p-4 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
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
                <section className="bg-background rounded-md border p-3">
                  <h3 className="text-muted-foreground text-xs font-semibold">底色</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.base || "-"}</p>
                </section>
                <section className="bg-background rounded-md border p-3">
                  <h3 className="text-muted-foreground text-xs font-semibold">主色调</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.main.join("、") || "-"}</p>
                </section>
                <section className="bg-background rounded-md border p-3">
                  <h3 className="text-muted-foreground text-xs font-semibold">点缀</h3>
                  <p className="mt-2 wrap-break-word">{personalityPalette.accents.join("、") || "-"}</p>
                </section>
              </div>
              {personalityPalette.derivatives.map((derivative) => (
                <section key={derivative.color} className="bg-background rounded-md border p-4">
                  <h3 className="mb-2 text-sm font-semibold">{derivative.color}衍生</h3>
                  <div className="space-y-2">
                    {derivative.items.map((item, index) => (
                      <p
                        key={`${derivative.color}-${index}`}
                        className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap"
                      >
                        {index + 1}. {item}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
              {personalityPalette.futureDerivatives?.length ? (
                <section className="bg-background rounded-md border p-4">
                  <h3 className="mb-2 text-sm font-semibold">未来衍生</h3>
                  <div className="space-y-2">
                    {personalityPalette.futureDerivatives.map((item, index) => (
                      <p
                        key={`${item}-${index}`}
                        className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
              {personalityPalette.compiledText ? (
                <section>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Compiled Personality</h3>
                  <p className="bg-muted/30 rounded-md border p-3 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
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
                  <section key={bar.id} className="bg-background rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold break-words">{bar.label}</h3>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {bar.assetId} · {bar.id}
                        </p>
                      </div>
                      <span className="bg-muted shrink-0 rounded px-2 py-1 text-xs">
                        {bar.value ?? "-"} / {bar.max}
                      </span>
                    </div>
                    {bar.description ? (
                      <p className="text-muted-foreground mt-3 text-xs wrap-break-word whitespace-pre-wrap">
                        {bar.description}
                      </p>
                    ) : null}
                  </section>
                ))}
              </div>
              <pre className="bg-muted/30 max-h-[38vh] overflow-auto rounded-md border p-4 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
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
              <section className="bg-background rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold">摘要</h3>
                <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{evaluationReport.summary}</p>
                {typeof evaluationReport.score === "number" ? (
                  <p className="text-muted-foreground mt-2 text-xs">Score {evaluationReport.score}/100</p>
                ) : null}
              </section>
              <section className="bg-background rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold">问题</h3>
                {evaluationReport.issues.length ? (
                  <div className="space-y-2">
                    {evaluationReport.issues.map((issue, index) => (
                      <div key={`${issue.target}-${index}`} className="bg-muted/20 rounded-md border p-3">
                        <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <span>{issue.severity}</span>
                          <span>{issue.target}</span>
                        </div>
                        <p className="wrap-break-word whitespace-pre-wrap">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无问题</p>
                )}
              </section>
              <section className="bg-background rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold">修改建议</h3>
                <div className="space-y-2">
                  {evaluationReport.suggestions.map((item, index) => (
                    <p key={`${item}-${index}`} className="wrap-break-word whitespace-pre-wrap">
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
                    <span key={tag} className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Description</h3>
                <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.description || "-"}</p>
              </section>
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Personality</h3>
                <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.personality || "-"}</p>
              </section>
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Scenario</h3>
                <p className="leading-relaxed wrap-break-word whitespace-pre-wrap">{draft.scenario || "-"}</p>
              </section>
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">First Message</h3>
                <p className="bg-muted/30 rounded-md border p-3 leading-relaxed wrap-break-word whitespace-pre-wrap">
                  {draft.firstMessage || "-"}
                </p>
              </section>
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Example Dialogues</h3>
                <p className="bg-background rounded-md border p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
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
                <section key={`${entry.title}-${index}`} className="bg-background rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold wrap-break-word">{entry.title}</h3>
                    <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                      <span className="bg-muted rounded px-2 py-1">{entry.type}</span>
                      <span className="bg-muted rounded px-2 py-1">{entry.position || "afterHistory"}</span>
                      <span className="bg-muted rounded px-2 py-1">priority {entry.priority}</span>
                      <span className="bg-muted rounded px-2 py-1">{entry.triggerMode}</span>
                    </div>
                  </div>
                  {entry.keys ? (
                    <p className="text-muted-foreground mt-3 text-xs wrap-break-word">Keys: {entry.keys}</p>
                  ) : null}
                  {entry.secondaryKeys ? (
                    <p className="text-muted-foreground mt-1 text-xs wrap-break-word">
                      Secondary: {entry.secondaryKeys}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{entry.content}</p>
                </section>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
