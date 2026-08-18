// The canonical contractor-response boundary (see RepairScope HK — Post-
// Intake Workflow, "frontend structure" phase). OperatorContractor (see
// domain/operatorCaseState.ts) mixes operator-owned metadata (id, name,
// trade, contactReference, contact/sourcing status, operator notes) with
// contractor-response data (what the contractor actually said). A
// contractor-facing form must never be able to touch the operator-owned
// half — this module is the single, structurally-enforced input/output
// boundary that guarantees that, for both directions:
//
//   - ContractorResponsePayload is an Omit<> over OperatorContractor, so
//     the operator-only fields cannot exist on the type at all;
//   - mergeContractorResponse reuses applyContractorPatch — the exact same
//     invariant-enforcing function the operator's own manual editor already
//     goes through — so there is only ever one implementation of price
//     sanitisation, range validation and response-type conditional
//     clearing, never a second copy for a contractor-facing path;
//   - parseContractorResponsePayload additionally strips any unexpected
//     keys at RUNTIME (not just compile time), so a hand-crafted or
//     corrupted import payload cannot smuggle an operator-only field in
//     even if it bypasses the TypeScript boundary.
//
// This module intentionally adds no new domain concepts beyond what Slice 2
// already validated — no versions, no provenance/source model, no revision
// history. "Who entered the response" is not tracked here at all; the
// export/import envelope exists only to move a response payload between a
// contractor's browser and the operator's, not to record its origin.

import {
  applyContractorPatch,
  OPERATOR_CONTRACTOR_RESPONSE_TYPES,
  OPERATOR_GUARANTEE_STATUSES,
  OPERATOR_INSPECTION_REQUIREMENTS,
  OPERATOR_PRICE_TYPES,
  type OperatorContractor,
  type OperatorContractorResponseType,
  type OperatorGuaranteeStatus,
  type OperatorInspectionRequirement,
  type OperatorPriceType,
} from "./operatorCaseState";
import { localize, lt, type Lang, type LocalizedText } from "./i18n";

/**
 * Everything a contractor's own response can contain — structurally
 * excludes id/name/trade/contactReference/status/notes, which remain
 * operator-owned and can only be edited through the operator's own card,
 * never through a contractor-facing form or an imported payload.
 */
export type ContractorResponsePayload = Omit<
  OperatorContractor,
  "id" | "name" | "trade" | "contactReference" | "status" | "notes"
>;

export const SUPPORTED_CONTRACTOR_RESPONSE_SCHEMA_VERSION = 1;

const RESPONSE_ONLY_KEYS = [
  "responseType",
  "originalResponse",
  "inspectionRequirement",
  "informationNeeded",
  "priceType",
  "price",
  "priceMin",
  "priceMax",
  "proposedApproach",
  "inclusions",
  "exclusions",
  "priceChangeFactors",
  "expectedDuration",
  "earliestStart",
  "guaranteeStatus",
  "guaranteeDetails",
] as const satisfies readonly (keyof ContractorResponsePayload)[];

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

/**
 * Whitelist-extracts only the known response fields from an arbitrary
 * value, validating each field's shape, and silently drops everything
 * else — including id/name/trade/contactReference/status/notes if present,
 * which is what makes this safe against a malicious or corrupted import
 * payload, not just a well-typed caller. Returns null if the value isn't
 * even a plain object, or if any present field fails its own type check
 * (fail-closed, matching the rest of this codebase's restoration
 * discipline — see operatorCaseState.ts's isValidContractor).
 */
export function parseContractorResponsePayload(value: unknown): ContractorResponsePayload | null {
  if (!isPlainObject(value)) return null;

  const ok =
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
    isOptionalString(value.earliestStart) &&
    isOptionalEnum(value.guaranteeStatus, OPERATOR_GUARANTEE_STATUSES) &&
    isOptionalString(value.guaranteeDetails);
  if (!ok) return null;

  const payload: ContractorResponsePayload = {};
  for (const key of RESPONSE_ONLY_KEYS) {
    if (value[key] !== undefined) {
      // Safe: each field was individually validated above against its own
      // known type/enum, and the key is drawn from the fixed whitelist.
      (payload as Record<string, unknown>)[key] = value[key];
    }
  }
  return payload;
}

/** Server-returned responses must be interpreted only under the exact
 * schema version this frontend understands. Paste imports have their own
 * independent envelope version and deliberately continue through
 * parseContractorResponseExport unchanged. */
export function parseSupportedContractorResponsePayload(
  schemaVersion: unknown,
  value: unknown,
): ContractorResponsePayload | null {
  if (schemaVersion !== SUPPORTED_CONTRACTOR_RESPONSE_SCHEMA_VERSION) return null;
  return parseContractorResponsePayload(value);
}

/**
 * Merges a contractor-response payload into an existing OperatorContractor,
 * preserving id/name/trade/contactReference/status/notes untouched — this
 * is guaranteed structurally (ContractorResponsePayload's type excludes
 * those fields) rather than by a second ad hoc "don't touch these" check.
 * Delegates entirely to applyContractorPatch, the same function the
 * operator's own manual editor uses, so a contractor-sourced response is
 * sanitised (price invariants, response-type conditional clearing) by the
 * exact same rules as a manually-typed one — there is no separate
 * contractor-import validation path to drift out of sync.
 */
export function mergeContractorResponse(
  contractor: OperatorContractor,
  payload: ContractorResponsePayload,
): OperatorContractor {
  return applyContractorPatch(contractor, payload);
}

/** A throwaway shape used only to run applyContractorPatch's invariants
 * from sanitizeContractorResponsePayload below — never persisted, never
 * shown to anyone. */
const INVARIANT_CHECK_CONTRACTOR: OperatorContractor = {
  id: "invariant-check",
  name: "",
  status: "considering",
  notes: "",
};

/**
 * Runs a contractor-response-in-progress through the exact same price
 * sanitisation and response-type conditional clearing as
 * mergeContractorResponse, without needing a real OperatorContractor to
 * merge into — this is what the contractor-facing form (Commit B) uses to
 * enforce Slice 2's invariants (invalid range rejected, negative price
 * rejected, stale fields cleared on branch change) while the contractor is
 * still filling the form in, before any operator record exists to merge
 * into.
 */
export function sanitizeContractorResponsePayload(payload: ContractorResponsePayload): ContractorResponsePayload {
  const merged = applyContractorPatch(INVARIANT_CHECK_CONTRACTOR, payload);
  const sanitized: ContractorResponsePayload = {};
  for (const key of RESPONSE_ONLY_KEYS) {
    if (merged[key] !== undefined) {
      (sanitized as Record<string, unknown>)[key] = merged[key];
    }
  }
  return sanitized;
}

// --- Submission completeness (T2 Commit 1) ---------------------------------
//
// sanitizeContractorResponsePayload (above) guarantees a payload is never
// internally CONTRADICTORY (stale proposal fields cleared on branch change,
// invalid price ranges cleared) — but it was never responsible for
// guaranteeing a payload is COMPLETE enough to submit. The frozen
// ContractorResponseForm let a contractor finalize/export a payload the
// backend's own ContractorResponsePayload Pydantic model (apps/api/app/
// schemas/contractor_requests.py) correctly rejects — e.g. "needs more
// information" with a blank informationNeeded, "fixed" price with no
// amount, a price range missing one bound. This section is the single
// source of truth for "is this payload complete/bounded enough that the
// real T1 API will accept it", reused both for per-step advance gating and
// for a full final-review re-check in ContractorResponseForm (back/edit
// must not be able to leave a stale invalid combination that a per-step
// gate alone wouldn't catch a second time).
//
// Field length caps mirror apps/api/app/schemas/contractor_requests.py's
// _SHORT_TEXT_MAX/_LONG_TEXT_MAX exactly — one named constant per bound,
// not a scattered magic number per field.

export const CONTRACTOR_RESPONSE_SHORT_TEXT_MAX = 200;
export const CONTRACTOR_RESPONSE_LONG_TEXT_MAX = 2_000;

const LONG_TEXT_FIELDS = [
  "originalResponse",
  "informationNeeded",
  "proposedApproach",
  "inclusions",
  "exclusions",
  "priceChangeFactors",
  "guaranteeDetails",
] as const satisfies readonly (keyof ContractorResponsePayload)[];

const SHORT_TEXT_FIELDS = [
  "expectedDuration",
  "earliestStart",
] as const satisfies readonly (keyof ContractorResponsePayload)[];

/** Field-length label map only for building error text — not a second
 * source of truth for which cap applies (that's LONG_TEXT_FIELDS/
 * SHORT_TEXT_FIELDS above). Bilingual (see domain/i18n.ts) — the
 * contractor-facing form is the only caller and defaults to Traditional
 * Chinese; `lang` is threaded through from checkContractorResponseCompletion. */
const FIELD_LABELS: Partial<Record<keyof ContractorResponsePayload, LocalizedText>> = {
  originalResponse: lt("你的回覆", "Your response"),
  informationNeeded: lt("你需要的資料", "What information you need"),
  proposedApproach: lt("建議處理方法", "Proposed approach"),
  inclusions: lt("包括項目", "What's included"),
  exclusions: lt("不包括項目", "What's excluded"),
  priceChangeFactors: lt("可能影響價格的因素", "What could change the price"),
  guaranteeDetails: lt("保養詳情", "Guarantee details"),
  expectedDuration: lt("預計工期", "Expected duration"),
  earliestStart: lt("最早可開始時間", "Earliest start"),
};

export function isNonBlank(value: string | undefined): boolean {
  return Boolean((value ?? "").trim());
}

export function isWithinLength(value: string | undefined, maxLength: number): boolean {
  return value === undefined || value.length <= maxLength;
}

/** True only for a finite, non-negative number — matches the backend's
 * `Field(ge=0, allow_inf_nan=False)` exactly (zero is valid). */
export function isValidAmount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export interface ContractorResponseCompletionCheck {
  complete: boolean;
  /** Human-readable, ready to render directly — order is stable (required
   * fields first, then length-cap violations) but not otherwise meaningful. */
  errors: string[];
}

/**
 * The full submission-readiness check — every rule here has a direct
 * counterpart in apps/api/app/schemas/contractor_requests.py's
 * ContractorResponsePayload._check_conditional_fields, so a payload this
 * function reports as `complete` is a payload the real T1 API accepts
 * (assuming sanitizeContractorResponsePayload has already cleared
 * contradictory fields, which ContractorResponseForm always runs on every
 * edit — see its own `update()`). Does NOT re-check the "must not be set"
 * half of the backend's conditional rules (e.g. proposal fields present
 * on a non-proposal response) — that half is already structurally
 * guaranteed by sanitizeContractorResponsePayload's use of
 * applyContractorPatch, which this function assumes has already run.
 */
export function checkContractorResponseCompletion(
  payload: ContractorResponsePayload,
  lang: Lang = "en",
): ContractorResponseCompletionCheck {
  const errors: string[] = [];
  const push = (text: LocalizedText) => errors.push(localize(text, lang));

  if (!payload.responseType) {
    return { complete: false, errors: [localize(lt("請選擇下一步做法。", "Choose what happens next."), lang)] };
  }

  if (payload.responseType === "needs-inspection" && !payload.inspectionRequirement) {
    push(lt("請選擇檢查要求。", "Choose an inspection requirement."));
  }
  if (payload.responseType === "needs-more-information" && !isNonBlank(payload.informationNeeded)) {
    push(lt("請說明你需要的資料。", "Describe what information you need."));
  }
  if (payload.responseType === "proposal-provided") {
    if (!payload.priceType) {
      push(lt("請選擇報價方式。", "Choose a price type."));
    } else if (payload.priceType === "fixed" || payload.priceType === "estimate") {
      if (!isValidAmount(payload.price)) push(lt("請輸入有效價格。", "Enter a valid price."));
    } else if (payload.priceType === "range") {
      if (!isValidAmount(payload.priceMin) || !isValidAmount(payload.priceMax)) {
        push(lt("請輸入最低及最高價格。", "Enter both a minimum and maximum price."));
      } else if (payload.priceMin > payload.priceMax) {
        push(lt("最低價格不可高於最高價格。", "The minimum can't be greater than the maximum."));
      }
    }
  }

  for (const field of LONG_TEXT_FIELDS) {
    if (!isWithinLength(payload[field], CONTRACTOR_RESPONSE_LONG_TEXT_MAX)) {
      push(
        lt(
          `${FIELD_LABELS[field]?.zh}太長（上限 ${CONTRACTOR_RESPONSE_LONG_TEXT_MAX} 個字）。`,
          `${FIELD_LABELS[field]?.en} is too long (max ${CONTRACTOR_RESPONSE_LONG_TEXT_MAX} characters).`,
        ),
      );
    }
  }
  for (const field of SHORT_TEXT_FIELDS) {
    if (!isWithinLength(payload[field], CONTRACTOR_RESPONSE_SHORT_TEXT_MAX)) {
      push(
        lt(
          `${FIELD_LABELS[field]?.zh}太長（上限 ${CONTRACTOR_RESPONSE_SHORT_TEXT_MAX} 個字）。`,
          `${FIELD_LABELS[field]?.en} is too long (max ${CONTRACTOR_RESPONSE_SHORT_TEXT_MAX} characters).`,
        ),
      );
    }
  }

  return { complete: errors.length === 0, errors };
}

// --- Export/import envelope (Commit B's transport bridge) -----------------
//
// Operator working state lives in localStorage; a contractor on another
// device/browser cannot write into it directly (see the reconciliation
// report's transport-options analysis — this is deliberately Option B, not
// a server-backed submission endpoint). ContractorResponseExportV1 is a
// small, versioned, deterministic envelope a contractor's browser can
// produce and an operator can paste back in — never a raw dump of
// OperatorContractor (which would risk leaking operator-owned fields into
// something copy-pasted through an uncontrolled channel).

export const CONTRACTOR_RESPONSE_EXPORT_SCHEMA = "repairscope.contractor-response-export";
export const CONTRACTOR_RESPONSE_EXPORT_VERSION = 1;

export interface ContractorResponseExportV1 {
  schema: typeof CONTRACTOR_RESPONSE_EXPORT_SCHEMA;
  version: typeof CONTRACTOR_RESPONSE_EXPORT_VERSION;
  response: ContractorResponsePayload;
}

export function createContractorResponseExport(payload: ContractorResponsePayload): ContractorResponseExportV1 {
  return {
    schema: CONTRACTOR_RESPONSE_EXPORT_SCHEMA,
    version: CONTRACTOR_RESPONSE_EXPORT_VERSION,
    response: payload,
  };
}

export function serializeContractorResponseExport(payload: ContractorResponsePayload): string {
  return JSON.stringify(createContractorResponseExport(payload));
}

export type ParsedContractorResponseExport =
  | { ok: true; payload: ContractorResponsePayload }
  | { ok: false; error: string };

/**
 * Parses and validates a pasted/imported export string. Fails closed with a
 * specific, operator-readable reason rather than throwing or silently
 * accepting a malformed value — the founder is pasting this by hand, so a
 * clear "why did this not work" matters more than for an internal
 * boundary.
 */
export function parseContractorResponseExport(raw: string): ParsedContractorResponseExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid response export — it could not be read as data." };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "That doesn't look like a valid response export." };
  }
  if (parsed.schema !== CONTRACTOR_RESPONSE_EXPORT_SCHEMA) {
    return { ok: false, error: "This isn't a RepairScope contractor response export." };
  }
  if (parsed.version !== CONTRACTOR_RESPONSE_EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version (expected ${CONTRACTOR_RESPONSE_EXPORT_VERSION}).` };
  }
  const payload = parseContractorResponsePayload(parsed.response);
  if (!payload) {
    return { ok: false, error: "The response data in this export is missing or invalid." };
  }
  return { ok: true, payload };
}

export type {
  OperatorContractorResponseType,
  OperatorInspectionRequirement,
  OperatorPriceType,
  OperatorGuaranteeStatus,
};

// --- Owner-visible proposal boundary (Commit C) ----------------------------
//
// The owner proposal-return preview must never surface operator-only
// context — contactReference (e.g. a WhatsApp number), contact/sourcing
// status, or operator notes. OwnerVisibleProposal is a Pick<> over
// OperatorContractor (same pattern as ContractorResponsePayload above), so
// this exclusion is structural rather than a rendering convention the
// owner component has to remember to follow. It is a type-level view, not
// a second persisted proposal model — toOwnerVisibleProposal is a pure
// projection with no storage of its own.

export type OwnerVisibleProposal = Pick<
  OperatorContractor,
  | "id"
  | "name"
  | "trade"
  | "responseType"
  | "originalResponse"
  | "priceType"
  | "price"
  | "priceMin"
  | "priceMax"
  | "proposedApproach"
  | "inclusions"
  | "exclusions"
  | "priceChangeFactors"
  | "expectedDuration"
  | "earliestStart"
  | "guaranteeStatus"
  | "guaranteeDetails"
>;

export function toOwnerVisibleProposal(contractor: OperatorContractor): OwnerVisibleProposal {
  const {
    id,
    name,
    trade,
    responseType,
    originalResponse,
    priceType,
    price,
    priceMin,
    priceMax,
    proposedApproach,
    inclusions,
    exclusions,
    priceChangeFactors,
    expectedDuration,
    earliestStart,
    guaranteeStatus,
    guaranteeDetails,
  } = contractor;
  return {
    id,
    name,
    trade,
    responseType,
    originalResponse,
    priceType,
    price,
    priceMin,
    priceMax,
    proposedApproach,
    inclusions,
    exclusions,
    priceChangeFactors,
    expectedDuration,
    earliestStart,
    guaranteeStatus,
    guaranteeDetails,
  };
}
