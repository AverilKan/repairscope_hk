// Stage-1 contractor sourcing brief — the minimised summary a contractor
// sees BEFORE any sharing consent has been confirmed for their case. Real
// owner submissions currently begin with consent_to_share_with_contractors
// = false (see domain/operatorSubmission.ts); this module is the typed
// boundary that keeps that true regardless of what a future contractor-
// facing screen tries to render.
//
// This is deliberately NOT the old UK reference prototype's
// SanitisedContractorBrief copied over — it is built fresh against HK's own
// ProblemBrief/OperatorSubmissionDetail shape (see domain/brief.ts,
// domain/operatorSubmission.ts), and only carries the fields this codebase
// actually has a source of truth for.
//
// PRIVACY MODEL: controlled/structured facts only, never arbitrary owner
// free text. "No owner name" does not by itself make property detail
// non-identifying — district/building/floor/unit together can be, and
// owner-authored free text (a "what happened" description, an "Other"
// symptom detail, a correction, what a previous contractor supposedly
// said) can just as easily embed a phone number, a flat number or a name
// typed directly into the text. So this module never reads raw owner
// free-text fields at all: every fact below is reconstructed from
// controlled questionnaire answer IDs, resolved to their existing
// human-facing option labels via data/questionnaires.ts's
// resolveAnswerLabel/resolveAnswerLabels (the same trusted mapping the
// rest of the app already uses) — never displayed as raw internal codes
// (e.g. "leak", "wan-chai") and never as owner-entered text. Concretely,
// this module never reads: reportedFacts (the owner's free-text
// description), observedFacts.symptomOther (the "Other" option's free
// text — represented only as a neutral "also reported" flag, never its
// content), priorAction.detail (what someone reportedly said, which the
// questionnaire's own field label warns "can embed anyone's original
// wording"), landlordCorrections, or any propertyDetails field beyond a
// resolved district label. If a fact has no safe controlled source, it is
// omitted rather than approximated — privacy minimisation over
// completeness at this stage. See tests/stage1-contractor-brief.test.ts
// for direct adversarial proof: unique secret markers placed into every
// plausible free-text source never appear anywhere in the serialised
// output.
//
// This is Stage 1 only. A fuller Stage 2 brief (shown only after explicit
// owner sharing consent) is out of scope for this pass — see the
// reconciliation report's privacy section.
//
// CATEGORY VALIDATION: input.issueCategory arrives as an untyped runtime
// string (the backend currently validates issue_category as a bounded
// string, not a strict enum — see repair_submissions.py; that is a
// separate, not-yet-implemented hardening opportunity and is deliberately
// NOT changed here, since this module must independently fail closed
// regardless of backend strictness, historical data or future schema
// drift). It is therefore never cast to RepairCategoryId and used
// directly — isKnownCategory checks it against the actual, current
// categoryOptions table first. An unrecognised value: never appears
// verbatim anywhere in the output (a small controlled fallback label is
// used instead — see FALLBACK_CATEGORY_LABEL); never causes a
// questionnaireByCategory[...] lookup (which would throw for an unknown
// key) — every category-specific helper below (buildObservedProblem,
// resolveAnswerLabel for prior/hasEvidence/evidenceKind) is only ever
// called with a category already confirmed to be a real key.

import { categoryOptions, districtOptions, questionnaireFieldLabel, resolveAnswerLabel, resolveAnswerLabels, SYMPTOM_OTHER_VALUE } from "@/data/questionnaires";
import type { Lang } from "./i18n";
import type { RepairCategoryId } from "./types";

const FALLBACK_CATEGORY_LABEL: Record<Lang, string> = {
  en: "Repair issue",
  zh: "維修問題",
};

/** The single runtime source of truth for "is this a real category" —
 * the same categoryOptions table categoryLabel resolution and every
 * category-specific step lookup below both rely on. Never trust
 * `issueCategory as RepairCategoryId` without this check first. */
function isKnownCategory(issueCategory: string): issueCategory is RepairCategoryId {
  return categoryOptions.some((option) => option.value === issueCategory);
}

/** Defensive, minimal read shape for a stored generated brief — mirrors
 * GeneratedBriefDocument's own GeneratedBriefLike pattern (a brief arrives
 * as untyped JSON from the API), but only lists the fields this module is
 * willing to read at all. Free-text fields (reportedFacts, symptomOther's
 * own text is read only to test truthiness, priorAction.detail,
 * landlordCorrections) are deliberately typed here only where a
 * presence/absence check is safe — their VALUES are never copied into the
 * output. propertyDetails only exposes `district` so nothing else on that
 * object (building/block/floor/unit/accessBy/availability) can ever be
 * read below. */
type Stage1SourceBrief = {
  category?: string;
  observedFacts?: {
    affected?: string;
    branchFirst?: string | string[];
    branchSecond?: string | string[];
    branchThird?: string | string[];
    duration?: string;
    frequency?: string;
    worsening?: string;
    /** Presence checked only — never read into the output. */
    symptomOther?: string;
  };
  /** Presence of `status` only — `detail` is never read. */
  priorAction?: { status?: string };
  hasEvidence?: string;
  evidenceKind?: string;
  propertyDetails?: { district?: string };
};

export interface Stage1ContractorBrief {
  /** Human-facing category label, resolved from the same categoryOptions
   * table the rest of the app uses — never the raw category id. */
  category: string;
  /** Human-facing broad district label — never building/block/floor/unit,
   * never the raw district id. */
  district?: string;
  /** Concise, localised, controlled observed-problem facts (what/when/
   * worsening), each resolved to an existing option label. Never includes
   * owner free text — see module comment. */
  observedProblem: string[];
  /** Controlled previous-action category only, e.g. "Previous action:
   * Repair already attempted" — never the free-text detail of what was
   * said. Undefined if nothing was reported. */
  priorAction?: string;
  /** Human-facing label, e.g. "Yes, I can provide this later". */
  hasEvidence?: string;
  /** Human-facing label, e.g. "Repair photo / video". */
  evidenceKind?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/** Strips the "other" raw value out of a multi_select branch answer — its
 * free text is never shown at Stage 1 (see symptomOther handling below),
 * so the bare "Other" option label would be a confusing, contentless row
 * on its own. Mirrors domain/brief.ts's private withoutOtherValue. */
function withoutOtherValue(value: string | string[] | undefined): string | string[] | undefined {
  if (!Array.isArray(value)) return value;
  const filtered = value.filter((entry) => entry !== SYMPTOM_OTHER_VALUE);
  return filtered.length > 0 ? filtered : undefined;
}

function labelled(category: RepairCategoryId, fieldId: string, value: string, lang: Lang): string {
  const label = questionnaireFieldLabel(category, fieldId, lang);
  if (!label) return value;
  return lang === "zh" ? `${label}：${value}` : `${label}: ${value}`;
}

/** Rebuilds the observed-problem facts from controlled questionnaire
 * answer IDs only — deliberately NOT domain/brief.ts's
 * summariseObservedFacts, which also folds in reportedFacts (owner free
 * text), the raw symptomOther text, and landlordCorrections. */
function buildObservedProblem(category: RepairCategoryId, of: Stage1SourceBrief["observedFacts"], lang: Lang): string[] {
  if (!of) return [];
  const rows: string[] = [];
  const joinSeparator = lang === "zh" ? "、" : ", ";

  if (of.affected) {
    rows.push(labelled(category, "affected", resolveAnswerLabel(category, "affected", of.affected, lang), lang));
  }
  for (const fieldId of ["branchFirst", "branchSecond", "branchThird"] as const) {
    const value = withoutOtherValue(of[fieldId]);
    if (!hasValue(value)) continue;
    const labels = resolveAnswerLabels(category, fieldId, value, lang);
    if (labels.length === 0) continue;
    rows.push(labelled(category, fieldId, labels.join(joinSeparator), lang));
  }
  // The owner's "Other" free text is never shown at Stage 1 — only a
  // neutral, content-free flag that one was given.
  if (of.symptomOther) {
    rows.push(lang === "zh" ? "業主亦提供咗其他情況（詳情未提供）" : "Other issue also reported (detail not shown yet)");
  }
  for (const fieldId of ["duration", "frequency", "worsening"] as const) {
    const value = of[fieldId];
    if (!value) continue;
    rows.push(labelled(category, fieldId, resolveAnswerLabel(category, fieldId, value, lang), lang));
  }
  return rows;
}

export function buildStage1ContractorBrief(
  input: { issueCategory: string; generatedBrief: unknown },
  lang: Lang = "en",
): Stage1ContractorBrief {
  const brief: Stage1SourceBrief = isPlainObject(input.generatedBrief)
    ? (input.generatedBrief as Stage1SourceBrief)
    : {};

  // Fail closed: an unrecognised issueCategory (malformed data, historical
  // record, future schema drift) resolves to `undefined` here, and every
  // category-specific lookup below is gated on it — never on the raw
  // input.issueCategory string, which is never read again past this line.
  const knownCategory = isKnownCategory(input.issueCategory) ? input.issueCategory : undefined;

  const categoryLabel = knownCategory
    ? categoryOptions.find((option) => option.value === knownCategory)!.label[lang]
    : FALLBACK_CATEGORY_LABEL[lang];

  const districtLabel = brief.propertyDetails?.district
    ? districtOptions.find((option) => option.value === brief.propertyDetails?.district)?.label[lang]
    : undefined;

  const observedProblem = knownCategory ? buildObservedProblem(knownCategory, brief.observedFacts, lang) : [];

  const priorAction =
    knownCategory && brief.priorAction?.status
      ? labelled(knownCategory, "prior", resolveAnswerLabel(knownCategory, "prior", brief.priorAction.status, lang), lang)
      : undefined;

  return {
    category: categoryLabel,
    district: districtLabel,
    observedProblem,
    priorAction,
    hasEvidence:
      knownCategory && brief.hasEvidence
        ? resolveAnswerLabel(knownCategory, "hasEvidence", brief.hasEvidence, lang)
        : undefined,
    evidenceKind:
      knownCategory && brief.evidenceKind
        ? resolveAnswerLabel(knownCategory, "evidenceKind", brief.evidenceKind, lang)
        : undefined,
  };
}
