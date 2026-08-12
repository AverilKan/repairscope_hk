import { questionnaireByCategory } from "@/data/questionnaires";
import { questionnaireFieldIsVisible } from "./rules";
import type {
  ProblemBrief,
  QuestionnaireField,
  QuestionnaireSchema,
  RepairCategoryId,
  RepairIntakeDraft,
  SafetyAcknowledgement,
} from "./types";

// ---------------------------------------------------------------------------
// Schema-aware validation shared by readJourneyDraft/readJourneyBrief. A
// malformed or corrupted localStorage record (hand-edited, from a stale
// schema version, or from a different browser tab's storage bleeding
// through some bug) must fail closed — the caller falls back to a fresh
// draft — rather than the app applying a mismatched shape into the current
// questionnaire. See the HK-A0 rework's "journey storage hardening"
// requirement.
// ---------------------------------------------------------------------------

function allFieldsOf(schema: QuestionnaireSchema): QuestionnaireField[] {
  return schema.steps.flatMap((step) => step.fields);
}

function isValidResponseValue(field: QuestionnaireField, value: unknown): boolean {
  switch (field.type) {
    case "checkbox":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "single_select":
      if (typeof value !== "string") return false;
      // Every single_select field in the HK schema carries its own option
      // list — a value that is not one of them is not a value the current
      // questionnaire could have produced.
      return !field.options?.length || field.options.some((option) => option.value === value);
    case "grouped_select":
      if (typeof value !== "string") return false;
      return (
        !field.groups?.length ||
        field.groups.some((group) => group.options.some((option) => option.value === value))
      );
    case "short_text":
    case "long_text":
    case "name":
    case "email":
    case "phone":
    case "postcode":
      return typeof value === "string";
    default:
      return false;
  }
}

/**
 * Removes responses whose field is currently hidden by showWhen given the
 * REST of the response map — e.g. hasEvidence="no" with a stale
 * evidenceKind still present, or prior="no" with a stale priorDetail still
 * present. QuestionnaireEngine's own changeResponse already does this at
 * the moment a parent answer changes (see its own dependent-field loop),
 * but that only protects live edits — a value shaped exactly like this can
 * still arrive here directly from a restored (or hand-edited/injected)
 * localStorage record that never went through changeResponse at all, so
 * restoration must enforce the same rule independently. Loops to a fixed
 * point rather than a single pass, so a chain (A hides B hides C) is fully
 * resolved even though today's schema has no such chain.
 */
function stripHiddenResponses(
  schema: QuestionnaireSchema,
  responses: RepairIntakeDraft["responses"],
): RepairIntakeDraft["responses"] {
  const fields = allFieldsOf(schema);
  const current: RepairIntakeDraft["responses"] = { ...responses };
  let changed = true;
  while (changed) {
    changed = false;
    for (const field of fields) {
      if (field.id in current && !questionnaireFieldIsVisible(field, current)) {
        delete current[field.id];
        changed = true;
      }
    }
  }
  return current;
}

/**
 * Validates a restored responses object against the schema it claims to
 * belong to — drops (does not merely warn about) any entry whose key is not
 * a real field on this schema, or whose value shape/option value the
 * schema's own field definition does not recognise, then strips any
 * remaining entry whose field is hidden given the rest of the (now
 * type-valid) map — see stripHiddenResponses. Returns null if the input is
 * not a plain object at all (fail closed at the top level too).
 */
function sanitiseResponses(
  schema: QuestionnaireSchema,
  value: unknown,
): RepairIntakeDraft["responses"] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fieldsById = new Map(allFieldsOf(schema).map((field) => [field.id, field]));
  const sanitised: RepairIntakeDraft["responses"] = {};
  for (const [fieldId, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    const field = fieldsById.get(fieldId);
    if (!field) continue; // not a field on this schema — drop, do not restore
    if (!isValidResponseValue(field, fieldValue)) continue; // wrong shape/unrecognised option — drop
    sanitised[fieldId] = fieldValue as RepairIntakeDraft["responses"][string];
  }
  return stripHiddenResponses(schema, sanitised);
}

/**
 * Validates a restored completedStepIds array against the schema — any id
 * that is not a real step on this schema is dropped rather than restored,
 * since it cannot correspond to any step the current questionnaire could
 * render.
 */
function sanitiseCompletedStepIds(schema: QuestionnaireSchema, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const validStepIds = new Set(schema.steps.map((step) => step.id));
  return [...new Set(value.filter((id): id is string => typeof id === "string" && validStepIds.has(id)))];
}

/**
 * Validates a restored activeIndex — must be a whole number that indexes an
 * actual step on this schema. A negative, fractional, or out-of-range index
 * (e.g. from a hand-edited or stale-schema record) falls back to 0 rather
 * than being applied as-is, which would otherwise crash or silently render
 * the wrong step (schema.steps[activeIndex] would be undefined).
 */
function sanitiseActiveIndex(schema: QuestionnaireSchema, value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < schema.steps.length
    ? value
    : 0;
}

/**
 * Restored safety acknowledgements must be a plain object mapping string
 * keys to string values, where each key is a real field id on this schema
 * that actually carries a safety rule — SafetyRule itself has no separate
 * "id", so the field id it is attached to is the only real identifier this
 * schema exposes for it. Any other key (e.g. one from a different
 * category's schema, or hand-injected) is dropped. (In the current HK flow
 * a safety-triggering answer is always a full-screen exit — see
 * components/LandlordApp.tsx's SafetyExit — so this is always {} in
 * practice; validated defensively in case that changes.)
 */
function sanitiseAcknowledgements(
  schema: QuestionnaireSchema,
  value: unknown,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const validRuleFieldIds = new Set(
    allFieldsOf(schema)
      .filter((field) => field.safetyRule)
      .map((field) => field.id),
  );
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => validRuleFieldIds.has(entry[0]) && typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}

// A per-repair anonymous journey id: identifies "one attempt at reporting
// one repair". Carried explicitly in the URL (?journey=<uuid>) — the URL is
// the source of truth for which journey is being viewed, not a global
// localStorage pointer. Not secret, not authentication. Never derived from
// name/email/phone/address.
//
// Rationale for route-carried identity (see the HK-A0 rework's "Journey
// ownership" requirement): a single global "current journey" pointer cannot
// distinguish two journeys open in two tabs, and silently mints a new
// journey on every fresh mount of a component that has no other identity to
// read — reloading /landlord/repairs/new used to orphan the in-progress
// draft. With the id in the URL, reload/back/forward naturally resolve to
// the same journey because the URL itself does not change.

function generateJourneyId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // No Math.random() fallback: a weak identifier must never be presented as
  // high-entropy. Fail loudly instead — the caller must not silently start
  // a journey with a predictable id.
  throw new Error(
    "Secure random number generation is unavailable in this browser — cannot start a new repair journey safely.",
  );
}

/** Mints a fresh, high-entropy journey id. Call once per genuinely new repair. */
export function createJourneyId(): string {
  return generateJourneyId();
}

function safeId(value: string): string | null {
  const id = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null;
}

/** Validates a journey id read from the URL — rejects anything that is not a plausible id, rather than trusting arbitrary query-string content. */
export function isPlausibleJourneyId(value: string | null | undefined): value is string {
  return typeof value === "string" && safeId(value) !== null && value.length >= 8;
}

function isValidCategory(value: unknown): value is RepairCategoryId {
  return typeof value === "string" && value in questionnaireByCategory;
}

function journeyStorageKey(journeyId: string, part: "draft" | "brief"): string | null {
  const id = safeId(journeyId);
  if (!id) return null;
  return `repairscope:journey:${id}:${part}`;
}

// ---------------------------------------------------------------------------
// Questionnaire draft — one per journey. Stamped with journeyId/category/
// schemaVersion so a restore can be validated and safely discarded (not
// silently applied) if it turns out to be stale or shaped for a different
// category/schema version.
// ---------------------------------------------------------------------------

export interface StoredDraftState {
  journeyId: string;
  category: RepairCategoryId;
  schemaVersion: number;
  activeIndex: number;
  responses: RepairIntakeDraft["responses"];
  acknowledgements: Record<string, string>;
  completedStepIds: string[];
}

/**
 * Reads and fully validates a journey's in-progress draft against the
 * schema currently active for it — takes the whole QuestionnaireSchema
 * (not just category/version) so it can also validate activeIndex's range,
 * that completedStepIds are real steps on this schema, and that every
 * response key/value/option is one this schema could actually have
 * produced. A malformed or corrupted record — wrong journey/category/
 * version, a negative or fractional activeIndex, an unknown step or field
 * id, an unrecognised option value, wrong JSON — is never partially
 * trusted: on any such mismatch this returns null and the caller starts
 * from a fresh draft, rather than applying a mismatched shape into the
 * current questionnaire.
 */
export function readJourneyDraft(
  journeyId: string,
  schema: QuestionnaireSchema,
): StoredDraftState | null {
  const key = journeyStorageKey(journeyId, "draft");
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraftState>;
    const responses = sanitiseResponses(schema, parsed.responses);
    if (
      parsed.journeyId !== journeyId ||
      parsed.category !== schema.category ||
      parsed.schemaVersion !== schema.version ||
      responses === null
    ) {
      // Stale or incompatible — fail safely rather than applying a
      // mismatched shape into the current schema.
      return null;
    }
    return {
      journeyId,
      category: schema.category,
      schemaVersion: schema.version,
      activeIndex: sanitiseActiveIndex(schema, parsed.activeIndex),
      responses,
      acknowledgements: sanitiseAcknowledgements(schema, parsed.acknowledgements),
      completedStepIds: sanitiseCompletedStepIds(schema, parsed.completedStepIds),
    };
  } catch {
    return null;
  }
}

/**
 * Reads back just the category of an in-progress draft, without already
 * knowing it — used only to bootstrap NewRepairFlow's category selection
 * on reload/navigation (it otherwise has no way to know which category's
 * schema to even ask readJourneyDraft to validate against). Callers must
 * still go through readJourneyDraft (with the now-known schemaVersion) for
 * the actual validated draft state — this is not a substitute for that
 * validation.
 */
export function peekJourneyDraftCategory(journeyId: string): RepairCategoryId | null {
  const key = journeyStorageKey(journeyId, "draft");
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraftState>;
    return parsed.journeyId === journeyId && isValidCategory(parsed.category) ? parsed.category : null;
  } catch {
    return null;
  }
}

export function writeJourneyDraft(state: StoredDraftState) {
  const key = journeyStorageKey(state.journeyId, "draft");
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage unavailable — the journey still works for this page
    // life, it just will not survive a reload. Not fatal.
  }
}

export function clearJourneyDraft(journeyId: string) {
  const key = journeyStorageKey(journeyId, "draft");
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * When the landlord changes category mid-journey, only genuinely shared
 * answers survive — the previous category's own branch answers must not
 * leak into a different category's brief fields. Returns a fresh draft
 * state for the NEW schema: activeIndex/completedStepIds are recomputed
 * from scratch (never copied from the old category), and safety
 * acknowledgements are reset (a new category's safety trigger is not
 * proven identical to the old one).
 */
export function rebuildDraftForCategoryChange(
  journeyId: string,
  newCategory: RepairCategoryId,
  newSchemaVersion: number,
  previousResponses: RepairIntakeDraft["responses"],
  sharedFieldIds: Set<string>,
): StoredDraftState {
  return {
    journeyId,
    category: newCategory,
    schemaVersion: newSchemaVersion,
    activeIndex: 0,
    responses: Object.fromEntries(
      Object.entries(previousResponses).filter(([fieldId]) => sharedFieldIds.has(fieldId)),
    ),
    acknowledgements: {},
    completedStepIds: [],
  };
}

// ---------------------------------------------------------------------------
// Generated (and possibly corrected) brief — one per journey. Persisting
// this is what lets a factual correction survive reload/navigation instead
// of living only in ephemeral React state. Completing the questionnaire
// again (a new buildRepairBrief generation) explicitly replaces whatever
// was stored here, including any prior correction — see
// components/LandlordApp.tsx's onComplete handler.
// ---------------------------------------------------------------------------

export interface StoredBriefState {
  journeyId: string;
  category: RepairCategoryId;
  /** The schema version the brief was generated against — a restored brief for a schema version this build no longer recognises fails closed rather than being applied. */
  schemaVersion: number;
  draft: RepairIntakeDraft;
  brief: ProblemBrief;
}

// ---------------------------------------------------------------------------
// Full structural validation for a restored ProblemBrief. A generated brief
// is display content (GeneratedBriefDocument already reads it defensively
// field by field for older/differently-shaped records arriving from the
// API — see its own GeneratedBriefLike comment), but a value restored from
// THIS app's own localStorage claims to be a real, freshly-generated
// ProblemBrief, and every array/object field here is something a render
// path iterates or destructures without a further guard — a malformed one
// (landlordCorrections: "not-an-array", a string where propertyDetails
// should be an object, etc.) must fail closed here, not surface as a
// customer-visible crash in GeneratedBriefDocument or the confirmation
// screen.
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isValidSourceDocument(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.uploadedAt === "string" &&
    typeof value.source === "string"
  );
}

function isValidObservedFacts(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  const allowedKeys = new Set([
    "affected",
    "branchFirst",
    "branchSecond",
    "branchThird",
    "duration",
    "frequency",
    "worsening",
  ]);
  return Object.entries(value).every(([key, entry]) => allowedKeys.has(key) && isOptionalString(entry));
}

function isValidPriorAction(value: unknown): boolean {
  if (value === undefined) return true;
  return isPlainObject(value) && typeof value.status === "string" && isOptionalString(value.detail);
}

function isValidBuildingContext(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isPlainObject(value) &&
    typeof value.managementContacted === "string" &&
    typeof value.sharedAreaInvolved === "string"
  );
}

function isValidPropertyDetails(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  const allowedKeys = new Set(["district", "building", "block", "floor", "unit", "accessBy", "availability"]);
  return Object.entries(value).every(([key, entry]) => allowedKeys.has(key) && isOptionalString(entry));
}

function isValidSafetyAcknowledgementList(value: unknown): value is SafetyAcknowledgement[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.ruleId === "string" &&
        typeof entry.acknowledged === "boolean" &&
        isOptionalString(entry.acknowledgedAt),
    )
  );
}

const DRAFT_STATUSES = new Set(["draft", "brief_ready", "submitted"]);

/**
 * Nested-draft structure — everything StoredBriefState.draft must have to
 * be a real RepairIntakeDraft, other than `responses` (validated
 * separately against the live schema by sanitiseResponses, since that
 * needs the schema's own field list).
 */
function isValidDraftShape(value: unknown, category: RepairCategoryId): value is RepairIntakeDraft {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    // Repair/draft id consistency: a brief's repairId is always the id of
    // the draft that produced it (see buildRepairBrief) — this is checked
    // by the caller once both are known, but the draft's own id must at
    // least be present and well-typed here.
    value.category === category &&
    typeof value.originalReport === "string" &&
    isStringArray(value.extractedSymptoms) &&
    isValidSafetyAcknowledgementList(value.safetyAcknowledgements) &&
    typeof value.status === "string" &&
    DRAFT_STATUSES.has(value.status) &&
    typeof value.updatedAt === "string"
  );
}

function isPlausibleBrief(value: unknown, draftId: string, category: RepairCategoryId): value is ProblemBrief {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.repairId === "string" &&
    // Repair/draft id consistency — a brief not generated from this
    // journey's own draft cannot be trusted to describe it.
    value.repairId === draftId &&
    typeof value.version === "number" &&
    isStringArray(value.reportedFacts) &&
    isStringArray(value.confirmedUnknowns) &&
    isStringArray(value.contractorRequests) &&
    (value.landlordCorrections === undefined || isStringArray(value.landlordCorrections)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isValidSourceDocument) &&
    // Category consistency — when present, a brief's own category field
    // must agree with the journey's actual category rather than silently
    // describing a different one.
    (value.category === undefined || value.category === category) &&
    isValidObservedFacts(value.observedFacts) &&
    isValidPriorAction(value.priorAction) &&
    isValidBuildingContext(value.buildingContext) &&
    isValidPropertyDetails(value.propertyDetails) &&
    isOptionalString(value.relationship) &&
    isOptionalString(value.additionalContext) &&
    isOptionalString(value.hasEvidence) &&
    isOptionalString(value.evidenceKind)
  );
}

/**
 * Reads and validates a journey's generated (and possibly corrected) brief.
 * Fails closed — returns null — on a journey/category mismatch, an invalid
 * category, a schema-version mismatch, a draft whose shape or responses do
 * not sanitise cleanly against that category's schema, or a brief missing
 * any part of the structural shape every render path assumes (see
 * isPlausibleBrief and its helpers above). A malformed stored record must
 * never reach GeneratedBriefDocument or the confirmation screen.
 */
export function readJourneyBrief(
  journeyId: string,
  category: RepairCategoryId,
): StoredBriefState | null {
  const key = journeyStorageKey(journeyId, "brief");
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBriefState>;
    if (
      parsed.journeyId !== journeyId ||
      parsed.category !== category ||
      !isValidCategory(parsed.category) ||
      parsed.schemaVersion !== questionnaireByCategory[category].version
    ) {
      return null;
    }
    const schema = questionnaireByCategory[category];
    if (!isValidDraftShape(parsed.draft, category)) return null;
    const draftResponses = sanitiseResponses(schema, (parsed.draft as RepairIntakeDraft).responses);
    if (draftResponses === null) return null;
    const draft: RepairIntakeDraft = { ...(parsed.draft as RepairIntakeDraft), category, responses: draftResponses };
    if (!isPlausibleBrief(parsed.brief, draft.id, category)) return null;
    return {
      journeyId,
      category,
      schemaVersion: schema.version,
      draft,
      brief: parsed.brief,
    };
  } catch {
    return null;
  }
}

export function writeJourneyBrief(state: StoredBriefState) {
  const key = journeyStorageKey(state.journeyId, "brief");
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore — correction just will not survive a reload this time
  }
}

export function clearJourneyBrief(journeyId: string) {
  const key = journeyStorageKey(journeyId, "brief");
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Called once a repair is submitted successfully — clears only this journey's own storage, never any other journey's. */
export function clearJourney(journeyId: string) {
  clearJourneyDraft(journeyId);
  clearJourneyBrief(journeyId);
}

/**
 * Bootstraps which category a journey is already in progress for, on
 * reload/navigation — checked before either an in-progress draft or a
 * completed brief exists is otherwise a chicken-and-egg problem (both
 * readJourneyDraft and readJourneyBrief require already knowing the
 * category to validate against). Checks the brief first (the more
 * "current" state once the questionnaire is complete), then the draft.
 */
export function peekJourneyCategory(journeyId: string): RepairCategoryId | null {
  const briefKey = journeyStorageKey(journeyId, "brief");
  if (briefKey) {
    try {
      const raw = window.localStorage.getItem(briefKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredBriefState>;
        if (parsed.journeyId === journeyId && isValidCategory(parsed.category)) {
          return parsed.category;
        }
      }
    } catch {
      // fall through to the draft check
    }
  }
  return peekJourneyDraftCategory(journeyId);
}

// ---------------------------------------------------------------------------
// "Last active journey" — a pure UX convenience for the /landlord home
// screen's "continue your in-progress repair?" prompt. This is NEVER
// consulted once a route already names a journey via ?journey= — it must
// not override an already-addressed journey's identity.
// ---------------------------------------------------------------------------

const LAST_ACTIVE_JOURNEY_KEY = "repairscope:last-active-repair-journey-id";

export function rememberLastActiveJourney(journeyId: string) {
  try {
    window.localStorage.setItem(LAST_ACTIVE_JOURNEY_KEY, journeyId);
  } catch {
    // ignore
  }
}

export function readLastActiveJourney(): string | null {
  try {
    const value = window.localStorage.getItem(LAST_ACTIVE_JOURNEY_KEY);
    return isPlausibleJourneyId(value) ? value : null;
  } catch {
    return null;
  }
}

export function forgetLastActiveJourney() {
  try {
    window.localStorage.removeItem(LAST_ACTIVE_JOURNEY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Called after a journey's own storage is cleared (see clearJourney) —
 * e.g. on successful submission. Only forgets the last-active pointer if it
 * still names THIS journey: if the owner has since started a second
 * journey (J2) in the same browser, the pointer already names J2, and
 * clearing J1 must not remove it — otherwise the home screen would lose
 * the "continue your in-progress repair" prompt for J2, a journey that is
 * still genuinely in progress. Without this check at all, the home screen
 * would instead keep offering to "continue" a journey that was already
 * submitted and cleared (see readLastActiveJourney's caller).
 */
export function forgetLastActiveJourneyIfCurrent(journeyId: string) {
  if (readLastActiveJourney() === journeyId) {
    forgetLastActiveJourney();
  }
}
