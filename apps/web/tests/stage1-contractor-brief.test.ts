import assert from "node:assert/strict";
import test from "node:test";

// Unit coverage for the Stage-1 contractor sourcing brief boundary — see
// domain/stage1ContractorBrief.ts's module comment. Real owner submissions
// currently begin with consent_to_share_with_contractors = false; these
// tests prove directly (by scanning the actual serialized output, not just
// by inspecting the type) that sensitive fields cannot reach a Stage-1
// brief, regardless of what a caller passes in.

const SENSITIVE_STRINGS = [
  "Jamie Landlord",
  "jamie@example.com",
  "07700900000",
  "Sunshine Tower",
  "12",
  "Flat B",
  "Ring the doorbell twice",
  "Call security first",
  "5B, phone 91234567",
];

test("Stage1ContractorBrief contains only the allowed fields", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      safetyFlags: ["water_uncontrolled"],
      generatedBrief: {
        category: "leak",
        observedFacts: { affected: "ceiling", duration: "today", worsening: "getting-worse" },
        reportedFacts: [],
        priorAction: { status: "none" },
        hasEvidence: "yes",
        evidenceKind: "photos",
      },
    },
    "en",
  );
  assert.deepEqual(
    Object.keys(brief).sort(),
    ["category", "district", "evidenceKind", "hasEvidence", "observedProblem", "priorAction", "safetyFlags"].sort(),
  );
  assert.equal(brief.category, "leak");
  assert.equal(brief.hasEvidence, "yes");
  assert.equal(brief.evidenceKind, "photos");
  assert.ok(Array.isArray(brief.safetyFlags));
});

test("Stage1ContractorBrief excludes owner name, email, phone, exact address, floor/unit and access-contact identity even when the raw generated brief and detail object carry them", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      safetyFlags: ["water_uncontrolled"],
      generatedBrief: {
        category: "leak",
        observedFacts: { affected: "ceiling", duration: "today" },
        reportedFacts: [],
        // A correction that plausibly contains identifying detail — must
        // never survive into the Stage-1 output (see module comment).
        landlordCorrections: ["Actually it's Flat B, 5B, phone 91234567"],
        propertyDetails: {
          district: "wan-chai",
          building: "Sunshine Tower",
          block: "A",
          floor: "12",
          unit: "B",
          accessBy: "Ring the doorbell twice",
        },
        buildingContext: { managementContacted: "yes", sharedAreaInvolved: "no" },
        relationship: "owner-occupier",
        additionalContext: "Call security first, ask for Mr. Chan.",
      },
      // Simulates a caller accidentally passing the WHOLE detail object —
      // buildStage1ContractorBrief only ever destructures issueCategory/
      // generatedBrief/safetyFlags from its input, so excess properties are
      // never read.
      landlordName: "Jamie Landlord",
      landlordEmail: "jamie@example.com",
      landlordPhone: "07700900000",
      propertyAddress: "Sunshine Tower, 12/B, Wan Chai",
      accessNotes: "Ring the doorbell twice",
      internalReviewNotes: "Owner seems anxious, be gentle.",
    } as never,
    "en",
  );

  const serialized = JSON.stringify(brief);
  for (const forbidden of SENSITIVE_STRINGS) {
    assert.ok(!serialized.includes(forbidden), `Stage1ContractorBrief leaked sensitive text: "${forbidden}"`);
  }
  // District alone (broad area) is allowed and expected.
  assert.equal(brief.district, "wan-chai");
  // But no building/block/floor/unit/access-contact fields exist on the
  // Stage1ContractorBrief type at all — this is enforced structurally by
  // buildStage1ContractorBrief only ever reading `.district` off
  // propertyDetails, never `.building`/`.block`/`.floor`/`.unit`/`.accessBy`.
  assert.deepEqual(
    Object.keys(brief).sort(),
    ["category", "district", "evidenceKind", "hasEvidence", "observedProblem", "priorAction", "safetyFlags"].sort(),
  );
});

test("Stage1ContractorBrief handles a missing/malformed generatedBrief safely — no crash, no leaked fields", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    { issueCategory: "electrical", safetyFlags: [], generatedBrief: "not an object" },
    "en",
  );
  assert.equal(brief.category, "electrical");
  assert.deepEqual(brief.observedProblem, []);
  assert.equal(brief.district, undefined);
});

test("Stage1ContractorBrief's observedProblem includes the owner's free-text description (reportedFacts) for an open/other category — this is the actual content being sourced, not something withheld", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "other",
      safetyFlags: [],
      generatedBrief: {
        category: "unsure",
        reportedFacts: ["The kitchen tap is dripping constantly."],
      },
    },
    "en",
  );
  assert.ok(brief.observedProblem.includes("The kitchen tap is dripping constantly."));
});

test("Stage1ContractorBrief renders priorAction as a combined status+detail string when present, and omits it entirely when absent", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const withPrior = buildStage1ContractorBrief(
    {
      issueCategory: "plumbing",
      safetyFlags: [],
      generatedBrief: { priorAction: { status: "called-a-plumber", detail: "Could not attend in time." } },
    },
    "en",
  );
  assert.equal(withPrior.priorAction, "called-a-plumber — Could not attend in time.");

  const withoutPrior = buildStage1ContractorBrief(
    { issueCategory: "plumbing", safetyFlags: [], generatedBrief: {} },
    "en",
  );
  assert.equal(withoutPrior.priorAction, undefined);
});
