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
// "No owner name" does not by itself make property detail non-identifying
// — district/building/floor/unit together can be. This module therefore
// reads ONLY category, a broad district, the observed-problem summary
// (built via summariseObservedFacts, which never touches propertyDetails),
// prior-action text, evidence availability, and non-identifying safety
// flags. It never reads landlordName/landlordEmail/landlordPhone/
// propertyAddress/accessNotes/internalReviewNotes, and it explicitly
// excludes landlordCorrections from the observed-facts summary (free-text
// owner corrections are the highest-risk channel for identifying detail —
// a correction could plausibly contain a phone number or flat number typed
// directly into free text) even though summariseObservedFacts would
// otherwise include them. See tests/stage1-contractor-brief.test.ts for
// direct proof that building/floor/unit/contact fields cannot leak through.
//
// This is Stage 1 only. A fuller Stage 2 brief (shown only after explicit
// owner sharing consent) is out of scope for this pass — see the
// reconciliation report's privacy section.

import { summariseObservedFacts } from "./brief";
import type { Lang } from "./i18n";
import type { RepairCategoryId } from "./types";

/** Defensive, minimal read shape for a stored generated brief — mirrors
 * GeneratedBriefDocument's own GeneratedBriefLike pattern (a brief arrives
 * as untyped JSON from the API), but only lists the fields this module
 * actually reads. Notably includes propertyDetails only so its `district`
 * can be read — building/block/floor/unit/accessBy/availability on that
 * same object are never accessed anywhere below. */
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
    symptomOther?: string;
  };
  reportedFacts?: string[];
  priorAction?: { status?: string; detail?: string };
  hasEvidence?: string;
  evidenceKind?: string;
  propertyDetails?: { district?: string };
};

export interface Stage1ContractorBrief {
  /** Raw category id (e.g. "leak") — resolved to a display label at render
   * time by the consuming UI, same convention as the rest of the app. */
  category: string;
  /** Broad district only — never building/block/floor/unit. */
  district?: string;
  /** Concise, localised observed-problem facts (what/when/worsening) —
   * built from the same summariser the owner's own review screen uses,
   * with landlordCorrections deliberately excluded (see module comment). */
  observedProblem: string[];
  /** e.g. "Owner already tried something — Called a plumber who couldn't
   * attend." Undefined if nothing was reported. */
  priorAction?: string;
  hasEvidence?: string;
  evidenceKind?: string;
  /** Non-identifying property-condition flags (e.g. "water_uncontrolled") —
   * already shown at the operator case-list level today. */
  safetyFlags: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildStage1ContractorBrief(
  input: { issueCategory: string; generatedBrief: unknown; safetyFlags: string[] },
  lang: Lang = "en",
): Stage1ContractorBrief {
  const brief: Stage1SourceBrief = isPlainObject(input.generatedBrief)
    ? (input.generatedBrief as Stage1SourceBrief)
    : {};

  const observedProblem = summariseObservedFacts(
    {
      category: brief.category as RepairCategoryId | undefined,
      observedFacts: brief.observedFacts,
      reportedFacts: brief.reportedFacts ?? [],
      // Deliberately omitted — see module comment.
      landlordCorrections: undefined,
    },
    lang,
    { style: "concise" },
  );

  const priorAction = brief.priorAction?.status
    ? [brief.priorAction.status, brief.priorAction.detail].filter(Boolean).join(" — ")
    : undefined;

  return {
    category: input.issueCategory,
    district: brief.propertyDetails?.district,
    observedProblem,
    priorAction,
    hasEvidence: brief.hasEvidence,
    evidenceKind: brief.evidenceKind,
    safetyFlags: input.safetyFlags,
  };
}
