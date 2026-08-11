import assert from "node:assert/strict";
import test from "node:test";
import { classifyIssueReport } from "../domain/classification";
import { applyBriefCorrection, buildRepairBrief } from "../domain/brief";
import { ceilingBrief } from "../data/fixtures";
import {
  questionnaireByCategory,
  questionnaireVersionLabel,
} from "../data/questionnaires";
import { mockServices } from "../services/mock";
import { createMockRepairScopeServices } from "../services/index";
import { createApiRepairScopeServices, ApiCapabilityUnavailableError } from "../services/api";
import type { RepairIntakeDraft } from "../domain/types";

// Root cause of the hosted-launch blocker this file guards against: the
// public intake's entry point (StartAndClassify) and brief step
// (GeneratedBriefReview) used to call repairScopeServices.classification
// and repairScopeServices.contractorBriefs — both deliberately unavailable
// in API mode (services/api.ts). classifyIssueReport/buildRepairBrief are
// the pure, deterministic replacements the launch flow now calls directly,
// with no service/network dependency in either mock or API mode. See
// docs/PUBLIC_INGESTION_LAUNCH.md.

test("classifyIssueReport never depends on a backend service and covers every launch category", () => {
  assert.equal(
    classifyIssueReport("Tenant reports a leaking tap in the kitchen").primaryCategory,
    "plumbing-leak",
  );
  // Note: "leak|pipe|tap|toilet|water" is checked before "boiler|heating|hot
  // water", so a report mentioning both matches the water branch first —
  // that ordering is existing, unchanged behaviour (see domain/classification.ts).
  assert.equal(
    classifyIssueReport("Boiler has stopped working, no heating").primaryCategory,
    "boiler-heating",
  );
  assert.equal(
    classifyIssueReport("A socket in the lounge sparked").primaryCategory,
    "electrical",
  );
  assert.equal(
    classifyIssueReport("Ceiling stained after heavy rain").primaryCategory,
    "roofing",
  );
  // No recognisable keyword still returns a usable category rather than
  // throwing or rejecting the report — the launch never turns any issue
  // away (docs/PUBLIC_INGESTION_LAUNCH.md's "Product decision").
  assert.equal(
    classifyIssueReport("Something is generally not right").primaryCategory,
    "general-maintenance",
  );
});

test("classifyIssueReport and the mock classification service agree", async () => {
  const report = "Tenant says the boiler has stopped producing hot water.";
  const direct = classifyIssueReport(report);
  const viaMock = await mockServices.classification.classify(report);
  assert.deepEqual(direct, viaMock);
});

test("buildRepairBrief is grounded in the draft and never invents diagnosis or price", () => {
  const draft: RepairIntakeDraft = {
    id: "draft-plumbing-leak",
    category: "plumbing-leak",
    originalReport: "STAGING TEST — dripping bathroom tap, slow drip, not urgent.",
    extractedSymptoms: ["water present"],
    responses: {
      urgency: "routine",
      occupancy: "tenant_occupied",
      access: "I will arrange access",
    },
    safetyAcknowledgements: [],
    status: "draft",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };

  const brief = buildRepairBrief(draft);

  assert.equal(brief.originalReport, draft.originalReport);
  assert.ok(brief.reportedFacts.includes(draft.originalReport));
  assert.equal(brief.urgency, "routine");
  assert.equal(brief.occupancy, "tenant_occupied");
  assert.equal(brief.accessOverview, "I will arrange access");
  assert.equal(brief.confirmedUnknowns.length > 0, true);

  const serialised = JSON.stringify(brief).toLowerCase();
  // Grounded-only guardrail: nothing in the deterministic output should
  // read as RepairScope itself fabricating a price or a contractor
  // choice. (contractorRequests legitimately *asks* the contractor to
  // state their own diagnosis — that's requesting information, not
  // RepairScope inventing one, so "diagnos" is not in this list.)
  for (const forbidden of ["£", "quote of", "guaranteed", "we recommend"]) {
    assert.equal(
      serialised.includes(forbidden),
      false,
      `buildRepairBrief output unexpectedly contains "${forbidden}"`,
    );
  }
});

test("buildRepairBrief and the mock contractorBriefs.generate agree", async () => {
  const draft: RepairIntakeDraft = {
    id: "draft-electrical",
    category: "electrical",
    originalReport: "STAGING TEST — a socket stopped working.",
    extractedSymptoms: [],
    responses: { urgency: "soon" as never },
    safetyAcknowledgements: [],
    status: "draft",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
  const direct = buildRepairBrief(draft);
  const viaMock = await createMockRepairScopeServices().contractorBriefs.generate(draft);
  assert.deepEqual(direct, viaMock);
});

test("classification and contractorBriefs.generate remain deliberately unavailable in the real API adapter", () => {
  const api = createApiRepairScopeServices({ baseUrl: "http://localhost:8000" });
  assert.throws(
    () => api.classification.classify("any report"),
    ApiCapabilityUnavailableError,
  );
  assert.throws(
    () => api.contractorBriefs.generate({} as RepairIntakeDraft),
    ApiCapabilityUnavailableError,
  );
  // getForRepair (used only by the unrelated existing-repair review route,
  // not the public launch path) stays unavailable too — this fix
  // deliberately does not expand contractorBriefs' API-mode surface.
  assert.throws(
    () => api.contractorBriefs.getForRepair("any-id"),
    ApiCapabilityUnavailableError,
  );
  // applyCorrection stays unavailable too — the fix for HK-A0 item B is
  // that the public launch flow (LandlordApp's BriefReview) no longer
  // calls this service method at all, not that this stub becomes callable.
  assert.throws(
    () => api.contractorBriefs.applyCorrection(ceilingBrief, "any correction"),
    ApiCapabilityUnavailableError,
  );
});

// Regression coverage for a defect where the "Check the facts" correction
// form called repairScopeServices.contractorBriefs.applyCorrection, which
// throws ApiCapabilityUnavailableError in real-API mode — silently breaking
// brief correction on the hosted launch (HK-A0 item B).

test("applyBriefCorrection never depends on a backend service and is what the public launch flow calls directly", () => {
  const result = applyBriefCorrection(
    ceilingBrief,
    "The staining is in the front bedroom, not the back bedroom.",
  );
  assert.equal(result.brief.version, ceilingBrief.version + 1);
  assert.match(result.brief.reportedFacts.at(-1) ?? "", /front bedroom/);
  // Correcting a brief must not silently fail and must not invent a new
  // diagnosis or price — only the factual correction is appended.
  assert.equal(result.brief.originalReport, ceilingBrief.originalReport);
});

test("applyBriefCorrection and the mock contractorBriefs.applyCorrection agree", async () => {
  const direct = applyBriefCorrection(ceilingBrief, "Front bedroom, not back.");
  const viaMock = await mockServices.contractorBrief.applyCorrection(
    ceilingBrief,
    "Front bedroom, not back.",
  );
  assert.deepEqual(direct, viaMock);
});

test("applyBriefCorrection rejects a blank correction and cannot silently succeed", () => {
  assert.throws(() => applyBriefCorrection(ceilingBrief, "   "));
});

// Regression coverage for a defect where every RepairSubmission persisted a
// hardcoded questionnaire_version of "v1" while the actual questionnaire
// schemas were already at structural version 4 — the persisted value never
// reflected the schema that produced the answers (HK-A0 item C).

test("questionnaireVersionLabel is derived from the real schema version, not a separately hand-maintained constant", () => {
  for (const category of Object.keys(questionnaireByCategory) as Array<
    keyof typeof questionnaireByCategory
  >) {
    const schema = questionnaireByCategory[category];
    assert.equal(
      questionnaireVersionLabel(category),
      `v${schema.version}`,
      `questionnaireVersionLabel(${category}) must match the schema's own version`,
    );
  }
});
