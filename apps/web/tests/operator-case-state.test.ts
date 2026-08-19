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
// --- Slice 2: manual contractor response workflow -------------------------

test("a contractor's structured response fields (proposal, price, guarantee) persist through a write/read round trip", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor } =
    await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000010");
  const contractor = createOperatorContractor("Contractor A");
  contractor.responseType = "proposal-provided";
  contractor.priceType = "range";
  contractor.priceMin = 1200;
  contractor.priceMax = 1800;
  contractor.proposedApproach = "Replace the trap and reseal.";
  contractor.inclusions = "Parts and labour.";
  contractor.exclusions = "Tiling repair if needed.";
  contractor.priceChangeFactors = "If pipe behind wall is also corroded.";
  contractor.expectedDuration = "Half a day";
  contractor.guaranteeStatus = "yes";
  contractor.guaranteeDetails = "6 months on parts.";
  contractor.originalResponse = "Can do it Thursday, HK$1200-1800 depending on what we find.";
  state.contractors = [contractor];
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000010");
  const restoredContractor = restored.contractors[0];
  assert.equal(restoredContractor.responseType, "proposal-provided");
  assert.equal(restoredContractor.priceType, "range");
  assert.equal(restoredContractor.priceMin, 1200);
  assert.equal(restoredContractor.priceMax, 1800);
  assert.equal(restoredContractor.guaranteeStatus, "yes");
  assert.equal(restoredContractor.guaranteeDetails, "6 months on parts.");
  assert.equal(
    restoredContractor.originalResponse,
    "Can do it Thursday, HK$1200-1800 depending on what we find.",
  );
});

test("an old, pre-Slice-2 minimal contractor record (no response fields at all) restores safely with all new fields undefined", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-OLD",
    JSON.stringify({
      caseReference: "RS-OLD",
      status: "ready-for-sourcing",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [
        { id: "contractor-1", name: "Legacy Contractor", status: "contacted", notes: "Old-shape record." },
      ],
    }),
  );
  const restored = readOperatorCaseState("RS-OLD");
  assert.equal(restored.contractors.length, 1);
  const contractor = restored.contractors[0];
  assert.equal(contractor.name, "Legacy Contractor");
  assert.equal(contractor.notes, "Old-shape record.");
  assert.equal(contractor.responseType, undefined);
  assert.equal(contractor.priceType, undefined);
  assert.equal(contractor.guaranteeStatus, undefined);
});

test("editing one contractor's response never affects a second, independent contractor", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor } =
    await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000011");
  const a = createOperatorContractor("Contractor A");
  const b = createOperatorContractor("Contractor B");
  a.responseType = "interested";
  a.originalResponse = "Sounds doable.";
  b.responseType = "not-suitable";
  b.originalResponse = "Not our trade.";
  state.contractors = [a, b];
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000011");
  const restoredA = restored.contractors.find((c) => c.id === a.id)!;
  const restoredB = restored.contractors.find((c) => c.id === b.id)!;
  assert.equal(restoredA.responseType, "interested");
  assert.equal(restoredB.responseType, "not-suitable");

  restoredA.originalResponse = "Actually, changed their mind.";
  restored.contractors = restored.contractors.map((c) => (c.id === a.id ? restoredA : c));
  writeOperatorCaseState(restored);

  const afterEdit = readOperatorCaseState("RS-000011");
  assert.equal(afterEdit.contractors.find((c) => c.id === a.id)!.originalResponse, "Actually, changed their mind.");
  assert.equal(afterEdit.contractors.find((c) => c.id === b.id)!.originalResponse, "Not our trade.");
});

test("applyContractorPatch clears proposal fields when the response type changes away from 'proposal-provided'", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 900,
    proposedApproach: "Replace the valve.",
    guaranteeStatus: "yes",
    guaranteeDetails: "3 months.",
  });
  assert.equal(contractor.price, 900);
  assert.equal(contractor.guaranteeDetails, "3 months.");

  contractor = applyContractorPatch(contractor, { responseType: "needs-inspection" });
  assert.equal(contractor.priceType, undefined);
  assert.equal(contractor.price, undefined);
  assert.equal(contractor.proposedApproach, undefined);
  assert.equal(contractor.guaranteeStatus, undefined);
  assert.equal(contractor.guaranteeDetails, undefined);
});

test("applyContractorPatch clears the price range when price type changes away from 'range', and clears the single price when moving to 'range'", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 500,
    priceMax: 900,
  });
  assert.equal(contractor.priceMin, 500);
  assert.equal(contractor.priceMax, 900);

  contractor = applyContractorPatch(contractor, { priceType: "fixed", price: 700 });
  assert.equal(contractor.priceMin, undefined);
  assert.equal(contractor.priceMax, undefined);
  assert.equal(contractor.price, 700);

  contractor = applyContractorPatch(contractor, { priceType: "range" });
  assert.equal(contractor.price, undefined);
});

test("applyContractorPatch clears guarantee details when guarantee status is not 'yes'", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    guaranteeStatus: "yes",
    guaranteeDetails: "1 year on parts and labour.",
  });
  assert.equal(contractor.guaranteeDetails, "1 year on parts and labour.");

  contractor = applyContractorPatch(contractor, { guaranteeStatus: "not-stated" });
  assert.equal(contractor.guaranteeDetails, undefined);
});

test("applyContractorPatch preserves the always-available originalResponse and operator notes across a response type change", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor.notes = "Called twice, no answer.";
  contractor = applyContractorPatch(contractor, {
    responseType: "needs-more-information",
    informationNeeded: "Photos of the pipe.",
    originalResponse: "Can you send more photos?",
  });
  contractor = applyContractorPatch(contractor, { responseType: "proposal-provided" });
  assert.equal(contractor.originalResponse, "Can you send more photos?");
  assert.equal(contractor.notes, "Called twice, no answer.");
  assert.equal(contractor.informationNeeded, undefined);
});

test("an out-of-range or unrecognised responseType value on a restored record is rejected, falling back to an empty case state rather than crashing", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-BAD3",
    JSON.stringify({
      caseReference: "RS-BAD3",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [{ id: "c1", name: "X", status: "contacted", notes: "", responseType: "not-a-real-type" }],
    }),
  );
  const restored = readOperatorCaseState("RS-BAD3");
  assert.deepEqual(restored.contractors, []);
});

// --- Slice 2 repair pass: contact-status/response-type overlap, invalid ---
// --- price ranges (Codex audit findings) -----------------------------------

test("the contact/sourcing status enum now only exposes contact-progress values, not response outcomes", async () => {
  const { OPERATOR_CONTRACTOR_STATUSES } = await import("../domain/operatorCaseState");
  assert.deepEqual([...OPERATOR_CONTRACTOR_STATUSES], ["considering", "not-contacted", "contacted"]);
});

test("historical status='interested' with no responseType normalizes to contact status=contacted, responseType=interested", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-LEGACY1",
    JSON.stringify({
      caseReference: "RS-LEGACY1",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [{ id: "c1", name: "Legacy A", status: "interested", notes: "" }],
    }),
  );
  const restored = readOperatorCaseState("RS-LEGACY1");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].responseType, "interested");
});

test("historical status='proposal-received' with no responseType normalizes to contact status=contacted, responseType=proposal-provided", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-LEGACY2",
    JSON.stringify({
      caseReference: "RS-LEGACY2",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [{ id: "c1", name: "Legacy B", status: "proposal-received", notes: "" }],
    }),
  );
  const restored = readOperatorCaseState("RS-LEGACY2");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].responseType, "proposal-provided");
});

test("historical status='declined' with no responseType normalizes to contact status=contacted, responseType=not-suitable", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-LEGACY3",
    JSON.stringify({
      caseReference: "RS-LEGACY3",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [{ id: "c1", name: "Legacy C", status: "declined", notes: "" }],
    }),
  );
  const restored = readOperatorCaseState("RS-LEGACY3");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].responseType, "not-suitable");
});

test("a legacy response-like status alongside an already-explicit valid responseType preserves that responseType and only normalizes the status", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-LEGACY4",
    JSON.stringify({
      caseReference: "RS-LEGACY4",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      // Old status says "needs-inspection", but an explicit, later
      // responseType of "needs-more-information" was already recorded —
      // the explicit value must win, not the legacy guess.
      contractors: [
        {
          id: "c1",
          name: "Legacy D",
          status: "needs-inspection",
          notes: "",
          responseType: "needs-more-information",
          informationNeeded: "Photos of the meter box.",
        },
      ],
    }),
  );
  const restored = readOperatorCaseState("RS-LEGACY4");
  assert.equal(restored.contractors[0].status, "contacted");
  assert.equal(restored.contractors[0].responseType, "needs-more-information");
  assert.equal(restored.contractors[0].informationNeeded, "Photos of the meter box.");
});

test("current (non-legacy) status values considering/not-contacted/contacted are left exactly as-is by restoration", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-CURRENT1",
    JSON.stringify({
      caseReference: "RS-CURRENT1",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [{ id: "c1", name: "Fresh A", status: "not-contacted", notes: "" }],
    }),
  );
  const restored = readOperatorCaseState("RS-CURRENT1");
  assert.equal(restored.contractors[0].status, "not-contacted");
  assert.equal(restored.contractors[0].responseType, undefined);
});

test("applyContractorPatch never persists an inverted range (min=10000, max=5000) — both bounds are dropped, everything else kept", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "range",
    proposedApproach: "Replace the whole unit.",
  });
  contractor = applyContractorPatch(contractor, { priceMin: 10000, priceMax: 5000 });
  assert.equal(contractor.priceMin, undefined);
  assert.equal(contractor.priceMax, undefined);
  assert.equal(contractor.priceType, "range");
  assert.equal(contractor.proposedApproach, "Replace the whole unit.");
});

test("a valid range (min=5000, max=10000) persists normally through applyContractorPatch", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 5000,
    priceMax: 10000,
  });
  assert.equal(contractor.priceMin, 5000);
  assert.equal(contractor.priceMax, 10000);
});

test("min equal to max is a valid range, not an inversion", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 7000,
    priceMax: 7000,
  });
  assert.equal(contractor.priceMin, 7000);
  assert.equal(contractor.priceMax, 7000);
});

test("negative fixed/estimate/range values never persist via applyContractorPatch", async () => {
  const { applyContractorPatch, createOperatorContractor } = await import("../domain/operatorCaseState");
  let contractor = createOperatorContractor("Contractor A");
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: -500,
  });
  assert.equal(contractor.price, undefined);

  contractor = applyContractorPatch(contractor, { priceType: "range", priceMin: -100, priceMax: 200 });
  assert.equal(contractor.priceMin, undefined);
  assert.equal(contractor.priceMax, 200);
});

test("an inverted range does not survive a localStorage write/read round trip", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor } =
    await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000020");
  const contractor = createOperatorContractor("Contractor A");
  contractor.responseType = "proposal-provided";
  contractor.priceType = "range";
  // Simulates state that predates the invariant (e.g. hand-edited
  // localStorage, or written by a pre-repair-pass build) — priceMin/priceMax
  // are type-valid numbers but logically inverted.
  contractor.priceMin = 10000;
  contractor.priceMax = 5000;
  state.contractors = [contractor];
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000020");
  assert.equal(restored.contractors[0].priceMin, undefined);
  assert.equal(restored.contractors[0].priceMax, undefined);
  assert.equal(restored.contractors[0].priceType, "range");
});

test("a restored negative price is sanitized away rather than displayed", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-NEG1",
    JSON.stringify({
      caseReference: "RS-NEG1",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [
        {
          id: "c1",
          name: "X",
          status: "contacted",
          notes: "",
          responseType: "proposal-provided",
          priceType: "fixed",
          price: -1200,
        },
      ],
    }),
  );
  const restored = readOperatorCaseState("RS-NEG1");
  assert.equal(restored.contractors[0].price, undefined);
  assert.equal(restored.contractors[0].priceType, "fixed");
});

test("restored conditionally-stale fields (leftover proposal fields under a non-proposal responseType) are normalized away, while free-form response and notes survive", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-STALE1",
    JSON.stringify({
      caseReference: "RS-STALE1",
      status: "new",
      internalNotes: "",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [
        {
          id: "c1",
          name: "X",
          status: "contacted",
          notes: "Operator's own note.",
          responseType: "interested",
          // Stale — left over from before a responseType change, or a
          // hand-edited record — must not survive restoration.
          inspectionRequirement: "required",
          informationNeeded: "Should not be here",
          priceType: "fixed",
          price: 800,
          guaranteeStatus: "yes",
          guaranteeDetails: "Should not be here either",
          originalResponse: "Yes, happy to take this on.",
        },
      ],
    }),
  );
  const restored = readOperatorCaseState("RS-STALE1");
  const contractor = restored.contractors[0];
  assert.equal(contractor.responseType, "interested");
  assert.equal(contractor.inspectionRequirement, undefined);
  assert.equal(contractor.informationNeeded, undefined);
  assert.equal(contractor.priceType, undefined);
  assert.equal(contractor.price, undefined);
  assert.equal(contractor.guaranteeStatus, undefined);
  assert.equal(contractor.guaranteeDetails, undefined);
  // Free-form data is never touched by normalization.
  assert.equal(contractor.originalResponse, "Yes, happy to take this on.");
  assert.equal(contractor.notes, "Operator's own note.");
});

// --- Slice 3: proposal comparison workflow ---------------------------------

test("proposalContractors selects only contractors whose current response is 'Initial proposal provided'", async () => {
  const { proposalContractors, createOperatorContractor, applyContractorPatch } = await import(
    "../domain/operatorCaseState"
  );
  const a = applyContractorPatch(createOperatorContractor("Contractor A"), {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
  });
  const b = applyContractorPatch(createOperatorContractor("Contractor B"), { responseType: "interested" });
  const c = applyContractorPatch(createOperatorContractor("Contractor C"), { responseType: "needs-inspection" });
  const d = applyContractorPatch(createOperatorContractor("Contractor D"), {
    responseType: "needs-more-information",
  });
  const e = applyContractorPatch(createOperatorContractor("Contractor E"), { responseType: "not-suitable" });
  const f = createOperatorContractor("Contractor F"); // no response at all yet

  const proposals = proposalContractors([a, b, c, d, e, f]);
  assert.deepEqual(
    proposals.map((p) => p.name),
    ["Contractor A"],
  );
});

test("proposalContractors is truthful about count against the full contractor list — three proposals among five contractors", async () => {
  const { proposalContractors, createOperatorContractor, applyContractorPatch } = await import(
    "../domain/operatorCaseState"
  );
  const proposal = () =>
    applyContractorPatch(createOperatorContractor("P"), { responseType: "proposal-provided", priceType: "no-price" });
  const contractors = [
    proposal(),
    proposal(),
    proposal(),
    applyContractorPatch(createOperatorContractor("Interested"), { responseType: "interested" }),
    createOperatorContractor("Untouched"),
  ];
  const proposals = proposalContractors(contractors);
  assert.equal(proposals.length, 3);
  assert.equal(contractors.length, 5);
});

test("comparison notes (key differences, unresolved questions, SimpleFix note) persist through a write/read round trip", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState } = await import(
    "../domain/operatorCaseState"
  );
  const state = emptyOperatorCaseState("RS-000030");
  state.comparisonKeyDifferences = "A replaces now at a fixed price; B wants to inspect first.";
  state.comparisonUnresolvedQuestions = "Does B's range include materials?";
  state.comparisonRepairScopeNote = "Both contractors are aware of the leak location.";
  writeOperatorCaseState(state);

  const restored = readOperatorCaseState("RS-000030");
  assert.equal(restored.comparisonKeyDifferences, "A replaces now at a fixed price; B wants to inspect first.");
  assert.equal(restored.comparisonUnresolvedQuestions, "Does B's range include materials?");
  assert.equal(restored.comparisonRepairScopeNote, "Both contractors are aware of the leak location.");
});

test("a pre-Slice-3 case state (no comparison fields at all) restores safely, with comparison notes undefined", async () => {
  const { readOperatorCaseState } = await import("../domain/operatorCaseState");
  window.localStorage.setItem(
    "repairscope:operator-case:RS-PRESLICE3",
    JSON.stringify({
      caseReference: "RS-PRESLICE3",
      status: "sourcing-contractors",
      internalNotes: "Pre-Slice-3 record.",
      unresolvedQuestions: "",
      ownerFollowUpQuestions: "",
      nextAction: "",
      contractors: [
        {
          id: "c1",
          name: "Contractor A",
          status: "contacted",
          notes: "",
          responseType: "proposal-provided",
          priceType: "fixed",
          price: 5000,
        },
      ],
    }),
  );
  const restored = readOperatorCaseState("RS-PRESLICE3");
  assert.equal(restored.internalNotes, "Pre-Slice-3 record.");
  assert.equal(restored.contractors.length, 1);
  assert.equal(restored.comparisonKeyDifferences, undefined);
  assert.equal(restored.comparisonUnresolvedQuestions, undefined);
  assert.equal(restored.comparisonRepairScopeNote, undefined);
});

test("editing Contractor A's price in the existing contractor record is reflected by proposalContractors with no separate comparison-proposal state to sync", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor,
    applyContractorPatch, proposalContractors } = await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000031");
  const contractor = applyContractorPatch(createOperatorContractor("Contractor A"), {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
  });
  state.contractors = [contractor];
  writeOperatorCaseState(state);

  let restored = readOperatorCaseState("RS-000031");
  assert.equal(proposalContractors(restored.contractors)[0].price, 5000);

  const updatedContractor = applyContractorPatch(restored.contractors[0], { price: 5500 });
  restored.contractors = [updatedContractor];
  writeOperatorCaseState(restored);

  restored = readOperatorCaseState("RS-000031");
  assert.equal(proposalContractors(restored.contractors)[0].price, 5500);
});

test("Contractor A's proposal changes never affect Contractor B's independently-recorded proposal", async () => {
  const { readOperatorCaseState, writeOperatorCaseState, emptyOperatorCaseState, createOperatorContractor,
    applyContractorPatch, proposalContractors } = await import("../domain/operatorCaseState");
  const state = emptyOperatorCaseState("RS-000032");
  const a = applyContractorPatch(createOperatorContractor("Contractor A"), {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
  });
  const b = applyContractorPatch(createOperatorContractor("Contractor B"), {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 4000,
    priceMax: 7000,
  });
  state.contractors = [a, b];
  writeOperatorCaseState(state);

  let restored = readOperatorCaseState("RS-000032");
  const updatedA = applyContractorPatch(restored.contractors.find((c) => c.id === a.id)!, { price: 9000 });
  restored.contractors = restored.contractors.map((c) => (c.id === a.id ? updatedA : c));
  writeOperatorCaseState(restored);

  restored = readOperatorCaseState("RS-000032");
  const proposals = proposalContractors(restored.contractors);
  assert.equal(proposals.find((p) => p.id === a.id)!.price, 9000);
  assert.equal(proposals.find((p) => p.id === b.id)!.priceMin, 4000);
  assert.equal(proposals.find((p) => p.id === b.id)!.priceMax, 7000);
});

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
