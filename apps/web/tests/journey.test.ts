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

// Regression coverage for the HK-A0 rework's "journey ownership" defects:
// reloading /landlord/repairs/new used to mint a new journey and orphan the
// in-progress draft, because a single global localStorage pointer decided
// identity instead of the URL. The journey id is now explicit navigation
// state (?journey=<uuid>, wired in components/LandlordApp.tsx) — these
// tests cover the id-generation and per-journey storage primitives that
// design depends on.

test("createJourneyId always mints a fresh, high-entropy id, not derived from PII", async () => {
  const { createJourneyId } = await import("../domain/journey");
  const first = createJourneyId();
  const second = createJourneyId();
  assert.notEqual(first, second, "two calls must not collide");
  assert.ok(first.length >= 16, "must be high-entropy, not a short/predictable value");
  for (const pii of ["landlord", "tenant", "email", "phone", "@"]) {
    assert.equal(first.toLowerCase().includes(pii), false);
  }
});

test("createJourneyId throws rather than falling back to Math.random when secure randomness is unavailable", async () => {
  const { createJourneyId } = await import("../domain/journey");
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    // globalThis.crypto is a getter-only accessor in this runtime —
    // redefine it instead of assigning, so the missing-crypto branch in
    // generateJourneyId (checked at call time) is actually exercised.
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    assert.throws(() => createJourneyId(), /[Ss]ecure random/);
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, "crypto", originalDescriptor);
  }
});

test("isPlausibleJourneyId rejects arbitrary/short query-string content rather than trusting it", async () => {
  const { isPlausibleJourneyId, createJourneyId } = await import("../domain/journey");
  assert.equal(isPlausibleJourneyId(createJourneyId()), true);
  assert.equal(isPlausibleJourneyId(null), false);
  assert.equal(isPlausibleJourneyId(undefined), false);
  assert.equal(isPlausibleJourneyId(""), false);
  assert.equal(isPlausibleJourneyId("short"), false);
  assert.equal(isPlausibleJourneyId("<script>alert(1)</script>"), false);
});

test("two independent journey ids never collide across many creations", async () => {
  const { createJourneyId } = await import("../domain/journey");
  const seen = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const id = createJourneyId();
    assert.equal(seen.has(id), false, "no collision across 50 fresh ids");
    seen.add(id);
  }
});

test("readJourneyDraft/writeJourneyDraft round-trip and are isolated per journey id", async () => {
  const { readJourneyDraft, writeJourneyDraft, createJourneyId } = await import("../domain/journey");
  const j1 = createJourneyId();
  const j2 = createJourneyId();
  writeJourneyDraft({
    journeyId: j1,
    category: "leak",
    schemaVersion: 1,
    activeIndex: 2,
    responses: { affected: "ceiling" },
    acknowledgements: {},
    completedStepIds: ["affected"],
  });
  writeJourneyDraft({
    journeyId: j2,
    category: "electrical",
    schemaVersion: 1,
    activeIndex: 0,
    responses: { affected: "one-fitting" },
    acknowledgements: {},
    completedStepIds: [],
  });

  const { questionnaireByCategory } = await import("../data/questionnaires");
  const j1Draft = readJourneyDraft(j1, questionnaireByCategory.leak);
  const j2Draft = readJourneyDraft(j2, questionnaireByCategory.electrical);
  assert.equal(j1Draft?.responses.affected, "ceiling");
  assert.equal(j2Draft?.responses.affected, "one-fitting");
  // Opening/writing j2 must not have touched j1's own storage.
  assert.equal(readJourneyDraft(j1, questionnaireByCategory.leak)?.responses.affected, "ceiling");
});

// Regression coverage for a defect found during manual verification of
// this rework: reloading /landlord/repairs/new?journey=<id> for an
// in-progress repair silently dropped back to the category picker, because
// NewRepairFlow had no way to know which category's schema to check
// readJourneyDraft/readJourneyBrief against without already knowing it —
// peekJourneyCategory bootstraps that from raw storage first.

test("peekJourneyCategory recovers the in-progress category from a draft, so reload does not drop back to the category picker", async () => {
  const { peekJourneyCategory, writeJourneyDraft, createJourneyId } = await import("../domain/journey");
  const journeyId = createJourneyId();
  assert.equal(peekJourneyCategory(journeyId), null);
  writeJourneyDraft({
    journeyId,
    category: "electrical",
    schemaVersion: 1,
    activeIndex: 1,
    responses: { affected: "one-room" },
    acknowledgements: {},
    completedStepIds: ["affected"],
  });
  assert.equal(peekJourneyCategory(journeyId), "electrical");
});

test("peekJourneyCategory recovers the category from a completed brief once the draft has been cleared", async () => {
  const { peekJourneyCategory, writeJourneyBrief, clearJourneyDraft, createJourneyId } = await import(
    "../domain/journey"
  );
  const journeyId = createJourneyId();
  clearJourneyDraft(journeyId);
  writeJourneyBrief({
    journeyId,
    category: "leak",
    draft: {
      id: journeyId,
      category: "leak",
      originalReport: "",
      extractedSymptoms: [],
      responses: {},
      safetyAcknowledgements: [],
      status: "brief_ready",
      updatedAt: new Date(0).toISOString(),
    },
    brief: {
      id: `brief-${journeyId}`,
      repairId: journeyId,
      originalReport: "",
      reportedFacts: [],
      structuredSymptoms: [],
      affectedArea: "",
      onsetAndTriggers: [],
      evidence: [],
      urgency: "routine",
      occupancy: "other",
      accessOverview: "",
      confirmedUnknowns: [],
      contractorRequests: [],
      version: 1,
    },
  });
  assert.equal(peekJourneyCategory(journeyId), "leak");
});

test("peekJourneyCategory never leaks one journey's category into another journey's lookup", async () => {
  const { peekJourneyCategory, writeJourneyDraft, createJourneyId } = await import("../domain/journey");
  const j1 = createJourneyId();
  const j2 = createJourneyId();
  writeJourneyDraft({
    journeyId: j1,
    category: "plumbing",
    schemaVersion: 1,
    activeIndex: 0,
    responses: {},
    acknowledgements: {},
    completedStepIds: [],
  });
  assert.equal(peekJourneyCategory(j1), "plumbing");
  assert.equal(peekJourneyCategory(j2), null);
});

test("readJourneyDraft fails safely (returns null) for a mismatched category or schema version rather than applying stale data", async () => {
  const { readJourneyDraft, writeJourneyDraft, createJourneyId } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const journeyId = createJourneyId();
  writeJourneyDraft({
    journeyId,
    category: "leak",
    schemaVersion: questionnaireByCategory.leak.version,
    activeIndex: 1,
    responses: { affected: "ceiling" },
    acknowledgements: {},
    completedStepIds: [],
  });
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.electrical), null);
  assert.equal(
    readJourneyDraft(journeyId, { ...questionnaireByCategory.leak, version: questionnaireByCategory.leak.version + 1 }),
    null,
  );
  assert.ok(readJourneyDraft(journeyId, questionnaireByCategory.leak));
});

// Regression coverage for the "journey storage hardening" requirement:
// readJourneyDraft/readJourneyBrief used to accept malformed state too
// easily (only shallow type checks) — a hand-edited or corrupted
// localStorage record must be rejected outright (fail closed to a fresh
// draft), never partially trusted.
test("readJourneyDraft rejects a negative or fractional activeIndex, falling back to 0 rather than an invalid step", async () => {
  const { readJourneyDraft } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const journeyId = "malformed-index-journey";
  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "leak",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: -3,
      responses: {},
      acknowledgements: {},
      completedStepIds: [],
    }),
  );
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.leak)?.activeIndex, 0);

  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "leak",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: 2.5,
      responses: {},
      acknowledgements: {},
      completedStepIds: [],
    }),
  );
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.leak)?.activeIndex, 0);

  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "leak",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: 999,
      responses: {},
      acknowledgements: {},
      completedStepIds: [],
    }),
  );
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.leak)?.activeIndex, 0);
});

test("readJourneyDraft drops an unknown completed step id rather than restoring it", async () => {
  const { readJourneyDraft } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const journeyId = "malformed-step-journey";
  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "leak",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: 0,
      responses: {},
      acknowledgements: {},
      completedStepIds: ["affected", "not-a-real-step"],
    }),
  );
  assert.deepEqual(readJourneyDraft(journeyId, questionnaireByCategory.leak)?.completedStepIds, ["affected"]);
});

test("readJourneyDraft drops an unknown response field id and an unrecognised option value rather than restoring them", async () => {
  const { readJourneyDraft } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const journeyId = "malformed-response-journey";
  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "leak",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: 0,
      responses: {
        affected: "ceiling", // valid field, valid option
        affected2: "ceiling", // not a real field on this schema
        district: "not-a-real-district", // real field, unrecognised option value
      },
      acknowledgements: {},
      completedStepIds: [],
    }),
  );
  assert.deepEqual(readJourneyDraft(journeyId, questionnaireByCategory.leak)?.responses, {
    affected: "ceiling",
  });
});

test("readJourneyDraft fails closed (returns null) for an invalid category or corrupted JSON, rather than throwing or partially restoring", async () => {
  const { readJourneyDraft } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const journeyId = "malformed-category-journey";

  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:draft`,
    JSON.stringify({
      journeyId,
      category: "not-a-real-category",
      schemaVersion: questionnaireByCategory.leak.version,
      activeIndex: 0,
      responses: {},
      acknowledgements: {},
      completedStepIds: [],
    }),
  );
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.leak), null);

  window.localStorage.setItem(`repairscope:journey:${journeyId}:draft`, "{not valid json");
  assert.equal(readJourneyDraft(journeyId, questionnaireByCategory.leak), null);
});

test("readJourneyBrief fails closed for a wrong journey id, malformed brief array fields, or a corrupted record", async () => {
  const { readJourneyBrief, writeJourneyBrief } = await import("../domain/journey");
  const journeyId = "malformed-brief-journey";
  const validDraft = {
    id: journeyId,
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: { affected: "ceiling" },
    safetyAcknowledgements: [],
    status: "brief_ready" as const,
    updatedAt: new Date(0).toISOString(),
  };
  writeJourneyBrief({
    journeyId,
    category: "leak",
    draft: validDraft,
    brief: {
      id: `brief-${journeyId}`,
      repairId: journeyId,
      originalReport: "",
      reportedFacts: [],
      structuredSymptoms: [],
      affectedArea: "",
      onsetAndTriggers: [],
      evidence: [],
      urgency: "routine",
      occupancy: "other",
      accessOverview: "",
      confirmedUnknowns: [],
      contractorRequests: [],
      version: 1,
    },
  });
  // Wrong journey id must never read another journey's brief.
  assert.equal(readJourneyBrief("a-different-journey-id", "leak"), null);
  assert.ok(readJourneyBrief(journeyId, "leak"));

  // A brief whose array fields are not actually arrays must be rejected —
  // every render path assumes reportedFacts/confirmedUnknowns/
  // contractorRequests are arrays.
  window.localStorage.setItem(
    `repairscope:journey:${journeyId}:brief`,
    JSON.stringify({
      journeyId,
      category: "leak",
      draft: validDraft,
      brief: { id: "brief-x", repairId: journeyId, version: 1, reportedFacts: "not-an-array" },
    }),
  );
  assert.equal(readJourneyBrief(journeyId, "leak"), null);

  window.localStorage.setItem(`repairscope:journey:${journeyId}:brief`, "{not valid json");
  assert.equal(readJourneyBrief(journeyId, "leak"), null);
});

test("clearJourney removes only that journey's draft and brief storage, never another journey's", async () => {
  const {
    createJourneyId,
    writeJourneyDraft,
    writeJourneyBrief,
    readJourneyDraft,
    readJourneyBrief,
    clearJourney,
  } = await import("../domain/journey");
  const { questionnaireByCategory } = await import("../data/questionnaires");
  const j1 = createJourneyId();
  const j2 = createJourneyId();
  const draftFor = (journeyId: string) => ({
    journeyId,
    category: "leak" as const,
    schemaVersion: questionnaireByCategory.leak.version,
    activeIndex: 0,
    responses: {},
    acknowledgements: {},
    completedStepIds: [],
  });
  const briefFor = (journeyId: string) => ({
    journeyId,
    category: "leak" as const,
    draft: {
      id: journeyId,
      category: "leak" as const,
      originalReport: "",
      extractedSymptoms: [],
      responses: {},
      safetyAcknowledgements: [],
      status: "brief_ready" as const,
      updatedAt: new Date(0).toISOString(),
    },
    brief: {
      id: `brief-${journeyId}`,
      repairId: journeyId,
      originalReport: "",
      reportedFacts: [],
      structuredSymptoms: [],
      affectedArea: "",
      onsetAndTriggers: [],
      evidence: [],
      urgency: "routine" as const,
      occupancy: "other" as const,
      accessOverview: "",
      confirmedUnknowns: [],
      contractorRequests: [],
      version: 1,
    },
  });

  writeJourneyDraft(draftFor(j1));
  writeJourneyDraft(draftFor(j2));
  writeJourneyBrief(briefFor(j1));
  writeJourneyBrief(briefFor(j2));

  clearJourney(j1);

  assert.equal(readJourneyDraft(j1, questionnaireByCategory.leak), null);
  assert.equal(readJourneyBrief(j1, "leak"), null);
  assert.ok(readJourneyDraft(j2, questionnaireByCategory.leak), "clearing j1 must not clear j2's draft");
  assert.ok(readJourneyBrief(j2, "leak"), "clearing j1 must not clear j2's brief");
});

test("rebuildDraftForCategoryChange keeps only shared answers and resets index/completion/acknowledgements", async () => {
  const { rebuildDraftForCategoryChange } = await import("../domain/journey");
  const shared = new Set(["district", "building", "relationship"]);
  const result = rebuildDraftForCategoryChange(
    "journey-1",
    "electrical",
    2,
    {
      district: "eastern",
      building: "Kornhill",
      relationship: "owner-occupier",
      affected: "kitchen",
      branchFirst: "leak",
    },
    shared,
  );
  assert.deepEqual(result.responses, {
    district: "eastern",
    building: "Kornhill",
    relationship: "owner-occupier",
  });
  assert.equal(result.activeIndex, 0);
  assert.deepEqual(result.completedStepIds, []);
  assert.deepEqual(result.acknowledgements, {});
  assert.equal(result.category, "electrical");
  assert.equal(result.schemaVersion, 2);
});

test("last-active-journey convenience pointer is a pure UX hint, separate from per-journey storage", async () => {
  const { rememberLastActiveJourney, readLastActiveJourney, forgetLastActiveJourney, createJourneyId } =
    await import("../domain/journey");
  const id = createJourneyId();
  assert.equal(readLastActiveJourney(), null);
  rememberLastActiveJourney(id);
  assert.equal(readLastActiveJourney(), id);
  forgetLastActiveJourney();
  assert.equal(readLastActiveJourney(), null);
});

// Regression coverage for rework item 6 (last-active journey pointer):
// a successful submission cleared the submitted journey's own draft/brief
// storage (clearJourney) but never touched the last-active pointer, so the
// home screen's "continue your in-progress repair" prompt kept pointing at
// an already-submitted-and-cleared journey. forgetLastActiveJourneyIfCurrent
// must clear the pointer only when it still names the journey just
// submitted — not when the owner has since started a second, genuinely
// still-in-progress journey.

test("forgetLastActiveJourneyIfCurrent clears the pointer when J1 submits and the pointer still names J1", async () => {
  const { rememberLastActiveJourney, readLastActiveJourney, forgetLastActiveJourneyIfCurrent, createJourneyId } =
    await import("../domain/journey");
  const j1 = createJourneyId();
  rememberLastActiveJourney(j1);
  assert.equal(readLastActiveJourney(), j1);

  forgetLastActiveJourneyIfCurrent(j1);

  assert.equal(readLastActiveJourney(), null);
});

test("forgetLastActiveJourneyIfCurrent does not clear the pointer for J1 once the owner has started J2", async () => {
  const { rememberLastActiveJourney, readLastActiveJourney, forgetLastActiveJourneyIfCurrent, createJourneyId } =
    await import("../domain/journey");
  const j1 = createJourneyId();
  const j2 = createJourneyId();
  rememberLastActiveJourney(j1);
  // Owner starts a second, still-in-progress journey — the pointer now
  // names J2, not J1.
  rememberLastActiveJourney(j2);
  assert.equal(readLastActiveJourney(), j2);

  // J1 (an older tab, or a journey abandoned earlier) is submitted —
  // clearing J1 must not remove J2's still-current pointer.
  forgetLastActiveJourneyIfCurrent(j1);

  assert.equal(readLastActiveJourney(), j2);
});

test("sharedTailFieldIds matches the questionnaire's actual shared step field ids", async () => {
  const { sharedTailFieldIds, questionnaireByCategory } = await import("../data/questionnaires");
  const sharedStepIds = new Set([
    "safety",
    "timeline",
    "prior",
    "evidence",
    "building",
    "access",
    "address",
    "relationship",
    "additional",
  ]);
  const expected = new Set(
    questionnaireByCategory.electrical.steps
      .filter((step) => sharedStepIds.has(step.id))
      .flatMap((step) => step.fields.map((field) => field.id)),
  );
  assert.deepEqual(sharedTailFieldIds, expected);
});
