import { districtOptions, questionnaireFieldLabel, resolveAnswerLabel } from "@/data/questionnaires";
import { lt, type Lang, type LocalizedText } from "./i18n";
import type {
  ProblemBrief,
  ProblemBriefCorrectionResult,
  RepairCategoryId,
  RepairIntakeDraft,
} from "./types";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The canonical property_address sent to the backend — stable regardless
 * of which language the UI happened to be displaying when the owner
 * submitted (unlike resolveAnswerLabel, which is deliberately
 * language-dependent for on-screen rendering). Always includes both the
 * Chinese and English district name so the stored value means the same
 * thing however it is later read. Undefined when no address information
 * was given at all (only district is required — see data/questionnaires.ts's
 * addressStep — so a submission may legitimately have none of these).
 */
export function buildCanonicalPropertyAddress(
  draft: Pick<RepairIntakeDraft, "responses">,
): string | undefined {
  const r = draft.responses;
  const districtValue = str(r.district);
  const districtOption = districtValue
    ? districtOptions.find((option) => option.value === districtValue)
    : undefined;
  const districtLabel = districtOption ? `${districtOption.label.zh}／${districtOption.label.en}` : undefined;

  const parts = [districtLabel, str(r.building), str(r.block), str(r.floor), str(r.unit)].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

const NOT_SPECIFIED = { zh: "未提供", en: "Not specified" };

// Fixed boilerplate sentences shown in "08 What remains unconfirmed" and
// "09 What contractors must provide" — buildRepairBrief stores the stable
// key below (not a pre-baked English sentence), and GeneratedBriefDocument
// resolves it to the current language at render time via
// resolveConfirmedUnknown/resolveContractorRequest, the same pattern used
// for every other brief field.
const CONFIRMED_UNKNOWN_TEXT: Record<string, LocalizedText> = {
  "not-independently-confirmed": lt(
    "RepairScope 未有獨立確認成因或責任。",
    "RepairScope has not independently confirmed the cause or responsibility.",
  ),
  "shared-area-unconfirmed": lt(
    "係咪牽涉其他單位或公用地方，仍未確認。",
    "Whether another flat or common area is involved remains unconfirmed.",
  ),
  "inspection-required": lt(
    "師傅可能需要先檢查，先可以提出處理方法。",
    "A contractor may need to inspect before proposing an approach.",
  ),
};

const CONTRACTOR_REQUEST_TEXT: Record<string, LocalizedText> = {
  "state-diagnosis": lt("講低自己嘅判斷同信心程度。", "State a working diagnosis and confidence."),
  "separate-inspection": lt(
    "將檢查同實際維修工作分開講清楚。",
    "Separate inspection from proposed repair work.",
  ),
  "list-inclusions-exclusions": lt(
    "列明包括、不包括、假設同可能嘅額外費用。",
    "List inclusions, exclusions, assumptions and variation risks.",
  ),
  "confirm-price-availability": lt(
    "確認價錢、可安排時間、需時同保養。",
    "Confirm price, availability, duration and guarantee.",
  ),
};

// A value that is not a recognised key is rendered as-is — a defensive
// fallback for submissions persisted before this change, whose
// generated_brief already stored a plain English sentence directly rather
// than a key.
function resolveTextKey(dictionary: Record<string, LocalizedText>, value: string, lang: Lang): string {
  const entry = dictionary[value];
  return entry ? (lang === "zh" ? entry.zh : entry.en) : value;
}

export function resolveConfirmedUnknown(value: string, lang: Lang): string {
  return resolveTextKey(CONFIRMED_UNKNOWN_TEXT, value, lang);
}

export function resolveContractorRequest(value: string, lang: Lang): string {
  return resolveTextKey(CONTRACTOR_REQUEST_TEXT, value, lang);
}

const CORRECTION_LABEL = lt("業主更正：", "Owner correction: ");

/**
 * Pairs a resolved answer with its own question/field text (e.g. "Can the
 * water be isolated?: Yes") — a bare resolved value on its own can be
 * ambiguous (a lone "Yes"/"No" in a list says nothing about what it
 * answers), but repeating the field's own label is not duplicating the
 * whole questionnaire, just labelling one fact. Falls back to the bare
 * value if this schema has no label for the field (should not happen for a
 * real category, but keeps this defensive like the rest of this file).
 */
function labelledFact(
  category: RepairCategoryId,
  fieldId: string,
  resolvedValue: string,
  lang: Lang,
): string {
  const question = questionnaireFieldLabel(category, fieldId, lang);
  if (!question) return resolvedValue;
  return lang === "zh" ? `${question}：${resolvedValue}` : `${question}: ${resolvedValue}`;
}

/**
 * Renders a brief's observed facts (a standard category's affected area,
 * branch answers and timeline, or an other/unsure category's short
 * description) as display strings for the current language — the single
 * shared implementation behind both the "Check the facts" brief document
 * and the post-submission confirmation screen, so neither shows an empty
 * list for a standard category now that reportedFacts is intentionally
 * empty there (see buildRepairBrief).
 *
 * Always appends reportedFacts (the other/unsure free-text description, or
 * — for a standard category — nothing until a correction is applied) and
 * any landlordCorrections, each with a localised label added here rather
 * than baked into the stored text. A correction must remain visible for a
 * standard category too — it is not conditional on hasObservedFacts, or an
 * owner's correction to a fully answered "leak" journey would silently
 * disappear from this section.
 */
export function summariseObservedFacts(
  brief: Pick<ProblemBrief, "category" | "observedFacts" | "reportedFacts" | "landlordCorrections">,
  lang: Lang,
): string[] {
  const category = brief.category;
  const of = brief.observedFacts;
  const hasObservedFacts = Boolean(
    of && (of.affected || of.branchFirst || of.branchSecond || of.branchThird || of.duration || of.frequency || of.worsening),
  );
  const resolve = (fieldId: string, value: string | undefined) =>
    category ? resolveAnswerLabel(category, fieldId, value, lang) : NOT_SPECIFIED[lang];
  // Each row is labelled with its own question text — a bare resolved
  // value like "Yes" is ambiguous on its own (see labelledFact); this is
  // the only formatting difference from the raw resolved values.
  const observed =
    hasObservedFacts && category
      ? [
          ...(of!.affected ? [labelledFact(category, "affected", resolve("affected", of!.affected), lang)] : []),
          // Each branch answer is rendered against its OWN known field
          // identity — observedFacts.branchFirst/Second/Third are already
          // separately named, so there is no need (and it is actively
          // wrong) to guess which field a value came from by trying field
          // ids in order and taking the first match: that breaks whenever
          // two branch fields share the same raw value (e.g. all three
          // answered "unsure"), silently mislabelling the 2nd/3rd answer
          // under the 1st question.
          ...(of!.branchFirst
            ? [labelledFact(category, "branchFirst", resolve("branchFirst", of!.branchFirst), lang)]
            : []),
          ...(of!.branchSecond
            ? [labelledFact(category, "branchSecond", resolve("branchSecond", of!.branchSecond), lang)]
            : []),
          ...(of!.branchThird
            ? [labelledFact(category, "branchThird", resolve("branchThird", of!.branchThird), lang)]
            : []),
          ...(of!.duration ? [labelledFact(category, "duration", resolve("duration", of!.duration), lang)] : []),
          ...(of!.frequency
            ? [labelledFact(category, "frequency", resolve("frequency", of!.frequency), lang)]
            : []),
          ...(of!.worsening
            ? [labelledFact(category, "worsening", resolve("worsening", of!.worsening), lang)]
            : []),
        ]
      : [];
  const correctionLabel = lang === "zh" ? CORRECTION_LABEL.zh : CORRECTION_LABEL.en;
  const corrections = (brief.landlordCorrections ?? []).map((text) => `${correctionLabel}${text}`);
  return [...observed, ...(brief.reportedFacts ?? []), ...corrections];
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
  const isOpenCategory = draft.category === "other" || draft.category === "unsure";
  // Standard categories have no single free-text "story" (the HK flow is
  // category-first, not free-text-first) — otherDetail only exists for
  // other/unsure categories. Falls back to draft.originalReport for the
  // one remaining caller that still supplies it (BriefReviewRoute's
  // unrelated fetched-brief path).
  const originalReport = str(r.otherDetail) ?? str(draft.originalReport) ?? "";

  // A standard category's actual observations live in affected/branchFirst/
  // Second/Third — these must reach reportedFacts, or the review shows an
  // empty "Reported facts" section despite the owner having answered every
  // question (the bug this function exists to fix). Only populated for
  // non-open categories; other/unsure has no branch questions to report.
  const observedFacts = isOpenCategory
    ? undefined
    : {
        affected: str(r.affected),
        branchFirst: str(r.branchFirst),
        branchSecond: str(r.branchSecond),
        branchThird: str(r.branchThird),
        duration: str(r.duration),
        frequency: str(r.frequency),
        worsening: str(r.worsening),
      };

  const reportedFacts = [
    ...(originalReport ? [originalReport] : []),
    ...draft.extractedSymptoms.map((symptom) => `Reported: ${symptom}.`),
  ];

  return {
    id: `brief-${draft.id}-v1`,
    repairId: draft.id,
    originalReport,
    // GeneratedBriefDocument renders observedFacts (resolved bilingually)
    // as the primary content of "02 Reported / observed facts" for
    // standard categories, and falls back to reportedFacts/originalReport
    // for other/unsure and for BriefReviewRoute's unrelated fetched-brief
    // path — reportedFacts itself intentionally stays empty for a standard
    // category rather than being padded with placeholder text.
    reportedFacts,
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
    // Stable keys, resolved bilingually at render time by
    // resolveConfirmedUnknown/resolveContractorRequest — not pre-baked
    // English sentences (see those functions' own comment).
    confirmedUnknowns: [
      "not-independently-confirmed",
      ...(r.sharedArea === "unsure" ? ["shared-area-unconfirmed"] : []),
      "inspection-required",
    ],
    contractorRequests: [
      "state-diagnosis",
      "separate-inspection",
      "list-inclusions-exclusions",
      "confirm-price-availability",
    ],
    version: 1,

    category: draft.category,
    observedFacts,
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
    propertyDetails: {
      district: str(r.district),
      building: str(r.building),
      block: str(r.block),
      floor: str(r.floor),
      unit: str(r.unit),
      accessBy: str(r.accessBy),
      availability: str(r.availability),
    },
    relationship: str(r.relationship),
    additionalContext: str(r.additionalContext),
    hasEvidence: str(r.hasEvidence),
    evidenceKind: str(r.evidenceKind),
  };
}

const CHANGE_SUMMARY_TEXT = lt(
  "更正已加入報告事實，並無加入任何診斷或建議做法。",
  "The factual correction was added to Reported facts. No diagnosis or proposed remedy was introduced.",
);
const CHANGED_SECTIONS_TEXT: LocalizedText[] = [
  lt("報告事實", "Reported facts"),
  lt("業主更正", "Landlord correction"),
  lt("簡報版本", "Brief version"),
];

/**
 * Pure, deterministic application of a landlord's factual correction to an
 * existing brief — appends the correction (raw text, untranslated — see
 * landlordCorrections on ProblemBrief) and bumps the version; never invents
 * a diagnosis or rewrites the original report. Used directly by the public
 * intake flow (no backend round-trip, same reason as buildRepairBrief
 * above) and by MockContractorBriefService.applyCorrection so both share
 * one implementation.
 *
 * lang controls only the localised changeSummary/changedSections text
 * returned here and the "Owner correction:" label baked into
 * summariseObservedFacts's rendering — it does not translate the owner's
 * own correction text, which is free-form input in whichever language they
 * typed it. Defaults to "en" for callers (e.g. the UK-reference mock
 * service) that have no language context of their own.
 */
export function applyBriefCorrection(
  brief: ProblemBrief,
  correction: string,
  lang: Lang = "en",
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
      landlordCorrections: [...(brief.landlordCorrections ?? []), factualCorrection],
      version: nextVersion,
    },
    changeSummary: lang === "zh" ? CHANGE_SUMMARY_TEXT.zh : CHANGE_SUMMARY_TEXT.en,
    changedSections: CHANGED_SECTIONS_TEXT.map((entry) => (lang === "zh" ? entry.zh : entry.en)),
  };
}
