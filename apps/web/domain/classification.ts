import type { IssueClassification, RepairCategoryId } from "./types";

/**
 * Pure, deterministic keyword-based category guess from a free-text report.
 * Used directly by the public intake flow (no backend round-trip — this is
 * a category-selection aid, not a diagnosis, and never rejects or narrows
 * what a landlord may report; see docs/PUBLIC_INGESTION_LAUNCH.md) and by
 * MockIssueClassificationService so both share one implementation.
 */
export function classifyIssueReport(report: string): IssueClassification {
  const source = report.toLowerCase();
  let primaryCategory: RepairCategoryId = "general-maintenance";
  let alternativeCategory: RepairCategoryId | undefined;

  if (/ceiling|rain|roof|tile|flashing/.test(source)) {
    primaryCategory = "roofing";
    alternativeCategory = "damp-mould";
  } else if (/leak|pipe|tap|toilet|water/.test(source)) {
    primaryCategory = "plumbing-leak";
    alternativeCategory = "roofing";
  } else if (/boiler|heating|hot water/.test(source)) {
    primaryCategory = "boiler-heating";
  } else if (/socket|power|electric|light/.test(source)) {
    primaryCategory = "electrical";
  }

  const symptoms = [
    /ceiling/.test(source) ? "ceiling affected" : undefined,
    /rain/.test(source) ? "triggered by rainfall" : undefined,
    /drip|leak|water/.test(source) ? "water present" : undefined,
    /stain|brown patch/.test(source) ? "visible staining" : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    primaryCategory,
    alternativeCategory,
    symptoms: symptoms.length > 0 ? symptoms : ["reported repair symptom"],
    confidence: symptoms.length > 1 ? "high" : "medium",
    safetyFieldsPrefilled: false,
  };
}
