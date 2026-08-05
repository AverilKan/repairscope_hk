import type {
  SubmittedContractorResponse,
  SubmittedRepairQuote,
} from "./types";

export type ComparisonIssueKey =
  | "duration_missing"
  | "warranty_missing"
  | "estimate_price"
  | "price_may_change"
  | "materials_uncertain"
  | "vat_unclear"
  | "exclusions_unclear"
  | "source_work_excluded"
  | "making_good_unclear";

export interface DraftedClarificationQuestion {
  id: string;
  issueKey: ComparisonIssueKey | "custom";
  text: string;
  selected: boolean;
}

export function clarificationIssueKeys(
  response: SubmittedContractorResponse,
): ComparisonIssueKey[] {
  if (response.responseType !== "repair_quote") return [];
  const quote = response.submittedData as SubmittedRepairQuote;
  const keys: ComparisonIssueKey[] = [];
  const priceChangeConditionsStated =
    quote.priceChangeReasons.length > 0 ||
    Boolean(quote.otherPriceChangeReason.trim()) ||
    Boolean(quote.priceChangeNote.trim());
  if (!quote.duration.trim()) keys.push("duration_missing");
  if (!quote.guaranteePosition) keys.push("warranty_missing");
  if (quote.priceStatus === "estimate" && !priceChangeConditionsStated) {
    keys.push("estimate_price");
  }
  if (quote.priceStatus === "may_change" && !priceChangeConditionsStated) {
    keys.push("price_may_change");
  }
  if (
    quote.materialsStatus === "to_confirm" ||
    !quote.materialsStatus
  ) {
    keys.push("materials_uncertain");
  }
  if (
    !quote.vatRegistered ||
    (quote.vatRegistered === "yes" &&
      (!quote.vatIncluded || !quote.vatRate))
  ) {
    keys.push("vat_unclear");
  }
  if (!quote.exclusions.length && !quote.otherExclusion.trim()) {
    keys.push("exclusions_unclear");
  }
  const sourcePattern =
    /source of (the )?(water|leak)|water ingress|roof inspection|external repair|roof|flashing|tile/i;
  const internalRepairPattern =
    /paint|plaster|decorat|stain block|ceiling|wall|make good/i;
  const scopeText = quote.workItems.map((item) => item.label).join(" ");
  const exclusionText = quote.exclusions.join(" ");
  if (
    internalRepairPattern.test(scopeText) &&
    !sourcePattern.test(scopeText) &&
    !sourcePattern.test(exclusionText)
  ) {
    keys.push("source_work_excluded");
  }
  if (
    !/make good|making.good|patch|plaster|redecorat|finish coat|stain block/i.test(
      scopeText,
    ) &&
    !/making.good|decoration/i.test(exclusionText)
  ) {
    keys.push("making_good_unclear");
  }
  return keys;
}

const questionByIssue: Record<ComparisonIssueKey, string> = {
  duration_missing:
    "Please confirm how long the proposed work is expected to take.",
  warranty_missing:
    "Is a guarantee included with the proposed work? Please confirm its duration and what it covers.",
  estimate_price:
    "Is the submitted total fixed, or could it change after attendance?",
  price_may_change:
    "Please confirm what could cause the submitted total to change.",
  materials_uncertain:
    "Please confirm the main materials and whether their costs are now confirmed.",
  vat_unclear:
    "Please confirm whether VAT applies and whether it is included in the submitted total.",
  exclusions_unclear:
    "Please confirm whether anything is excluded from the proposed work.",
  source_work_excluded:
    "Does the quote include addressing the source of the water ingress?",
  making_good_unclear: "Please confirm whether making-good is included.",
};

export function draftClarificationQuestions(
  response: SubmittedContractorResponse,
  issueKeys: ComparisonIssueKey[] = clarificationIssueKeys(response),
): DraftedClarificationQuestion[] {
  const uniqueKeys = [...new Set(issueKeys)];
  return uniqueKeys.map((issueKey, index) => ({
    id: `${response.responseId}-${issueKey}-${index + 1}`,
    issueKey,
    text: questionByIssue[issueKey],
    selected: true,
  }));
}

export function clarificationQuestionIsPrivate(
  question: string,
  competitorNames: string[] = [],
) {
  const source = question.toLowerCase();
  if (
    /other contractor|another contractor|competitor|cheapest|best quote|beat (the|their)|£\s?\d/.test(
      source,
    )
  ) {
    return false;
  }
  return competitorNames.every(
    (name) => !source.includes(name.trim().toLowerCase()),
  );
}
