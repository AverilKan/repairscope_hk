import assert from "node:assert/strict";
import test from "node:test";

// Unit coverage for the Stage-1 contractor sourcing brief boundary — see
// domain/stage1ContractorBrief.ts's module comment. Real owner submissions
// currently begin with consent_to_share_with_contractors = false; these
// tests prove directly (by scanning the actual serialized output, not just
// by inspecting the type) that no arbitrary owner-authored free text —
// wherever it might be embedded — can reach a Stage-1 brief, and that
// every field present is either a controlled label or omitted.

const ALLOWED_STAGE1_KEYS = ["category", "district", "evidenceKind", "hasEvidence", "observedProblem", "priorAction"];

test("Stage1ContractorBrief contains only the allowed fields, resolved to human labels, never raw codes", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      generatedBrief: {
        category: "leak",
        observedFacts: { affected: "ceiling", branchFirst: "rain", branchSecond: "mark", duration: "today", worsening: "yes" },
        priorAction: { status: "attempted" },
        hasEvidence: "yes",
        evidenceKind: "repair-media",
        propertyDetails: { district: "wan-chai" },
      },
    },
    "en",
  );
  assert.deepEqual(Object.keys(brief).sort(), ALLOWED_STAGE1_KEYS.sort());
  // Human labels, not raw internal codes.
  assert.equal(brief.category, "Water seepage / leakage");
  assert.equal(brief.district, "Wan Chai");
  assert.equal(brief.hasEvidence, "Yes, I can provide this later");
  assert.equal(brief.evidenceKind, "Repair photo / video");
  assert.ok(brief.observedProblem.some((row) => row.includes("Ceiling")));
  assert.ok(brief.observedProblem.some((row) => row.includes("During / after rain")));
  assert.ok(brief.observedProblem.some((row) => row.includes("Water mark")));
  // None of the underlying raw codes ("leak", "wan-chai", "ceiling",
  // "rain", "mark", "yes", "repair-media") leak through as bare tokens —
  // every value above is resolved to its option label instead.
  const serialized = JSON.stringify(brief);
  assert.ok(!serialized.includes('"leak"'));
  assert.ok(!serialized.includes('"wan-chai"'));
});

// Adversarial: place a unique secret marker into EVERY plausible free-text
// source that could conceivably flow into a Stage-1 brief, then assert
// none of them appear ANYWHERE in the serialized output — a whole-object
// content scan, not just a check that particular top-level fields are
// absent.
test("Stage1ContractorBrief leaks no owner-authored free text from any source, adversarially checked", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");

  const MARKERS = {
    ownerName: "SECRET-OWNER-NAME-7f3a",
    ownerEmail: "secret-owner-9c1e@example.com",
    ownerPhone: "SECRET-PHONE-91234567",
    propertyAddress: "SECRET-ADDRESS-Sunshine-Tower",
    building: "SECRET-BUILDING-4b2d",
    block: "SECRET-BLOCK-A1",
    floor: "SECRET-FLOOR-12",
    unit: "SECRET-UNIT-B",
    accessIdentity: "SECRET-ACCESS-CONTACT-Mrs-Chan",
    accessPhone: "SECRET-ACCESS-PHONE-98765432",
    symptomOther: "SECRET-SYMPTOM-OTHER-detail-e91c",
    additionalContext: "SECRET-ADDITIONAL-CONTEXT-a02f",
    corrections: "SECRET-CORRECTION-TEXT-c551",
    priorActionDetail: "SECRET-PRIOR-DETAIL-call-Mrs-Chan-91234567",
    reportedFacts: "SECRET-REPORTED-FACTS-free-text-d883",
    generatedBriefFreeText: "SECRET-GENERATED-BRIEF-SUMMARY-99aa",
    operatorNotes: "SECRET-OPERATOR-NOTES-internal-b77e",
  };

  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      generatedBrief: {
        category: "leak",
        observedFacts: {
          affected: "ceiling",
          branchFirst: "rain",
          branchSecond: ["mark", "other"],
          duration: "today",
          worsening: "yes",
          symptomOther: MARKERS.symptomOther,
        },
        reportedFacts: [MARKERS.reportedFacts],
        landlordCorrections: [MARKERS.corrections],
        priorAction: { status: "attempted", detail: MARKERS.priorActionDetail },
        hasEvidence: "yes",
        evidenceKind: "repair-media",
        propertyDetails: {
          district: "wan-chai",
          building: MARKERS.building,
          block: MARKERS.block,
          floor: MARKERS.floor,
          unit: MARKERS.unit,
          accessBy: MARKERS.accessIdentity,
        },
        relationship: "owner-occupier",
        additionalContext: MARKERS.additionalContext,
        originalReport: MARKERS.generatedBriefFreeText,
        landlordName: MARKERS.ownerName,
        landlordEmail: MARKERS.ownerEmail,
        landlordPhone: MARKERS.ownerPhone,
        propertyAddress: MARKERS.propertyAddress,
        accessNotes: MARKERS.accessPhone,
        internalReviewNotes: MARKERS.operatorNotes,
      },
      // A caller accidentally passing top-level sensitive fields too —
      // buildStage1ContractorBrief only ever destructures
      // issueCategory/generatedBrief from its input.
      landlordName: MARKERS.ownerName,
      landlordEmail: MARKERS.ownerEmail,
      landlordPhone: MARKERS.ownerPhone,
      propertyAddress: MARKERS.propertyAddress,
      accessContact: MARKERS.accessIdentity,
      accessPhone: MARKERS.accessPhone,
      operatorNotes: MARKERS.operatorNotes,
    } as never,
    "en",
  );

  const serialized = JSON.stringify(brief);
  for (const [source, marker] of Object.entries(MARKERS)) {
    assert.ok(!serialized.includes(marker), `Stage1ContractorBrief leaked "${source}" free text: "${marker}"`);
  }

  // Positive checks: safe controlled facts still come through.
  assert.equal(brief.category, "Water seepage / leakage");
  assert.equal(brief.district, "Wan Chai");
  assert.ok(brief.observedProblem.some((row) => row.includes("Ceiling")));
  assert.ok(brief.observedProblem.some((row) => row.includes("Water mark")));
  // A neutral, content-free flag for the "Other" symptom — never the text.
  assert.ok(brief.observedProblem.some((row) => row.toLowerCase().includes("other issue also reported")));
  assert.equal(brief.priorAction, "Previous action: Repair already attempted");

  // Only the allowed keys exist at all — no building/block/floor/unit/
  // access/notes/reportedFacts/corrections field on the type.
  assert.deepEqual(Object.keys(brief).sort(), ALLOWED_STAGE1_KEYS.sort());
});

test("Stage1ContractorBrief handles a missing/malformed generatedBrief safely — no crash, no leaked fields", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief({ issueCategory: "electrical", generatedBrief: "not an object" }, "en");
  assert.equal(brief.category, "Electrical / power problem");
  assert.deepEqual(brief.observedProblem, []);
  assert.equal(brief.district, undefined);
  assert.equal(brief.priorAction, undefined);
});

test("Stage1ContractorBrief's observedProblem for an open/other category never includes the owner's free-text description, even though that is the only content that category has", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "other",
      generatedBrief: {
        category: "unsure",
        reportedFacts: ["The kitchen tap is dripping constantly and I think it's the neighbour's fault."],
        observedFacts: { duration: "today" },
      },
    },
    "en",
  );
  assert.ok(!JSON.stringify(brief).includes("kitchen tap"));
  assert.ok(!JSON.stringify(brief).includes("neighbour"));
  // The only safe structured fact available for an open category (its
  // shared timeline) still comes through.
  assert.ok(brief.observedProblem.some((row) => row.includes("Today")));
});

test("Stage1ContractorBrief renders priorAction from the controlled status only, and omits it entirely when absent", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const withPrior = buildStage1ContractorBrief(
    {
      issueCategory: "plumbing",
      generatedBrief: { priorAction: { status: "attempted", detail: "Called a plumber who could not attend — Mrs Chan, 91234567." } },
    },
    "en",
  );
  assert.equal(withPrior.priorAction, "Previous action: Repair already attempted");
  assert.ok(!JSON.stringify(withPrior).includes("91234567"));
  assert.ok(!JSON.stringify(withPrior).includes("Mrs Chan"));

  const withoutPrior = buildStage1ContractorBrief({ issueCategory: "plumbing", generatedBrief: {} }, "en");
  assert.equal(withoutPrior.priorAction, undefined);
});

// Unknown/malformed issueCategory — the backend currently validates
// issue_category as a bounded string, not a strict enum, so this module
// must independently fail closed regardless of that (see module comment).

test("an unknown issueCategory with no observations never emits the raw string, and the builder does not throw", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    { issueCategory: "SECRET_CATEGORY", generatedBrief: { category: "SECRET_CATEGORY" } },
    "en",
  );
  assert.equal(brief.category, "Repair issue");
  assert.deepEqual(brief.observedProblem, []);
  assert.ok(!JSON.stringify(brief).includes("SECRET_CATEGORY"));
});

test("an unknown issueCategory with otherwise-populated observations does not throw, never emits the raw category, and leaks no category-specific observation values", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  assert.doesNotThrow(() => {
    const brief = buildStage1ContractorBrief(
      {
        issueCategory: "SECRET_CATEGORY",
        generatedBrief: {
          category: "SECRET_CATEGORY",
          observedFacts: {
            affected: "ceiling",
            branchFirst: "rain",
            branchSecond: ["mark", "other"],
            duration: "today",
            frequency: "constant",
            worsening: "yes",
            symptomOther: "some other detail",
          },
          priorAction: { status: "attempted" },
          hasEvidence: "yes",
          evidenceKind: "repair-media",
        },
      },
      "en",
    );
    const serialized = JSON.stringify(brief);
    assert.ok(!serialized.includes("SECRET_CATEGORY"));
    // No category-specific observation is resolved for an unrecognised
    // category — buildObservedProblem/resolveAnswerLabel are never called
    // with an unverified category, so these raw field values never leak
    // either.
    assert.deepEqual(brief.observedProblem, []);
    assert.ok(!serialized.includes("ceiling"));
    assert.ok(!serialized.includes("rain"));
    assert.equal(brief.priorAction, undefined);
    assert.equal(brief.hasEvidence, undefined);
    assert.equal(brief.evidenceKind, undefined);
  });
});

test("a privacy marker smuggled into issueCategory itself never appears anywhere in the output", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    { issueCategory: "SECRET_OWNER_EMAIL_jamie@example.com", generatedBrief: {} },
    "en",
  );
  const serialized = JSON.stringify(brief);
  assert.ok(!serialized.includes("SECRET_OWNER_EMAIL_jamie@example.com"));
  assert.ok(!serialized.includes("jamie@example.com"));
  assert.equal(brief.category, "Repair issue");
});

test("exact-unit-like text smuggled into issueCategory never appears anywhere in the output", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief({ issueCategory: "SECRET_UNIT_FLAT_12B", generatedBrief: {} }, "en");
  const serialized = JSON.stringify(brief);
  assert.ok(!serialized.includes("SECRET_UNIT_FLAT_12B"));
  assert.ok(!serialized.includes("FLAT_12B"));
  assert.equal(brief.category, "Repair issue");
});

test("an unknown district id remains fail-closed (omitted, never the raw code) — unaffected by category validation", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    { issueCategory: "leak", generatedBrief: { propertyDetails: { district: "SECRET_DISTRICT_CODE" } } },
    "en",
  );
  assert.equal(brief.district, undefined);
  assert.ok(!JSON.stringify(brief).includes("SECRET_DISTRICT_CODE"));
});

test("unknown duration/frequency/worsening/prior/evidence values resolve to a controlled 'not specified' fallback, never the raw value", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      generatedBrief: {
        category: "leak",
        observedFacts: { duration: "SECRET_BOGUS_DURATION", frequency: "SECRET_BOGUS_FREQUENCY", worsening: "SECRET_BOGUS_WORSENING" },
        priorAction: { status: "SECRET_BOGUS_PRIOR" },
        hasEvidence: "SECRET_BOGUS_EVIDENCE",
        evidenceKind: "SECRET_BOGUS_KIND",
      },
    },
    "en",
  );
  const serialized = JSON.stringify(brief);
  assert.ok(!serialized.includes("SECRET_BOGUS"));
});

test("unknown multi-select branch values are omitted, never emitted raw", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      generatedBrief: {
        category: "leak",
        observedFacts: { branchSecond: ["SECRET_BOGUS_SYMPTOM_A", "SECRET_BOGUS_SYMPTOM_B"] },
      },
    },
    "en",
  );
  const serialized = JSON.stringify(brief);
  assert.ok(!serialized.includes("SECRET_BOGUS_SYMPTOM"));
});

test("Stage1ContractorBrief truthfully communicates enough to decide initial interest: category, district, controlled symptoms, timing/change, previous-action category and evidence availability", async () => {
  const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "electrical",
      generatedBrief: {
        category: "electrical",
        observedFacts: { duration: "today", frequency: "constant", worsening: "yes" },
        priorAction: { status: "inspected" },
        hasEvidence: "yes",
        evidenceKind: "repair-media",
        propertyDetails: { district: "kwun-tong" },
      },
    },
    "en",
  );
  assert.equal(brief.category, "Electrical / power problem");
  assert.equal(brief.district, "Kwun Tong");
  assert.ok(brief.observedProblem.length > 0);
  assert.equal(brief.priorAction, "Previous action: Inspected only");
  assert.equal(brief.hasEvidence, "Yes, I can provide this later");
  assert.equal(brief.evidenceKind, "Repair photo / video");
});
