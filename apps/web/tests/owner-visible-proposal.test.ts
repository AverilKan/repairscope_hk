import assert from "node:assert/strict";
import test from "node:test";

// Unit coverage for the owner-visible proposal boundary (RepairScope HK —
// "frontend structure" phase, Commit C). See domain/contractorResponse.ts's
// OwnerVisibleProposal — a Pick<> over OperatorContractor that structurally
// excludes operator-only fields (contactReference/status/notes), the same
// pattern already proven for ContractorResponsePayload.

test("toOwnerVisibleProposal excludes contactReference, status and notes even when the source contractor has them set", async () => {
  const { toOwnerVisibleProposal } = await import("../domain/contractorResponse");
  const { createOperatorContractor, applyContractorPatch } = await import("../domain/operatorCaseState");

  let contractor = createOperatorContractor("Fortune Plumbing Co.");
  contractor.trade = "Plumber";
  contractor.contactReference = "WhatsApp 9123 4567";
  contractor.status = "contacted";
  contractor.notes = "Owner mentioned they're anxious about cost.";
  contractor = applyContractorPatch(contractor, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
    proposedApproach: "Replace the connector.",
  });

  const visible = toOwnerVisibleProposal(contractor);
  assert.deepEqual(
    Object.keys(visible).sort(),
    [
      "earliestStart",
      "exclusions",
      "expectedDuration",
      "guaranteeDetails",
      "guaranteeStatus",
      "id",
      "inclusions",
      "name",
      "originalResponse",
      "price",
      "priceChangeFactors",
      "priceMax",
      "priceMin",
      "priceType",
      "proposedApproach",
      "responseType",
      "trade",
    ].sort(),
  );
  assert.equal((visible as unknown as Record<string, unknown>).contactReference, undefined);
  assert.equal((visible as unknown as Record<string, unknown>).status, undefined);
  assert.equal((visible as unknown as Record<string, unknown>).notes, undefined);

  const serialized = JSON.stringify(visible);
  assert.ok(!serialized.includes("WhatsApp 9123 4567"));
  assert.ok(!serialized.includes("anxious about cost"));
  assert.ok(!serialized.includes("contacted"));

  assert.equal(visible.name, "Fortune Plumbing Co.");
  assert.equal(visible.price, 5000);
  assert.equal(visible.proposedApproach, "Replace the connector.");
});
