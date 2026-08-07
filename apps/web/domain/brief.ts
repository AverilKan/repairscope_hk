import type { ProblemBrief, RepairIntakeDraft } from "./types";

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
