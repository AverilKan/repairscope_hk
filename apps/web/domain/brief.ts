import type {
  ProblemBrief,
  ProblemBriefCorrectionResult,
  RepairIntakeDraft,
} from "./types";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Pure, deterministic transformation of questionnaire answers into a
 * landlord-reviewable neutral brief — no diagnosis, no invented scope or
 * price, no contractor chosen. Used directly by the public intake flow (no
 * backend round-trip) and by MockContractorBriefService.generate so both
 * share one implementation. See docs/PUBLIC_INGESTION_LAUNCH.md.
 *
 * Stores raw answer values (not pre-baked English/Chinese strings) — see
 * ProblemBrief's Hong Kong review-section fields in domain/types.ts — so
 * GeneratedBriefDocument can render the same stored brief correctly in
 * either language via data/questionnaires.ts's resolveAnswerLabel.
 */
export function buildRepairBrief(draft: RepairIntakeDraft): ProblemBrief {
  const r = draft.responses;
  // Standard categories have no single free-text "story" (the HK flow is
  // category-first, not free-text-first) — otherDetail only exists for
  // other/unsure categories. Falls back to draft.originalReport for the
  // one remaining caller that still supplies it (BriefReviewRoute's
  // unrelated fetched-brief path).
  const originalReport = str(r.otherDetail) ?? str(draft.originalReport) ?? "";

  return {
    id: `brief-${draft.id}-v1`,
    repairId: draft.id,
    originalReport,
    reportedFacts: [
      ...(originalReport ? [originalReport] : []),
      ...draft.extractedSymptoms.map((symptom) => `Reported: ${symptom}.`),
    ],
    structuredSymptoms: draft.extractedSymptoms,
    affectedArea: str(r.affected) ?? str(r.otherDetail) ?? "",
    onsetAndTriggers: [str(r.branchFirst), str(r.duration), str(r.frequency)].filter(
      (value): value is string => Boolean(value),
    ),
    evidence: [],
    urgency:
      r.safety && r.safety !== "none"
        ? "emergency"
        : (r.duration === "today" ? "urgent" : "routine"),
    occupancy: "other",
    accessOverview: str(r.availability) ?? "",
    confirmedUnknowns: [
      "RepairScope has not independently confirmed the cause or responsibility.",
      ...(r.sharedArea === "unsure"
        ? ["Whether another flat or common area is involved remains unconfirmed."]
        : []),
      "A contractor may need to inspect before proposing an approach.",
    ],
    contractorRequests: [
      "State a working diagnosis and confidence.",
      "Separate inspection from proposed repair work.",
      "List inclusions, exclusions, assumptions and variation risks.",
      "Confirm price, availability, duration and guarantee.",
    ],
    version: 1,

    category: draft.category,
    priorAction: r.prior
      ? { status: String(r.prior), detail: str(r.priorDetail) }
      : undefined,
    buildingContext:
      r.management || r.sharedArea
        ? {
            managementContacted: String(r.management ?? ""),
            sharedAreaInvolved: String(r.sharedArea ?? ""),
          }
        : undefined,
    propertyLine: [str(r.building), str(r.block), str(r.floor), str(r.unit)]
      .filter(Boolean)
      .join(" "),
    relationship: str(r.relationship),
    additionalContext: str(r.additionalContext),
    hasEvidence: str(r.hasEvidence),
    evidenceKind: str(r.evidenceKind),
  };
}

/**
 * Pure, deterministic application of a landlord's factual correction to an
 * existing brief — appends the correction to Reported facts and bumps the
 * version; never invents a diagnosis or rewrites the original report. Used
 * directly by the public intake flow (no backend round-trip, same reason as
 * buildRepairBrief above) and by MockContractorBriefService.applyCorrection
 * so both share one implementation.
 */
export function applyBriefCorrection(
  brief: ProblemBrief,
  correction: string,
): ProblemBriefCorrectionResult {
  const factualCorrection = correction.trim();
  if (!factualCorrection) {
    throw new Error("A factual correction is required.");
  }

  const nextVersion = brief.version + 1;
  return {
    brief: {
      ...brief,
      id: `${brief.id.replace(/-v\d+$/, "")}-v${nextVersion}`,
      reportedFacts: [
        ...brief.reportedFacts,
        `Landlord correction: ${factualCorrection}`,
      ],
      landlordCorrections: factualCorrection,
      version: nextVersion,
    },
    changeSummary:
      "The factual correction was added to Reported facts. No diagnosis or proposed remedy was introduced.",
    changedSections: ["Reported facts", "Landlord correction", "Brief version"],
  };
}
