// The public, unauthenticated contractor-request transport (T2 Commit 2) —
// types and error classes for the real T1 API a contractor's own browser
// talks to. Deliberately a NEW HK-specific module, not an extension of the
// old UK reference prototype's dormant contractorResponses/
// contractorInvitations service stubs (services/api.ts) — those stay
// dormant; this is a fresh, small surface matching the actual T1 backend
// exactly (apps/api/app/schemas/contractor_requests.py, read directly).
//
// Field names mirror the backend byte-for-byte — ContractorResponsePayload
// (domain/contractorResponse.ts) already uses the same camelCase field
// names the backend's Pydantic model uses (responseType, priceType, ...),
// so no snake_case<->camelCase conversion is needed for the response body,
// unlike the repair-submissions/operator-submissions APIs.

export type ContractorRequestStatus = "open" | "responded" | "revoked" | "expired";

export const SUPPORTED_STAGE1_SNAPSHOT_SCHEMA_VERSION = 1;

export type ContractorResponseSubmissionOutcome =
  | "submitted"
  | "already-responded"
  | "revoked"
  | "expired"
  | "open-conflict"
  | "reconciliation-failed";

/** Mirrors apps/api/app/schemas/contractor_requests.py's Stage1SnapshotV1
 * exactly — controlled IDs only, never resolved labels (humanising is the
 * frontend's job — see domain/stage1SnapshotAdapter.ts). */
export interface Stage1SnapshotV1 {
  schema_version: number;
  category: string | null;
  district: string | null;
  affected: string[];
  branchFirst: string[];
  branchSecond: string[];
  branchThird: string[];
  duration: string | null;
  frequency: string | null;
  worsening: string | null;
  priorStatus: string | null;
  hasEvidence: string | null;
  evidenceKind: string | null;
  symptomOtherPresent: boolean;
}

/** Mirrors ContractorRequestPublicView exactly — `stage1` is populated
 * only when status is "open". No other field exists on this shape: no
 * repair UUID, no RS-xxxxxx reference, no contractor_label, no
 * client_contractor_id, no owner/operator data of any kind. */
export interface ContractorRequestPublicView {
  status: ContractorRequestStatus;
  stage1: Stage1SnapshotV1 | null;
}

/** Mirrors ContractorResponseSubmitResult exactly. */
export interface ContractorResponseSubmitResult {
  status: "responded";
  response_schema_version: number;
}

export abstract class ContractorRequestPublicError extends Error {}

export class ContractorRequestNotFoundError extends ContractorRequestPublicError {
  constructor() {
    super("This link isn't valid.");
    this.name = "ContractorRequestNotFoundError";
  }
}

export class ContractorRequestUnsupportedStage1VersionError extends ContractorRequestPublicError {
  constructor() {
    super("This repair request uses a version that this page can't open.");
    this.name = "ContractorRequestUnsupportedStage1VersionError";
  }
}

export function hasSupportedStage1SnapshotVersion(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schema_version === SUPPORTED_STAGE1_SNAPSHOT_SCHEMA_VERSION
  );
}

/** A 409 from the real API — the request is no longer open (already
 * responded to, revoked, or expired) at the moment of submission. Carries
 * the server's own detail message for callers that want it, but UI code
 * should generally show a neutral, truthful "no longer open" state rather
 * than the raw server string. */
export class ContractorRequestConflictError extends ContractorRequestPublicError {
  constructor(public readonly detail: string) {
    super(detail);
    this.name = "ContractorRequestConflictError";
  }
}

/** A 400/422/413 from the real API — malformed input, a validation
 * failure, or an oversized body. Should not normally happen once the
 * frontend form's own completeness check (checkContractorResponseCompletion)
 * passes, but the backend remains the authority and this is how a
 * rejection still surfaces truthfully rather than as a generic error. */
export class ContractorRequestValidationError extends ContractorRequestPublicError {
  constructor(public readonly issues: unknown) {
    super("The response could not be validated.");
    this.name = "ContractorRequestValidationError";
  }
}

export class ContractorRequestNetworkError extends ContractorRequestPublicError {
  constructor(cause: unknown) {
    super("Could not reach SimpleFix.", { cause });
    this.name = "ContractorRequestNetworkError";
  }
}

export class ContractorRequestServerError extends ContractorRequestPublicError {
  constructor(detail: string) {
    super(`SimpleFix returned an unexpected response: ${detail}`);
    this.name = "ContractorRequestServerError";
  }
}
