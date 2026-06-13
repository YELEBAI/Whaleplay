import { startTransition, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CornerDownLeft, MessageSquare, X } from "lucide-react";
import { Button } from "@neo-tavern/ui";

export type ChoiceInputPanelChoice = {
  id: string;
  label: string;
  value: string;
  description?: string;
  meta?: Record<string, unknown>;
};

export type ChoiceInputPanelQuestion = {
  id: string;
  title: string;
  description?: string;
  choices: ChoiceInputPanelChoice[];
};

export type ChoiceInputPanelAnswer = {
  questionId: string;
  questionTitle: string;
  value: string;
  label?: string;
  description?: string;
};

type DraftAnswer = {
  selectedId: string;
  customText: string;
};

export function ChoiceInputPanel({
  title,
  choices,
  questions,
  disabled,
  onSubmit,
  onCancel,
}: {
  title: string;
  choices?: ChoiceInputPanelChoice[];
  questions?: ChoiceInputPanelQuestion[];
  disabled?: boolean;
  onSubmit: (value: string, choice?: ChoiceInputPanelChoice, answers?: ChoiceInputPanelAnswer[]) => void;
  onCancel?: () => void;
}) {
  const panelQuestions: ChoiceInputPanelQuestion[] = questions?.length
    ? questions.filter((question) => question.choices.length > 0)
    : [{ id: "question_1", title, choices: choices ?? [] }];

  const questionsKey = panelQuestions
    .map((question) => `${question.id}:${question.title}:${question.choices.map((choice) => choice.id).join(",")}`)
    .join("\u0000");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const currentQuestion = panelQuestions[Math.min(questionIndex, Math.max(0, panelQuestions.length - 1))];
  const currentDraft = currentQuestion ? draftAnswers[currentQuestion.id] : undefined;
  const selectedId = currentDraft?.selectedId ?? currentQuestion?.choices[0]?.id ?? "custom";
  const customText = currentDraft?.customText ?? "";
  const selectedChoice = currentQuestion?.choices.find((choice) => choice.id === selectedId);
  const isCustom = selectedId === "custom";
  const canSubmit = !disabled && (isCustom ? !!customText.trim() : !!selectedChoice);
  const isLastQuestion = questionIndex >= panelQuestions.length - 1;
  const totalQuestions = Math.max(panelQuestions.length, 1);
  const currentQuestionNumber = Math.min(questionIndex + 1, totalQuestions);

  useEffect(() => {
    startTransition(() => {
      setQuestionIndex(0);
      setDraftAnswers({});
    });
  }, [questionsKey]);

  const setCurrentDraft = (patch: Partial<DraftAnswer>) => {
    if (!currentQuestion) return;
    setDraftAnswers((answers) => {
      const previous = answers[currentQuestion.id] ?? {
        selectedId: currentQuestion.choices[0]?.id ?? "custom",
        customText: "",
      };
      return {
        ...answers,
        [currentQuestion.id]: {
          ...previous,
          ...patch,
        },
      };
    });
  };

  const buildAnswer = (
    question: ChoiceInputPanelQuestion,
    draft: DraftAnswer | undefined,
  ): ChoiceInputPanelAnswer | null => {
    const answerSelectedId = draft?.selectedId ?? question.choices[0]?.id ?? "custom";
    const answerCustomText = draft?.customText ?? "";
    if (answerSelectedId === "custom") {
      const value = answerCustomText.trim();
      if (!value) return null;
      return {
        questionId: question.id,
        questionTitle: question.title,
        value,
      };
    }
    const choice = question.choices.find((item) => item.id === answerSelectedId);
    if (!choice) return null;
    return {
      questionId: question.id,
      questionTitle: question.title,
      value: choice.value,
      label: choice.label,
      description: choice.description,
    };
  };

  const buildAllAnswers = (): ChoiceInputPanelAnswer[] => {
    if (!currentQuestion) return [];
    const nextDraftAnswers: Record<string, DraftAnswer> = {
      ...draftAnswers,
      [currentQuestion.id]: {
        selectedId,
        customText,
      },
    };
    return panelQuestions
      .map((question) => buildAnswer(question, nextDraftAnswers[question.id]))
      .filter((answer): answer is ChoiceInputPanelAnswer => !!answer);
  };

  const formatAnswerSummary = (answers: ChoiceInputPanelAnswer[]): string => {
    if (answers.length === 1) {
      const answer = answers[0];
      return [
        "【选项回答】",
        `问题：${answer.questionTitle}`,
        `选择：${answer.label ?? "自定义输入"}${answer.description ? `（${answer.description}）` : ""}`,
        `具体指令：${answer.value}`,
      ].join("\n");
    }
    return [
      "【本阶段选项汇总】",
      ...answers.map((answer, index) => {
        const picked = answer.label
          ? `${answer.label}${answer.description ? `：${answer.description}` : ""}`
          : answer.value;
        return `${index + 1}. ${answer.questionTitle}\n选择：${picked}\n用于创作的设定：${answer.value}`;
      }),
    ].join("\n\n");
  };

  const submit = () => {
    if (!canSubmit) return;
    if (!isLastQuestion) {
      setCurrentDraft({ selectedId, customText });
      setQuestionIndex((index) => Math.min(index + 1, panelQuestions.length - 1));
      return;
    }
    const answers = buildAllAnswers();
    if (!answers.length) return;
    onSubmit(formatAnswerSummary(answers), answers.length === 1 ? selectedChoice : undefined, answers);
  };

  const submitChoice = (choice: ChoiceInputPanelChoice) => {
    if (disabled || !currentQuestion) return;
    if (panelQuestions.length === 1) {
      const answers = [
        {
          questionId: currentQuestion.id,
          questionTitle: currentQuestion.title,
          value: choice.value,
          label: choice.label,
          description: choice.description,
        },
      ];
      onSubmit(formatAnswerSummary(answers), choice, answers);
      return;
    }
    setCurrentDraft({ selectedId: choice.id, customText });
    if (!isLastQuestion) {
      setQuestionIndex((index) => Math.min(index + 1, panelQuestions.length - 1));
      return;
    }
    const answers = panelQuestions
      .map((question) => {
        const draft =
          question.id === currentQuestion.id ? { selectedId: choice.id, customText } : draftAnswers[question.id];
        return buildAnswer(question, draft);
      })
      .filter((answer): answer is ChoiceInputPanelAnswer => !!answer);
    if (answers.length) onSubmit(formatAnswerSummary(answers), undefined, answers);
  };

  const goPrevious = () => {
    setCurrentDraft({ selectedId, customText });
    setQuestionIndex((index) => Math.max(0, index - 1));
  };

  const goNext = () => {
    submit();
  };

  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-lg border shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-violet-500 text-white">
            <MessageSquare className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="min-w-0 text-sm leading-relaxed font-semibold wrap-break-word">
              {currentQuestion?.title ?? title}
            </h3>
            {currentQuestion?.description ? (
              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{currentQuestion.description}</p>
            ) : null}
          </div>
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded disabled:opacity-40"
            disabled={disabled || questionIndex <= 0}
            onClick={goPrevious}
            aria-label="上一个问题"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center tabular-nums">
            {currentQuestionNumber} of {totalQuestions}
          </span>
          <button
            type="button"
            className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded disabled:opacity-40"
            disabled={disabled || isLastQuestion || !canSubmit}
            onClick={goNext}
            aria-label="下一个问题"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="hover:bg-muted hover:text-foreground ml-1 flex h-7 w-7 items-center justify-center rounded"
            onClick={onCancel}
            aria-label="关闭选项"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {(currentQuestion?.choices ?? []).map((choice) => {
          const selected = selectedId === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              className={`flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${
                selected ? "bg-muted text-foreground" : "bg-muted/45 hover:bg-muted/70"
              }`}
              onClick={() => setCurrentDraft({ selectedId: choice.id })}
              onDoubleClick={() => {
                submitChoice(choice);
              }}
              disabled={disabled}
            >
              <span className="min-w-0 text-sm leading-relaxed wrap-break-word">
                <span className="font-semibold">{choice.label}</span>
                {choice.description ? <span className="text-muted-foreground ml-2">{choice.description}</span> : null}
              </span>
              {selected ? <CornerDownLeft className="text-muted-foreground h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          );
        })}

        <label
          className={`flex min-h-10 min-w-0 items-center gap-3 rounded-md px-3 py-2 ${
            isCustom ? "bg-muted text-foreground" : "bg-muted/45"
          }`}
        >
          <button
            type="button"
            className="shrink-0 text-sm font-semibold"
            onClick={() => setCurrentDraft({ selectedId: "custom" })}
          >
            其他
          </button>
          <input
            value={customText}
            maxLength={500}
            onFocus={() => setCurrentDraft({ selectedId: "custom" })}
            onChange={(event) => {
              setCurrentDraft({ selectedId: "custom", customText: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="请输入"
            disabled={disabled}
            className="placeholder:text-muted-foreground focus:border-foreground min-w-0 flex-1 border-0 border-b bg-transparent px-0 py-1 text-sm outline-none disabled:opacity-60"
          />
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{customText.length}/500</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t px-3 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="button" onClick={submit} disabled={!canSubmit}>
          下一步
        </Button>
      </div>
    </div>
  );
}
