"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  canContinueQuestionnaireStep,
  questionnaireFieldIsVisible,
  questionnaireNextVisibleStepIndex,
  questionnaireResumeState,
  questionnaireStepUsesAutomaticProgression,
  questionnaireStepValidationErrors,
} from "@/domain/rules";
import { intakeStageForStep } from "@/data/questionnaires";
import type {
  QuestionnaireField,
  QuestionnaireResponseValue,
  QuestionnaireSchema,
  QuestionnaireStep,
  RepairIntakeDraft,
  SafetyRule,
} from "@/domain/types";
import { repairScopeServices } from "@/services";
import { readJourneyDraft, writeJourneyDraft, clearJourneyDraft } from "@/domain/journey";
import { IntakeStageProgress } from "./IntakeStageProgress";
import { useLanguage } from "./LanguageContext";

interface QuestionnaireEngineProps {
  schema: QuestionnaireSchema;
  originalReport?: string;
  extractedSymptoms?: string[];
  initialResponses?: RepairIntakeDraft["responses"];
  resumeDraft?: RepairIntakeDraft;
  /** The route-carried journey id for this repair — see domain/journey.ts. */
  journeyId: string;
  onComplete?: (draft: RepairIntakeDraft) => void;
  /**
   * Fired instead of the normal step flow when a safety-triggering answer
   * is given — the parent must stop rendering the questionnaire and show a
   * dedicated safety-exit screen (no "acknowledge and continue" path back
   * into the normal flow). See components/LandlordApp.tsx's SafetyExit.
   */
  onSafetyExit?: (rule: SafetyRule) => void;
}

type SafetyAcknowledgements = Record<string, string>;
const emptyResponses: RepairIntakeDraft["responses"] = {};

const formatSavedTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function valueIsSelected(
  current: QuestionnaireResponseValue | undefined,
  expected: string,
) {
  return current === expected;
}

function valueHasContent(value: QuestionnaireResponseValue | undefined) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some((entry) => Boolean(entry));
  }
  if (typeof value === "boolean") return value;
  return String(value).trim().length > 0;
}

export function QuestionnaireEngine({
  schema,
  originalReport = "",
  extractedSymptoms = [],
  initialResponses = emptyResponses,
  resumeDraft,
  journeyId,
  onComplete,
  onSafetyExit,
}: QuestionnaireEngineProps) {
  const { lang, t } = useLanguage();

  const responseLabel = (
    field: QuestionnaireField,
    value: QuestionnaireResponseValue | undefined,
  ) => {
    if (!valueHasContent(value)) {
      return lang === "zh" ? "未提供" : "Not provided";
    }
    if (field.type === "single_select" && typeof value === "string") {
      return t(field.options?.find((option) => option.value === value)?.label ?? { zh: value, en: value });
    }
    if (typeof value === "boolean") return value ? (lang === "zh" ? "已確認" : "Confirmed") : (lang === "zh" ? "未確認" : "Not confirmed");
    return String(value);
  };

  const stepSummary = (step: QuestionnaireStep, responses: RepairIntakeDraft["responses"]) =>
    step.fields
      .filter((field) => questionnaireFieldIsVisible(field, responses))
      .map((field) => responseLabel(field, responses[field.id]))
      .filter(Boolean)
      .join(" · ");

  const contextualActionLabel = (step: QuestionnaireStep, stepIndex: number, totalSteps: number) => {
    if (stepIndex === totalSteps - 1) {
      return lang === "zh" ? "整理維修簡報" : "Generate repair brief";
    }
    return lang === "zh" ? "繼續" : "Continue";
  };

  const resolvedDraftId = resumeDraft?.id ?? journeyId;
  const initialQuestionnaireState = useMemo(
    () => questionnaireResumeState(schema, resumeDraft, initialResponses),
    [initialResponses, resumeDraft, schema],
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    questionnaireNextVisibleStepIndex(
      schema,
      initialQuestionnaireState.activeIndex,
      initialQuestionnaireState.responses,
    ),
  );
  const [responses, setResponses] = useState<RepairIntakeDraft["responses"]>(
    () => initialQuestionnaireState.responses,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [acknowledgements, setAcknowledgements] = useState<SafetyAcknowledgements>({});
  const [completedStepIds, setCompletedStepIds] = useState<string[]>(() => {
    const resolvedIndex = questionnaireNextVisibleStepIndex(
      schema,
      initialQuestionnaireState.activeIndex,
      initialQuestionnaireState.responses,
    );
    const skipped = schema.steps
      .slice(initialQuestionnaireState.activeIndex, resolvedIndex)
      .map((step) => step.id);
    return [...new Set([...initialQuestionnaireState.completedStepIds, ...skipped])];
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const submitting = useRef(false);

  const currentIndex = editingIndex ?? activeIndex;
  const currentStep = schema.steps[currentIndex];

  const safetyAcknowledgementList = useMemo(
    () =>
      Object.entries(acknowledgements).map(([ruleId, acknowledgedAt]) => ({
        ruleId,
        acknowledged: true,
        acknowledgedAt,
      })),
    [acknowledgements],
  );

  // Restore from journey-scoped storage — only when NOT explicitly resuming
  // a specific draft (resumeDraft already IS the intended starting point,
  // e.g. after a category-change rebuild; restoring on top of it here would
  // risk clobbering it with older persisted content for this journey).
  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      if (resumeDraft) {
        setHydrated(true);
        return;
      }
      const stored = readJourneyDraft(journeyId, schema);
      if (stored) {
        const restoredResponses = { ...initialQuestionnaireState.responses, ...stored.responses };
        const resolvedIndex = questionnaireNextVisibleStepIndex(
          schema,
          Math.min(stored.activeIndex, Math.max(schema.steps.length - 1, 0)),
          restoredResponses,
        );
        setActiveIndex(resolvedIndex);
        setResponses(restoredResponses);
        setAcknowledgements(stored.acknowledgements);
        setCompletedStepIds([...new Set(stored.completedStepIds)]);
        setSavedAt("restored");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, schema.category, schema.version]);

  useEffect(() => {
    if (!hydrated || completed) return;
    const saveTimer = window.setTimeout(() => {
      setSaveError(false);
      const draft: RepairIntakeDraft = {
        id: resolvedDraftId,
        category: schema.category,
        originalReport,
        extractedSymptoms,
        responses,
        safetyAcknowledgements: safetyAcknowledgementList,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      writeJourneyDraft({
        journeyId,
        category: schema.category,
        schemaVersion: schema.version,
        activeIndex,
        responses,
        acknowledgements,
        completedStepIds,
      });
      // Remote saveDraft is attempted best-effort only; its adapter stub
      // throws synchronously when unavailable (not a rejected promise), so
      // this must be a try/catch, not a .then/.catch chain.
      (async () => {
        try {
          await repairScopeServices.questionnaire.saveDraft(draft);
          setSavedAt(formatSavedTime());
        } catch {
          setSaveError(true);
        }
      })();
    }, 220);
    return () => window.clearTimeout(saveTimer);
  }, [
    acknowledgements,
    activeIndex,
    completed,
    completedStepIds,
    extractedSymptoms,
    hydrated,
    journeyId,
    originalReport,
    resolvedDraftId,
    responses,
    safetyAcknowledgementList,
    schema,
  ]);

  const activeSafetyRule = useMemo(() => {
    for (const field of currentStep.fields) {
      if (!field.safetyRule) continue;
      const response = responses[field.id];
      if (typeof response === "string" && field.safetyRule.triggerValues.includes(response)) {
        return field.safetyRule;
      }
    }
    return undefined;
  }, [currentStep.fields, responses]);

  // A safety-triggering answer is a full-screen exit, not an inline
  // "acknowledge and continue" card — the parent takes over rendering.
  useEffect(() => {
    if (activeSafetyRule) onSafetyExit?.(activeSafetyRule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSafetyRule]);

  const focusStep = (index: number) => {
    window.requestAnimationFrame(() => {
      const step = schema.steps[index];
      const section = step ? sectionRefs.current[step.id] : null;
      if (!section) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      section.querySelector<HTMLElement>("[data-question-heading]")?.focus({ preventScroll: true });
    });
  };

  const revealStep = (index: number) => {
    const resolvedIndex = questionnaireNextVisibleStepIndex(schema, index, responses);
    const step = schema.steps[resolvedIndex];
    if (!step) return;
    if (resolvedIndex > index) {
      const skipped = schema.steps.slice(index, resolvedIndex);
      setCompletedStepIds((current) => [...new Set([...current, ...skipped.map((s) => s.id)])]);
    }
    setActiveIndex(resolvedIndex);
    setAnnouncement(`${lang === "zh" ? "下一題" : "Next question"}: ${t(step.title)}`);
    focusStep(resolvedIndex);
  };

  const markStepComplete = (stepId: string) => {
    setCompletedStepIds((current) => (current.includes(stepId) ? current : [...current, stepId]));
  };

  const advanceFrom = (stepIndex: number) => {
    const step = schema.steps[stepIndex];
    markStepComplete(step.id);
    setErrors({});
    if (editingIndex === stepIndex) {
      setEditingIndex(null);
      focusStep(activeIndex);
      return;
    }
    if (stepIndex < schema.steps.length - 1) {
      revealStep(stepIndex + 1);
    }
  };

  const changeResponse = (stepIndex: number, fieldId: string, value: QuestionnaireResponseValue) => {
    const step = schema.steps[stepIndex];
    const nextResponses = { ...responses, [fieldId]: value };
    for (const dependentField of step.fields) {
      if (!questionnaireFieldIsVisible(dependentField, nextResponses)) {
        delete nextResponses[dependentField.id];
      }
    }
    setResponses(nextResponses);
    setErrors((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });

    if (
      questionnaireStepUsesAutomaticProgression(step) &&
      canContinueQuestionnaireStep(schema, stepIndex, nextResponses, false)
    ) {
      window.setTimeout(() => advanceFrom(stepIndex), 120);
    }
  };

  const continueFlow = async () => {
    if (submitting.current || busy || activeSafetyRule) return;
    const validationErrors = questionnaireStepValidationErrors(schema, currentIndex, responses);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!canContinueQuestionnaireStep(schema, currentIndex, responses, true)) return;

    if (editingIndex !== null) {
      advanceFrom(currentIndex);
      return;
    }
    if (currentIndex < schema.steps.length - 1) {
      advanceFrom(currentIndex);
      return;
    }

    submitting.current = true;
    setBusy(true);
    markStepComplete(currentStep.id);
    const draft: RepairIntakeDraft = {
      id: resolvedDraftId,
      category: schema.category,
      originalReport,
      extractedSymptoms,
      responses,
      safetyAcknowledgements: safetyAcknowledgementList,
      status: "brief_ready",
      updatedAt: new Date().toISOString(),
    };
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setBusy(false);
    setCompleted(true);
    clearJourneyDraft(journeyId);
    onComplete?.(draft);
  };

  const openPreviousStep = (stepIndex: number) => {
    setEditingIndex(stepIndex);
    setErrors({});
    focusStep(stepIndex);
  };

  if (completed && !onComplete) {
    return (
      <section className="guided-panel guided-panel--complete">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">{lang === "zh" ? "草稿已儲存" : "Draft saved"}</p>
        <h1>{lang === "zh" ? "你嘅答案已可以整理簡報" : "Your answers are ready for brief review"}</h1>
        <p>
          {lang === "zh"
            ? "未有師傅收到任何資料。下一步係核對已知事實、未知情況同證據。"
            : "No contractor has received anything yet. The next step is to check the reported facts, unknowns and evidence."}
        </p>
        <Link className="button" href={`/landlord/repairs/${resolvedDraftId}/brief`}>
          {lang === "zh" ? "檢視維修簡報" : "Review contractor brief"}
        </Link>
      </section>
    );
  }

  return (
    <section className="progressive-questionnaire" aria-label={`${t(schema.label)} questions`}>
      <IntakeStageProgress activeStage={intakeStageForStep(currentStep.id)} />
      <div className="questionnaire-toolbar">
        <div>
          <span className="questionnaire-toolbar__label">{lang === "zh" ? "新維修個案" : "New repair"}</span>
          <strong>{t(schema.shortLabel)}</strong>
        </div>
        <div className="questionnaire-toolbar__status">
          <span className="save-status">
            <span className="save-status__dot" aria-hidden="true" />
            {saveError
              ? (lang === "zh" ? "已喺呢部裝置儲存" : "Saved on this device")
              : savedAt === "restored"
                ? (lang === "zh" ? "已還原草稿" : "Draft restored")
                : savedAt
                  ? `${lang === "zh" ? "已儲存" : "Saved"} ${savedAt}`
                  : (lang === "zh" ? "自動儲存中" : "Saving automatically")}
          </span>
        </div>
      </div>

      <form
        className="question-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void continueFlow();
        }}
        noValidate
      >
        {schema.steps.slice(0, activeIndex + 1).map((step, stepIndex) => {
          const isCurrent = stepIndex === currentIndex;
          const isCompleted = completedStepIds.includes(step.id);
          const isPausedNext = editingIndex !== null && stepIndex === activeIndex && !isCompleted;
          const summary = stepSummary(step, responses);

          if (isPausedNext) {
            return (
              <section
                className="question-section question-section--queued"
                id={`question-${step.id}`}
                key={step.id}
                ref={(node) => {
                  sectionRefs.current[step.id] = node;
                }}
              >
                <span className="question-marker" aria-hidden="true">
                  {String(stepIndex + 1).padStart(2, "0")}
                </span>
                <div className="question-section__queued">
                  <span>{lang === "zh" ? "下一題" : "Next question"}</span>
                  <h2>{t(step.title)}</h2>
                </div>
              </section>
            );
          }

          if (!isCurrent && !isCompleted) return null;

          if (!isCurrent) {
            return (
              <section
                className="question-section question-section--complete"
                id={`question-${step.id}`}
                key={step.id}
                ref={(node) => {
                  sectionRefs.current[step.id] = node;
                }}
              >
                <span className="question-marker question-marker--complete" aria-hidden="true">✓</span>
                <div className="question-complete__content">
                  <p>{t(step.title)}</p>
                  <strong>{summary}</strong>
                </div>
                <button
                  className="text-button question-change"
                  type="button"
                  onClick={() => openPreviousStep(stepIndex)}
                >
                  {lang === "zh" ? "更正" : "Edit"}
                </button>
              </section>
            );
          }

          return (
            <section
              className="question-section question-section--current"
              id={`question-${step.id}`}
              key={step.id}
              ref={(node) => {
                sectionRefs.current[step.id] = node;
              }}
            >
              <span className="question-marker" aria-hidden="true">
                {String(stepIndex + 1).padStart(2, "0")}
              </span>
              <div className="question-section__body">
                <div className="question-section__heading">
                  <span>{t(step.eyebrow)}</span>
                  <h2 tabIndex={-1} data-question-heading>{t(step.title)}</h2>
                  {step.description && <p>{t(step.description)}</p>}
                </div>

                <div className="field-stack">
                  {step.fields
                    .filter((field) => questionnaireFieldIsVisible(field, responses))
                    .map((field) => (
                      <FieldControl
                        field={field}
                        value={responses[field.id]}
                        error={errors[field.id]}
                        onChange={(value) => changeResponse(stepIndex, field.id, value)}
                        key={field.id}
                      />
                    ))}
                </div>

                {!questionnaireStepUsesAutomaticProgression(step) && !activeSafetyRule && (
                  <div className="question-action">
                    <button className="button" type="submit" disabled={busy}>
                      {busy
                        ? (lang === "zh" ? "整理緊你嘅簡報…" : "Organising your brief…")
                        : contextualActionLabel(step, stepIndex, schema.steps.length)}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </form>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: QuestionnaireField;
  value: QuestionnaireResponseValue | undefined;
  error?: string;
  onChange: (value: QuestionnaireResponseValue) => void;
}) {
  const { t } = useLanguage();
  const inputId = `field-${field.id}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  if (field.type === "single_select") {
    const display = field.display ?? "list";
    const containerClass =
      display === "pill" ? "pill-row" : display === "grid" ? "card-grid" : "choice-list";
    return (
      <fieldset className={`choice-field ${error ? "field--error" : ""}`} aria-describedby={describedBy}>
        <legend>{t(field.label)}</legend>
        {field.help && (
          <p id={helpId} className="field-help">{t(field.help)}</p>
        )}
        <div className={containerClass} role="radiogroup" aria-label={t(field.label)}>
          {field.options?.map((item) => {
            const checked = valueIsSelected(value, item.value);
            return (
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                className={checked ? "selected" : ""}
                key={item.value}
                onClick={() => onChange(item.value)}
              >
                {display === "list" && (
                  <span className="choice-list-radio" aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                )}
                {display === "grid" && (
                  <span aria-hidden="true">{checked ? "✓" : "→"}</span>
                )}
                <strong>{t(item.label)}</strong>
                {item.hint && <small>{t(item.hint)}</small>}
              </button>
            );
          })}
        </div>
        {error && <p className="field-error" id={errorId}>{error}</p>}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className={`checkbox-field ${error ? "field--error" : ""}`}>
        <label>
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span aria-hidden="true" />
          <strong>{t(field.label)}</strong>
        </label>
        {error && <p className="field-error" id={errorId}>{error}</p>}
      </div>
    );
  }

  const isLong = field.type === "long_text";
  const commonProps = {
    id: inputId,
    value: typeof value === "string" || typeof value === "number" ? value : "",
    placeholder: field.placeholder ? t(field.placeholder) : undefined,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
  };

  return (
    <div className={`text-field ${error ? "field--error" : ""}`}>
      <label htmlFor={inputId}>{t(field.label)}</label>
      {field.help && <p id={helpId} className="field-help">{t(field.help)}</p>}
      {isLong ? (
        <textarea {...commonProps} rows={5} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          {...commonProps}
          type="text"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
}
