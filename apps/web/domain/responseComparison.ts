import type {
  Contractor,
  SanitisedContractorBrief,
  SubmittedContractorResponse,
  SubmittedInspectionRequest,
  SubmittedRepairQuote,
} from "./types";
import {
  addMoney,
  formatMoney,
  moneyEquals,
} from "./money";

export type ResponseComparisonState =
  | "no_responses"
  | "one_quote"
  | "three_quotes"
  | "quotes_and_inspection"
  | "question"
  | "revised"
  | "withdrawn"
  | "all_declined";

export interface RepairQuoteRecord {
  id: string;
  responseType: "repair_quote";
  contractor: Contractor;
  versions: SubmittedContractorResponse[];
  latestVersion: number;
  lifecycle: "active" | "withdrawn";
  withdrawnAt?: string;
}

export function importedResponseRecord(
  response: SubmittedContractorResponse,
  businessName: string,
): RepairQuoteRecord {
  return {
    id: `record-${response.responseId}`,
    responseType: "repair_quote",
    contractor: {
      id: response.contractorId,
      displayName: businessName,
      trade: "External quote · landlord imported",
    },
    versions: [structuredClone(response)],
    latestVersion: response.version,
    lifecycle: "active",
  };
}

export interface InspectionResponseRecord {
  id: string;
  responseType: "inspection";
  contractor: Contractor;
  response: SubmittedContractorResponse;
}

export interface ContractorQuestionRecord {
  id: string;
  responseType: "question";
  contractor: Contractor;
  question: string;
  context: string;
  submittedAt: string;
  status: "awaiting_landlord";
}

export interface InactiveResponseRecord {
  id: string;
  responseType: "decline" | "expired";
  contractor: Contractor;
  note: string;
  occurredAt: string;
}

export interface RepairResponseBundle {
  repairId: string;
  repairReference: string;
  repairTitle: string;
  lastUpdatedAt: string;
  brief: SanitisedContractorBrief;
  repairQuotes: RepairQuoteRecord[];
  inspections: InspectionResponseRecord[];
  questions: ContractorQuestionRecord[];
  inactiveResponses: InactiveResponseRecord[];
}

export interface LandlordComparisonAuthContext {
  userKind: "verified_clerk_user" | "anonymous" | "contractor_invitation";
  emailVerified: boolean;
  capabilities: ("landlord" | "contractor")[];
  permittedRepairIds: string[];
}

export type ComparisonAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "authentication_required"
        | "verified_email_required"
        | "landlord_capability_required"
        | "repair_permission_required";
    };

export function responseComparisonAccessDecision(
  auth: LandlordComparisonAuthContext,
  repairId: string,
): ComparisonAccessDecision {
  if (auth.userKind !== "verified_clerk_user") {
    return { allowed: false, reason: "authentication_required" };
  }
  if (!auth.emailVerified) {
    return { allowed: false, reason: "verified_email_required" };
  }
  if (!auth.capabilities.includes("landlord")) {
    return { allowed: false, reason: "landlord_capability_required" };
  }
  if (!auth.permittedRepairIds.includes(repairId)) {
    return { allowed: false, reason: "repair_permission_required" };
  }
  return { allowed: true };
}

export function latestSubmittedResponse(record: RepairQuoteRecord) {
  const response = record.versions.find(
    (version) => version.version === record.latestVersion,
  );
  if (!response) throw new Error(`Latest response missing for ${record.id}`);
  return response;
}

export function submittedRepairQuote(record: RepairQuoteRecord) {
  const response = latestSubmittedResponse(record);
  if (response.responseType !== "repair_quote") {
    throw new Error(`Expected a repair quote for ${record.id}`);
  }
  return response.submittedData as SubmittedRepairQuote;
}

export function submittedInspection(record: InspectionResponseRecord) {
  return record.response.submittedData as SubmittedInspectionRequest;
}

export function activeRepairQuotes(bundle: RepairResponseBundle) {
  return bundle.repairQuotes.filter((record) => record.lifecycle === "active");
}

export function missingQuoteDetails(quote: SubmittedRepairQuote) {
  const missing: string[] = [];
  if (!quote.workItems.length) missing.push("Work included");
  if (!quote.mainMaterials.length && !quote.customMaterial.trim()) {
    missing.push("Main materials");
  }
  if (!quote.exclusions.length && !quote.otherExclusion.trim()) {
    missing.push("Exclusions");
  }
  if (!quote.startAvailability.trim() && !quote.laterStartDate.trim()) {
    missing.push("Earliest start");
  }
  if (!quote.duration.trim()) missing.push("Duration");
  if (!quote.guaranteePosition) missing.push("Warranty position");
  if (quote.guaranteePosition === "yes" && !quote.guaranteeDuration.trim()) {
    missing.push("Warranty duration");
  }
  if (quote.vatRegistered === "") missing.push("VAT treatment");
  return missing;
}

export type DifferenceKey =
  | "scope"
  | "total"
  | "price_status"
  | "start"
  | "duration"
  | "warranty"
  | "missing";

export interface ComparisonDifference {
  key: DifferenceKey;
  label: string;
  detail: string;
}

export function deriveComparisonDifferences(
  bundle: RepairResponseBundle,
): ComparisonDifference[] {
  const records = activeRepairQuotes(bundle);
  if (records.length < 2) return [];
  const quotes = records.map(submittedRepairQuote);
  const totals = quotes.map((quote) => quote.finalTotal.amountMinor);
  const output: ComparisonDifference[] = [];

  if (new Set(totals).size > 1) {
    output.push({
      key: "total",
      label: "Submitted totals differ",
      detail: `Active repair quotes range from ${formatMoney({ amountMinor: Math.min(...totals), currency: "GBP" })} to ${formatMoney({ amountMinor: Math.max(...totals), currency: "GBP" })}.`,
    });
  }
  if (new Set(quotes.map((quote) => quote.workItems.length)).size > 1) {
    output.push({
      key: "scope",
      label: "Work included is not identical",
      detail: "Some responses cover more work items or include making-good.",
    });
  }
  if (new Set(quotes.map((quote) => quote.priceStatus)).size > 1) {
    output.push({
      key: "price_status",
      label: "Price certainty varies",
      detail: "The responses include both fixed prices and estimates.",
    });
  }
  if (quotes.some((quote) => missingQuoteDetails(quote).length > 0)) {
    output.push({
      key: "missing",
      label: "Some details are not stated",
      detail: "Missing information is marked in amber in the comparison.",
    });
  }
  if (
    new Set(
      quotes.map((quote) =>
        quote.guaranteePosition === "yes"
          ? quote.guaranteeDuration
          : quote.guaranteePosition,
      ),
    ).size > 1
  ) {
    output.push({
      key: "warranty",
      label: "Warranty positions differ",
      detail: "Check both the stated duration and what the warranty covers.",
    });
  }
  return output;
}

export function formatSubmittedVat(quote: SubmittedRepairQuote) {
  if (quote.vatRegistered === "") return "VAT treatment not stated";
  if (quote.vatRegistered === "no") return "VAT not charged";
  if (quote.costSnapshot.vat.mode === "not_stated") {
    return "VAT treatment not stated";
  }
  if (quote.costSnapshot.vat.mode === "not_charged") return "VAT not charged";
  const amount = quote.costSnapshot.vat.amount;
  const rate = (quote.costSnapshot.vat.rateBasisPoints ?? 0) / 100;
  if (quote.costSnapshot.vat.mode === "included") {
    return `Includes ${amount ? formatMoney(amount, { alwaysShowPence: true }) : "VAT"} VAT`;
  }
  return `${amount ? `${formatMoney(amount, { alwaysShowPence: true })} VAT` : "VAT"} added at ${rate}%`;
}

export function validateSubmittedQuoteSnapshot(quote: SubmittedRepairQuote) {
  const breakdownTotal = addMoney([
    quote.costSnapshot.labour,
    quote.costSnapshot.materials,
    quote.costSnapshot.extras,
  ]);
  const expectedFinal =
    quote.costSnapshot.vat.mode === "added" &&
    quote.costSnapshot.vat.amount
      ? addMoney([quote.costSnapshot.subtotal, quote.costSnapshot.vat.amount])
      : quote.costSnapshot.subtotal;
  return (
    moneyEquals(breakdownTotal, quote.costSnapshot.subtotal) &&
    moneyEquals(expectedFinal, quote.finalTotal)
  );
}
