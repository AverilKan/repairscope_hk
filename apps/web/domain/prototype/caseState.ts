// Local, disposable state for the "/prototype/operator" internal case
// workspace (see RepairScope HK — Local Post-Intake Prototype, Slice 1).
//
// This is deliberately NOT modelled like a production domain: no quote
// versions, no contractor accounts, no workflow engine, no audit history.
// It exists to let the founder learn from Case #1 by hand — every field is
// free text or a simple dropdown, and everything lives in localStorage
// only, namespaced under "repairscope:proto:" so it can never collide with
// the real owner journey's "repairscope:journey:"/"repairscope:repair:"
// keys (see domain/journey.ts, domain/storageKeys.ts) and is trivial to
// wipe (clear anything with that prefix) without touching real data.

export const PROTOTYPE_CASE_STATUSES = [
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

export type PrototypeCaseStatus = (typeof PROTOTYPE_CASE_STATUSES)[number];

export const PROTOTYPE_CASE_STATUS_LABELS: Record<PrototypeCaseStatus, string> = {
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

export const PROTOTYPE_CONTRACTOR_STATUSES = [
  "considering",
  "not-contacted",
  "contacted",
  "interested",
  "needs-more-information",
  "needs-inspection",
  "declined",
  "proposal-received",
] as const;

export type PrototypeContractorStatus = (typeof PROTOTYPE_CONTRACTOR_STATUSES)[number];

export const PROTOTYPE_CONTRACTOR_STATUS_LABELS: Record<PrototypeContractorStatus, string> = {
  considering: "Considering",
  "not-contacted": "Not contacted",
  contacted: "Contacted",
  interested: "Interested",
  "needs-more-information": "Needs more information",
  "needs-inspection": "Needs inspection",
  declined: "Declined",
  "proposal-received": "Proposal received",
};

export interface PrototypeContractor {
  id: string;
  name: string;
  trade?: string;
  contactReference?: string;
  status: PrototypeContractorStatus;
  notes: string;
}

export interface PrototypeCaseState {
  caseReference: string;
  status: PrototypeCaseStatus;
  internalNotes: string;
  unresolvedQuestions: string;
  ownerFollowUpQuestions: string;
  nextAction: string;
  followUpDate?: string;
  contractors: PrototypeContractor[];
}

export function emptyPrototypeCaseState(caseReference: string): PrototypeCaseState {
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

const STORAGE_PREFIX = "repairscope:proto:operator-case:";

function storageKey(caseReference: string): string {
  return `${STORAGE_PREFIX}${caseReference}`;
}

/** True for any localStorage key this prototype owns — used by tests to
 * prove the prototype never writes into the real owner-journey namespace. */
export function isPrototypeStorageKey(key: string): boolean {
  return key.startsWith(STORAGE_PREFIX);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidContractor(value: unknown): value is PrototypeContractor {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.trade === undefined || typeof value.trade === "string") &&
    (value.contactReference === undefined || typeof value.contactReference === "string") &&
    typeof value.status === "string" &&
    (PROTOTYPE_CONTRACTOR_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.notes === "string"
  );
}

/** Loose, fail-closed validation of a restored record — a corrupted or
 * hand-edited entry falls back to an empty state rather than crashing the
 * workspace or leaking a malformed shape into the UI. This prototype has no
 * schema-version concept (see task scope: no migrations, no elaborate
 * validation) — this is just enough to keep a bad localStorage value from
 * breaking the page. */
function isValidCaseState(value: unknown, caseReference: string): value is PrototypeCaseState {
  return (
    isPlainObject(value) &&
    value.caseReference === caseReference &&
    typeof value.status === "string" &&
    (PROTOTYPE_CASE_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.internalNotes === "string" &&
    typeof value.unresolvedQuestions === "string" &&
    typeof value.ownerFollowUpQuestions === "string" &&
    typeof value.nextAction === "string" &&
    (value.followUpDate === undefined || typeof value.followUpDate === "string") &&
    Array.isArray(value.contractors) &&
    value.contractors.every(isValidContractor)
  );
}

export function readPrototypeCaseState(caseReference: string): PrototypeCaseState {
  if (typeof window === "undefined") return emptyPrototypeCaseState(caseReference);
  try {
    const raw = window.localStorage.getItem(storageKey(caseReference));
    if (!raw) return emptyPrototypeCaseState(caseReference);
    const parsed: unknown = JSON.parse(raw);
    return isValidCaseState(parsed, caseReference) ? parsed : emptyPrototypeCaseState(caseReference);
  } catch {
    return emptyPrototypeCaseState(caseReference);
  }
}

export function writePrototypeCaseState(state: PrototypeCaseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(state.caseReference), JSON.stringify(state));
  } catch {
    // Local prototype only — losing a save here is not worth surfacing an
    // error to the founder mid-flow; the next edit will just try again.
  }
}

export function createPrototypeContractor(name: string): PrototypeContractor {
  return {
    id: `contractor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    trade: undefined,
    contactReference: undefined,
    status: "considering",
    notes: "",
  };
}
