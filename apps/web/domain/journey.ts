import type { RepairIntakeDraft } from "./types";

// A per-repair anonymous journey id: identifies "one attempt at reporting
// one repair" in localStorage (questionnaire draft key today; the intended
// association point for a future upload session, first-touch attribution,
// and submission idempotency key — see docs/PUBLIC_INGESTION_LAUNCH.md and
// HK-A0 item F's idempotency design). Deliberately not an authentication
// credential and never derived from name/email/phone/postcode.
//
// Lifecycle:
//   - startNewJourney() is called once when a landlord begins a genuinely
//     new repair report (StartAndClassify with startFresh=true) — it always
//     mints and persists a fresh id, discarding whatever journey id (if
//     any) was current before.
//   - getOrCreateCurrentJourneyId() is called when resuming the landlord's
//     in-progress workspace (StartAndClassify with startFresh=false) — it
//     returns the existing current journey id if one is stored, or mints
//     one if this is the first visit.
//   - Both read/write the same "current journey" slot in localStorage, so
//     normal navigation (Back/Continue) and a page reload within the same
//     repair keep resolving to the same id — the id itself is passed down
//     as a React prop/closure for the lifetime of that journey, not re-read
//     on every render.
//   - clearCurrentJourney() is called once a repair is submitted, so the
//     next repair the landlord starts gets a different journey id rather
//     than silently resuming the just-submitted one.
const CURRENT_JOURNEY_STORAGE_KEY = "repairscope:current-repair-journey-id";

function generateJourneyId(): string {
  // crypto.randomUUID() is the standard high-entropy browser primitive for
  // this — available in all supported browsers, no PII input.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (e.g. non-secure
  // contexts in older test runners) — still high-entropy, still no PII.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readStoredJourneyId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_JOURNEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredJourneyId(id: string) {
  try {
    window.localStorage.setItem(CURRENT_JOURNEY_STORAGE_KEY, id);
  } catch {
    // localStorage unavailable (private browsing, quota, SSR) — the id
    // still works for the lifetime of this page; it just will not survive
    // a reload. Not fatal to the journey.
  }
}

/** Starts a genuinely new repair journey, replacing any journey id already stored. */
export function startNewJourney(): string {
  const id = generateJourneyId();
  writeStoredJourneyId(id);
  return id;
}

/** Resumes the current journey (survives reload/back-forward), or starts one if none exists yet. */
export function getOrCreateCurrentJourneyId(): string {
  const existing = readStoredJourneyId();
  if (existing) return existing;
  return startNewJourney();
}

/** Called once a repair is submitted, so the next repair gets a different journey id. */
export function clearCurrentJourney() {
  try {
    window.localStorage.removeItem(CURRENT_JOURNEY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * When the landlord changes category mid-journey, drop the previous
 * category's own answers (they do not apply to the new category's
 * questions and, left in place, could leak into brief fields like
 * affectedArea/onsetAndTriggers that read specific response keys) while
 * keeping every shared/commonTail answer (postcode, urgency, occupancy,
 * access, responsibility, role, additional context) — the journey and its
 * shared answers are not lost, only the abandoned category's own answers.
 */
export function keepSharedResponsesOnly(
  responses: RepairIntakeDraft["responses"],
  sharedFieldIds: Set<string>,
): RepairIntakeDraft["responses"] {
  return Object.fromEntries(
    Object.entries(responses).filter(([fieldId]) => sharedFieldIds.has(fieldId)),
  );
}
