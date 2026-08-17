"use client";

// The NEW HK contractor-facing guided response form (see RepairScope HK —
// "frontend structure" phase, Commit B). Built fresh against
// ContractorResponsePayload and Stage1ContractorBrief — this is
// deliberately NOT the old UK ContractorApp.tsx wired into the current
// domain. It reuses that reference prototype's progressive-question
// DISCIPLINE (one active question at a time, completed questions collapse
// to a short answer summary with a "Change" link, single-select answers
// advance automatically, everything else needs an explicit "Continue",
// Back works, a final review exists) without reusing its 3,000+ line
// orchestration component or its GBP/VAT/itemised-materials domain model.
//
// There is no production transport yet — this form never talks to a
// backend. It produces a small, versioned export (see
// domain/contractorResponse.ts's ContractorResponseExportV1) that the
// founder pastes into the matching contractor's card in the existing
// operator workspace (Commit B's "Import contractor response" action).

import { useState } from "react";
import {
  OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS,
  OPERATOR_CONTRACTOR_RESPONSE_TYPES,
  OPERATOR_GUARANTEE_STATUS_LABELS,
  OPERATOR_GUARANTEE_STATUSES,
  OPERATOR_INSPECTION_REQUIREMENT_LABELS,
  OPERATOR_INSPECTION_REQUIREMENTS,
  OPERATOR_PRICE_TYPE_LABELS,
  OPERATOR_PRICE_TYPES,
  type OperatorContractorResponseType,
  type OperatorPriceType,
} from "@/domain/operatorCaseState";
import {
  sanitizeContractorResponsePayload,
  serializeContractorResponseExport,
  type ContractorResponsePayload,
} from "@/domain/contractorResponse";
import type { Stage1ContractorBrief } from "@/domain/stage1ContractorBrief";

type StepId =
  | "response-type"
  | "inspection-requirement"
  | "inspection-what"
  | "information-needed"
  | "original-response"
  | "proposed-approach"
  | "price-type"
  | "price-amount"
  | "inclusions"
  | "exclusions"
  | "price-change-factors"
  | "expected-duration"
  | "earliest-start"
  | "guarantee"
  | "anything-else"
  | "confirm";

function stepsForResponseType(responseType: OperatorContractorResponseType | undefined): StepId[] {
  switch (responseType) {
    case "interested":
      return ["response-type", "original-response", "confirm"];
    case "needs-inspection":
      return ["response-type", "inspection-requirement", "inspection-what", "confirm"];
    case "needs-more-information":
      return ["response-type", "information-needed", "original-response", "confirm"];
    case "not-suitable":
      return ["response-type", "original-response", "confirm"];
    case "proposal-provided":
      return [
        "response-type",
        "proposed-approach",
        "price-type",
        "price-amount",
        "inclusions",
        "exclusions",
        "price-change-factors",
        "expected-duration",
        "earliest-start",
        "guarantee",
        "anything-else",
        "confirm",
      ];
    default:
      return ["response-type"];
  }
}

const EXCLUSION_SUGGESTIONS = [
  "Making good (plaster, paint)",
  "Hidden damage found once work starts",
  "Additional faults not described here",
  "Specialist access (scaffolding etc.)",
  "Moving furniture or belongings",
];

const PRICE_CHANGE_SUGGESTIONS = [
  "Hidden damage",
  "More faults found",
  "More materials/parts required",
  "Access harder than expected",
  "Unsafe/unsuitable existing work",
  "Extra work requested",
];

function appendSuggestion(current: string, suggestion: string): string {
  const trimmed = current.trim();
  if (!trimmed) return suggestion;
  if (trimmed.includes(suggestion)) return trimmed;
  return `${trimmed}, ${suggestion}`;
}

function parseOptionalAmount(raw: string): number | undefined {
  if (raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function stepLabel(stepId: StepId, priceType: OperatorPriceType | undefined): string {
  switch (stepId) {
    case "response-type":
      return "What happens next?";
    case "inspection-requirement":
      return "Inspection requirement";
    case "inspection-what":
      return "What do you want to inspect, or what did you say?";
    case "information-needed":
      return "What information do you need?";
    case "original-response":
      return "Anything else you'd like to say?";
    case "proposed-approach":
      return "Proposed work / approach";
    case "price-type":
      return "Price type";
    case "price-amount":
      return priceType === "range" ? "Price range" : "Price";
    case "inclusions":
      return "What's included?";
    case "exclusions":
      return "What's excluded?";
    case "price-change-factors":
      return "What could change the price?";
    case "expected-duration":
      return "Expected duration";
    case "earliest-start":
      return "Earliest start";
    case "guarantee":
      return "Guarantee";
    case "anything-else":
      return "Anything else you'd like to say?";
    case "confirm":
      return "Review your response";
  }
}

function answerSummary(stepId: StepId, answers: ContractorResponsePayload): string {
  switch (stepId) {
    case "response-type":
      return answers.responseType ? OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[answers.responseType] : "";
    case "inspection-requirement":
      return answers.inspectionRequirement
        ? OPERATOR_INSPECTION_REQUIREMENT_LABELS[answers.inspectionRequirement]
        : "";
    case "inspection-what":
    case "original-response":
    case "anything-else":
      return answers.originalResponse ?? "";
    case "information-needed":
      return answers.informationNeeded ?? "";
    case "proposed-approach":
      return answers.proposedApproach ?? "";
    case "price-type":
      return answers.priceType ? OPERATOR_PRICE_TYPE_LABELS[answers.priceType] : "";
    case "price-amount":
      if (answers.priceType === "range") {
        return typeof answers.priceMin === "number" && typeof answers.priceMax === "number"
          ? `HK$${answers.priceMin.toLocaleString("en-HK")}–HK$${answers.priceMax.toLocaleString("en-HK")}`
          : "";
      }
      return typeof answers.price === "number" ? `HK$${answers.price.toLocaleString("en-HK")}` : "";
    case "inclusions":
      return answers.inclusions ?? "";
    case "exclusions":
      return answers.exclusions ?? "";
    case "price-change-factors":
      return answers.priceChangeFactors ?? "";
    case "expected-duration":
      return answers.expectedDuration ?? "";
    case "earliest-start":
      return answers.earliestStart ?? "";
    case "guarantee":
      return answers.guaranteeStatus ? OPERATOR_GUARANTEE_STATUS_LABELS[answers.guaranteeStatus] : "";
    case "confirm":
      return "";
  }
}

export function ContractorResponseForm({ brief }: { brief: Stage1ContractorBrief }) {
  const [answers, setAnswers] = useState<ContractorResponsePayload>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [priceRangeError, setPriceRangeError] = useState<string | null>(null);
  const [exportedText, setExportedText] = useState<string | null>(null);
  // Range price inputs are deliberately NOT wired straight through
  // update()/sanitizeContractorResponsePayload on every keystroke — that
  // would clear an in-progress invalid combination (min > max) before the
  // contractor even reaches "Continue" (applyContractorPatch enforces the
  // range invariant unconditionally). These two hold the draft text; only a
  // valid pair is committed to `answers` when Continue is pressed.
  const [rangeMinDraft, setRangeMinDraft] = useState("");
  const [rangeMaxDraft, setRangeMaxDraft] = useState("");

  const steps = stepsForResponseType(answers.responseType);
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  function update(patch: ContractorResponsePayload) {
    setAnswers((current) => sanitizeContractorResponsePayload({ ...current, ...patch }));
  }

  // Resets the range-price draft from the last confirmed values — called
  // directly from whichever user action is about to make "price-amount"
  // the active step (rather than an effect watching for it), since this
  // codebase avoids setState-inside-useEffect.
  function resetRangeDraft(current: ContractorResponsePayload) {
    setRangeMinDraft(current.priceMin !== undefined ? String(current.priceMin) : "");
    setRangeMaxDraft(current.priceMax !== undefined ? String(current.priceMax) : "");
    setPriceRangeError(null);
  }

  function goTo(index: number) {
    setStepIndex(index);
    setExportedText(null);
    if (steps[index] === "price-amount") resetRangeDraft(answers);
  }

  function advance() {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    setExportedText(null);
  }

  function selectResponseType(responseType: OperatorContractorResponseType) {
    update({ responseType });
    setStepIndex(1);
  }

  const observedProblemText =
    brief.observedProblem.length > 0 ? brief.observedProblem.join(" · ") : "No further detail provided yet.";

  return (
    <div className="contractor-response-form">
      <section className="contractor-brief-panel" aria-label="Job summary">
        <h2>Job summary</h2>
        <p className="contractor-brief-panel__hint">
          This is a sourcing summary only — exact address, owner contact details and any other contractors are not
          shown at this stage.
        </p>
        <dl>
          <div>
            <dt>Category</dt>
            <dd>{brief.category}</dd>
          </div>
          {brief.district && (
            <div>
              <dt>Area</dt>
              <dd>{brief.district}</dd>
            </div>
          )}
          <div>
            <dt>What&apos;s been observed</dt>
            <dd>{observedProblemText}</dd>
          </div>
          {brief.priorAction && (
            <div>
              <dt>Previous action</dt>
              <dd>{brief.priorAction}</dd>
            </div>
          )}
          {brief.hasEvidence && (
            <div>
              <dt>Evidence</dt>
              <dd>
                {brief.hasEvidence}
                {brief.evidenceKind ? ` — ${brief.evidenceKind}` : ""}
              </dd>
            </div>
          )}
          {brief.safetyFlags.length > 0 && (
            <div>
              <dt>Flags</dt>
              <dd>{brief.safetyFlags.join(", ")}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="contractor-response-steps" aria-label="Your response">
        {steps.slice(0, stepIndex).map((stepId, index) => {
          // "No price yet" skips straight past the now-irrelevant
          // price-amount step (see the price-type handler above) — it was
          // never actually shown, so it shouldn't appear as an answered
          // (or "Not answered") row here.
          if (stepId === "price-amount" && answers.priceType === "no-price") return null;
          return (
            <div className="contractor-step contractor-step--done" key={`${stepId}-${index}`}>
              <div className="contractor-step__summary-row">
                <span className="contractor-step__label">{stepLabel(stepId, answers.priceType)}</span>
                <button type="button" onClick={() => goTo(index)}>
                  Change
                </button>
              </div>
              <p className="contractor-step__answer">{answerSummary(stepId, answers) || "Not answered"}</p>
            </div>
          );
        })}

        <div className="contractor-step contractor-step--active" data-active-step={currentStep}>
          <h3>{stepLabel(currentStep, answers.priceType)}</h3>

          {currentStep === "response-type" && (
            <div className="contractor-step__options">
              {OPERATOR_CONTRACTOR_RESPONSE_TYPES.map((type) => (
                <button key={type} type="button" onClick={() => selectResponseType(type)}>
                  {OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}

          {currentStep === "inspection-requirement" && (
            <div className="contractor-step__options">
              {OPERATOR_INSPECTION_REQUIREMENTS.map((requirement) => (
                <button
                  key={requirement}
                  type="button"
                  onClick={() => {
                    update({ inspectionRequirement: requirement });
                    advance();
                  }}
                >
                  {OPERATOR_INSPECTION_REQUIREMENT_LABELS[requirement]}
                </button>
              ))}
            </div>
          )}

          {(currentStep === "inspection-what" ||
            currentStep === "original-response" ||
            currentStep === "anything-else") && (
            <>
              <textarea
                aria-label={stepLabel(currentStep, answers.priceType)}
                value={answers.originalResponse ?? ""}
                onChange={(event) => update({ originalResponse: event.target.value })}
                placeholder="In your own words…"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "information-needed" && (
            <>
              <textarea
                aria-label="What information do you need?"
                value={answers.informationNeeded ?? ""}
                onChange={(event) => update({ informationNeeded: event.target.value })}
                placeholder="e.g. Access to the affected area, more photos, a call with the owner…"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "proposed-approach" && (
            <>
              <textarea
                aria-label="Proposed work / approach"
                value={answers.proposedApproach ?? ""}
                onChange={(event) => update({ proposedApproach: event.target.value })}
                placeholder="What would you do to fix this?"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "price-type" && (
            <div className="contractor-step__options">
              {OPERATOR_PRICE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    update({ priceType: type });
                    setPriceRangeError(null);
                    if (type === "range") resetRangeDraft(answers);
                    if (type === "no-price") {
                      setStepIndex((index) => index + 2); // skip the now-empty price-amount step
                    } else {
                      advance();
                    }
                  }}
                >
                  {OPERATOR_PRICE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}

          {currentStep === "price-amount" && answers.priceType === "range" && (
            <>
              <label>
                Minimum (HK$)
                <input
                  type="number"
                  min={0}
                  value={rangeMinDraft}
                  onChange={(event) => {
                    setRangeMinDraft(event.target.value);
                    setPriceRangeError(null);
                  }}
                />
              </label>
              <label>
                Maximum (HK$)
                <input
                  type="number"
                  min={0}
                  value={rangeMaxDraft}
                  onChange={(event) => {
                    setRangeMaxDraft(event.target.value);
                    setPriceRangeError(null);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const min = parseOptionalAmount(rangeMinDraft);
                  const max = parseOptionalAmount(rangeMaxDraft);
                  if (typeof min === "number" && typeof max === "number" && min > max) {
                    setPriceRangeError("The minimum can't be greater than the maximum.");
                    return;
                  }
                  setPriceRangeError(null);
                  update({ priceMin: min, priceMax: max });
                  advance();
                }}
              >
                Continue
              </button>
              {priceRangeError && (
                <p className="field-error" role="alert">
                  {priceRangeError}
                </p>
              )}
            </>
          )}

          {currentStep === "price-amount" && answers.priceType !== "range" && (
            <>
              <label>
                Price (HK$)
                <input
                  type="number"
                  min={0}
                  value={answers.price ?? ""}
                  onChange={(event) => update({ price: parseOptionalAmount(event.target.value) })}
                />
              </label>
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "inclusions" && (
            <>
              <textarea
                aria-label="What's included?"
                value={answers.inclusions ?? ""}
                onChange={(event) => update({ inclusions: event.target.value })}
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "exclusions" && (
            <>
              <div className="contractor-step__suggestions">
                {EXCLUSION_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => update({ exclusions: appendSuggestion(answers.exclusions ?? "", suggestion) })}
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
              <textarea
                aria-label="What's excluded?"
                value={answers.exclusions ?? ""}
                onChange={(event) => update({ exclusions: event.target.value })}
                placeholder="Optional"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "price-change-factors" && (
            <>
              <div className="contractor-step__suggestions">
                {PRICE_CHANGE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      update({ priceChangeFactors: appendSuggestion(answers.priceChangeFactors ?? "", suggestion) })
                    }
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
              <textarea
                aria-label="What could change the price?"
                value={answers.priceChangeFactors ?? ""}
                onChange={(event) => update({ priceChangeFactors: event.target.value })}
                placeholder="Optional"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "expected-duration" && (
            <>
              <input
                aria-label="Expected duration"
                value={answers.expectedDuration ?? ""}
                onChange={(event) => update({ expectedDuration: event.target.value })}
                placeholder="e.g. 2 hours, 1 day, 2–3 visits"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "earliest-start" && (
            <>
              <input
                aria-label="Earliest start"
                value={answers.earliestStart ?? ""}
                onChange={(event) => update({ earliestStart: event.target.value })}
                placeholder="Optional — e.g. Tomorrow afternoon, within 3 days"
              />
              <button type="button" onClick={advance}>
                Continue
              </button>
            </>
          )}

          {currentStep === "guarantee" && (
            <div className="contractor-step__options">
              {OPERATOR_GUARANTEE_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    update({ guaranteeStatus: status });
                    // "Yes" reveals an optional follow-up field below and
                    // waits for an explicit Continue — auto-advancing past
                    // it here would skip the chance to add details.
                    // "No"/"Not stated" have no follow-up, so they advance
                    // immediately, matching the single-select auto-advance
                    // rule used everywhere else in this form.
                    if (status !== "yes") advance();
                  }}
                >
                  {OPERATOR_GUARANTEE_STATUS_LABELS[status]}
                </button>
              ))}
              {answers.guaranteeStatus === "yes" && (
                <>
                  <label>
                    Guarantee details
                    <input
                      value={answers.guaranteeDetails ?? ""}
                      onChange={(event) => update({ guaranteeDetails: event.target.value })}
                      placeholder="Optional — e.g. 6 months on parts"
                    />
                  </label>
                  <button type="button" onClick={advance}>
                    Continue
                  </button>
                </>
              )}
            </div>
          )}

          {currentStep === "confirm" && (
            <div className="contractor-step__review">
              <p>Check your answers above, then copy your response for RepairScope.</p>
              <button
                type="button"
                onClick={() => setExportedText(serializeContractorResponseExport(answers))}
              >
                Prepare my response
              </button>
              {exportedText && (
                <div className="contractor-step__export">
                  <p>Copy this and send it to RepairScope (e.g. paste it back to the person who invited you):</p>
                  <textarea aria-label="Response to copy" readOnly value={exportedText} />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
