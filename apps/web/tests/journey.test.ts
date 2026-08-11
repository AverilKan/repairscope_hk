import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

// domain/journey.ts reads/writes window.localStorage directly — stub a
// minimal in-memory implementation rather than pulling in full jsdom,
// since these are pure storage-slot semantics, not DOM behaviour.
function createFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

const globalRecord = globalThis as unknown as Record<string, unknown>;
let originalWindow: unknown;

beforeEach(() => {
  originalWindow = globalRecord.window;
  globalRecord.window = { localStorage: createFakeLocalStorage() };
});

afterEach(() => {
  globalRecord.window = originalWindow;
});

// Regression coverage for a defect where the questionnaire draft storage
// key was derived only from category (`draft-${category}`), so two
// separate new repairs of the same category silently shared the same
// draft state, and reloading or navigating Back/Continue had no reliable
// way to resolve back to the correct one (HK-A0 item E).

test("startNewJourney always mints a fresh, high-entropy id, not derived from PII", async () => {
  const { startNewJourney } = await import("../domain/journey");
  const first = startNewJourney();
  const second = startNewJourney();
  assert.notEqual(first, second, "two calls to startNewJourney must not collide");
  // High-entropy — not a short/predictable/category-derived value.
  assert.ok(first.length >= 16);
  for (const pii of ["landlord", "tenant", "email", "phone", "@"]) {
    assert.equal(first.toLowerCase().includes(pii), false);
  }
});

test("getOrCreateCurrentJourneyId resumes the same id across calls (Back/Continue, reload)", async () => {
  const { getOrCreateCurrentJourneyId } = await import("../domain/journey");
  const first = getOrCreateCurrentJourneyId();
  const second = getOrCreateCurrentJourneyId();
  const third = getOrCreateCurrentJourneyId();
  assert.equal(first, second);
  assert.equal(second, third);
});

test("startNewJourney followed by getOrCreateCurrentJourneyId resumes the newly started journey", async () => {
  const { startNewJourney, getOrCreateCurrentJourneyId } = await import(
    "../domain/journey"
  );
  const started = startNewJourney();
  const resumed = getOrCreateCurrentJourneyId();
  assert.equal(started, resumed);
});

test("starting a genuinely new repair after clearing the current journey gets a different id", async () => {
  const { startNewJourney, clearCurrentJourney } = await import(
    "../domain/journey"
  );
  const firstRepair = startNewJourney();
  clearCurrentJourney();
  const secondRepair = startNewJourney();
  assert.notEqual(
    firstRepair,
    secondRepair,
    "clearing the current journey and starting again must not reuse the submitted repair's id",
  );
});

test("two independent new journeys never collide, even for the same category", async () => {
  const { startNewJourney } = await import("../domain/journey");
  const seen = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const id = startNewJourney();
    assert.equal(seen.has(id), false, "no stale/duplicate journey id across 50 fresh starts");
    seen.add(id);
  }
});

test("keepSharedResponsesOnly drops category-specific answers but keeps shared ones (category change does not lose the journey's shared progress)", async () => {
  const { keepSharedResponsesOnly } = await import("../domain/journey");
  const shared = new Set(["postcode", "urgency", "access", "role"]);
  const responses = {
    postcode: "SE15 3DF",
    urgency: "routine",
    access: "me",
    role: "landlord",
    // category-specific, must be dropped:
    plumbingLocation: "kitchen",
    electricalIssue: "sockets",
  };
  const result = keepSharedResponsesOnly(responses, shared);
  assert.deepEqual(result, {
    postcode: "SE15 3DF",
    urgency: "routine",
    access: "me",
    role: "landlord",
  });
});

test("commonTailFieldIds matches the questionnaire's actual shared step field ids", async () => {
  const { commonTailFieldIds, questionnaireByCategory } = await import(
    "../data/questionnaires"
  );
  // Every category's commonTail steps (postcode, urgency, occupancy,
  // access, responsibility, contact, context) contribute exactly the
  // fields listed in commonTailFieldIds — proves the set used by category
  // change to decide what survives is not stale relative to the schema.
  const sharedStepIds = new Set([
    "postcode",
    "urgency",
    "occupancy",
    "access",
    "responsibility",
    "contact",
    "context",
  ]);
  const expected = new Set(
    questionnaireByCategory.electrical.steps
      .filter((step) => sharedStepIds.has(step.id))
      .flatMap((step) => step.fields.map((field) => field.id)),
  );
  assert.deepEqual(commonTailFieldIds, expected);
});
