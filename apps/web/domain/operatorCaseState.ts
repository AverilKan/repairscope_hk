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

export const OPERATOR_CONTRACTOR_STATUSES = [
  "considering",
  "not-contacted",
  "contacted",
  "interested",
  "needs-more-information",
  "needs-inspection",
  "declined",
  "proposal-received",
] as const;

export type OperatorContractorStatus = (typeof OPERATOR_CONTRACTOR_STATUSES)[number];

export const OPERATOR_CONTRACTOR_STATUS_LABELS: Record<OperatorContractorStatus, string> = {
  considering: "Considering",
  "not-contacted": "Not contacted",
  contacted: "Contacted",
  interested: "Interested",
  "needs-more-information": "Needs more information",
  "needs-inspection": "Needs inspection",
  declined: "Declined",
  "proposal-received": "Proposal received",
};

export interface OperatorContractor {
  id: string;
  name: string;
  trade?: string;
  contactReference?: string;
  status: OperatorContractorStatus;
  notes: string;
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

function isValidContractor(value: unknown): value is OperatorContractor {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.trade === undefined || typeof value.trade === "string") &&
    (value.contactReference === undefined || typeof value.contactReference === "string") &&
    typeof value.status === "string" &&
    (OPERATOR_CONTRACTOR_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.notes === "string"
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
    value.contractors.every(isValidContractor)
  );
}

export function readOperatorCaseState(caseReference: string): OperatorCaseState {
  if (typeof window === "undefined") return emptyOperatorCaseState(caseReference);
  try {
    const raw = window.localStorage.getItem(storageKey(caseReference));
    if (!raw) return emptyOperatorCaseState(caseReference);
    const parsed: unknown = JSON.parse(raw);
    return isValidCaseState(parsed, caseReference) ? parsed : emptyOperatorCaseState(caseReference);
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
