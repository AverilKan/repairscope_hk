// The operator-authenticated contractor-request transport (T2 Commit 3) —
// types and error classes for the real T1 operator API
// (apps/api/app/api/routes/operator_contractor_requests.py, read directly)
// that lets the founder create/list/revoke contractor_requests for a real
// submission. Distinct from domain/contractorRequestPublic.ts, which is the
// separate, unauthenticated transport a contractor's own browser uses —
// nothing here is ever reachable without a valid operator session (see
// services/contractor/ContractorRequestOperatorService.ts's own Bearer
// wiring, mirroring services/operator/OperatorSubmissionService.ts).
//
// This module only covers the SERVER's own record of a contractor request
// (id, label, status, timestamps, and — once responded — the response
// payload). The raw access token is a one-time secret the backend returns
// only from the create call and never again; see
// domain/contractorRequestLinkCache.ts for how that gets held locally so a
// re-opened workspace can still show/copy a link it already generated.
// The founder's own working state about a contractor (name, trade, contact
// status, notes) stays exactly where it already lives —
// domain/operatorCaseState.ts's OperatorContractor — untouched by this
// module. `clientContractorId` is the join key between the two: it carries
// OperatorContractor.id so a submission's contractor_requests can be
// grouped by which local contractor card requested them.

export type ContractorRequestStatus = "open" | "responded" | "revoked" | "expired";

/** Mirrors apps/api/app/schemas/contractor_requests.py's
 * ContractorRequestSummary — the operator-facing record of ONE request,
 * with no response payload (see ContractorRequestDetail below for that). */
export interface ContractorRequestSummary {
  id: string;
  contractorLabel: string;
  clientContractorId: string | null;
  status: ContractorRequestStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
}

/** Mirrors ContractorRequestDetail — adds whatever the contractor actually
 * submitted. responsePayload is deliberately typed `unknown` here (not
 * ContractorResponsePayload) — see T2 Commit 4's review/import pipeline for
 * where that gets validated and reshaped before it can touch any canonical
 * state; this module is just the transport. */
export interface ContractorRequestDetail extends ContractorRequestSummary {
  responseType: string | null;
  responsePayload: unknown;
  responseSchemaVersion: number | null;
}

/** Mirrors ContractorRequestCreateResponse — the ONLY point in this
 * transport where the raw access token is ever visible. */
export interface ContractorRequestCreateResult {
  id: string;
  accessToken: string;
  contractorLabel: string;
  clientContractorId: string | null;
  expiresAt: string;
  createdAt: string;
}

export abstract class ContractorRequestOperatorError extends Error {}

export class ContractorRequestOperatorUnauthenticatedError extends ContractorRequestOperatorError {
  constructor() {
    super("No authenticated RepairScope session.");
    this.name = "ContractorRequestOperatorUnauthenticatedError";
  }
}

export class ContractorRequestOperatorForbiddenError extends ContractorRequestOperatorError {
  constructor() {
    super("This account does not have operator access.");
    this.name = "ContractorRequestOperatorForbiddenError";
  }
}

export class ContractorRequestOperatorNotFoundError extends ContractorRequestOperatorError {
  constructor() {
    super("Contractor request not found.");
    this.name = "ContractorRequestOperatorNotFoundError";
  }
}

export class ContractorRequestOperatorNetworkError extends ContractorRequestOperatorError {
  constructor(cause: unknown) {
    super("Could not reach the RepairScope API.", { cause });
    this.name = "ContractorRequestOperatorNetworkError";
  }
}

export class ContractorRequestOperatorServerError extends ContractorRequestOperatorError {
  constructor(detail: string) {
    super(`RepairScope API returned an unexpected response: ${detail}`);
    this.name = "ContractorRequestOperatorServerError";
  }
}

/**
 * UI-boundary error localization (HK localization follow-up) — maps the
 * three DIFFERENTIATED, meaningful ContractorRequestOperatorError states
 * (unauthenticated/forbidden/not-found) to specific Chinese copy the
 * operator can act on. Anything else — a network failure, an unexpected
 * server error, or a raw non-domain exception — falls back to the
 * caller-supplied generic Chinese message rather than ever surfacing
 * error.message (which may carry raw English/backend detail text — see
 * ContractorRequestOperatorServerError). Does not change what gets thrown
 * or how the request layer behaves — display only. Lives here (not in
 * OperatorCaseWorkspace.tsx, which the test suite cannot import directly —
 * see tests/contractor-response-review-import.test.ts's own comment on the
 * pre-existing @clerk/nextjs/jsdom limitation) so it stays unit-testable.
 */
export function describeContractorRequestOperatorError(error: unknown, fallback: string): string {
  if (error instanceof ContractorRequestOperatorUnauthenticatedError) {
    return "你未登入 RepairScope，請重新登入。";
  }
  if (error instanceof ContractorRequestOperatorForbiddenError) {
    return "此帳戶未有操作員權限。";
  }
  if (error instanceof ContractorRequestOperatorNotFoundError) {
    return "找不到此師傅回覆連結。";
  }
  return fallback;
}
