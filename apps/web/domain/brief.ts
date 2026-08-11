import type {
  ProblemBrief,
  ProblemBriefCorrectionResult,
  RepairIntakeDraft,
} from "./types";

/**
 * Pure, deterministic transformation of questionnaire answers into a
 * landlord-reviewable neutral brief — no diagnosis, no invented scope or
 * price, no contractor chosen. Used directly by the public intake flow (no
 * backend round-trip) and by MockContractorBriefService.generate so both
 * share one implementation. See docs/PUBLIC_INGESTION_LAUNCH.md.
 */
export function buildRepairBrief(draft: RepairIntakeDraft): ProblemBrief {
  return {
    id: `brief-${draft.id}-v1`,
    repairId: draft.id.replace("draft", "repair"),
    originalReport: draft.originalReport,
    reportedFacts: [
      draft.originalReport,
      ...draft.extractedSymptoms.map((symptom) => `Reported: ${symptom}.`),
    ],
    structuredSymptoms: draft.extractedSymptoms,
    affectedArea: String(
      draft.responses.plumbingLocation ??
        draft.responses.dampLocation ??
        "Area stated in report",
    ),
    onsetAndTriggers: [
      String(
        draft.responses.electricalOnset ??
          draft.responses.dampDuration ??
          "Timing not confirmed",
      ),
    ],
    evidence: [],
    urgency: (draft.responses.urgency as ProblemBrief["urgency"]) ?? "routine",
    occupancy:
      (draft.responses.occupancy as ProblemBrief["occupancy"]) ?? "other",
    accessOverview: String(
      draft.responses.access ?? "Access responsibility not confirmed",
    ),
    confirmedUnknowns: [
      "The technical cause has not been confirmed.",
      "Hidden damage and access requirements may change the scope.",
    ],
    contractorRequests: [
      "State a working diagnosis and confidence.",
      "Separate inspection from proposed repair work.",
      "List inclusions, exclusions, assumptions and variation risks.",
      "Confirm price, VAT, availability, duration and guarantee.",
    ],
    version: 1,
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
  if (/simulate (a )?regeneration failure/i.test(factualCorrection)) {
    throw new Error("Brief regeneration failed.");
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
