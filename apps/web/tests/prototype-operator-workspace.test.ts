import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

// Unit coverage for the local-only "/prototype/operator" case workspace
// (RepairScope HK — Local Post-Intake Prototype, Slice 1). This is a
// deliberately disposable prototype — these tests exist to prove the
// persistence layer itself works and stays out of the real owner-journey
// localStorage namespace, not to lock in the exact field set as a
// production contract.

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
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
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

// A. Case list renders fixture cases (data-level: fixtures exist and are
// findable by reference).
test("prototypeCases provides at least 3 representative sample cases, findable by reference", async () => {
  const { prototypeCases, findPrototypeCase } = await import("../data/prototypeFixtures");
  assert.ok(prototypeCases.length >= 3);
  const categories = new Set(prototypeCases.map((c) => c.brief.category));
  assert.ok(categories.has("leak"));
  assert.ok(categories.has("electrical"));
  for (const proto of prototypeCases) {
    assert.equal(findPrototypeCase(proto.caseReference)?.caseReference, proto.caseReference);
  }
});

// B. Opening a case displays the correct owner submission (data-level: the
// brief attached to each fixture is genuinely built via buildRepairBrief
// and carries that case's own facts, not a shared/duplicated object).
test("each sample case's brief is independently built and carries its own observed facts", async () => {
  const { prototypeCases } = await import("../data/prototypeFixtures");
  const leak = prototypeCases.find((c) => c.brief.category === "leak")!;
  const electrical = prototypeCases.find((c) => c.brief.category === "electrical")!;
  assert.notEqual(leak.brief, electrical.brief);
  assert.equal(leak.brief.observedFacts?.affected, "ceiling");
  assert.equal(electrical.brief.observedFacts?.affected, "one-room");
});

// C. Status can be changed, and persists — D/E/J covered together since
// they share the same read/write round trip.
test("C/D/E/J: status, internal notes, unresolved questions and next action all persist through a write/read round trip", async () => {
  const { readPrototypeCaseState, writePrototypeCaseState, emptyPrototypeCaseState } = await import(
    "../domain/prototype/caseState"
  );
  const state = emptyPrototypeCaseState("RS-PROTO01");
  state.status = "ready-for-sourcing";
  state.internalNotes = "Owner is responsive.";
  state.unresolvedQuestions = "Is the source confirmed?";
  state.nextAction = "Call Contractor A tomorrow.";
  state.followUpDate = "2026-08-20";
  writePrototypeCaseState(state);

  const restored = readPrototypeCaseState("RS-PROTO01");
  assert.equal(restored.status, "ready-for-sourcing");
  assert.equal(restored.internalNotes, "Owner is responsive.");
  assert.equal(restored.unresolvedQuestions, "Is the source confirmed?");
  assert.equal(restored.nextAction, "Call Contractor A tomorrow.");
  assert.equal(restored.followUpDate, "2026-08-20");
});

// F/G/H/I: a contractor can be added, its status/notes updated, and it can
// be removed — all persisting.
test("F/G/H: a contractor can be added with a status and notes, and both persist", async () => {
  const { readPrototypeCaseState, writePrototypeCaseState, emptyPrototypeCaseState, createPrototypeContractor } =
    await import("../domain/prototype/caseState");
  const state = emptyPrototypeCaseState("RS-PROTO02");
  const contractor = createPrototypeContractor("Contractor A");
  contractor.status = "contacted";
  contractor.notes = "WhatsApp 9pm, can visit Saturday.";
  state.contractors = [contractor];
  writePrototypeCaseState(state);

  const restored = readPrototypeCaseState("RS-PROTO02");
  assert.equal(restored.contractors.length, 1);
  assert.equal(restored.contractors[0].name, "Contractor A");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].notes, "WhatsApp 9pm, can visit Saturday.");
});

test("I: a contractor can be removed, and the removal persists", async () => {
  const { readPrototypeCaseState, writePrototypeCaseState, emptyPrototypeCaseState, createPrototypeContractor } =
    await import("../domain/prototype/caseState");
  const state = emptyPrototypeCaseState("RS-PROTO03");
  const a = createPrototypeContractor("Contractor A");
  const b = createPrototypeContractor("Contractor B");
  state.contractors = [a, b];
  writePrototypeCaseState(state);

  const afterAdd = readPrototypeCaseState("RS-PROTO03");
  assert.equal(afterAdd.contractors.length, 2);

  afterAdd.contractors = afterAdd.contractors.filter((c) => c.id !== a.id);
  writePrototypeCaseState(afterAdd);

  const afterRemove = readPrototypeCaseState("RS-PROTO03");
  assert.equal(afterRemove.contractors.length, 1);
  assert.equal(afterRemove.contractors[0].name, "Contractor B");
});

// K. Prototype localStorage namespace does not collide with owner-journey
// storage.
test("K: the prototype's storage key is clearly namespaced and never matches the owner-journey key patterns", async () => {
  const { writePrototypeCaseState, emptyPrototypeCaseState, isPrototypeStorageKey } = await import(
    "../domain/prototype/caseState"
  );
  writePrototypeCaseState(emptyPrototypeCaseState("RS-PROTO01"));

  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    keys.push(window.localStorage.key(i)!);
  }
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(isPrototypeStorageKey(key), `unexpected prototype key shape: ${key}`);
    assert.equal(key.startsWith("repairscope:journey:"), false);
    assert.equal(key.startsWith("repairscope:repair:"), false);
    assert.notEqual(key, "repairscope:last-active-repair-journey-id");
    assert.notEqual(key, "repairscope:language");
  }
});

// A corrupted/hand-edited record must fail closed to an empty state rather
// than crash the workspace — same philosophy as the owner journey's own
// storage hardening (see domain/journey.ts).
test("a corrupted stored record falls back to an empty state instead of crashing", async () => {
  const { readPrototypeCaseState } = await import("../domain/prototype/caseState");
  window.localStorage.setItem("repairscope:proto:operator-case:RS-BAD", "not valid json");
  const restored = readPrototypeCaseState("RS-BAD");
  assert.equal(restored.status, "new");
  assert.deepEqual(restored.contractors, []);

  window.localStorage.setItem(
    "repairscope:proto:operator-case:RS-BAD2",
    JSON.stringify({ caseReference: "RS-BAD2", status: "not-a-real-status" }),
  );
  const restored2 = readPrototypeCaseState("RS-BAD2");
  assert.equal(restored2.status, "new");
});
