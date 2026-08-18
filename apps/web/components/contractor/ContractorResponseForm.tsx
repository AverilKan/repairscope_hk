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
//
// LOCALIZATION (HK validation-pilot pass): Traditional Chinese is the
// default contractor experience (see components/LanguageContext.tsx —
// the app-wide LanguageProvider already defaults to "zh"); English
// remains an optional secondary language via the existing 繁/EN toggle.
// Every user-facing string in this file goes through useLanguage()'s
// `t()` against a small local LocalizedText dictionary — no new i18n
// framework, just the same domain/i18n.ts mechanism GeneratedBriefDocument
// already uses. Internal step ids, enum values (interested,
// proposal-provided, fixed, ...) and payload field names are untouched —
// this is display copy only.

import { useState } from "react";
import type { ContractorResponseSubmissionOutcome } from "@/domain/contractorRequestPublic";
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
  checkContractorResponseCompletion,
  CONTRACTOR_RESPONSE_LONG_TEXT_MAX,
  CONTRACTOR_RESPONSE_SHORT_TEXT_MAX,
  isNonBlank,
  isValidAmount,
  sanitizeContractorResponsePayload,
  serializeContractorResponseExport,
  type ContractorResponsePayload,
} from "@/domain/contractorResponse";
import type { Stage1ContractorBrief } from "@/domain/stage1ContractorBrief";
import { localize, lt, type Lang, type LocalizedText } from "@/domain/i18n";
import { useLanguage } from "@/components/LanguageContext";

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

const EXCLUSION_SUGGESTIONS: LocalizedText[] = [
  lt("油漆／批盪修飾", "Making good (plaster, paint)"),
  lt("開工後才發現的隱藏損壞", "Hidden damage found once work starts"),
  lt("這裡未提到的其他問題", "Additional faults not described here"),
  lt("特別搭棚／進入安排", "Specialist access (scaffolding etc.)"),
  lt("搬傢俬／雜物", "Moving furniture or belongings"),
];

const PRICE_CHANGE_SUGGESTIONS: LocalizedText[] = [
  lt("隱藏損壞", "Hidden damage"),
  lt("發現更多問題", "More faults found"),
  lt("需要更多材料／零件", "More materials/parts required"),
  lt("進入現場比預期困難", "Access harder than expected"),
  lt("現有裝置不安全／不合規格", "Unsafe/unsuitable existing work"),
  lt("業主要求額外工程", "Extra work requested"),
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

function stepLabel(stepId: StepId, priceType: OperatorPriceType | undefined, lang: Lang): string {
  const text: LocalizedText = (() => {
    switch (stepId) {
      case "response-type":
        return lt("你打算如何處理？", "What happens next?");
      case "inspection-requirement":
        return lt("檢查要求", "Inspection requirement");
      case "inspection-what":
        return lt("你想檢查什麼，或你與對方談了什麼？", "What do you want to inspect, or what did you say?");
      case "information-needed":
        return lt("你需要什麼資料？", "What information do you need?");
      case "original-response":
        return lt("還有沒有想說的？", "Anything else you'd like to say?");
      case "proposed-approach":
        return lt("建議處理方法", "Proposed work / approach");
      case "price-type":
        return lt("報價方式", "Price type");
      case "price-amount":
        return priceType === "range" ? lt("價格範圍", "Price range") : lt("價格", "Price");
      case "inclusions":
        return lt("包括什麼？", "What's included?");
      case "exclusions":
        return lt("不包括什麼？", "What's excluded?");
      case "price-change-factors":
        return lt("什麼因素可能影響價格？", "What could change the price?");
      case "expected-duration":
        return lt("預計工期", "Expected duration");
      case "earliest-start":
        return lt("最早可開始時間", "Earliest start");
      case "guarantee":
        return lt("保養", "Guarantee");
      case "anything-else":
        return lt("還有沒有想說的？", "Anything else you'd like to say?");
      case "confirm":
        return lt("查看回覆", "Review your response");
    }
  })();
  return localize(text, lang);
}

function answerSummary(stepId: StepId, answers: ContractorResponsePayload, lang: Lang): string {
  switch (stepId) {
    case "response-type":
      return answers.responseType ? localize(OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[answers.responseType], lang) : "";
    case "inspection-requirement":
      return answers.inspectionRequirement
        ? localize(OPERATOR_INSPECTION_REQUIREMENT_LABELS[answers.inspectionRequirement], lang)
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
      return answers.priceType ? localize(OPERATOR_PRICE_TYPE_LABELS[answers.priceType], lang) : "";
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
      return answers.guaranteeStatus ? localize(OPERATOR_GUARANTEE_STATUS_LABELS[answers.guaranteeStatus], lang) : "";
    case "confirm":
      return "";
  }
}

/** Real submission wiring for API/live mode (T2 Commit 2). Absent
 * entirely in mock/dev mode, which keeps the original copy/export-only
 * flow unchanged below. `submit` should reject on failure (network,
 * validation, server, or conflict — see domain/contractorRequestPublic.ts's
 * error classes) and resolve only after the real T1 API has persisted the
 * response. */
export interface ContractorResponseFormSubmission {
  submit: (payload: ContractorResponsePayload) => Promise<ContractorResponseSubmissionOutcome>;
  /** Secondary debug escape hatch only — copy/export must not be the
   * primary real-mode completion flow, so this defaults to hidden. */
  showExportFallback?: boolean;
}

type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "success" }
  | { phase: "terminal"; message: LocalizedText; tone: "success" | "error" }
  | { phase: "error"; message: string };

function describeSubmitError(error: unknown, lang: Lang): string {
  if (error instanceof Error && error.message) return error.message;
  return localize(lt("提交回覆時發生問題，請再試一次。", "Something went wrong sending your response. Please try again."), lang);
}

// Terminal/error copy audited for lifecycle truthfulness (see the T2 Codex
// fix pass) — translation must never blur these distinctions:
//   - "submitted"/"already-responded" are the ONLY outcomes allowed to read
//     as success;
//   - "revoked"/"expired" must explicitly say the response was NOT
//     recorded, never imply persistence;
//   - "reconciliation-failed" must communicate genuine uncertainty, never
//     claim success or failure outright.
function submitOutcomeState(outcome: ContractorResponseSubmissionOutcome): SubmitState {
  switch (outcome) {
    case "submitted":
      return { phase: "success" };
    case "already-responded":
      return {
        phase: "terminal",
        tone: "success",
        message: lt(
          "你已經提交過此回覆，多謝你！",
          "You've already submitted a response for this request. Thank you.",
        ),
      };
    case "revoked":
      return {
        phase: "terminal",
        tone: "error",
        message: lt(
          "此邀請已經被取消，你的回覆未能記錄。請向邀請你的人索取新連結。",
          "This request was revoked before RepairScope recorded your response. Ask for a new link.",
        ),
      };
    case "expired":
      return {
        phase: "terminal",
        tone: "error",
        message: lt(
          "此邀請已經過期，你的回覆未能記錄。請向邀請你的人索取新連結。",
          "This request expired before RepairScope recorded your response. Ask for a new link.",
        ),
      };
    case "open-conflict":
      return {
        phase: "terminal",
        tone: "error",
        message: lt("RepairScope 未能接受此回覆，請再試一次。", "RepairScope could not accept this response. Please try again."),
      };
    case "reconciliation-failed":
      return {
        phase: "terminal",
        tone: "error",
        message: lt(
          "我們暫時未能確認你的回覆是否已成功記錄，請再試一次。",
          "We couldn't confirm whether RepairScope recorded your response. Please try again.",
        ),
      };
  }
}

export function ContractorResponseForm({
  brief,
  submission,
}: {
  brief: Stage1ContractorBrief;
  submission?: ContractorResponseFormSubmission;
}) {
  const { lang, t } = useLanguage();
  const [answers, setAnswers] = useState<ContractorResponsePayload>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [priceRangeError, setPriceRangeError] = useState<LocalizedText | null>(null);
  const [priceAmountError, setPriceAmountError] = useState<LocalizedText | null>(null);
  const [informationNeededError, setInformationNeededError] = useState<LocalizedText | null>(null);
  const [exportedText, setExportedText] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ phase: "idle" });
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
    brief.observedProblem.length > 0
      ? brief.observedProblem.join(" · ")
      : t(lt("暫時未有更多詳情。", "No further detail provided yet."));

  return (
    <div className="contractor-response-form">
      <section className="contractor-brief-panel" aria-label={t(lt("個案概要", "Job summary"))}>
        <h2>{t(lt("個案概要", "Job summary"))}</h2>
        <p className="contractor-brief-panel__hint">
          {t(
            lt(
              "此為搵師傅階段的概要 — 現階段未會顯示確實地址、業主聯絡資料或其他師傅的資料。",
              "This is a sourcing summary only — exact address, owner contact details and any other contractors are not shown at this stage.",
            ),
          )}
        </p>
        <dl>
          <div>
            <dt>{t(lt("類別", "Category"))}</dt>
            <dd>{brief.category}</dd>
          </div>
          {brief.district && (
            <div>
              <dt>{t(lt("地區", "Area"))}</dt>
              <dd>{brief.district}</dd>
            </div>
          )}
          <div>
            <dt>{t(lt("觀察到的情況", "What's been observed"))}</dt>
            <dd>{observedProblemText}</dd>
          </div>
          {brief.priorAction && (
            <div>
              <dt>{t(lt("之前處理", "Previous action"))}</dt>
              <dd>{brief.priorAction}</dd>
            </div>
          )}
          {brief.hasEvidence && (
            <div>
              <dt>{t(lt("證據", "Evidence"))}</dt>
              <dd>
                {brief.hasEvidence}
                {brief.evidenceKind ? ` — ${brief.evidenceKind}` : ""}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="contractor-response-steps" aria-label={t(lt("你的回覆", "Your response"))}>
        {steps.slice(0, stepIndex).map((stepId, index) => {
          // "No price yet" skips straight past the now-irrelevant
          // price-amount step (see the price-type handler above) — it was
          // never actually shown, so it shouldn't appear as an answered
          // (or "Not answered") row here.
          if (stepId === "price-amount" && answers.priceType === "no-price") return null;
          return (
            <div className="contractor-step contractor-step--done" key={`${stepId}-${index}`}>
              <div className="contractor-step__summary-row">
                <span className="contractor-step__label">{stepLabel(stepId, answers.priceType, lang)}</span>
                <button type="button" onClick={() => goTo(index)}>
                  {t(lt("更改", "Change"))}
                </button>
              </div>
              <p className="contractor-step__answer">
                {answerSummary(stepId, answers, lang) || t(lt("未填寫", "Not answered"))}
              </p>
            </div>
          );
        })}

        <div className="contractor-step contractor-step--active" data-active-step={currentStep}>
          <h3>{stepLabel(currentStep, answers.priceType, lang)}</h3>

          {currentStep === "response-type" && (
            <div className="contractor-step__options">
              {OPERATOR_CONTRACTOR_RESPONSE_TYPES.map((type) => (
                <button key={type} type="button" onClick={() => selectResponseType(type)}>
                  {t(OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[type])}
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
                  {t(OPERATOR_INSPECTION_REQUIREMENT_LABELS[requirement])}
                </button>
              ))}
            </div>
          )}

          {(currentStep === "inspection-what" ||
            currentStep === "original-response" ||
            currentStep === "anything-else") && (
            <>
              <textarea
                aria-label={stepLabel(currentStep, answers.priceType, lang)}
                value={answers.originalResponse ?? ""}
                onChange={(event) => update({ originalResponse: event.target.value })}
                placeholder={t(lt("用你自己的說法寫下…", "In your own words…"))}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
              </button>
            </>
          )}

          {currentStep === "information-needed" && (
            <>
              <textarea
                aria-label={t(lt("你需要什麼資料？", "What information do you need?"))}
                value={answers.informationNeeded ?? ""}
                onChange={(event) => {
                  update({ informationNeeded: event.target.value });
                  setInformationNeededError(null);
                }}
                placeholder={t(
                  lt(
                    "例如：可以進入現場查看、需要更多相片、想與業主通話…",
                    "e.g. Access to the affected area, more photos, a call with the owner…",
                  ),
                )}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button
                type="button"
                onClick={() => {
                  if (!isNonBlank(answers.informationNeeded)) {
                    setInformationNeededError(lt("請說明你需要的資料。", "Describe what information you need."));
                    return;
                  }
                  setInformationNeededError(null);
                  advance();
                }}
              >
                {t(lt("繼續", "Continue"))}
              </button>
              {informationNeededError && (
                <p className="field-error" role="alert">
                  {t(informationNeededError)}
                </p>
              )}
            </>
          )}

          {currentStep === "proposed-approach" && (
            <>
              <textarea
                aria-label={t(lt("建議處理方法", "Proposed work / approach"))}
                value={answers.proposedApproach ?? ""}
                onChange={(event) => update({ proposedApproach: event.target.value })}
                placeholder={t(lt("你會如何處理此問題？", "What would you do to fix this?"))}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
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
                  {t(OPERATOR_PRICE_TYPE_LABELS[type])}
                </button>
              ))}
            </div>
          )}

          {currentStep === "price-amount" && answers.priceType === "range" && (
            <>
              <label>
                {t(lt("最低價（港幣）", "Minimum (HK$)"))}
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
                {t(lt("最高價（港幣）", "Maximum (HK$)"))}
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
                  if (!isValidAmount(min) || !isValidAmount(max)) {
                    setPriceRangeError(lt("請輸入最低及最高價格。", "Enter both a minimum and maximum price."));
                    return;
                  }
                  if (min > max) {
                    setPriceRangeError(lt("最低價格不可高於最高價格。", "The minimum can't be greater than the maximum."));
                    return;
                  }
                  setPriceRangeError(null);
                  update({ priceMin: min, priceMax: max });
                  advance();
                }}
              >
                {t(lt("繼續", "Continue"))}
              </button>
              {priceRangeError && (
                <p className="field-error" role="alert">
                  {t(priceRangeError)}
                </p>
              )}
            </>
          )}

          {currentStep === "price-amount" && answers.priceType !== "range" && (
            <>
              <label>
                {t(lt("價格（港幣）", "Price (HK$)"))}
                <input
                  type="number"
                  min={0}
                  value={answers.price ?? ""}
                  onChange={(event) => {
                    update({ price: parseOptionalAmount(event.target.value) });
                    setPriceAmountError(null);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!isValidAmount(answers.price)) {
                    setPriceAmountError(lt("請輸入有效價格（0 或以上）。", "Enter a valid price (0 or more)."));
                    return;
                  }
                  setPriceAmountError(null);
                  advance();
                }}
              >
                {t(lt("繼續", "Continue"))}
              </button>
              {priceAmountError && (
                <p className="field-error" role="alert">
                  {t(priceAmountError)}
                </p>
              )}
            </>
          )}

          {currentStep === "inclusions" && (
            <>
              <textarea
                aria-label={t(lt("包括什麼？", "What's included?"))}
                value={answers.inclusions ?? ""}
                onChange={(event) => update({ inclusions: event.target.value })}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
              </button>
            </>
          )}

          {currentStep === "exclusions" && (
            <>
              <div className="contractor-step__suggestions">
                {EXCLUSION_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.en}
                    type="button"
                    onClick={() => update({ exclusions: appendSuggestion(answers.exclusions ?? "", t(suggestion)) })}
                  >
                    + {t(suggestion)}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={t(lt("不包括什麼？", "What's excluded?"))}
                value={answers.exclusions ?? ""}
                onChange={(event) => update({ exclusions: event.target.value })}
                placeholder={t(lt("可不填", "Optional"))}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
              </button>
            </>
          )}

          {currentStep === "price-change-factors" && (
            <>
              <div className="contractor-step__suggestions">
                {PRICE_CHANGE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.en}
                    type="button"
                    onClick={() =>
                      update({ priceChangeFactors: appendSuggestion(answers.priceChangeFactors ?? "", t(suggestion)) })
                    }
                  >
                    + {t(suggestion)}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={t(lt("什麼因素可能影響價格？", "What could change the price?"))}
                value={answers.priceChangeFactors ?? ""}
                onChange={(event) => update({ priceChangeFactors: event.target.value })}
                placeholder={t(lt("可不填", "Optional"))}
                maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
              </button>
            </>
          )}

          {currentStep === "expected-duration" && (
            <>
              <input
                aria-label={t(lt("預計工期", "Expected duration"))}
                value={answers.expectedDuration ?? ""}
                onChange={(event) => update({ expectedDuration: event.target.value })}
                placeholder={t(lt("例如：2 小時、1 日、2-3 次上門", "e.g. 2 hours, 1 day, 2–3 visits"))}
                maxLength={CONTRACTOR_RESPONSE_SHORT_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
              </button>
            </>
          )}

          {currentStep === "earliest-start" && (
            <>
              <input
                aria-label={t(lt("最早可開始時間", "Earliest start"))}
                value={answers.earliestStart ?? ""}
                onChange={(event) => update({ earliestStart: event.target.value })}
                placeholder={t(lt("可不填 — 例如：聽日下晝、3 日內", "Optional — e.g. Tomorrow afternoon, within 3 days"))}
                maxLength={CONTRACTOR_RESPONSE_SHORT_TEXT_MAX}
              />
              <button type="button" onClick={advance}>
                {t(lt("繼續", "Continue"))}
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
                  {t(OPERATOR_GUARANTEE_STATUS_LABELS[status])}
                </button>
              ))}
              {answers.guaranteeStatus === "yes" && (
                <>
                  <label>
                    {t(lt("保養詳情", "Guarantee details"))}
                    <input
                      value={answers.guaranteeDetails ?? ""}
                      onChange={(event) => update({ guaranteeDetails: event.target.value })}
                      placeholder={t(lt("可不填 — 例如：零件保養 6 個月", "Optional — e.g. 6 months on parts"))}
                      maxLength={CONTRACTOR_RESPONSE_LONG_TEXT_MAX}
                    />
                  </label>
                  <button type="button" onClick={advance}>
                    {t(lt("繼續", "Continue"))}
                  </button>
                </>
              )}
            </div>
          )}

          {currentStep === "confirm" && (() => {
            // Full re-check of the complete payload, independent of
            // whichever per-step gates were passed to get here — back/edit
            // navigation must not be able to leave a stale invalid
            // combination that only a per-step gate would have caught.
            const completion = checkContractorResponseCompletion(answers, lang);
            return (
              <div className="contractor-step__review">
                {!completion.complete ? (
                  <div className="contractor-step__errors" role="alert">
                    <p>{t(lt("請先解決以下問題才可以繼續：", "Please fix the following before continuing:"))}</p>
                    <ul>
                      {completion.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : submission ? (
                  <>
                    {submitState.phase === "success" ? (
                      <p role="status" className="contractor-step__submit-success">
                        {t(lt("回覆已成功提交，多謝你！", "Response submitted. Thank you."))}
                      </p>
                    ) : submitState.phase === "terminal" ? (
                      <p
                        role={submitState.tone === "error" ? "alert" : "status"}
                        className={submitState.tone === "success" ? "contractor-step__submit-success" : "field-error"}
                      >
                        {t(submitState.message)}
                      </p>
                    ) : (
                      <>
                        <p>{t(lt("請檢查以上答案，然後提交給 RepairScope。", "Check your answers above, then submit your response to RepairScope."))}</p>
                        <button
                          type="button"
                          disabled={submitState.phase === "submitting"}
                          onClick={async () => {
                            setSubmitState({ phase: "submitting" });
                            try {
                              const outcome = await submission.submit(answers);
                              setSubmitState(submitOutcomeState(outcome));
                            } catch (error) {
                              setSubmitState({ phase: "error", message: describeSubmitError(error, lang) });
                            }
                          }}
                        >
                          {submitState.phase === "submitting" ? t(lt("提交中…", "Submitting…")) : t(lt("提交回覆", "Submit response"))}
                        </button>
                        {submitState.phase === "error" && (
                          <p className="field-error" role="alert">
                            {submitState.message}
                          </p>
                        )}
                      </>
                    )}
                    {submission.showExportFallback && submitState.phase !== "success" && (
                      <div className="contractor-step__export-fallback">
                        <button
                          type="button"
                          onClick={() => setExportedText(serializeContractorResponseExport(answers))}
                        >
                          {t(lt("準備回覆內容（除錯用）", "Prepare my response (debug export)"))}
                        </button>
                        {exportedText && (
                          <div className="contractor-step__export">
                            <textarea aria-label={t(lt("可複製的回覆內容", "Response to copy"))} readOnly value={exportedText} />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>{t(lt("請檢查以上答案，然後複製你的回覆給 RepairScope。", "Check your answers above, then copy your response for RepairScope."))}</p>
                    <button
                      type="button"
                      onClick={() => setExportedText(serializeContractorResponseExport(answers))}
                    >
                      {t(lt("準備回覆內容", "Prepare my response"))}
                    </button>
                    {exportedText && (
                      <div className="contractor-step__export">
                        <p>
                          {t(
                            lt(
                              "複製此內容給 RepairScope（例如貼回給邀請你的人）：",
                              "Copy this and send it to RepairScope (e.g. paste it back to the person who invited you):",
                            ),
                          )}
                        </p>
                        <textarea aria-label={t(lt("可複製的回覆內容", "Response to copy"))} readOnly value={exportedText} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
