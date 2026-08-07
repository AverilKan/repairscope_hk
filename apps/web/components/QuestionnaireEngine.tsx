"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  canContinueQuestionnaireStep,
  normaliseContactName,
  normaliseEmailAddress,
  normalisePhoneNumber,
  normaliseUkPostcode,
  questionnaireFieldIsVisible,
  questionnaireResumeState,
  questionnaireStepUsesAutomaticProgression,
  questionnaireStepValidationErrors,
} from "@/domain/rules";
import type {
  QuestionnaireField,
  QuestionnaireResponseValue,
  QuestionnaireSchema,
  QuestionnaireStep,
  RepairIntakeDraft,
  SafetyRule,
} from "@/domain/types";
import { repairScopeServices } from "@/services";
import { getRepairDraftStorageKey } from "@/domain/storageKeys";

interface QuestionnaireEngineProps {
  schema: QuestionnaireSchema;
  originalReport?: string;
  extractedSymptoms?: string[];
  initialResponses?: RepairIntakeDraft["responses"];
  resumeDraft?: RepairIntakeDraft;
  onComplete?: (draft: RepairIntakeDraft) => void;
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

function responseLabel(
  field: QuestionnaireField,
  value: QuestionnaireResponseValue | undefined,
) {
  if (!valueHasContent(value)) {
    return "Not provided";
  }
  if (field.type === "single_select" && typeof value === "string") {
    return field.options?.find((option) => option.value === value)?.label ?? value;
  }
  if (
    field.type === "grouped_select" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return field.groups
      ?.map((group) => {
        const selected = value[group.id];
        return group.options.find((option) => option.value === selected)?.label;
      })
      .filter(Boolean)
      .join(" · ");
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"} added`;
  }
  if (typeof value === "boolean") return value ? "Confirmed" : "Not confirmed";
  return String(value);
}

function stepSummary(
  step: QuestionnaireStep,
  responses: RepairIntakeDraft["responses"],
) {
  return step.fields
    .filter((field) => questionnaireFieldIsVisible(field, responses))
    .map((field) => responseLabel(field, responses[field.id]))
    .filter(Boolean)
    .join(" · ");
}

function contextualActionLabel(
  step: QuestionnaireStep,
  stepIndex: number,
  totalSteps: number,
) {
  if (stepIndex === totalSteps - 1) return "Generate repair brief";
  if (step.id === "contact" || step.id === "responsibility") {
    return "Continue";
  }
  if (step.fields.some((field) => field.safetyRule)) {
    return "Confirm safety action";
  }
  if (step.fields.some((field) => field.type === "postcode")) {
    return "Confirm postcode";
  }
  if (
    step.fields.some(
      (field) =>
        field.type === "short_text" ||
        field.type === "name" ||
        field.type === "email" ||
        field.type === "phone" ||
        field.type === "long_text" ||
        field.type === "number" ||
        field.type === "postcode",
    )
  ) {
    return "Add details";
  }
  return "Save choices";
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
  const inputId = `field-${field.id}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  if (field.type === "single_select") {
    return (
      <fieldset
        className={`choice-field ${field.safetyRule ? "choice-field--safety" : ""} ${error ? "field--error" : ""}`}
        aria-describedby={describedBy}
      >
        <legend>{field.label}</legend>
        {field.help && (
          <p id={helpId} className="field-help">
            {field.help}
          </p>
        )}
        <div className="choice-grid">
          {field.options?.map((item) => {
            const checked = valueIsSelected(value, item.value);
            return (
              <label
                className={`choice-card ${checked ? "choice-card--selected" : ""}`}
                key={item.value}
              >
                <input
                  type="radio"
                  name={field.id}
                  value={item.value}
                  checked={checked}
                  onClick={() => {
                    if (checked) onChange(item.value);
                  }}
                  onChange={() => onChange(item.value)}
                />
                <span className="choice-card__indicator" aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </label>
            );
          })}
        </div>
        {error && (
          <p className="field-error" id={errorId}>
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  if (field.type === "grouped_select") {
    const groupedValue =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, string>)
        : {};
    return (
      <fieldset
        className={`grouped-field ${error ? "field--error" : ""}`}
        aria-describedby={describedBy}
      >
        <legend>{field.label}</legend>
        <div className="grouped-field__grid">
          {field.groups?.map((group) => (
            <div className="select-group" key={group.id}>
              <label htmlFor={`${inputId}-${group.id}`}>{group.label}</label>
              <select
                id={`${inputId}-${group.id}`}
                value={groupedValue[group.id] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...groupedValue,
                    [group.id]: event.target.value,
                  })
                }
              >
                <option value="">Choose an answer</option>
                {group.options.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {error && (
          <p className="field-error" id={errorId}>
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className={`checkbox-field ${error ? "field--error" : ""}`}>
        <label>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span aria-hidden="true" />
          <strong>{field.label}</strong>
        </label>
        {error && (
          <p className="field-error" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const isLong = field.type === "long_text";
  const commonProps = {
    id: inputId,
    value: typeof value === "string" || typeof value === "number" ? value : "",
    placeholder: field.placeholder,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
  };
  const inputType =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "number"
          ? "number"
          : "text";
  const inputMode =
    field.type === "postcode"
      ? "text"
      : field.type === "number"
        ? "numeric"
        : field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : undefined;
  const autoComplete =
    field.type === "postcode"
      ? "postal-code"
      : field.type === "name"
        ? "name"
        : field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : undefined;

  return (
    <div className={`text-field ${error ? "field--error" : ""}`}>
      <label htmlFor={inputId}>{field.label}</label>
      {field.help && (
        <p id={helpId} className="field-help">
          {field.help}
        </p>
      )}
      {isLong ? (
        <textarea
          {...commonProps}
          rows={5}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...commonProps}
          type={inputType}
          inputMode={inputMode}
          min={field.type === "number" ? 1 : undefined}
          autoComplete={autoComplete}
          maxLength={
            field.type === "postcode"
              ? 8
              : field.type === "name"
                ? 80
                : field.type === "email"
                  ? 254
                  : field.type === "phone"
                    ? 30
                    : undefined
          }
          onChange={(event) =>
            onChange(
              field.type === "number"
                ? Number(event.target.value)
                : event.target.value,
            )
          }
          onBlur={(event) => {
            if (field.type === "postcode") {
              onChange(normaliseUkPostcode(event.target.value));
            } else if (field.type === "name") {
              onChange(normaliseContactName(event.target.value));
            } else if (field.type === "email") {
              onChange(normaliseEmailAddress(event.target.value));
            } else if (field.type === "phone") {
              onChange(normalisePhoneNumber(event.target.value));
            }
          }}
        />
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

function SafetyNotice({
  rule,
  acknowledged,
  onAcknowledge,
}: {
  rule: SafetyRule;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <div className={`safety-notice safety-notice--${rule.severity}`} role="alert">
      <div className="safety-notice__flag">Safety action required</div>
      <h3>{rule.title}</h3>
      <p>{rule.message}</p>
      <p className="safety-notice__no-wait">
        This issue may require urgent attendance. Do not wait for RepairScope to source and
        compare contractors. Contact an appropriate emergency service or contractor now.
      </p>
      <label className="safety-acknowledgement">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledge(event.target.checked)}
        />
        <span aria-hidden="true" />
        <strong>{rule.acknowledgement}</strong>
      </label>
    </div>
  );
}

export function QuestionnaireEngine({
  schema,
  originalReport = "",
  extractedSymptoms = [],
  initialResponses = emptyResponses,
  resumeDraft,
  onComplete,
}: QuestionnaireEngineProps) {
  const draftId = resumeDraft?.id ?? `draft-${schema.category}`;
  const storageKey = getRepairDraftStorageKey(draftId);
  const initialQuestionnaireState = useMemo(
    () => questionnaireResumeState(schema, resumeDraft, initialResponses),
    [initialResponses, resumeDraft, schema],
  );
  const [activeIndex, setActiveIndex] = useState(
    () => initialQuestionnaireState.activeIndex,
  );
  const [responses, setResponses] =
    useState<RepairIntakeDraft["responses"]>(
      () => initialQuestionnaireState.responses,
    );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [acknowledgements, setAcknowledgements] =
    useState<SafetyAcknowledgements>({});
  const [completedStepIds, setCompletedStepIds] = useState<string[]>(
    () => initialQuestionnaireState.completedStepIds,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const submitting = useRef(false);

  const currentIndex = editingIndex ?? activeIndex;
  const currentStep = schema.steps[currentIndex];
  const answeredCount = completedStepIds.length;

  const safetyAcknowledgementList = useMemo(
    () =>
      Object.entries(acknowledgements).map(([ruleId, acknowledgedAt]) => ({
        ruleId,
        acknowledged: true,
        acknowledgedAt,
      })),
    [acknowledgements],
  );

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            activeIndex?: number;
            stepIndex?: number;
            responses?: RepairIntakeDraft["responses"];
            acknowledgements?: SafetyAcknowledgements;
            completedStepIds?: string[];
          };
          const restoredIndex =
            parsed.activeIndex ??
            parsed.stepIndex ??
            initialQuestionnaireState.activeIndex;
          setActiveIndex(
            Math.min(restoredIndex, Math.max(schema.steps.length - 1, 0)),
          );
          setResponses({
            ...initialQuestionnaireState.responses,
            ...(parsed.responses ?? {}),
          });
          setAcknowledgements(parsed.acknowledgements ?? {});
          setCompletedStepIds(
            parsed.completedStepIds ??
              initialQuestionnaireState.completedStepIds,
          );
          setSavedAt("restored");
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [initialQuestionnaireState, schema.steps, storageKey]);

  useEffect(() => {
    if (!hydrated || completed) return;
    const saveTimer = window.setTimeout(() => {
      setSaveError(false);
      const draft: RepairIntakeDraft = {
        id: `draft-${schema.category}`,
        category: schema.category,
        originalReport,
        extractedSymptoms,
        responses,
        safetyAcknowledgements: safetyAcknowledgementList,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          activeIndex,
          responses,
          acknowledgements,
          completedStepIds,
        }),
      );
      // The local write above is the durable save for the public intake
      // flow (see docs/PUBLIC_INGESTION_LAUNCH.md) — server-side draft
      // persistence is a deferred capability, not a launch requirement.
      // Remote saveDraft is attempted best-effort only; its adapter stub
      // throws synchronously when unavailable (not a rejected promise), so
      // this must be a try/catch, not a .then/.catch chain, or the throw
      // becomes an uncaught exception instead of falling back gracefully.
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
    originalReport,
    responses,
    safetyAcknowledgementList,
    schema.category,
    storageKey,
  ]);

  const activeSafetyRule = useMemo(() => {
    for (const field of currentStep.fields) {
      if (!field.safetyRule) continue;
      const response = responses[field.id];
      if (
        typeof response === "string" &&
        field.safetyRule.triggerValues.includes(response)
      ) {
        return field.safetyRule;
      }
    }
    return undefined;
  }, [currentStep.fields, responses]);

  const focusStep = (index: number) => {
    window.requestAnimationFrame(() => {
      const step = schema.steps[index];
      const section = step ? sectionRefs.current[step.id] : null;
      if (!section) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      section.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      section
        .querySelector<HTMLElement>("[data-question-heading]")
        ?.focus({ preventScroll: true });
    });
  };

  const revealStep = (index: number) => {
    const step = schema.steps[index];
    if (!step) return;
    setActiveIndex(index);
    setAnnouncement(`Next question: ${step.title}`);
    focusStep(index);
  };

  const markStepComplete = (stepId: string) => {
    setCompletedStepIds((current) =>
      current.includes(stepId) ? current : [...current, stepId],
    );
  };

  const advanceFrom = (
    stepIndex: number,
  ) => {
    const step = schema.steps[stepIndex];
    markStepComplete(step.id);
    setErrors({});
    if (editingIndex === stepIndex) {
      setEditingIndex(null);
      setAnnouncement(`Answer updated: ${step.title}`);
      focusStep(activeIndex);
      return;
    }
    if (stepIndex < schema.steps.length - 1) {
      revealStep(stepIndex + 1);
    }
  };

  const changeResponse = (
    stepIndex: number,
    fieldId: string,
    value: QuestionnaireResponseValue,
  ) => {
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
    setAcknowledgements((current) => {
      const next = { ...current };
      delete next[schema.steps[stepIndex].id];
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
    if (submitting.current || busy) return;
    const validationErrors = questionnaireStepValidationErrors(
      schema,
      currentIndex,
      responses,
    );
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const safetyAcknowledged = Boolean(
      acknowledgements[currentStep.id],
    );
    if (
      !canContinueQuestionnaireStep(
        schema,
        currentIndex,
        responses,
        safetyAcknowledged,
      )
    ) {
      return;
    }

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
      id: `draft-${schema.category}`,
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
    window.localStorage.removeItem(storageKey);
    onComplete?.(draft);
  };

  const openPreviousStep = (stepIndex: number) => {
    setEditingIndex(stepIndex);
    setErrors({});
    setAnnouncement(`Editing: ${schema.steps[stepIndex].title}`);
    focusStep(stepIndex);
  };

  if (completed && !onComplete) {
    return (
      <section className="guided-panel guided-panel--complete">
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow">Draft saved</p>
        <h1>Your answers are ready for brief review</h1>
        <p>
          No contractor has received anything yet. The next step is to check the
          reported facts, unknowns and evidence.
        </p>
        <Link
          className="button"
          href={`/landlord/repairs/${draftId}/brief`}
        >
          Review contractor brief
        </Link>
      </section>
    );
  }

  return (
    <section className="progressive-questionnaire" aria-label={`${schema.label} questions`}>
      <div className="questionnaire-toolbar">
        <div>
          <span className="questionnaire-toolbar__label">New repair</span>
          <strong>{schema.shortLabel} questions</strong>
        </div>
        <div className="questionnaire-toolbar__status">
          <span className="save-status">
            <span className="save-status__dot" aria-hidden="true" />
            {saveError
              ? "Saved on this device"
              : savedAt === "restored"
                ? "Draft restored"
                : savedAt
                  ? `Saved ${savedAt}`
                  : "Saving automatically"}
          </span>
          <span>
            {answeredCount} of {schema.steps.length} answered
          </span>
        </div>
      </div>

      <div className="questionnaire-intro">
        <p className="eyebrow">{schema.label}</p>
        <h1>Tell the repair story as it happened.</h1>
        <p>
          Only relevant questions appear. Earlier answers stay in view and can
          be changed at any time.
        </p>
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
          const isPausedNext =
            editingIndex !== null &&
            stepIndex === activeIndex &&
            !isCompleted;
          const summary = stepSummary(step, responses);
          const safetyAcknowledged = Boolean(acknowledgements[step.id]);

          if (isPausedNext) {
            return (
              <section
                className="question-section question-section--queued"
                id={`question-${step.id}`}
                key={step.id}
                aria-label={`Next question: ${step.title}`}
                ref={(node) => {
                  sectionRefs.current[step.id] = node;
                }}
              >
                <span className="question-marker" aria-hidden="true">
                  {String(stepIndex + 1).padStart(2, "0")}
                </span>
                <div className="question-section__queued">
                  <span>Next question</span>
                  <h2>{step.title}</h2>
                  <p>Keep or change your answer above to continue here.</p>
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
                <span className="question-marker question-marker--complete" aria-hidden="true">
                  ✓
                </span>
                <div className="question-complete__content">
                  <p>{step.title}</p>
                  <strong>{summary}</strong>
                </div>
                <button
                  className="text-button question-change"
                  type="button"
                  onClick={() => openPreviousStep(stepIndex)}
                >
                  Change
                </button>
              </section>
            );
          }

          return (
            <section
              className={`question-section question-section--current ${step.fields.some((field) => field.safetyRule) ? "question-section--safety" : ""}`}
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
                  <span>{step.eyebrow}</span>
                  <h2 tabIndex={-1} data-question-heading>
                    {step.title}
                  </h2>
                  {step.description && <p>{step.description}</p>}
                </div>

                <div className="field-stack">
                  {step.fields
                    .filter((field) =>
                      questionnaireFieldIsVisible(field, responses),
                    )
                    .map((field) => (
                      <FieldControl
                        field={field}
                        value={responses[field.id]}
                        error={errors[field.id]}
                        onChange={(value) =>
                          changeResponse(stepIndex, field.id, value)
                        }
                        key={field.id}
                      />
                    ))}
                </div>

                {activeSafetyRule && (
                  <SafetyNotice
                    rule={activeSafetyRule}
                    acknowledged={safetyAcknowledged}
                    onAcknowledge={(acknowledged) =>
                      setAcknowledgements((current) => {
                        const next = { ...current };
                        if (acknowledged) {
                          next[step.id] = new Date().toISOString();
                        } else {
                          delete next[step.id];
                        }
                        return next;
                      })
                    }
                  />
                )}

                {!questionnaireStepUsesAutomaticProgression(step) && (
                  <div className="question-action">
                    <button
                      className="button"
                      type="submit"
                      disabled={
                        busy || Boolean(activeSafetyRule && !safetyAcknowledged)
                      }
                    >
                      {busy
                        ? "Organising your brief…"
                        : contextualActionLabel(
                            step,
                            stepIndex,
                            schema.steps.length,
                          )}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </form>

      <div className="questionnaire-footer-count">
        <span>Questions completed</span>
        <strong>
          {answeredCount} of {schema.steps.length}
        </strong>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
