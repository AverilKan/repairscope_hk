import type { ProblemBrief, RepairCategoryId, RepairIntakeDraft } from "./types";

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

export function readJourneyDraft(
  journeyId: string,
  category: RepairCategoryId,
  schemaVersion: number,
): StoredDraftState | null {
  const key = journeyStorageKey(journeyId, "draft");
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraftState>;
    if (
      parsed.journeyId !== journeyId ||
      parsed.category !== category ||
      parsed.schemaVersion !== schemaVersion ||
      typeof parsed.responses !== "object" ||
      parsed.responses === null
    ) {
      // Stale or incompatible — fail safely rather than applying a
      // mismatched shape into the current schema.
      return null;
    }
    return {
      journeyId,
      category,
      schemaVersion,
      activeIndex: typeof parsed.activeIndex === "number" ? parsed.activeIndex : 0,
      responses: parsed.responses,
      acknowledgements:
        typeof parsed.acknowledgements === "object" && parsed.acknowledgements !== null
          ? parsed.acknowledgements
          : {},
      completedStepIds: Array.isArray(parsed.completedStepIds)
        ? parsed.completedStepIds
        : [],
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
    return parsed.journeyId === journeyId && typeof parsed.category === "string"
      ? (parsed.category as RepairCategoryId)
      : null;
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
  draft: RepairIntakeDraft;
  brief: ProblemBrief;
}

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
      typeof parsed.draft !== "object" ||
      parsed.draft === null ||
      typeof parsed.brief !== "object" ||
      parsed.brief === null
    ) {
      return null;
    }
    return parsed as StoredBriefState;
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
        if (parsed.journeyId === journeyId && typeof parsed.category === "string") {
          return parsed.category as RepairCategoryId;
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
