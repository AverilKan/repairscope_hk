import assert from "node:assert/strict";
import test from "node:test";

// Unit coverage for the canonical contractor-response boundary (see
// RepairScope HK — frontend structure phase, Commit A). This is the
// single input/output boundary a future contractor-facing form and the
// operator's manual import both go through — see domain/contractorResponse.ts's
// own module comment for why the design guarantees operator-only fields
// (id/name/trade/contactReference/status/notes) can never be overwritten.

test("ContractorResponsePayload structurally excludes operator-only fields — mergeContractorResponse cannot touch them even if a caller tries", async () => {
  const { mergeContractorResponse } = await import("../domain/contractorResponse");
  const { createOperatorContractor } = await import("../domain/operatorCaseState");
  const contractor = createOperatorContractor("Fortune Plumbing Co.");
  contractor.trade = "Plumber";
  contractor.contactReference = "WhatsApp 9123 4567";
  contractor.status = "contacted";
  contractor.notes = "Called twice, very responsive.";

  const merged = mergeContractorResponse(contractor, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
    proposedApproach: "Replace the connector now.",
  });

  assert.equal(merged.id, contractor.id);
  assert.equal(merged.name, "Fortune Plumbing Co.");
  assert.equal(merged.trade, "Plumber");
  assert.equal(merged.contactReference, "WhatsApp 9123 4567");
  assert.equal(merged.status, "contacted");
  assert.equal(merged.notes, "Called twice, very responsive.");
  assert.equal(merged.responseType, "proposal-provided");
  assert.equal(merged.price, 5000);
  assert.equal(merged.proposedApproach, "Replace the connector now.");
});

test("mergeContractorResponse applies the same price/range invariants as the operator's own editor (delegates to applyContractorPatch, not a second implementation)", async () => {
  const { mergeContractorResponse } = await import("../domain/contractorResponse");
  const { createOperatorContractor } = await import("../domain/operatorCaseState");
  const contractor = createOperatorContractor("Contractor A");

  const merged = mergeContractorResponse(contractor, {
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 10000,
    priceMax: 5000, // inverted
  });
  assert.equal(merged.priceMin, undefined);
  assert.equal(merged.priceMax, undefined);
});

test("parseContractorResponsePayload whitelists known response fields and silently drops anything else, including operator-only keys smuggled at runtime", async () => {
  const { parseContractorResponsePayload } = await import("../domain/contractorResponse");
  const parsed = parseContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 4200,
    proposedApproach: "Replace the trap.",
    // Attempted operator-only fields — must never survive parsing.
    id: "contractor-evil",
    name: "Injected Name",
    trade: "Injected Trade",
    contactReference: "Injected Contact",
    status: "contacted",
    notes: "Injected notes",
    // Unknown junk key.
    somethingElse: "ignored",
  });
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed!).sort(), ["price", "priceType", "proposedApproach", "responseType"].sort());
  assert.equal(parsed!.responseType, "proposal-provided");
  assert.equal(parsed!.price, 4200);
  assert.equal((parsed as unknown as Record<string, unknown>).id, undefined);
  assert.equal((parsed as unknown as Record<string, unknown>).name, undefined);
  assert.equal((parsed as unknown as Record<string, unknown>).status, undefined);
});

test("parseContractorResponsePayload rejects a payload with an invalid field type or value", async () => {
  const { parseContractorResponsePayload } = await import("../domain/contractorResponse");
  assert.equal(parseContractorResponsePayload({ responseType: "not-a-real-type" }), null);
  assert.equal(parseContractorResponsePayload({ price: "not-a-number" }), null);
  assert.equal(parseContractorResponsePayload("just a string"), null);
  assert.equal(parseContractorResponsePayload(null), null);
  assert.equal(parseContractorResponsePayload([1, 2, 3]), null);
});

test("export/import round trip: a serialized export parses back to the exact same response payload", async () => {
  const { serializeContractorResponseExport, parseContractorResponseExport } = await import(
    "../domain/contractorResponse"
  );
  const payload = {
    responseType: "proposal-provided" as const,
    priceType: "estimate" as const,
    price: 1800,
    proposedApproach: "Inspect valve first.",
    exclusions: "Materials.",
    earliestStart: "Tomorrow afternoon",
  };
  const serialized = serializeContractorResponseExport(payload);
  const result = parseContractorResponseExport(serialized);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.payload, payload);
  }
});

test("export envelope never carries operator notes, contractor status, or any case-identifying data — only the response payload", async () => {
  const { serializeContractorResponseExport } = await import("../domain/contractorResponse");
  const serialized = serializeContractorResponseExport({
    responseType: "interested",
    originalResponse: "Sounds doable, can start soon.",
  });
  const parsed = JSON.parse(serialized);
  assert.deepEqual(Object.keys(parsed).sort(), ["response", "schema", "version"]);
  assert.deepEqual(Object.keys(parsed.response).sort(), ["originalResponse", "responseType"]);
});

test("parseContractorResponseExport rejects malformed JSON, wrong schema, wrong version, and invalid response data", async () => {
  const { parseContractorResponseExport } = await import("../domain/contractorResponse");

  const malformedJson = parseContractorResponseExport("{not valid json");
  assert.equal(malformedJson.ok, false);

  const wrongSchema = parseContractorResponseExport(
    JSON.stringify({ schema: "something-else", version: 1, response: {} }),
  );
  assert.equal(wrongSchema.ok, false);

  const wrongVersion = parseContractorResponseExport(
    JSON.stringify({ schema: "repairscope.contractor-response-export", version: 99, response: {} }),
  );
  assert.equal(wrongVersion.ok, false);

  const invalidResponse = parseContractorResponseExport(
    JSON.stringify({
      schema: "repairscope.contractor-response-export",
      version: 1,
      response: { responseType: "not-a-real-type" },
    }),
  );
  assert.equal(invalidResponse.ok, false);

  const notAnObject = parseContractorResponseExport(JSON.stringify(["array", "not", "object"]));
  assert.equal(notAnObject.ok, false);
});

test("a full contractor response (every field) survives export/import and merges cleanly into a fresh operator contractor", async () => {
  const { serializeContractorResponseExport, parseContractorResponseExport, mergeContractorResponse } = await import(
    "../domain/contractorResponse"
  );
  const { createOperatorContractor } = await import("../domain/operatorCaseState");

  const payload = {
    responseType: "proposal-provided" as const,
    originalResponse: "Can start Thursday, HK$5000 fixed.",
    priceType: "fixed" as const,
    price: 5000,
    proposedApproach: "Replace the connector.",
    inclusions: "Labour and part.",
    exclusions: "Making good.",
    priceChangeFactors: "Hidden damage behind the wall.",
    expectedDuration: "2 hours",
    earliestStart: "Thursday",
    guaranteeStatus: "yes" as const,
    guaranteeDetails: "6 months on parts.",
  };
  const exported = serializeContractorResponseExport(payload);
  const result = parseContractorResponseExport(exported);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const contractor = createOperatorContractor("Fortune Plumbing Co.");
  const merged = mergeContractorResponse(contractor, result.payload);
  assert.equal(merged.name, "Fortune Plumbing Co.");
  assert.equal(merged.price, 5000);
  assert.equal(merged.earliestStart, "Thursday");
  assert.equal(merged.guaranteeDetails, "6 months on parts.");
});
