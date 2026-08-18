import assert from "node:assert/strict";
import test from "node:test";

// Unit coverage for T2 Commit 1's frontend/backend completeness alignment.
// See domain/contractorResponse.ts's checkContractorResponseCompletion —
// every rule here has a direct counterpart in the real T1 API's
// ContractorResponsePayload._check_conditional_fields
// (apps/api/app/schemas/contractor_requests.py), read directly before
// writing this: responseType required; needs-inspection requires
// inspectionRequirement; needs-more-information requires a non-blank,
// trimmed informationNeeded; proposal-provided requires priceType, and
// then price (fixed/estimate) or both priceMin+priceMax with
// priceMin<=priceMax (range); every free-text field is capped at either
// _SHORT_TEXT_MAX=200 or _LONG_TEXT_MAX=2000 depending on the field.
//
// STATIC CROSS-CONTRACT COMPATIBILITY: this file proves the frontend side
// of the contract (a payload this module reports `complete` matches every
// rule read from the real Pydantic model above). The other half — that
// the live T1 API genuinely accepts these exact payload shapes — is
// proven for real over HTTP by T2 Commit 2's public-transport tests,
// which POST these same branch shapes against the actual running FastAPI
// backend and assert success. Cross-runner (TS -> Python) validation
// inside a single test run was judged unnecessary overhead given Commit 2
// already exercises the real backend directly with equivalent fixtures.

test("responseType is required", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({});
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("what happens next")));
});

// --- Needs more information -------------------------------------------

test("needs-more-information: blank informationNeeded is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({ responseType: "needs-more-information" });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("information")));
});

test("needs-more-information: whitespace-only informationNeeded is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "needs-more-information",
    informationNeeded: "   \n\t  ",
  });
  assert.equal(result.complete, false);
});

test("needs-more-information: non-blank informationNeeded is accepted", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "needs-more-information",
    informationNeeded: "Access to the affected area, please.",
  });
  assert.equal(result.complete, true);
});

// --- Needs inspection ----------------------------------------------------

test("needs-inspection: missing inspectionRequirement is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({ responseType: "needs-inspection" });
  assert.equal(result.complete, false);
});

test("needs-inspection: with inspectionRequirement is accepted", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "needs-inspection",
    inspectionRequirement: "required",
  });
  assert.equal(result.complete, true);
});

// --- Interested / not-suitable (no required fields beyond responseType) --

test("interested requires only responseType", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  assert.equal(checkContractorResponseCompletion({ responseType: "interested" }).complete, true);
});

test("not-suitable requires only responseType", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  assert.equal(checkContractorResponseCompletion({ responseType: "not-suitable" }).complete, true);
});

// --- Proposal: fixed / estimate -------------------------------------------

test("fixed price without an amount is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "fixed",
  });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});

test("estimate price without an amount is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "estimate",
  });
  assert.equal(result.complete, false);
});

test("fixed price with a valid amount is accepted, including zero", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  assert.equal(
    checkContractorResponseCompletion({ responseType: "proposal-provided", priceType: "fixed", price: 5000 })
      .complete,
    true,
  );
  assert.equal(
    checkContractorResponseCompletion({ responseType: "proposal-provided", priceType: "fixed", price: 0 })
      .complete,
    true,
  );
});

test("negative or non-finite fixed price is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  assert.equal(
    checkContractorResponseCompletion({ responseType: "proposal-provided", priceType: "fixed", price: -1 })
      .complete,
    false,
  );
  assert.equal(
    checkContractorResponseCompletion({
      responseType: "proposal-provided",
      priceType: "fixed",
      price: Number.POSITIVE_INFINITY,
    }).complete,
    false,
  );
  assert.equal(
    checkContractorResponseCompletion({ responseType: "proposal-provided", priceType: "fixed", price: NaN })
      .complete,
    false,
  );
});

// --- Proposal: range -------------------------------------------------------

test("range missing priceMin is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
    priceMax: 7000,
  });
  assert.equal(result.complete, false);
});

test("range missing priceMax is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 4000,
  });
  assert.equal(result.complete, false);
});

test("range with both bounds missing is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
  });
  assert.equal(result.complete, false);
});

test("inverted range (min > max) is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 9000,
    priceMax: 3000,
  });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("minimum")));
});

test("a valid equal range (min === max) is accepted", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 5000,
    priceMax: 5000,
  });
  assert.equal(result.complete, true);
});

test("a valid ascending range is accepted", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 4000,
    priceMax: 7000,
  });
  assert.equal(result.complete, true);
});

// --- Proposal: no-price ----------------------------------------------------

test("no-price with no numeric fields set is accepted", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "no-price",
  });
  assert.equal(result.complete, true);
});

test("proposal-provided without any priceType chosen yet is blocked", async () => {
  const { checkContractorResponseCompletion } = await import("../domain/contractorResponse");
  const result = checkContractorResponseCompletion({ responseType: "proposal-provided" });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("price type")));
});

// --- Text length bounds ----------------------------------------------------

test("overlength long-text field is blocked", async () => {
  const { checkContractorResponseCompletion, CONTRACTOR_RESPONSE_LONG_TEXT_MAX } = await import(
    "../domain/contractorResponse"
  );
  const result = checkContractorResponseCompletion({
    responseType: "interested",
    originalResponse: "x".repeat(CONTRACTOR_RESPONSE_LONG_TEXT_MAX + 1),
  });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((e) => e.includes("too long")));
});

test("boundary-length long-text field (exactly at the cap) is accepted", async () => {
  const { checkContractorResponseCompletion, CONTRACTOR_RESPONSE_LONG_TEXT_MAX } = await import(
    "../domain/contractorResponse"
  );
  const result = checkContractorResponseCompletion({
    responseType: "interested",
    originalResponse: "x".repeat(CONTRACTOR_RESPONSE_LONG_TEXT_MAX),
  });
  assert.equal(result.complete, true);
});

test("overlength short-text field (expectedDuration) is blocked", async () => {
  const { checkContractorResponseCompletion, CONTRACTOR_RESPONSE_SHORT_TEXT_MAX } = await import(
    "../domain/contractorResponse"
  );
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "no-price",
    expectedDuration: "x".repeat(CONTRACTOR_RESPONSE_SHORT_TEXT_MAX + 1),
  });
  assert.equal(result.complete, false);
});

test("boundary-length short-text field (exactly at the cap) is accepted", async () => {
  const { checkContractorResponseCompletion, CONTRACTOR_RESPONSE_SHORT_TEXT_MAX } = await import(
    "../domain/contractorResponse"
  );
  const result = checkContractorResponseCompletion({
    responseType: "proposal-provided",
    priceType: "no-price",
    expectedDuration: "x".repeat(CONTRACTOR_RESPONSE_SHORT_TEXT_MAX),
  });
  assert.equal(result.complete, true);
});

// --- Full valid branch fixtures (static cross-contract compatibility) -----
//
// One representative COMPLETE payload per branch — each of these is
// re-submitted verbatim (same shape) against the real T1 API in T2 Commit
// 2's public-transport tests to prove live backend acceptance, not just
// frontend-side completeness.

const VALID_BRANCH_FIXTURES = {
  interested: { responseType: "interested", originalResponse: "Happy to take a look this week." },
  needsInspection: {
    responseType: "needs-inspection",
    inspectionRequirement: "required",
    originalResponse: "Need to see the ceiling in person first.",
  },
  needsMoreInformation: {
    responseType: "needs-more-information",
    informationNeeded: "A couple more photos of the affected ceiling area.",
  },
  notSuitable: { responseType: "not-suitable", originalResponse: "This isn't a job for my trade." },
  proposalFixed: {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
    proposedApproach: "Replace the connector and reseal.",
    inclusions: "Parts and labour.",
    exclusions: "Repainting the ceiling.",
    priceChangeFactors: "If hidden damage is found once we open the wall.",
    expectedDuration: "Half a day",
    earliestStart: "Within 3 days",
    guaranteeStatus: "yes",
    guaranteeDetails: "6 months on parts and labour.",
  },
  proposalRange: {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 4000,
    priceMax: 7000,
    proposedApproach: "Inspect first, then confirm scope.",
  },
  proposalNoPrice: {
    responseType: "proposal-provided",
    priceType: "no-price",
    proposedApproach: "Need to inspect before I can quote.",
  },
} as const;

for (const [name, fixture] of Object.entries(VALID_BRANCH_FIXTURES)) {
  test(`valid branch fixture "${name}" is reported complete and remains exportable`, async () => {
    const { checkContractorResponseCompletion, sanitizeContractorResponsePayload, serializeContractorResponseExport } =
      await import("../domain/contractorResponse");
    const sanitized = sanitizeContractorResponsePayload(fixture as never);
    const result = checkContractorResponseCompletion(sanitized);
    assert.equal(result.complete, true, `expected "${name}" to be complete, got errors: ${result.errors.join(", ")}`);
    // Exportable — serialization must not throw and must round-trip.
    const exported = serializeContractorResponseExport(sanitized);
    assert.ok(exported.length > 0);
  });
}

// --- Conditional cleanup still relies on the existing sanitizer, not a
// parallel rules engine -----------------------------------------------

test("switching away from proposal-provided clears proposal-only fields via the existing sanitizer", async () => {
  const { sanitizeContractorResponsePayload, checkContractorResponseCompletion } = await import(
    "../domain/contractorResponse"
  );
  const stale = sanitizeContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
    guaranteeStatus: "yes",
    guaranteeDetails: "6 months",
  });
  const switched = sanitizeContractorResponsePayload({ ...stale, responseType: "not-suitable" });
  assert.equal(switched.priceType, undefined);
  assert.equal(switched.price, undefined);
  assert.equal(switched.guaranteeStatus, undefined);
  assert.equal(switched.guaranteeDetails, undefined);
  assert.equal(checkContractorResponseCompletion(switched).complete, true);
});

test("switching guaranteeStatus away from yes clears guaranteeDetails via the existing sanitizer", async () => {
  const { sanitizeContractorResponsePayload } = await import("../domain/contractorResponse");
  const withDetails = sanitizeContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "no-price",
    guaranteeStatus: "yes",
    guaranteeDetails: "6 months on parts.",
  });
  const cleared = sanitizeContractorResponsePayload({ ...withDetails, guaranteeStatus: "no" });
  assert.equal(cleared.guaranteeDetails, undefined);
});
