import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

// Unit coverage for the local-only operator working-state layer on
// /operator (see RepairScope HK — Post-Intake Workflow, Slice 1.5). The
// owner SUBMISSION itself is real backend data — see
// tests/api-operator-submission-service.test.ts for real-shape parsing
// coverage, and tests/e2e/operator-case-workspace.spec.ts for full
// rendering/interaction coverage (component-level jsdom rendering of
// components/operator/* was attempted but is blocked by a real
// environment limitation: @clerk/nextjs's ESM build does not resolve
// `useAuth` under plain Node/tsx module resolution outside Next's own
// bundler, even when the hook is never called — see this session's final
// report). This file covers the operator's own local layer — status,
// notes, contractor tracking — plus a structural check that the real
// components never import test-only fixture data as a fallback.

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

test("operatorCaseFixtures provides at least 3 representative sample cases, findable by reference (test-only fixtures)", async () => {
  const { operatorCaseFixtures, findOperatorCaseFixture } = await import("../data/operatorCaseFixtures");
  assert.ok(operatorCaseFixtures.length >= 3);
  const categories = new Set(operatorCaseFixtures.map((c) => c.brief.category));
  assert.ok(categories.has("leak"));
  assert.ok(categories.has("electrical"));
  for (const fixture of operatorCaseFixtures) {
    assert.equal(findOperatorCaseFixture(fixture.caseReference)?.caseReference, fixture.caseReference);
  }
});

test("each sample case's brief is independently built and carries its own observed facts", async () => {
  const { operatorCaseFixtures } = await import("../data/operatorCaseFixtures");
  const leak = operatorCaseFixtures.find((c) => c.brief.category === "leak")!;
  const electrical = operatorCaseFixtures.find((c) => c.brief.category === "electrical")!;
  assert.notEqual(leak.brief, electrical.brief);
  assert.equal(leak.brief.observedFacts?.affected, "ceiling");
  assert.equal(electrical.brief.observedFacts?.affected, "one-room");
});

test("status, internal notes, unresolved questions and next action all persist through a write/read round trip", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState } = await import(
    "../domain/operatorCaseState"
  );
  const state = emptyOperatorCaseState("RS-000001");
  state.status = "ready-for-sourcing";
  state.internalNotes = "Owner is responsive.";
  state.unresolvedQuestions = "Is the source confirmed?";
  state.nextAction = "Call Contractor A tomorrow.";
  state.followUpDate = "2026-08-20";
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000001");
  assert.equal(restored.status, "ready-for-sourcing");
  assert.equal(restored.internalNotes, "Owner is responsive.");
  assert.equal(restored.unresolvedQuestions, "Is the source confirmed?");
  assert.equal(restored.nextAction, "Call Contractor A tomorrow.");
  assert.equal(restored.followUpDate, "2026-08-20");
});

test("a contractor can be added with a status and notes, and both persist", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor } =
    await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000002");
  const contractor = createOperatorContractor("Contractor A");
  contractor.status = "contacted";
  contractor.notes = "WhatsApp 9pm, can visit Saturday.";
  state.contractors = [contractor];
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000002");
  assert.equal(restored.contractors.length, 1);
  assert.equal(restored.contractors[0].name, "Contractor A");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].notes, "WhatsApp 9pm, can visit Saturday.");
});

test("a contractor can be removed, and the removal persists", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor } =
    await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000003");
  const a = createOperatorContractor("Contractor A");
  const b = createOperatorContractor("Contractor B");
  state.contractors = [a, b];
  writeOperatorCaseState(state);

  const afterAdd = readOperatorCaseState("RS-000003");
  assert.equal(afterAdd.contractors.length, 2);

  afterAdd.contractors = afterAdd.contractors.filter((c) => c.id !== a.id);
  writeOperatorCaseState(afterAdd);

  const afterRemove = readOperatorCaseState("RS-000003");
  assert.equal(afterRemove.contractors.length, 1);
  assert.equal(afterRemove.contractors[0].name, "Contractor B");
});

test("the local workflow storage key is namespaced by REAL public case reference and never matches the owner-journey key patterns", async () => {
  const { writeOperatorCaseState, emptyOperatorCaseState, isOperatorCaseStorageKey } = await import(
    "../domain/operatorCaseState"
  );
  writeOperatorCaseState(emptyOperatorCaseState("RS-000001"));

  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    keys.push(window.localStorage.key(i)!);
  }
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(isOperatorCaseStorageKey(key), `unexpected key shape: ${key}`);
    assert.equal(key, "repairscope:operator-case:RS-000001");
    assert.equal(key.startsWith("repairscope:journey:"), false);
    assert.equal(key.startsWith("repairscope:repair:"), false);
    assert.notEqual(key, "repairscope:last-active-repair-journey-id");
    assert.notEqual(key, "repairscope:language");
  }
});

test("a corrupted stored record falls back to an empty state instead of crashing", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem("repairscope:operator-case:RS-BAD", "not valid json");
  const restored = readOperatorCaseState("RS-BAD");
  assert.equal(restored.status, "new");
  assert.deepEqual(restored.contractors, []);

  window.localStorage.setItem(
    "repairscope:operator-case:RS-BAD2",
    JSON.stringify({ caseReference: "RS-BAD2", status: "not-a-real-status" }),
  );
  const restored2 = readOperatorCaseState("RS-BAD2");
  assert.equal(restored2.status, "new");
});

// Section 18: "API failure does not silently show fixtures." The service
// layer's own error typing is proven in tests/api-operator-submission-
// service.test.ts (a rejected list()/get() call surfaces a typed
// OperatorSubmission*Error, never a fixture-shaped fallback value); this
// proves the OTHER half — that the real components never import the
// test-only fixture module at all, so there is no code path by which a
// fixture could reach the live UI regardless of API outcome.
test("OperatorCaseList and OperatorCaseWorkspace never import the test-only fixture module", async () => {
  const { readFile } = await import("node:fs/promises");
  const listSource = await readFile(
    new URL("../components/operator/OperatorCaseList.tsx", import.meta.url),
    "utf8",
  );
  const workspaceSource = await readFile(
    new URL("../components/operator/OperatorCaseWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(listSource, /operatorCaseFixtures/);
  assert.doesNotMatch(workspaceSource, /operatorCaseFixtures/);
});
