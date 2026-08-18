// A LOCAL-ONLY cache of raw contractor-request links (T2 Commit 3) —
// deliberately NOT part of domain/operatorCaseState.ts's OperatorCaseState.
// That module is the founder's own canonical working state (contact
// status, notes, current response) and gets read/written as one JSON blob
// per case; this is a narrower, purely incidental cache solving one
// specific problem: the backend's raw access token
// (ContractorRequestCreateResult.accessToken) is a one-time secret returned
// ONLY from the create call and never again by any GET (see
// apps/api/app/schemas/contractor_requests.py's own ContractorRequestSummary/
// Detail, which never carry a token). Losing this cache (a cleared
// localStorage, a different browser) is NOT a canonical-state loss — the
// contractor_requests row and everything the contractor already submitted
// still live in the backend; the founder only loses the ability to
// re-display/re-copy that ONE link and would need to revoke and re-send.
//
// Stored under its own key prefix, distinct from
// "repairscope:operator-case:" — never merged into or read alongside that
// state, and never treated as a source of truth for request status (status
// always comes live from ContractorRequestOperatorService.list(), never
// from this cache).

export interface CachedContractorRequestLink {
  requestId: string;
  rawLink: string;
  clientContractorId: string | null;
  createdAt: string;
}

const STORAGE_PREFIX = "repairscope:contractor-request-links:";

function storageKey(caseReference: string): string {
  return `${STORAGE_PREFIX}${caseReference}`;
}

/** True for any localStorage key this cache owns — used by tests to prove
 * it never writes into the canonical operator-case namespace or the owner
 * journey namespace. */
export function isContractorRequestLinkStorageKey(key: string): boolean {
  return key.startsWith(STORAGE_PREFIX);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidEntry(value: unknown): value is CachedContractorRequestLink {
  return (
    isPlainObject(value) &&
    typeof value.requestId === "string" &&
    typeof value.rawLink === "string" &&
    (value.clientContractorId === null || typeof value.clientContractorId === "string") &&
    typeof value.createdAt === "string"
  );
}

export function readCachedContractorRequestLinks(caseReference: string): CachedContractorRequestLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(caseReference));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidEntry)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeCachedContractorRequestLinks(
  caseReference: string,
  entries: CachedContractorRequestLink[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(caseReference), JSON.stringify(entries));
  } catch {
    // Best-effort cache only — see the module comment on what losing it
    // actually costs (a re-display convenience, not canonical data).
  }
}

/** Appends one freshly-created request's raw link to the cache. Never
 * mutates or removes an existing entry — a revoke/expiry doesn't retract
 * the fact that this link was once generated, it only makes it stop
 * working, which the live status from the operator service already
 * reflects. */
export function cacheContractorRequestLink(
  caseReference: string,
  entry: CachedContractorRequestLink,
): void {
  const current = readCachedContractorRequestLinks(caseReference);
  writeCachedContractorRequestLinks(caseReference, [...current, entry]);
}
