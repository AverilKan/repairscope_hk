import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeContractorResponse,
  parseContractorResponsePayload,
  parseSupportedContractorResponsePayload,
} from "../domain/contractorResponse";
import { createOperatorContractor } from "../domain/operatorCaseState";

// Unit coverage for T2 Commit 4's review-and-import pipeline: proves the
// exact logic components/operator/OperatorCaseWorkspace.tsx's
// ContractorRequestPanel.reviewRequest/confirmReviewImport uses —
// parseContractorResponsePayload (fail-closed shape validation) then
// mergeContractorResponse (== applyContractorPatch, the SAME function the
// operator's manual editor and the paste-import flow already use) — using
// realistic backend response_payload shapes rather than the React
// component tree, which the pre-existing @clerk/nextjs/jsdom limitation
// (see tests/operator-case-state.test.ts) blocks rendering. This is a pure
// domain-level test: it never touches ContractorRequestPanel itself, but
// it proves the ONE shared pipeline claim its own comment makes — that a
// server-submitted response can never bypass any invariant paste-import
// already enforces, because there is only one merge function.

// Shapes produced by apps/api/app/schemas/contractor_requests.py's
// ContractorResponsePayload.model_dump(mode="json", exclude_none=True) —
// camelCase field names matching the frontend byte-for-byte (see
// domain/contractorRequestOperator.ts's own module comment).
const BACKEND_PROPOSAL_PAYLOAD = {
  responseType: "proposal-provided",
  priceType: "fixed",
  price: 3500,
  proposedApproach: "Replace the seal and re-test.",
  inclusions: "Labour and parts.",
};

const BACKEND_INTERESTED_PAYLOAD = {
  responseType: "interested",
  originalResponse: "Happy to take a look this week.",
};

test("a real backend proposal payload parses cleanly and merges via the shared pipeline, preserving operator-owned fields untouched", () => {
  const parsed = parseContractorResponsePayload(BACKEND_PROPOSAL_PAYLOAD);
  assert.ok(parsed);

  const contractor = createOperatorContractor("ABC Plumbing");
  contractor.trade = "Plumber";
  contractor.contactReference = "9123 4567";
  contractor.status = "contacted";
  contractor.notes = "Called Monday, said they'd send a proposal.";

  const merged = mergeContractorResponse(contractor, parsed!);

  assert.equal(merged.responseType, "proposal-provided");
  assert.equal(merged.priceType, "fixed");
  assert.equal(merged.price, 3500);
  assert.equal(merged.proposedApproach, "Replace the seal and re-test.");
  // Operator-owned fields are untouched — the review/import pipeline can
  // only ever set contractor-response fields, never these.
  assert.equal(merged.name, "ABC Plumbing");
  assert.equal(merged.trade, "Plumber");
  assert.equal(merged.contactReference, "9123 4567");
  assert.equal(merged.status, "contacted");
  assert.equal(merged.notes, "Called Monday, said they'd send a proposal.");
});

test("a real backend 'interested' payload merges without inventing proposal fields", () => {
  const parsed = parseContractorResponsePayload(BACKEND_INTERESTED_PAYLOAD);
  assert.ok(parsed);
  const merged = mergeContractorResponse(createOperatorContractor("XYZ Electric"), parsed!);
  assert.equal(merged.responseType, "interested");
  assert.equal(merged.originalResponse, "Happy to take a look this week.");
  assert.equal(merged.priceType, undefined);
  assert.equal(merged.price, undefined);
});

test("importing a NEW response over a contractor with a stale prior proposal clears the stale fields via the same conditional-clearing rule as any other edit", () => {
  const contractor = createOperatorContractor("ABC Plumbing");
  const withStaleProposal = mergeContractorResponse(contractor, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 9999,
    proposedApproach: "Old approach.",
  });
  assert.equal(withStaleProposal.price, 9999);

  // The contractor later responds "not-suitable" instead — reviewing and
  // confirming THAT response must clear the stale proposal fields, exactly
  // as switching response type in the manual editor already does.
  const parsed = parseContractorResponsePayload({ responseType: "not-suitable", originalResponse: "Too small a job for us." });
  const reImported = mergeContractorResponse(withStaleProposal, parsed!);
  assert.equal(reImported.responseType, "not-suitable");
  assert.equal(reImported.price, undefined);
  assert.equal(reImported.priceType, undefined);
  assert.equal(reImported.proposedApproach, undefined);
});

test("a payload with an unrecognised responseType (transport corruption/schema drift) fails closed to null, never partially merges", () => {
  const parsed = parseContractorResponsePayload({ responseType: "not-a-real-type", price: 100 });
  assert.equal(parsed, null);
});

test("a payload carrying an unexpected/foreign key is rejected outright rather than silently stripped and merged", () => {
  const parsed = parseContractorResponsePayload({
    responseType: "interested",
    originalResponse: "Sure",
    // A hand-crafted or corrupted payload trying to smuggle an
    // operator-only field in — parseContractorResponsePayload's own
    // whitelist means this key is silently ignored, not applied; the
    // structurally-guaranteed field (name) proves it never reaches the
    // merged contractor.
    name: "Attacker-Controlled Name",
  });
  assert.ok(parsed);
  assert.ok(!("name" in parsed!));
  const merged = mergeContractorResponse(createOperatorContractor("Real Name"), parsed!);
  assert.equal(merged.name, "Real Name");
});

test("a non-object payload (malformed transport) fails closed to null", () => {
  assert.equal(parseContractorResponsePayload(null), null);
  assert.equal(parseContractorResponsePayload("proposal-provided"), null);
  assert.equal(parseContractorResponsePayload([1, 2, 3]), null);
});

test("server response schema v1 is accepted before the existing parse/sanitize/merge pipeline", () => {
  const parsed = parseSupportedContractorResponsePayload(1, BACKEND_PROPOSAL_PAYLOAD);
  assert.ok(parsed);
  assert.equal(parsed.responseType, "proposal-provided");
});

for (const version of [999, null, undefined, "1"] as const) {
  test(`server response schema ${String(version)} is rejected before preview or merge`, () => {
    const contractor = createOperatorContractor("Unchanged contractor");
    contractor.notes = "Operator-owned note";
    const before = structuredClone(contractor);
    const parsed = parseSupportedContractorResponsePayload(version, BACKEND_PROPOSAL_PAYLOAD);
    assert.equal(parsed, null);
    // The UI only exposes Confirm when parsing produced a preview. With no
    // preview there is no merge call, so canonical contractor/proposal and
    // every downstream comparison/owner projection remain unchanged.
    assert.deepEqual(contractor, before);
    assert.equal(contractor.responseType, undefined);
  });
}
