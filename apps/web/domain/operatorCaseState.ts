// Local, disposable workflow state for the "/operator" case workspace (see
// RepairScope HK — Post-Intake Workflow, Slice 1.5). The owner SUBMISSION
// itself (questionnaire answers, generated brief, contact details, consent)
// is real backend data — see services/operator/OperatorSubmissionService.ts
// and components/operator/OperatorCaseWorkspace.tsx. This module only
// covers the operator's own working state layered on top of it: workflow
// status, notes, contractor tracking. It is deliberately NOT modelled like
// a production domain — no quote versions, no contractor accounts, no
// workflow engine, no audit history — every field is free text or a simple
// dropdown, and everything lives in localStorage only, namespaced under
// "repairscope:operator-case:" so it can never collide with the owner
// journey's "repairscope:journey:"/"repairscope:repair:" keys (see
// domain/journey.ts, domain/storageKeys.ts).

export const OPERATOR_CASE_STATUSES = [
  "new",
  "reviewing",
  "waiting-for-owner",
  "ready-for-sourcing",
  "sourcing-contractors",
  "inspection-required",
  "waiting-for-proposal",
  "proposals-received",
  "comparing",
  "owner-deciding",
  "closed",
] as const;

export type OperatorCaseStatus = (typeof OPERATOR_CASE_STATUSES)[number];

export const OPERATOR_CASE_STATUS_LABELS: Record<OperatorCaseStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  "waiting-for-owner": "Waiting for owner",
  "ready-for-sourcing": "Ready for sourcing",
  "sourcing-contractors": "Sourcing contractors",
  "inspection-required": "Inspection required",
  "waiting-for-proposal": "Waiting for proposal",
  "proposals-received": "Proposals received",
  comparing: "Comparing",
  "owner-deciding": "Owner deciding",
  closed: "Closed",
};

// CONTACT / SOURCING STATUS — where the founder is in reaching a
// contractor, not what the contractor actually said. Kept deliberately
// narrow: whether the founder has engaged them at all. What the contractor
// SAID is `responseType` below — a Codex audit of the original Slice 2 pass
// found the two dimensions overlapping in this same field (e.g. "declined"
// and "proposal-received" were contact statuses that were really response
// outcomes), which let a contractor end up with two contradictory-looking
// current states. See LEGACY_CONTRACTOR_STATUS_TO_RESPONSE_TYPE below for
// how historical records carrying the old, wider set of values are
// normalized rather than rejected.
export const OPERATOR_CONTRACTOR_STATUSES = ["considering", "not-contacted", "contacted"] as const;

export type OperatorContractorStatus = (typeof OPERATOR_CONTRACTOR_STATUSES)[number];

export const OPERATOR_CONTRACTOR_STATUS_LABELS: Record<OperatorContractorStatus, string> = {
  considering: "Considering",
  "not-contacted": "Not contacted",
  contacted: "Contacted",
};

// CURRENT CONTRACTOR RESPONSE — distinct from `status` above, which tracks
// contact/sourcing progress only. `responseType` is what actually drives
// the conditional fields below (see RepairScope HK — Post-Intake Workflow,
// Slice 2). A separate field from `status` so the two dimensions can never
// contradict each other — see the module comment above OPERATOR_CONTRACTOR_
// STATUSES for why that distinction matters.
export const OPERATOR_CONTRACTOR_RESPONSE_TYPES = [
  "interested",
  "needs-inspection",
  "needs-more-information",
  "not-suitable",
  "proposal-provided",
] as const;

export type OperatorContractorResponseType = (typeof OPERATOR_CONTRACTOR_RESPONSE_TYPES)[number];

export const OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS: Record<OperatorContractorResponseType, string> = {
  interested: "Interested",
  "needs-inspection": "Needs inspection",
  "needs-more-information": "Needs more information",
  "not-suitable": "Not suitable",
  "proposal-provided": "Initial proposal provided",
};

/** Historical `status` values from before the Slice 2 repair pass, when the
 * contact-status field also doubled as the response outcome. No longer
 * selectable in the UI — recognized only so old localStorage records can be
 * normalized (see normalizeRestoredContractor) instead of failing closed
 * and losing the whole record. */
const LEGACY_CONTRACTOR_STATUS_TO_RESPONSE_TYPE: Record<string, OperatorContractorResponseType> = {
  interested: "interested",
  "needs-more-information": "needs-more-information",
  "needs-inspection": "needs-inspection",
  declined: "not-suitable",
  "proposal-received": "proposal-provided",
};

export const OPERATOR_INSPECTION_REQUIREMENTS = ["required", "recommended", "not-sure"] as const;
export type OperatorInspectionRequirement = (typeof OPERATOR_INSPECTION_REQUIREMENTS)[number];
export const OPERATOR_INSPECTION_REQUIREMENT_LABELS: Record<OperatorInspectionRequirement, string> = {
  required: "Required before proposal",
  recommended: "Recommended",
  "not-sure": "Not sure",
};

export const OPERATOR_PRICE_TYPES = ["fixed", "estimate", "range", "no-price"] as const;
export type OperatorPriceType = (typeof OPERATOR_PRICE_TYPES)[number];
export const OPERATOR_PRICE_TYPE_LABELS: Record<OperatorPriceType, string> = {
  fixed: "Fixed price",
  estimate: "Estimate",
  range: "Range",
  "no-price": "No price yet",
};

export const OPERATOR_GUARANTEE_STATUSES = ["yes", "no", "not-stated"] as const;
export type OperatorGuaranteeStatus = (typeof OPERATOR_GUARANTEE_STATUSES)[number];
export const OPERATOR_GUARANTEE_STATUS_LABELS: Record<OperatorGuaranteeStatus, string> = {
  yes: "Yes",
  no: "No",
  "not-stated": "Not stated",
};

export interface OperatorContractor {
  id: string;
  name: string;
  trade?: string;
  contactReference?: string;
  status: OperatorContractorStatus;
  notes: string;

  // Structured "current response" — see OPERATOR_CONTRACTOR_RESPONSE_TYPES
  // above. All fields below are optional so existing minimal localStorage
  // records (from before Slice 2) remain valid and simply render with no
  // response captured yet.
  responseType?: OperatorContractorResponseType;
  /** Free-form "what did the contractor actually say?" — always available
   * regardless of responseType, never replaced by the structured fields
   * below (see Slice 2's free-form response principle). */
  originalResponse?: string;

  // responseType === "needs-inspection"
  inspectionRequirement?: OperatorInspectionRequirement;

  // responseType === "needs-more-information"
  informationNeeded?: string;

  // responseType === "proposal-provided"
  priceType?: OperatorPriceType;
  price?: number; // priceType "fixed" | "estimate"
  priceMin?: number; // priceType "range"
  priceMax?: number; // priceType "range"
  proposedApproach?: string;
  inclusions?: string;
  exclusions?: string;
  priceChangeFactors?: string;
  expectedDuration?: string;
  guaranteeStatus?: OperatorGuaranteeStatus;
  guaranteeDetails?: string; // guaranteeStatus === "yes"
}

/**
 * The operator's own working state for a case — distinct from, and never
 * conflated with, the backend's own `SubmissionStatus`/`internalReviewNotes`
 * (see domain/operatorSubmission.ts). Keyed by the case's public reference
 * (RS-XXXXXX), not the internal UUID — see storageKey below.
 */
export interface OperatorCaseState {
  caseReference: string;
  status: OperatorCaseStatus;
  internalNotes: string;
  unresolvedQuestions: string;
  ownerFollowUpQuestions: string;
  nextAction: string;
  followUpDate?: string;
  contractors: OperatorContractor[];

  // Proposal comparison working notes (Slice 3) — the founder's own
  // free-text record of what differs between proposals, what's still
  // unclear, and neutral context for the owner. Deliberately NOT a nested
  // object: every other working-state field on this interface is a flat
  // optional/required string, and a nested `comparison` object would only
  // complicate isValidCaseState/emptyOperatorCaseState for no benefit here.
  // Optional (not defaulted to "") so pre-Slice-3 localStorage records —
  // which never had these keys — restore cleanly with no migration; the UI
  // treats undefined the same as an empty string. The comparison ITSELF
  // (which contractors, their prices, approach, etc.) is never stored here
  // — see proposalContractors below, which reads live from `contractors`.
  comparisonKeyDifferences?: string;
  comparisonUnresolvedQuestions?: string;
  comparisonRepairScopeNote?: string;
}

export function emptyOperatorCaseState(caseReference: string): OperatorCaseState {
  return {
    caseReference,
    status: "new",
    internalNotes: "",
    unresolvedQuestions: "",
    ownerFollowUpQuestions: "",
    nextAction: "",
    followUpDate: undefined,
    contractors: [],
  };
}

const STORAGE_PREFIX = "repairscope:operator-case:";

function storageKey(caseReference: string): string {
  return `${STORAGE_PREFIX}${caseReference}`;
}

/** True for any localStorage key this local workflow state owns — used by
 * tests to prove it never writes into the real owner-journey namespace. */
export function isOperatorCaseStorageKey(key: string): boolean {
  return key.startsWith(STORAGE_PREFIX);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === "number";
}

function isOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T | undefined {
  return value === undefined || ((allowed as readonly string[]).includes(value as string) && typeof value === "string");
}

/** Tolerates both pre-Slice-2 minimal records (id/name/status/notes only)
 * and the extended Slice-2 shape — every new field is optional, so an old
 * record simply passes with them all undefined. See the module comment. */
function isValidContractor(value: unknown): value is OperatorContractor {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isOptionalString(value.trade) &&
    isOptionalString(value.contactReference) &&
    typeof value.status === "string" &&
    ((OPERATOR_CONTRACTOR_STATUSES as readonly string[]).includes(value.status) ||
      value.status in LEGACY_CONTRACTOR_STATUS_TO_RESPONSE_TYPE) &&
    typeof value.notes === "string" &&
    isOptionalEnum(value.responseType, OPERATOR_CONTRACTOR_RESPONSE_TYPES) &&
    isOptionalString(value.originalResponse) &&
    isOptionalEnum(value.inspectionRequirement, OPERATOR_INSPECTION_REQUIREMENTS) &&
    isOptionalString(value.informationNeeded) &&
    isOptionalEnum(value.priceType, OPERATOR_PRICE_TYPES) &&
    isOptionalNumber(value.price) &&
    isOptionalNumber(value.priceMin) &&
    isOptionalNumber(value.priceMax) &&
    isOptionalString(value.proposedApproach) &&
    isOptionalString(value.inclusions) &&
    isOptionalString(value.exclusions) &&
    isOptionalString(value.priceChangeFactors) &&
    isOptionalString(value.expectedDuration) &&
    isOptionalEnum(value.guaranteeStatus, OPERATOR_GUARANTEE_STATUSES) &&
    isOptionalString(value.guaranteeDetails)
  );
}

/** Loose, fail-closed validation of a restored record — a corrupted or
 * hand-edited entry falls back to an empty state rather than crashing the
 * workspace or leaking a malformed shape into the UI. This local workflow
 * layer has no schema-version concept (see task scope: no migrations, no
 * elaborate validation) — this is just enough to keep a bad localStorage
 * value from breaking the page. */
function isValidCaseState(value: unknown, caseReference: string): value is OperatorCaseState {
  return (
    isPlainObject(value) &&
    value.caseReference === caseReference &&
    typeof value.status === "string" &&
    (OPERATOR_CASE_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.internalNotes === "string" &&
    typeof value.unresolvedQuestions === "string" &&
    typeof value.ownerFollowUpQuestions === "string" &&
    typeof value.nextAction === "string" &&
    (value.followUpDate === undefined || typeof value.followUpDate === "string") &&
    Array.isArray(value.contractors) &&
    value.contractors.every(isValidContractor) &&
    isOptionalString(value.comparisonKeyDifferences) &&
    isOptionalString(value.comparisonUnresolvedQuestions) &&
    isOptionalString(value.comparisonRepairScopeNote)
  );
}

export function readOperatorCaseState(caseReference: string): OperatorCaseState {
  if (typeof window === "undefined") return emptyOperatorCaseState(caseReference);
  try {
    const raw = window.localStorage.getItem(storageKey(caseReference));
    if (!raw) return emptyOperatorCaseState(caseReference);
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCaseState(parsed, caseReference)) return emptyOperatorCaseState(caseReference);
    return { ...parsed, contractors: parsed.contractors.map(normalizeRestoredContractor) };
  } catch {
    return emptyOperatorCaseState(caseReference);
  }
}

export function writeOperatorCaseState(state: OperatorCaseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(state.caseReference), JSON.stringify(state));
  } catch {
    // Local workflow state only — losing a save here is not worth
    // surfacing an error to the operator mid-flow; the next edit will just
    // try again.
  }
}

/** A price value only ever persists if it is a finite, non-negative HK$
 * amount — blank/unset stays undefined, invalid input (negative, NaN,
 * Infinity) is dropped rather than stored. Applied to every price-shaped
 * field, live or restored, so no path can smuggle in a bad number. */
function sanitizeAmount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Merges a patch onto a contractor, then clears fields that are no longer
 * meaningful given the resulting responseType/priceType/guaranteeStatus —
 * e.g. switching away from "proposal-provided" clears every proposal field,
 * switching a price type away from "range" clears priceMin/priceMax. This
 * is the single, predictable clearing policy for Slice 2 (see task scope):
 * incompatible fields are actively cleared, not just hidden, so stale data
 * can never resurface by flipping the response type back and forth or leak
 * via a raw view of localStorage. Always re-applied on every update (not
 * only when the "triggering" key is in the patch), so it stays correct
 * however the caller constructs the patch. Also enforces the price
 * invariants below, so it doubles as the restoration-normalization pass
 * (see normalizeRestoredContractor) with no separate rule set to keep in
 * sync.
 */
export function applyContractorPatch(
  contractor: OperatorContractor,
  patch: Partial<OperatorContractor>,
): OperatorContractor {
  const merged: OperatorContractor = { ...contractor, ...patch };

  if (merged.responseType !== "needs-inspection") {
    merged.inspectionRequirement = undefined;
  }
  if (merged.responseType !== "needs-more-information") {
    merged.informationNeeded = undefined;
  }
  if (merged.responseType !== "proposal-provided") {
    merged.priceType = undefined;
    merged.price = undefined;
    merged.priceMin = undefined;
    merged.priceMax = undefined;
    merged.proposedApproach = undefined;
    merged.inclusions = undefined;
    merged.exclusions = undefined;
    merged.priceChangeFactors = undefined;
    merged.expectedDuration = undefined;
    merged.guaranteeStatus = undefined;
    merged.guaranteeDetails = undefined;
  } else {
    if (merged.priceType !== "range") {
      merged.priceMin = undefined;
      merged.priceMax = undefined;
    }
    if (merged.priceType !== "fixed" && merged.priceType !== "estimate") {
      merged.price = undefined;
    }
    if (merged.guaranteeStatus !== "yes") {
      merged.guaranteeDetails = undefined;
    }

    // Price invariants (see the Slice 2 repair pass — Codex found an
    // inverted range could persist, survive reload, and render as a valid
    // proposal). Sanitize first, then check the range: an inverted range
    // clears BOTH bounds together — there is no way to know which side the
    // operator got wrong — while priceType and every other proposal field
    // (approach, inclusions, guarantee, free-form response...) are left
    // untouched. This same pass runs for restored records via
    // normalizeRestoredContractor below, so historical bad data is
    // sanitized the same way live edits are.
    merged.price = sanitizeAmount(merged.price);
    merged.priceMin = sanitizeAmount(merged.priceMin);
    merged.priceMax = sanitizeAmount(merged.priceMax);
    if (
      merged.priceType === "range" &&
      merged.priceMin !== undefined &&
      merged.priceMax !== undefined &&
      merged.priceMin > merged.priceMax
    ) {
      merged.priceMin = undefined;
      merged.priceMax = undefined;
    }
  }

  return merged;
}

/**
 * Enforces every contractor-state invariant against a record that was just
 * restored from localStorage, where it may predate this repair pass or
 * contain type-valid-but-logically-stale combinations (e.g. a proposal's
 * fields left over after an older code path failed to clear them). Two
 * steps: (1) map a legacy `status` that used to double as a response
 * outcome onto the current status/responseType split — an explicit,
 * already-restored responseType always wins over a guess from the legacy
 * status; (2) re-run applyContractorPatch with an empty patch, which
 * re-derives every conditional-clearing and price-sanitization rule above
 * from the record's own current fields. originalResponse and notes are
 * never touched by either step — see applyContractorPatch's own comment.
 */
function normalizeRestoredContractor(contractor: OperatorContractor): OperatorContractor {
  const legacyResponseType = LEGACY_CONTRACTOR_STATUS_TO_RESPONSE_TYPE[contractor.status];
  const withCurrentStatus: OperatorContractor = legacyResponseType
    ? { ...contractor, status: "contacted", responseType: contractor.responseType ?? legacyResponseType }
    : contractor;
  return applyContractorPatch(withCurrentStatus, {});
}

/**
 * The contractors whose CURRENT response is "Initial proposal provided" —
 * the set the Slice 3 comparison view renders as full proposal columns.
 * Deliberately just a filter over the existing `contractors` array: there
 * is no separate proposal/comparison data store, so editing a contractor's
 * price (etc.) in the Slice 2 editor is automatically reflected here on the
 * next render — nothing to keep in sync.
 */
export function proposalContractors(contractors: OperatorContractor[]): OperatorContractor[] {
  return contractors.filter((contractor) => contractor.responseType === "proposal-provided");
}

export function createOperatorContractor(name: string): OperatorContractor {
  return {
    id: `contractor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    trade: undefined,
    contactReference: undefined,
    status: "considering",
    notes: "",
  };
}
