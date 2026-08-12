import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

// classifyIssueReport is no longer called by the HK public intake flow
// (category-first, not free-text-first — see components/LandlordApp.tsx),
// but remains exported/valid for MockIssueClassificationService's Gate B
// mock surface, so it must still return current, valid category ids.
test("classifyIssueReport is not called by the HK intake flow but still returns valid category ids", async () => {
  assert.equal(
    classifyIssueReport("Tenant reports a leaking tap in the kitchen").primaryCategory,
    "plumbing",
  );
  assert.equal(
    classifyIssueReport("Ceiling stained after heavy rain").primaryCategory,
    "leak",
  );
  assert.equal(
    classifyIssueReport("A socket in the lounge sparked").primaryCategory,
    "electrical",
  );
  assert.equal(
    classifyIssueReport("Something is generally not right").primaryCategory,
    "other",
  );
  const landlordSource = await readFile(
    new URL("../components/LandlordApp.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(landlordSource, /classifyIssueReport/);
});

test("classifyIssueReport and the mock classification service agree", async () => {
  const report = "Tenant says the boiler has stopped producing hot water.";
  const direct = classifyIssueReport(report);
  const viaMock = await mockServices.classification.classify(report);
  assert.deepEqual(direct, viaMock);
});

test("buildRepairBrief is grounded in the draft and never invents diagnosis or price", () => {
  const draft: RepairIntakeDraft = {
    id: "draft-plumbing",
    category: "plumbing",
    originalReport: "STAGING TEST — dripping bathroom tap, slow drip, not urgent.",
    extractedSymptoms: ["water present"],
    responses: {
      safety: "none",
      duration: "week",
      availability: "Weekday evenings after 7pm",
    },
    safetyAcknowledgements: [],
    status: "draft",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };

  const brief = buildRepairBrief(draft);

  assert.equal(brief.originalReport, draft.originalReport);
  assert.ok(brief.reportedFacts.includes(draft.originalReport));
  assert.equal(brief.urgency, "routine");
  assert.equal(brief.accessOverview, "Weekday evenings after 7pm");
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

// Regression coverage for a CRITICAL defect: a standard-category (non
// other/unsure) journey with every question answered used to produce
// reportedFacts: [] in the generated brief, because reportedFacts is only
// ever built from originalReport/extractedSymptoms — both empty for the
// HK flow's category-first standard categories, which have no free-text
// "story" step. The real answers live in affected/branchFirst/Second/Third
// plus the shared timeline questions, so buildRepairBrief must surface them
// via observedFacts instead. Uses a real "leak" draft with every branch and
// timeline field answered — not a legacy other/unsure-style fixture with
// originalReport populated, which would not exercise the bug at all.
test("buildRepairBrief retains every observation from a fully answered standard-category draft", () => {
  const draft: RepairIntakeDraft = {
    id: "draft-leak-full",
    category: "leak",
    originalReport: "",
    extractedSymptoms: [],
    responses: {
      affected: "ceiling",
      branchFirst: "rain",
      branchSecond: "mark",
      branchThird: "large",
      duration: "week",
      frequency: "occasional",
      worsening: "yes",
      safety: "none",
      prior: "quote",
      priorDetail: "A contractor quoted $2,000 last month but we did not proceed.",
      management: "yes",
      sharedArea: "unsure",
      district: "eastern",
      building: "Kornhill",
      floor: "12",
      unit: "A",
      accessBy: "owner",
      availability: "Weekday evenings after 7pm",
      relationship: "owner-occupier",
      hasEvidence: "yes",
      evidenceKind: "photo",
    },
    safetyAcknowledgements: [],
    status: "draft",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };

  const brief = buildRepairBrief(draft);

  // The bug: this used to be [] despite every question being answered.
  assert.equal(brief.reportedFacts.length, 0);
  assert.ok(brief.observedFacts, "observedFacts must be populated for a standard category");
  assert.deepEqual(brief.observedFacts, {
    affected: "ceiling",
    branchFirst: "rain",
    branchSecond: "mark",
    branchThird: "large",
    duration: "week",
    frequency: "occasional",
    worsening: "yes",
  });
  assert.deepEqual(brief.priorAction, {
    status: "quote",
    detail: "A contractor quoted $2,000 last month but we did not proceed.",
  });
  assert.deepEqual(brief.buildingContext, { managementContacted: "yes", sharedAreaInvolved: "unsure" });
  assert.equal(brief.propertyDetails?.district, "eastern");
  assert.equal(brief.propertyDetails?.building, "Kornhill");
  assert.equal(brief.hasEvidence, "yes");
  assert.equal(brief.evidenceKind, "photo");
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
  // The raw correction text lives in landlordCorrections, not baked into
  // reportedFacts with a hardcoded English prefix — see domain/brief.ts's
  // summariseObservedFacts, which applies a localised label at render time.
  assert.match(result.brief.landlordCorrections?.at(-1) ?? "", /front bedroom/);
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
