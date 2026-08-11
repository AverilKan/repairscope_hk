import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ceilingBrief,
  demoOpportunity,
} from "../data/fixtures";
import { repairAccessDecision } from "../domain/auth";
import {
  evaluateContractorCapability,
  type PendingClerkUserMock,
  type ValidatedContractorInvitationMock,
  type VerifiedClerkUserMock,
} from "../domain/contractorAuth";
import { mockServices } from "../services/mock";
import {
  questionnaireByCategory,
  questionnaireSchemas,
  sharedTailFieldIds,
} from "../data/questionnaires";
import {
  canContinueQuestionnaireStep,
  correctionMeetsMinimumWords,
  createSingleFlightGate,
  isValidContactName,
  isValidEmailAddress,
  isValidPhoneNumber,
  questionnaireStepUsesAutomaticProgression,
  requiredFieldsMissing,
  safetyAnswersAreUnprefilled,
  validateQuestionnaireSchemas,
} from "../domain/rules";
import { rebuildDraftForCategoryChange } from "../domain/journey";
import {
  calculateContractorQuote,
  contractorMaterialsTotal,
  createSubmittedRepairQuote,
  toggleContractorExclusion,
} from "../domain/contractorQuote";
import {
  createProposalRevisionDraft,
  detectQuoteFieldChanges,
  revisionSummary,
  sectionsForClarificationQuestions,
  validateQuoteRevisionDraft,
} from "../domain/quoteRevision";
import {
  activeRepairQuotes,
  deriveComparisonDifferences,
  formatSubmittedVat,
  latestSubmittedResponse,
  missingQuoteDetails,
  responseComparisonAccessDecision,
  submittedInspection,
  submittedRepairQuote,
  validateSubmittedQuoteSnapshot,
} from "../domain/responseComparison";
import {
  defaultResponseBundle,
  responseFixtureForState,
} from "../data/responseFixtures";
import {
  clarificationIssueKeys,
  clarificationQuestionIsPrivate,
  draftClarificationQuestions,
} from "../domain/landlordClarification";
import {
  contractorProgressionMode,
  contractorQuestionHasProgressed,
  contractorQuestionRequiresConfirmation,
  workItemsConfirmationLabel,
} from "../domain/contractorProgression";
import type {
  ContractorResponseDraft,
  RepairCategoryId,
  RepairIntakeDraft,
  SubmittedRepairQuote,
} from "../domain/types";
import {
  agreedScopePreservesQuoteTotal,
  submittedSelectionTotal,
  type ReviewedExternalProposalDraft,
} from "../domain/procurement";
import { moneyToMajor } from "../domain/money";
import {
  contractorClarificationFixture,
  extractedExternalProposalFixture,
  repairSummaries,
  selectionFixture,
} from "../data/procurementFixtures";

test("all ten Hong Kong problem categories have valid, bilingual questionnaire configuration", () => {
  assert.equal(questionnaireSchemas.length, 10);
  assert.deepEqual(validateQuestionnaireSchemas(questionnaireSchemas), []);

  const expected: RepairCategoryId[] = [
    "leak",
    "drainage",
    "plumbing",
    "electrical",
    "aircon",
    "door-window",
    "surface",
    "bathroom",
    "other",
    "unsure",
  ];
  for (const category of expected) {
    const schema = questionnaireByCategory[category];
    assert.ok(schema, `missing schema for ${category}`);
    assert.ok(schema.label.zh, `${category} missing zh label`);
    assert.ok(schema.label.en, `${category} missing en label`);
    // Every step/field must carry both languages, not just English.
    for (const step of schema.steps) {
      assert.ok(step.title.zh && step.title.en, `${category}/${step.id} missing bilingual title`);
      for (const field of step.fields) {
        assert.ok(
          field.label.zh && field.label.en,
          `${category}/${step.id}/${field.id} missing bilingual label`,
        );
        for (const option of field.options ?? []) {
          assert.ok(
            option.label.zh && option.label.en,
            `${category}/${step.id}/${field.id}/${option.value} missing bilingual option label`,
          );
        }
      }
    }
  }
});

test("category-first: standard categories ask affected area then three branch facts before the shared tail", () => {
  const leak = questionnaireByCategory.leak;
  assert.deepEqual(leak.steps.slice(0, 2).map((step) => step.id), ["affected", "branch"]);
  const branchStep = leak.steps[1];
  assert.deepEqual(
    branchStep.fields.map((field) => field.id),
    ["branchFirst", "branchSecond", "branchThird"],
  );
});

test("other/unsure categories skip the branch questions for a small free-text description, but keep the timeline step", () => {
  for (const category of ["other", "unsure"] as const) {
    const schema = questionnaireByCategory[category];
    assert.equal(schema.steps[0].id, "other-detail");
    assert.equal(
      schema.steps.some((step) => step.id === "affected" || step.id === "branch"),
      false,
    );
    assert.ok(
      schema.steps.some((step) => step.id === "timeline"),
      `${category} must not drop the timeline step`,
    );
  }
});

test("safety is one shared check, not per-category, and is required before continuing on 'yes'", () => {
  const leak = questionnaireByCategory.leak;
  const electrical = questionnaireByCategory.electrical;
  const leakSafety = leak.steps.find((step) => step.id === "safety");
  const electricalSafety = electrical.steps.find((step) => step.id === "safety");
  assert.deepEqual(leakSafety?.fields[0].options?.map((o) => o.value), [
    "fire",
    "gas",
    "flood",
    "structure",
    "none",
  ]);
  assert.deepEqual(leakSafety?.fields[0].options, electricalSafety?.fields[0].options);

  assert.equal(safetyAnswersAreUnprefilled(leak, {}), true);
  assert.equal(
    canContinueQuestionnaireStep(leak, leak.steps.findIndex((s) => s.id === "safety"), { safety: "fire" }, false),
    false,
  );
  assert.equal(
    canContinueQuestionnaireStep(leak, leak.steps.findIndex((s) => s.id === "safety"), { safety: "none" }, false),
    true,
  );
});

test("electrical's branch has a second, category-specific safety trigger (burning smell / sparks)", () => {
  const electrical = questionnaireByCategory.electrical;
  const branchStep = electrical.steps.find((step) => step.id === "branch");
  const first = branchStep?.fields.find((field) => field.id === "branchFirst");
  assert.ok(first?.safetyRule);
  assert.deepEqual(first?.safetyRule?.triggerValues, ["smell-sparks"]);
});

test("required fields block continuation and answers remain reusable when navigating back", () => {
  const schema = questionnaireByCategory.plumbing;
  const affectedIndex = schema.steps.findIndex((step) => step.id === "affected");
  const responses: RepairIntakeDraft["responses"] = {};
  assert.deepEqual(requiredFieldsMissing(schema, affectedIndex, responses), ["affected"]);

  responses.affected = "kitchen";
  const preserved = structuredClone(responses);
  assert.deepEqual(requiredFieldsMissing(schema, affectedIndex, responses), []);
  assert.deepEqual(responses, preserved);
});

test("progressive questionnaire auto-advances ordinary single-choice steps but not the safety step", () => {
  const electrical = questionnaireByCategory.electrical;
  const affectedStep = electrical.steps.find((step) => step.id === "affected")!;
  const safetyStep = electrical.steps.find((step) => step.id === "safety")!;
  assert.equal(questionnaireStepUsesAutomaticProgression(affectedStep), true);
  // The safety step has a safetyRule attached, so it must never auto-advance
  // even though it is otherwise a single-select step.
  assert.equal(questionnaireStepUsesAutomaticProgression(safetyStep), false);
});

test("Hong Kong address step asks district/estate/block/floor/unit — no UK postcode field anywhere in the schema", () => {
  const leak = questionnaireByCategory.leak;
  const addressStep = leak.steps.find((step) => step.id === "address");
  assert.ok(addressStep);
  assert.deepEqual(
    addressStep.fields.map((field) => field.id),
    ["district", "building", "block", "floor", "unit"],
  );
  for (const schema of questionnaireSchemas) {
    assert.equal(
      schema.steps.some((step) => step.fields.some((field) => field.type === "postcode")),
      false,
      `${schema.category} must not use the UK "postcode" field type`,
    );
  }
  // Generic name/email/phone validators remain exported, general-purpose
  // utilities (used nowhere in the HK schema, which collects contact
  // details once on RepairSubmissionPanel instead — see domain/submission.ts).
  assert.equal(isValidContactName("Alex Chan"), true);
  assert.equal(isValidEmailAddress("alex@example.com"), true);
  assert.equal(isValidPhoneNumber("+852 9123 4567"), true);
});

test("building context and access/relationship steps preserve the approved Sites question set", () => {
  const leak = questionnaireByCategory.leak;
  const building = leak.steps.find((step) => step.id === "building");
  assert.deepEqual(
    building?.fields.map((field) => field.id),
    ["management", "sharedArea"],
  );
  const access = leak.steps.find((step) => step.id === "access");
  assert.deepEqual(access?.fields.map((field) => field.id), ["accessBy", "availability"]);
  assert.deepEqual(
    access?.fields[0].options?.map((option) => option.value),
    ["owner", "tenant", "family", "management", "other"],
  );
  const relationship = leak.steps.find((step) => step.id === "relationship");
  assert.deepEqual(
    relationship?.fields[0].options?.map((option) => option.value),
    ["owner-occupier", "landlord", "manager", "other"],
  );
});

test("evidence step asks whether evidence exists and its kind, without claiming a real upload", () => {
  for (const schema of questionnaireSchemas) {
    const evidence = schema.steps.find((step) => step.id === "evidence");
    assert.ok(evidence, `${schema.category} missing evidence step`);
    assert.deepEqual(
      evidence.fields.map((field) => field.id),
      ["hasEvidence", "evidenceKind"],
    );
  }
});

test("category change rebuilds draft state safely: shared answers kept, category-specific answers and progression discarded", () => {
  const previousResponses: RepairIntakeDraft["responses"] = {
    // shared (kept):
    district: "eastern",
    building: "Kornhill",
    relationship: "owner-occupier",
    // category-specific to the OLD category (must be dropped):
    affected: "kitchen",
    branchFirst: "leak",
    branchSecond: "constant",
    branchThird: "yes",
  };
  const rebuilt = rebuildDraftForCategoryChange(
    "journey-1",
    "electrical",
    questionnaireByCategory.electrical.version,
    previousResponses,
    sharedTailFieldIds,
  );

  assert.deepEqual(rebuilt.responses, {
    district: "eastern",
    building: "Kornhill",
    relationship: "owner-occupier",
  });
  // Never blindly copy the old numeric index, completed steps or safety
  // acknowledgements — always recomputed fresh for the new schema.
  assert.equal(rebuilt.activeIndex, 0);
  assert.deepEqual(rebuilt.completedStepIds, []);
  assert.deepEqual(rebuilt.acknowledgements, {});
  assert.equal(rebuilt.category, "electrical");
});

test("rapid repeated submissions can enter a single flight only once", () => {
  const gate = createSingleFlightGate();
  const attempts = [gate.tryStart(), gate.tryStart(), gate.tryStart()];
  assert.deepEqual(attempts, [true, false, false]);
  gate.release();
  assert.equal(gate.tryStart(), true);
});

test("repair workspace access fails closed around verified identity and repair capability", () => {
  assert.equal(
    repairAccessDecision({
      identity: null,
      repairId: "rs-1047",
    }),
    "sign_in_required",
  );
  assert.equal(
    repairAccessDecision({
      identity: {
        userId: "user_owner",
        emailVerified: false,
        capabilities: ["landlord"],
        permittedRepairIds: ["rs-1047"],
      },
      repairId: "rs-1047",
    }),
    "verification_required",
  );
  assert.equal(
    repairAccessDecision({
      identity: {
        userId: "user_other",
        emailVerified: true,
        capabilities: ["contractor"],
        permittedRepairIds: ["rs-1047"],
      },
      repairId: "rs-1047",
    }),
    "capability_required",
  );
  assert.equal(
    repairAccessDecision({
      identity: {
        userId: "user_owner",
        emailVerified: true,
        capabilities: ["landlord"],
        permittedRepairIds: ["rs-1047"],
      },
      repairId: "rs-1047",
    }),
    "allowed",
  );
});

test("public repair-brief submission requires no account and captures contact/consent", async () => {
  const [layoutSource, panelSource, landlordSource, routeSource, packageSource] =
    await Promise.all([
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../components/RepairSubmissionPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../components/LandlordApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/landlord/[[...path]]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  // Clerk is genuinely integrated for the account features that need it
  // (ClerkProvider wraps the root layout) — but the public repair-brief
  // submission path below deliberately never touches it. See
  // docs/PUBLIC_INGESTION_LAUNCH.md.
  assert.match(layoutSource, /ClerkProvider/);
  assert.doesNotMatch(panelSource, /@clerk|useAuth|ClerkProvider/);
  assert.match(panelSource, /consentToContact/);
  // Contractor-sharing consent is deliberately not collected on this
  // screen — it stays false until obtained separately later. See the
  // ContactFormState comment in RepairSubmissionPanel.tsx.
  assert.match(panelSource, /consentToShareWithContractors:\s*false/);
  assert.doesNotMatch(panelSource, /checked=\{form\.consentToShareWithContractors\}/);
  assert.match(
    panelSource,
    /Submission does not guarantee managed sourcing and does not broadcast your information to contractors\./,
  );
  assert.match(landlordSource, /Something incorrect or missing/);
  assert.match(landlordSource, /Edit questionnaire answers/);
  assert.match(landlordSource, /Apply correction/);
  // The corrected brief is persisted to journey-scoped storage (not only
  // React state), so it survives reload/navigation within the journey —
  // see domain/journey.ts's writeJourneyBrief.
  assert.match(landlordSource, /writeJourneyBrief/);
  assert.match(landlordSource, /clearJourney\(journeyId\)/);
  assert.match(routeSource, /<LandlordApp path=\{path\}/);
  // Deliberate: no server-side auth() call or capability check in the
  // landlord route itself — see docs/FRONTEND_RUNTIME_MIGRATION.md's
  // "no Clerk middleware" decision. FastAPI remains the real
  // authorization boundary; this route only threads the path prop.
  assert.doesNotMatch(routeSource, /await auth\(\)|repairAccessDecision/);
  assert.match(packageSource, /@clerk\/nextjs/);
  assert.doesNotMatch(packageSource, /drizzle-orm|drizzle-kit/);
});

test("a safety-triggering answer is a full-screen exit (onSafetyExit), never an inline acknowledge-and-continue card", async () => {
  const engineSource = await readFile(
    new URL("../components/QuestionnaireEngine.tsx", import.meta.url),
    "utf8",
  );
  const landlordSource = await readFile(
    new URL("../components/LandlordApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(engineSource, /onSafetyExit/);
  // The old inline "SafetyNotice" acknowledge-and-continue pattern must not
  // return — a safety exit takes over the whole screen (SafetyExit in
  // LandlordApp.tsx), it does not let the user tick a box and carry on.
  assert.doesNotMatch(engineSource, /SafetyNotice/);
  assert.match(landlordSource, /function SafetyExit/);
  assert.match(landlordSource, /tel:999/);
  // No diagnosis language in the safety-exit screen specifically — it
  // tells the owner what to do, it never claims to identify the cause.
  // ("diagnos" legitimately appears elsewhere in this file, e.g. "Keep the
  // diagnosis open" — asserting the opposite: that RepairScope does NOT
  // claim one.)
  const safetyExitBody = landlordSource.slice(
    landlordSource.indexOf("function SafetyExit"),
    landlordSource.indexOf("function NewRepairFlow"),
  );
  assert.doesNotMatch(safetyExitBody, /diagnos/i);
});

test("brief correction creates a new brief version without mutating the original", async () => {
  assert.equal(correctionMeetsMinimumWords("wrong room"), false);
  assert.equal(correctionMeetsMinimumWords("wrong front room"), true);

  const originalFacts = [...ceilingBrief.reportedFacts];
  const result = await mockServices.contractorBrief.applyCorrection(
    ceilingBrief,
    "The staining is in the front bedroom, not the back bedroom.",
  );

  assert.equal(result.brief.version, ceilingBrief.version + 1);
  assert.deepEqual(ceilingBrief.reportedFacts, originalFacts);
  assert.match(result.brief.reportedFacts.at(-1) ?? "", /front bedroom/);
  assert.deepEqual(result.changedSections, [
    "Reported facts",
    "Landlord correction",
    "Brief version",
  ]);
});

test("contractor opportunity excludes competitor and landlord-private data", () => {
  const visiblePayload = JSON.stringify(demoOpportunity);
  for (const forbidden of [
    "competitor",
    "landlordBudget",
    "ranking",
    "tenantPhone",
    "prop-riverside",
    "prop-agent",
  ]) {
    assert.equal(visiblePayload.includes(forbidden), false);
  }
});

test("contractor invitation resolves by opaque token to a sanitised brief", async () => {
  const invitation =
    await mockServices.contractorInvitations.getInvitation("demo-token");
  assert.equal(invitation.tokenStatus, "valid");
  assert.equal(invitation.sanitisedBrief.approximateArea, "LS6");
  assert.ok(invitation.sanitisedBrief.summary);
  assert.ok(invitation.contractor.businessName);
  assert.equal("fullAddress" in invitation.sanitisedBrief, false);
  assert.equal("tenantPhone" in invitation.sanitisedBrief, false);
});

test("contractor token statuses fail safely on the same route", async () => {
  const [expired, revoked, closed, submitted] = await Promise.all([
    mockServices.contractorInvitations.getInvitation("expired-token"),
    mockServices.contractorInvitations.getInvitation("revoked-token"),
    mockServices.contractorInvitations.getInvitation("closed-token"),
    mockServices.contractorInvitations.getInvitation("submitted-token"),
  ]);
  await assert.rejects(
    mockServices.contractorInvitations.getInvitation("invalid-token"),
    /not valid/i,
  );
  assert.equal(expired.tokenStatus, "expired");
  assert.equal(revoked.tokenStatus, "revoked");
  assert.equal(closed.tokenStatus, "closed");
  assert.equal(submitted.currentResponseStatus, "submitted");
});

test("contractor capability requires a validated invitation and matching verified email", () => {
  const invitation: ValidatedContractorInvitationMock = {
    kind: "validated_contractor_invitation",
    invitationId: "invite-1",
    contractorId: "contractor-1",
    verifiedEmail: "quotes@example.com",
    status: "validated",
  };
  const verifiedUser: VerifiedClerkUserMock = {
    kind: "verified_clerk_user",
    clerkUserId: "user-1",
    email: "Quotes@example.com",
    emailVerified: true,
  };
  const granted = evaluateContractorCapability(
    verifiedUser,
    invitation,
    "quote-1",
    "2026-08-04T12:00:00.000Z",
  );
  assert.equal(granted.granted, true);
  if (granted.granted) {
    assert.deepEqual(granted.capability.attachedQuoteIds, ["quote-1"]);
    assert.equal(granted.capability.verifiedEmail, "quotes@example.com");
  }

  const mismatch = evaluateContractorCapability(
    { ...verifiedUser, email: "other@example.com" },
    invitation,
    "quote-1",
  );
  assert.deepEqual(mismatch, {
    granted: false,
    reason: "invitation_email_mismatch",
  });

  const pendingUser: PendingClerkUserMock = {
    kind: "pending_clerk_user",
    clerkUserId: "user-1",
    email: "quotes@example.com",
    emailVerified: false,
  };
  assert.deepEqual(
    evaluateContractorCapability(pendingUser, invitation, "quote-1"),
    { granted: false, reason: "unverified_user" },
  );
  assert.deepEqual(
    evaluateContractorCapability(
      verifiedUser,
      { ...invitation, status: "invalid" },
      "quote-1",
    ),
    { granted: false, reason: "invalid_invitation" },
  );
});

test("contractor auth mock exposes the requested frontend states", async () => {
  const base = {
    mode: "sign_in" as const,
    identity: {
      email: "quotes@example.com",
      name: "Alex Contractor",
      businessName: "AC Repairs",
      password: "prototype-password",
    },
    invitationEmail: "quotes@example.com",
  };
  const incorrect = await mockServices.auth.authenticate({
    ...base,
    outcome: "incorrect_password",
  });
  const existing = await mockServices.auth.authenticate({
    ...base,
    outcome: "account_already_exists",
  });
  const verification = await mockServices.auth.authenticate({
    ...base,
    outcome: "verification_required",
  });
  const mismatch = await mockServices.auth.authenticate({
    ...base,
    outcome: "email_mismatch",
  });
  assert.equal(incorrect.state, "incorrect_password");
  assert.equal(existing.state, "account_already_exists");
  assert.equal(verification.state, "verification_required");
  assert.equal(mismatch.state, "email_mismatch");
  if (verification.state === "verification_required") {
    const verified = await mockServices.auth.verify(verification.user);
    assert.equal(verified.emailVerified, true);
  }
});

test("contractor response submission is idempotent and keeps invitation linkage", async () => {
  const invitation =
    await mockServices.contractorInvitations.getInvitation("demo-token");
  const draft: ContractorResponseDraft = {
    responseType: "repair_quote",
    contractorDetails: invitation.contractor,
    inspectionDraft: {
      reasons: [],
      otherReason: "",
      note: "",
      inspectionFee: "",
      vatTreatment: "",
      deductionPosition: "",
      deductionAmount: "",
      attendance: "",
      preferredWindows: ["", "", ""],
      accessRequired: [],
      otherAccess: "",
      proposalTiming: "",
    },
    repairQuoteDraft: {
      workItems: [
        { id: "work-1", label: "Test the affected sockets" },
        { id: "work-2", label: "Replace faulty socket fittings" },
      ],
      labourAmount: "170",
      materialsAmount: "70",
      mainMaterials: ["Replacement socket fittings"],
      customMaterial: "",
      materialsStatus: "confirmed",
      itemiseMaterials: false,
      materialCostItems: [],
      otherChargesReviewed: true,
      extraCharges: [],
      exclusions: ["Nothing else is excluded"],
      otherExclusion: "",
      priceStatus: "fixed",
      priceChangeReasons: [],
      otherPriceChangeReason: "",
      priceChangeNote: "",
      startAvailability: "Within 2–3 days",
      laterStartDate: "",
      duration: "Half a day",
      guaranteePosition: "yes",
      guaranteeDuration: "12 months",
      guaranteeNote: "Replacement accessories and workmanship",
      vatRegistered: "no",
      vatIncluded: "",
      vatRate: "20",
      customVatRate: "",
    },
    questionDraft: { question: "", context: "" },
    declineDraft: { reason: "", note: "" },
  };
  const request = { idempotencyKey: "test-single-submit", draft };
  const first = await mockServices.contractorResponse.submitResponse(
    "demo-token",
    request,
  );
  const second = await mockServices.contractorResponse.submitResponse(
    "demo-token",
    request,
  );
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.response.responseId, second.response.responseId);
  assert.equal(first.response.invitationId, invitation.invitationId);
  assert.equal(first.response.repairId, invitation.repairId);
  assert.equal(first.response.contractorId, invitation.contractorId);
});

test("contractor work suggestions are deterministic and never preselected", async () => {
  const invitation =
    await mockServices.contractorInvitations.getInvitation("demo-token");
  const suggestions =
    await mockServices.contractorWorkSuggestions.suggestWorkItems(
      invitation.sanitisedBrief,
    );
  assert.deepEqual(
    suggestions.map((item) => item.label),
    [
      "Test the affected sockets",
      "Isolate and test the circuit",
      "Replace faulty socket fittings",
      "Check wiring and connections",
      "Test the circuit after the repair",
      "Provide the relevant electrical certificate",
    ],
  );
  assert.equal(
    suggestions.some((item) => "selected" in item),
    false,
  );
});

test("contractor quote totals handle combined, itemised and VAT modes", () => {
  const base = {
    workItems: [{ id: "work-1", label: "Test affected sockets" }],
    labourAmount: "300",
    materialsAmount: "70",
    mainMaterials: ["Replacement socket fittings"],
    customMaterial: "",
    materialsStatus: "confirmed" as const,
    itemiseMaterials: false,
    materialCostItems: [],
    otherChargesReviewed: true,
    extraCharges: [
      {
        id: "charge-testing",
        type: "testing" as const,
        label: "Testing or certificate",
        amount: "50",
      },
    ],
    exclusions: ["Nothing else is excluded"],
    otherExclusion: "",
    priceStatus: "fixed" as const,
    priceChangeReasons: [],
    otherPriceChangeReason: "",
    priceChangeNote: "",
    startAvailability: "Within one week",
    laterStartDate: "",
    duration: "Half a day",
    guaranteePosition: "yes" as const,
    guaranteeDuration: "12 months",
    guaranteeNote: "",
    vatRegistered: "no" as const,
    vatIncluded: "" as const,
    vatRate: "20" as const,
    customVatRate: "",
  };

  assert.deepEqual(calculateContractorQuote(base), {
    labour: 300,
    materials: 70,
    extras: 50,
    subtotal: 420,
    vatRate: 0,
    vatAmount: 0,
    total: 420,
    vatMode: "not_charged",
  });

  const vatIncluded = calculateContractorQuote({
    ...base,
    labourAmount: "434",
    materialsAmount: "70",
    extraCharges: [],
    vatRegistered: "yes",
    vatIncluded: "yes",
  });
  assert.equal(vatIncluded.subtotal, 504);
  assert.equal(vatIncluded.vatAmount, 84);
  assert.equal(vatIncluded.total, 504);

  const addVat = calculateContractorQuote({
    ...base,
    vatRegistered: "yes",
    vatIncluded: "no",
  });
  assert.equal(addVat.vatAmount, 84);
  assert.equal(addVat.total, 504);

  const itemised = {
    ...base,
    itemiseMaterials: true,
    materialCostItems: [
      {
        id: "material-1",
        label: "Sockets",
        quantity: "2",
        amount: "42.50",
        status: "confirmed" as const,
      },
      {
        id: "material-2",
        label: "Cable",
        quantity: "",
        amount: "27.50",
        status: "estimated" as const,
      },
    ],
  };
  assert.equal(contractorMaterialsTotal(itemised), 70);
  assert.equal(calculateContractorQuote(itemised).subtotal, 420);
});

test("contractor quote exclusions keep the nothing-else choice exclusive", () => {
  assert.deepEqual(
    toggleContractorExclusion(
      ["Hidden damage found after work starts"],
      "Nothing else is excluded",
    ),
    ["Nothing else is excluded"],
  );
  assert.deepEqual(
    toggleContractorExclusion(
      ["Nothing else is excluded"],
      "Scaffolding or specialist access",
    ),
    ["Scaffolding or specialist access"],
  );
  assert.deepEqual(
    toggleContractorExclusion(
      ["Nothing else is excluded"],
      "Nothing else is excluded",
    ),
    [],
  );
});

test("contractor autosave retry preserves the unchanged draft", async () => {
  const invitation =
    await mockServices.contractorInvitations.getInvitation("demo-token");
  const draft: ContractorResponseDraft = {
    responseType: "question",
    contractorDetails: invitation.contractor,
    inspectionDraft: {
      reasons: [],
      otherReason: "",
      note: "",
      inspectionFee: "",
      vatTreatment: "",
      deductionPosition: "",
      deductionAmount: "",
      attendance: "",
      preferredWindows: ["", "", ""],
      accessRequired: [],
      otherAccess: "",
      proposalTiming: "",
    },
    repairQuoteDraft: {
      workItems: [],
      labourAmount: "",
      materialsAmount: "",
      mainMaterials: [],
      customMaterial: "",
      materialsStatus: "",
      itemiseMaterials: false,
      materialCostItems: [],
      otherChargesReviewed: false,
      extraCharges: [],
      exclusions: [],
      otherExclusion: "",
      priceStatus: "",
      priceChangeReasons: [],
      otherPriceChangeReason: "",
      priceChangeNote: "",
      startAvailability: "",
      laterStartDate: "",
      duration: "",
      guaranteePosition: "",
      guaranteeDuration: "",
      guaranteeNote: "",
      vatRegistered: "",
      vatIncluded: "",
      vatRate: "",
      customVatRate: "",
    },
    questionDraft: {
      question: "Is weekday access available?",
      context: "The inspection would take around one hour.",
    },
    declineDraft: { reason: "", note: "" },
  };
  const before = structuredClone(draft);

  await assert.rejects(
    mockServices.contractorResponse.saveDraft("autosave-fail-once", draft),
  );
  assert.deepEqual(draft, before);
  const retry = await mockServices.contractorResponse.saveDraft(
    "autosave-fail-once",
    draft,
  );
  assert.ok(retry.savedAt);
  assert.deepEqual(draft, before);
});

test("contractor question service supports one active unanswered question", async () => {
  const first = await mockServices.contractorResponse.submitQuestion(
    "one-question-token",
    { question: "Is the circuit still isolated?", context: "" },
  );
  const repeated = await mockServices.contractorResponse.submitQuestion(
    "one-question-token",
    { question: "Is access available tomorrow?", context: "" },
  );
  assert.equal(first.questionId, repeated.questionId);
  assert.equal(first.status, "waiting_for_landlord");
});

test("contractor response is one progressive, accessible responsive route", async () => {
  const [source, css, route, legacyRoute] = await Promise.all([
    readFile(new URL("../components/ContractorApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/contractor/respond/[token]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/respond/[token]/[[...path]]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(route, /<ContractorTaskRouter token=\{token\}/);
  assert.match(legacyRoute, /redirect\(`\/contractor\/respond\/\$\{token\}`\)/);
  assert.doesNotMatch(source, /mockServices\.repair\.get/);
  assert.match(source, /How can you respond to this job\?/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Switch response type\?/);
  assert.match(source, /Submit quote/);
  assert.match(source, /Submit inspection request/);
  assert.match(source, /Opportunity declined/);
  assert.match(source, /Question sent/);
  assert.doesNotMatch(source, /create (an )?account|password/i);
  assert.doesNotMatch(source, /Save inclusions|Save answer/);
  assert.doesNotMatch(source, /quote\.diagnosis|quote\.proposedWork/);
  assert.match(source, /What work will you do\?/);
  assert.match(source, /Enter your main costs/);
  assert.match(source, /contractor-question-summary/);
  assert.match(source, /View job details/);
  assert.match(source, /onClick=\{\(\) => \{[\s\S]*onCommit/);
  assert.doesNotMatch(source, /\{selected \? "✓ " : ""\}/);
  assert.match(source, /Nothing else is excluded/);
  assert.match(source, /Are you VAT registered\?/);
  assert.match(source, /Is a warranty included\?/);
  assert.match(source, /How long is the warranty\?/);
  assert.doesNotMatch(
    source,
    /Is a guarantee included\?|How long is the guarantee\?|<h3>Guarantee<\/h3>/,
  );
  assert.match(source, /I have checked the work, costs and exclusions/);
  assert.match(css, /\.contractor-brief \{[\s\S]*position: sticky/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.brief-drawer/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*font-size: 16px/);
});

test("contractor question progression is driven by question type", () => {
  assert.equal(contractorProgressionMode("single_choice"), "automatic");
  assert.equal(contractorProgressionMode("multi_select"), "explicit");
  assert.equal(contractorProgressionMode("text_or_numeric"), "explicit");
  assert.equal(contractorProgressionMode("final_review"), "explicit");
  assert.equal(contractorQuestionRequiresConfirmation("single_choice"), false);
  assert.equal(contractorQuestionRequiresConfirmation("multi_select"), true);

  assert.equal(
    contractorQuestionHasProgressed("multi_select", true, false),
    false,
  );
  assert.equal(
    contractorQuestionHasProgressed("multi_select", true, true),
    true,
  );
  assert.equal(
    contractorQuestionHasProgressed("single_choice", true, false),
    true,
  );
  assert.equal(
    contractorQuestionHasProgressed("single_choice", false, true),
    false,
  );
});

test("work-item confirmation labels use the selected count and edit state", () => {
  assert.equal(
    workItemsConfirmationLabel(0, false),
    "Continue with 0 work items",
  );
  assert.equal(
    workItemsConfirmationLabel(1, false),
    "Continue with 1 work item",
  );
  assert.equal(
    workItemsConfirmationLabel(3, false),
    "Continue with 3 work items",
  );
  assert.equal(workItemsConfirmationLabel(3, true), "Update work items");
});

test("multi-select contractor questions require bottom confirmation without auto-scroll", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../components/ContractorApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, />\s*Done\s*</);
  assert.doesNotMatch(source, /onDone=/);
  assert.match(source, /questionType="multi_select"/);
  assert.match(source, /workItemsConfirmationLabel/);
  assert.match(source, /quote\.workItems\.length > 0/);
  assert.match(
    source,
    /quote\.workItems\.every\(\(item\) => item\.label\.trim\(\)\.length >= 2\)/,
  );
  assert.match(
    source,
    /Add this work item or clear the field before continuing\./,
  );
  assert.match(source, /confirmStep\("work", "Main costs question revealed\."\)/);
  assert.match(source, /current\.includes\(step\) \? current/);
  assert.match(source, /Continue with selected materials/);
  assert.match(source, /Continue with added charges/);
  assert.match(source, /Continue with these exclusions/);
  assert.match(source, /Continue with these reasons/);
  assert.match(source, /Continue with selected access needs/);
  assert.doesNotMatch(
    source,
    /toggleSuggestion[\s\S]{0,500}(scrollIntoView|confirmStep)/,
  );
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*\.contractor-confirmation-action \.button[\s\S]*width: 100%/,
  );
});

test("contractor confirmation and shared auth shell keep invitation access separate", async () => {
  const [contractor, authShell, workspace, workspaceRoute, css] =
    await Promise.all([
      readFile(
        new URL("../components/ContractorApp.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/SharedAuthShell.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/ContractorQuoteWorkspace.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/contractor/quotes/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(contractor, />\s*View quote\s*</);
  assert.match(contractor, />\s*Manage my quotes\s*</);
  assert.doesNotMatch(contractor, /View submitted response|Print summary/);
  assert.match(contractor, /setPhase\("review"\)/);
  assert.match(contractor, /setAuthOpen\(true\)/);
  assert.match(contractor, /context="contractor"/);

  assert.match(authShell, /contractor: \{/);
  assert.match(authShell, /landlord: \{/);
  assert.match(authShell, /Manage your quotes/);
  assert.match(
    authShell,
    /Sign in or create an account to keep your submitted quotes together and respond to landlord questions\./,
  );
  assert.match(authShell, /Sign in/);
  assert.match(authShell, /Create account/);
  assert.match(authShell, /Contractor name/);
  assert.match(authShell, /Business name/);
  assert.match(authShell, /Confirm password/);
  assert.match(authShell, /Forgotten password\?/);
  assert.match(authShell, /incorrect_password/);
  assert.match(authShell, /account_already_exists/);
  assert.match(authShell, /verification_required/);
  assert.match(authShell, /verification_successful/);
  assert.match(authShell, /email_mismatch/);
  assert.match(authShell, /evaluateContractorCapability/);
  assert.doesNotMatch(authShell, /searchParams|URLSearchParams|accountType/);

  assert.match(workspaceRoute, /<ContractorQuoteWorkspace \/>/);
  assert.match(workspace, /CONTRACTOR_CAPABILITY_STORAGE_KEY/);
  assert.match(workspace, /Submitted quotes/);
  assert.match(workspace, /query string or account-type/);
  assert.doesNotMatch(workspace, /searchParams|URLSearchParams/);
  assert.match(css, /\.auth-shell-backdrop/);
  assert.match(css, /\.contractor-workspace/);
});

test("mobile comparison, loading, empty and error states are present", async () => {
  const [css, homeSource, landlordSource, questionnaireSource] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandlordApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/QuestionnaireEngine.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(css, /@media \(max-width: 840px\)[\s\S]*\.clean-response-card/);
  assert.match(
    homeSource,
    /href="\/landlord\/repairs\/new"[\s\S]*Submit a repair/,
  );
  // Category-first entry (HK-A0 rework): no more free-text-first
  // "startFresh ? describe : start" phase machine — CategoryPickerScreen
  // is the first thing NewRepairFlow renders once a journey id is known.
  assert.match(landlordSource, /function CategoryPickerScreen/);
  assert.match(landlordSource, /function NewRepairFlow/);
  assert.doesNotMatch(landlordSource, /Understanding the report…/);
  // The old UK schema's separate "repair responsibility" record (private,
  // landlord/tenant/disputed + free-text basis) has no equivalent in the
  // approved Sites design, which only asks "relationship to the property"
  // — intentionally dropped, not a regression.
  assert.match(landlordSource, /resumeDraft=\{resumeDraft \?\? undefined\}/);
  assert.match(landlordSource, /setResumeDraft\(briefDraft\)/);
  assert.match(landlordSource, /<ResponseComparisonPage repairId=/);
  assert.match(questionnaireSource, /aria-live="polite"/);
  assert.match(questionnaireSource, /scrollIntoView/);
  assert.doesNotMatch(questionnaireSource, /← Back/);
  assert.match(questionnaireSource, /if \(checked\) onChange\(item\.value\)/);
  // The UK "postcode" field type/normalisation is gone from the engine —
  // Hong Kong has no postcode (see the address-step tests above).
  assert.doesNotMatch(questionnaireSource, /Confirm postcode|normaliseUkPostcode/);
  assert.doesNotMatch(questionnaireSource, /field\.type === "email"/);
  assert.doesNotMatch(questionnaireSource, /field\.type === "phone"/);
});

test("submitted repair quote freezes its accepted total and cost snapshot", () => {
  const draft: ContractorResponseDraft["repairQuoteDraft"] = {
    workItems: [{ id: "work-1", label: "Complete repair" }],
    labourAmount: "300",
    materialsAmount: "250",
    mainMaterials: ["Repair materials"],
    customMaterial: "",
    materialsStatus: "confirmed",
    itemiseMaterials: false,
    materialCostItems: [],
    otherChargesReviewed: true,
    extraCharges: [
      { id: "testing", type: "testing", label: "Testing", amount: "30" },
      { id: "waste", type: "waste", label: "Waste", amount: "30" },
    ],
    exclusions: ["Nothing else is excluded"],
    otherExclusion: "",
    priceStatus: "fixed",
    priceChangeReasons: [],
    otherPriceChangeReason: "",
    priceChangeNote: "",
    startAvailability: "Within one week",
    laterStartDate: "",
    duration: "1 day",
    guaranteePosition: "yes",
    guaranteeDuration: "12 months",
    guaranteeNote: "",
    vatRegistered: "no",
    vatIncluded: "",
    vatRate: "",
    customVatRate: "",
  };
  const submitted = createSubmittedRepairQuote(draft);
  assert.equal(moneyToMajor(submitted.costSnapshot.subtotal), 610);
  assert.equal(moneyToMajor(submitted.finalTotal), 610);
  assert.equal(validateSubmittedQuoteSnapshot(submitted), true);

  draft.labourAmount = "9999";
  assert.equal(moneyToMajor(submitted.costSnapshot.labour), 300);
  assert.equal(moneyToMajor(submitted.finalTotal), 610);
});

test("landlord response fixtures preserve canonical totals and VAT wording", () => {
  const quotes = activeRepairQuotes(defaultResponseBundle).map(submittedRepairQuote);
  assert.deepEqual(
    quotes.map((quote) => moneyToMajor(quote.finalTotal)),
    [610, 456, 1600],
  );
  assert.equal(
    quotes.every((quote) => validateSubmittedQuoteSnapshot(quote)),
    true,
  );
  assert.equal(formatSubmittedVat(quotes[0]), "VAT not charged");
  assert.match(formatSubmittedVat(quotes[1]), /£76\.00 VAT added at 20%/);
  assert.equal(moneyToMajor(quotes[1].costSnapshot.subtotal), 380);
  assert.equal(
    moneyToMajor(quotes[1].costSnapshot.vat.amount!),
    76,
  );
});

test("repair quote summary excludes inspections, questions and inactive responses", () => {
  const bundle = responseFixtureForState("quotes_and_inspection");
  assert.equal(activeRepairQuotes(bundle).length, 3);
  assert.equal(bundle.inspections.length, 1);
  assert.equal(bundle.questions.length, 0);
  const totals = activeRepairQuotes(bundle).map(
    (record) => moneyToMajor(submittedRepairQuote(record).finalTotal),
  );
  assert.deepEqual(totals, [610, 456, 1600]);
  assert.equal(
    totals.includes(
      moneyToMajor(submittedInspection(bundle.inspections[0]).finalFee),
    ),
    false,
  );
});

test("comparison access fails closed and contractor invitations cannot grant access", async () => {
  assert.deepEqual(
    responseComparisonAccessDecision(
      {
        userKind: "contractor_invitation",
        emailVerified: true,
        capabilities: ["contractor"],
        permittedRepairIds: ["rs-1047"],
      },
      "rs-1047",
    ),
    { allowed: false, reason: "authentication_required" },
  );
  assert.deepEqual(
    responseComparisonAccessDecision(
      {
        userKind: "verified_clerk_user",
        emailVerified: true,
        capabilities: ["landlord"],
        permittedRepairIds: ["rs-1047"],
      },
      "rs-other",
    ),
    { allowed: false, reason: "repair_permission_required" },
  );
  await assert.rejects(
    mockServices.proposalComparison.getForRepair("rs-other"),
    /not found/,
  );
});

test("comparison states cover no, one, mixed, question and inactive outcomes", () => {
  assert.equal(
    activeRepairQuotes(responseFixtureForState("no_responses")).length,
    0,
  );
  assert.equal(
    activeRepairQuotes(responseFixtureForState("one_quote")).length,
    1,
  );
  assert.equal(
    responseFixtureForState("quotes_and_inspection").inspections.length,
    1,
  );
  assert.equal(responseFixtureForState("question").questions.length, 1);
  assert.equal(
    responseFixtureForState("all_declined").inactiveResponses.some(
      (record) => record.responseType === "decline",
    ),
    true,
  );
  assert.equal(
    responseFixtureForState("withdrawn").repairQuotes.some(
      (record) => record.lifecycle === "withdrawn",
    ),
    true,
  );
});

test("revisions retain prior submissions and expose only the latest active value", () => {
  const bundle = responseFixtureForState("revised");
  const revised = bundle.repairQuotes.find(
    (record) => record.contractor.id === "contractor-northline",
  );
  assert.ok(revised);
  assert.equal(revised.versions.length, 2);
  assert.equal(revised.latestVersion, 2);
  assert.equal(
    moneyToMajor(
      (revised.versions[0].submittedData as SubmittedRepairQuote).finalTotal,
    ),
    1450,
  );
  assert.equal(moneyToMajor(submittedRepairQuote(revised).finalTotal), 1600);
  assert.equal(latestSubmittedResponse(revised).version, 2);
});

test("missing-detail and difference summaries remain neutral and data-derived", () => {
  const bundle = responseFixtureForState("three_quotes");
  const eastgate = bundle.repairQuotes.find(
    (record) => record.contractor.id === "contractor-eastgate",
  );
  assert.ok(eastgate);
  assert.deepEqual(missingQuoteDetails(submittedRepairQuote(eastgate)), [
    "Duration",
    "Warranty position",
  ]);
  const differences = deriveComparisonDifferences(bundle);
  assert.equal(differences.some((item) => item.key === "total"), true);
  assert.equal(differences.some((item) => item.key === "price_status"), true);
  assert.equal(
    differences.some((item) => /best|recommended|winner/i.test(item.detail)),
    false,
  );
});

test("deterministic follow-ups cover missing and uncertain quote fields privately", () => {
  const bundle = responseFixtureForState("three_quotes");
  const eastgate = bundle.repairQuotes.find(
    (record) => record.contractor.id === "contractor-eastgate",
  );
  assert.ok(eastgate);
  const response = latestSubmittedResponse(eastgate);
  const issues = clarificationIssueKeys(response);
  assert.deepEqual(issues, ["duration_missing", "warranty_missing"]);

  const questions = draftClarificationQuestions(response, issues);
  assert.equal(
    questions.some((question) =>
      /how long the proposed work is expected to take/i.test(question.text),
    ),
    true,
  );
  assert.equal(
    questions.some((question) =>
      /guarantee included[\s\S]*duration[\s\S]*what it covers/i.test(
        question.text,
      ),
    ),
    true,
  );
  const incompleteRecord = structuredClone(eastgate);
  const incompleteQuote = submittedRepairQuote(incompleteRecord);
  incompleteQuote.duration = "1 day";
  incompleteQuote.guaranteePosition = "no";
  incompleteQuote.priceChangeReasons = [];
  incompleteQuote.priceChangeNote = "";
  incompleteQuote.materialsStatus = "to_confirm";
  incompleteQuote.vatRegistered = "";
  incompleteQuote.exclusions = [];
  incompleteQuote.otherExclusion = "";
  const incompleteIssues = clarificationIssueKeys(
    latestSubmittedResponse(incompleteRecord),
  );
  assert.equal(incompleteIssues.includes("estimate_price"), true);
  assert.equal(incompleteIssues.includes("materials_uncertain"), true);
  assert.equal(incompleteIssues.includes("vat_unclear"), true);
  assert.equal(incompleteIssues.includes("exclusions_unclear"), true);
  assert.equal(incompleteIssues.includes("source_work_excluded"), true);

  const incompleteQuestions = draftClarificationQuestions(
    latestSubmittedResponse(incompleteRecord),
    incompleteIssues,
  );
  assert.equal(
    incompleteQuestions.some((question) =>
      /submitted total fixed, or could it change/i.test(question.text),
    ),
    true,
  );
  assert.equal(
    questions.every((question) =>
      clarificationQuestionIsPrivate(
        question.text,
        bundle.repairQuotes.map((record) => record.contractor.displayName),
      ),
    ),
    true,
  );
  assert.equal(
    clarificationQuestionIsPrivate(
      "Can you beat the other contractor's £610 quote?",
    ),
    false,
  );
});

test("mocked landlord follow-up submission returns awaiting-reply state", async () => {
  const eastgate = responseFixtureForState("three_quotes").repairQuotes.find(
    (record) => record.contractor.id === "contractor-eastgate",
  );
  assert.ok(eastgate);
  const response = latestSubmittedResponse(eastgate);
  const drafted = await mockServices.procurementClarification.draftQuestions(
    response.responseId,
    ["duration_missing", "warranty_missing", "estimate_price"],
  );
  const result = await mockServices.procurementClarification.sendClarification(
    response.repairId,
    response.responseId,
    drafted.map(({ id, text }) => ({ id, text })),
  );
  assert.equal(result.thread.status, "awaiting_reply");
  assert.equal(result.thread.responseId, response.responseId);
  assert.equal(result.thread.messages.length, 3);
});

test("guided response comparison uses one filtered rail and factual summaries", async () => {
  const [landlord, component, css, contractor, quoteDomain] = await Promise.all([
    readFile(new URL("../components/LandlordApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/ContractorApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../domain/contractorQuote.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    landlord,
    /href=\{`\/landlord\/repairs\/\$\{repairId\}\/responses`\}/,
  );
  assert.match(landlord, /joined\.endsWith\("\/responses"\)/);
  assert.match(component, /<h1>\{bundle\.repairTitle\}<\/h1>/);
  assert.doesNotMatch(component, /Compare contractor responses/);
  assert.match(component, /View contractor brief/);
  assert.match(component, /At a glance/);
  assert.match(component, /Most complete response/);
  assert.match(component, /Lowest submitted repair total/);
  assert.match(component, /Needs clarification/);
  assert.match(
    component,
    /Draft \{topFollowUpIssues\.length\} follow-up/,
  );
  assert.doesNotMatch(component, /Earliest stated availability/);
  assert.doesNotMatch(
    component,
    /Things to clarify|clean-check-strip|clean-check-chips/,
  );
  assert.match(
    component,
    /not contractor quality or technical[\s\S]*correctness/,
  );
  assert.match(component, /Contractor responses/);
  assert.match(component, /All responses/);
  assert.match(component, /Repair quotes/);
  assert.match(component, /Inspection requests/);
  assert.doesNotMatch(component, /Other responses/);
  assert.doesNotMatch(component, /role="tablist"/);
  assert.doesNotMatch(component, /role="tab"/);
  assert.doesNotMatch(component, /role="tabpanel"/);
  assert.match(component, /Previous contractor response/);
  assert.match(component, /Next contractor response/);
  assert.match(component, /clean-response-rail/);
  assert.match(component, /Inspection required/i);
  assert.match(component, /Not a repair quote/);
  assert.match(component, /Contractor[\s\S]*question[\s\S]*awaiting an answer/);
  assert.match(component, /Compare details/);
  assert.match(component, /clean-quote-card/);
  assert.match(component, /clean-inspection-card/);
  assert.match(component, /clean-matrix-desktop/);
  assert.match(component, /matrixTopics\.map/);
  assert.doesNotMatch(component, /QuoteTable|response-comparison-table/);
  assert.doesNotMatch(component, /ResponseOverview|response-overview/);
  assert.doesNotMatch(component, /bundle\.inactiveResponses/);
  assert.doesNotMatch(component, /Review quote/);
  assert.match(component, />\s*View quote\s*</);
  assert.match(component, /Awaiting reply/);
  assert.match(component, /Follow up with/);
  assert.match(component, /Send follow-up/);
  assert.match(
    component,
    /This message is private\. The contractor will not see other quotes,[\s\S]*prices or contractor details\./,
  );
  assert.match(
    component,
    /Each contractor receives a separate private message/,
  );
  assert.doesNotMatch(component, />Missing details</);
  assert.match(component, /data-prototype-control/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /detailReturnFocusRef\.current\?\.focus/);
  assert.match(component, /followUpReturnFocusRef\.current\?\.focus/);
  assert.doesNotMatch(
    component,
    /strongest quote|best quote|recommended contractor|winner/i,
  );

  assert.match(css, /\.clean-response-rail[\s\S]*overflow-x: auto/);
  assert.match(
    css,
    /\.clean-response-rail[\s\S]*grid-auto-columns: minmax\(380px, 420px\)/,
  );
  assert.match(
    css,
    /\.clean-response-rail[\s\S]*scroll-snap-type: inline mandatory/,
  );
  assert.match(css, /\.clean-response-card[\s\S]*min-width: 380px/);
  assert.match(
    css,
    /\.clean-quote-card__facts div,[\s\S]*grid-template-columns: 110px/,
  );
  assert.match(
    css,
    /\.clean-inspection-card dl\.clean-inspection-card__facts[\s\S]*grid-template-columns: 1fr[\s\S]*gap: 0/,
  );
  assert.match(
    css,
    /\.clean-inspection-card dl\.clean-inspection-card__facts > div[\s\S]*background: transparent/,
  );
  assert.match(css, /\.clean-quote-card__price strong,[\s\S]*2\.6rem/);
  assert.match(css, /\.clean-matrix-desktop thead th[\s\S]*position: sticky/);
  assert.match(
    css,
    /\.clean-response-filters button\[aria-pressed="true"\]/,
  );
  assert.match(css, /\.is-uncertain/);
  assert.match(css, /\.clean-at-a-glance__follow-up \.button/);
  assert.doesNotMatch(css, /\.clean-check-strip|\.clean-check-chips/);
  assert.match(
    css,
    /@media \(max-width: 840px\)[\s\S]*\.clean-response-rail[\s\S]*grid-auto-columns: min\(86vw, 390px\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 840px\)[\s\S]*\.clean-matrix-desktop[\s\S]*display: none/,
  );
  assert.match(css, /\.clean-matrix-mobile[\s\S]*display: none/);

  assert.match(contractor, /SubmittedRepairQuote\)\.finalTotal/);
  assert.doesNotMatch(
    contractor,
    /phase === "submitted"[\s\S]{0,650}calculateContractorQuote/,
  );
  assert.match(quoteDomain, /finalTotal: moneyFromMajor\(totals\.total\)/);
});

test("My repairs lists and filters canonical repair stages", async () => {
  const all = await mockServices.landlordRepairs.listRepairs();
  assert.equal(all.length, repairSummaries.length);
  const actionNeeded = await mockServices.landlordRepairs.listRepairs({
    stages: ["brief_ready", "clarification_required"],
  });
  assert.deepEqual(
    actionNeeded.map((repair) => repair.stage),
    ["brief_ready", "clarification_required"],
  );
  const propertyRepairs = await mockServices.landlordRepairs.listRepairs({
    postcode: "SE15 3DF",
  });
  assert.equal(propertyRepairs.length, 2);
  assert.ok(
    propertyRepairs.every(
      (repair) => repair.propertyPostcode === "SE15 3DF",
    ),
  );
});

test("every repair stage resolves to its required primary destination", () => {
  const destinations = new Map(
    repairSummaries.map((repair) => [repair.stage, repair.destination]),
  );
  assert.match(destinations.get("draft") ?? "", /\/landlord\/repairs\/new\//);
  assert.match(destinations.get("brief_ready") ?? "", /\/brief$/);
  assert.match(destinations.get("sourcing") ?? "", /\/status$/);
  assert.match(destinations.get("responses_received") ?? "", /\/responses$/);
  assert.match(destinations.get("clarification_required") ?? "", /\/responses$/);
  assert.match(
    destinations.get("awaiting_contractor_confirmation") ?? "",
    /\/selection$/,
  );
  assert.match(destinations.get("repair_in_progress") ?? "", /\/progress$/);
  assert.match(destinations.get("completed") ?? "", /\/completed$/);
});

test("landlord repairs UI stays procurement-focused and opens existing intake", async () => {
  const [component, landlord, route] = await Promise.all([
    readFile(
      new URL("../components/LandlordProcurementPages.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../components/LandlordApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/landlord/[[...path]]/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(component, /<h1>My repairs<\/h1>/);
  assert.match(component, /href="\/landlord\/repairs\/new"/);
  assert.match(component, /Repair stage[\s\S]*Property postcode/);
  assert.match(component, /<select[\s\S]*All postcodes/);
  assert.doesNotMatch(component, /aria-pressed=\{activeFilter/);
  assert.match(component, /Loading your repairs/);
  assert.match(component, /Your repairs could not be loaded/);
  assert.match(component, /No repairs in this view/);
  assert.doesNotMatch(component, /portfolio statistics|financial analytics|chart/i);
  assert.match(landlord, /path\[0\] === "repairs" && path\.length === 1/);
  assert.doesNotMatch(route, /clerkConfigured|await auth\(\)/);
});

test("external quote extraction requires explicit review and preserves Not stated", async () => {
  const source = await mockServices.externalQuoteImport.createEmailSource({
    fileName: "forwarded-roof-quote.pdf",
  });
  const extracted =
    await mockServices.externalQuoteImport.extractQuote(source.sourceId);
  assert.equal(extracted.reviewed, false);
  assert.equal(extracted.contractorPhone.state, "not_stated");
  assert.equal(extracted.contractorPhone.value, "");
  await assert.rejects(
    mockServices.externalQuoteImport.saveExternalProposal(
      "rs-1047",
      extracted as unknown as ReviewedExternalProposalDraft,
    ),
    /review/i,
  );
});

test("reviewed external quote becomes a canonical submitted response", async () => {
  const source = await mockServices.externalQuoteImport.createEmailSource({
    fileName: "forwarded-roof-quote.pdf",
  });
  const extracted =
    await mockServices.externalQuoteImport.extractQuote(source.sourceId);
  const response =
    await mockServices.externalQuoteImport.saveExternalProposal("rs-1047", {
      ...extracted,
      reviewed: true,
    });
  assert.equal(response.source, "email_import");
  assert.equal(response.responseType, "repair_quote");
  assert.equal(response.version, 1);
  assert.equal(
    moneyToMajor(
      (response.submittedData as SubmittedRepairQuote).finalTotal,
    ),
    extracted.finalTotal.value,
  );
});

test("external import save is idempotent for one reviewed source", async () => {
  const extracted = extractedExternalProposalFixture();
  const reviewed = {
    ...extracted,
    reviewed: true as const,
  };
  const first = await mockServices.externalQuoteImport.saveExternalProposal(
    "rs-1047",
    reviewed,
  );
  const second = await mockServices.externalQuoteImport.saveExternalProposal(
    "rs-1047",
    reviewed,
  );
  assert.equal(first.responseId, second.responseId);
});

test("selection references an exact response version without appointing it", async () => {
  const selection = await mockServices.repairSelection.selectResponse(
    selectionFixture.repairId,
    selectionFixture.responseId,
    selectionFixture.responseVersion,
  );
  assert.equal(selection.status, "confirmation_requested");
  assert.equal(selection.responseVersion, selection.selectedResponse.version);
  assert.equal(
    submittedSelectionTotal(selection),
    (selection.selectedResponse.submittedData as SubmittedRepairQuote).finalTotal,
  );
});

test("selection requests are idempotent and cancellation preserves response history", async () => {
  const first = await mockServices.repairSelection.selectResponse(
    selectionFixture.repairId,
    selectionFixture.responseId,
    selectionFixture.responseVersion,
  );
  const second = await mockServices.repairSelection.selectResponse(
    selectionFixture.repairId,
    selectionFixture.responseId,
    selectionFixture.responseVersion,
  );
  assert.equal(first.selectionId, second.selectionId);
  const cancelled = await mockServices.repairSelection.cancelSelection(
    first.repairId,
    first.selectionId,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.selectedResponse.responseId, first.responseId);
});

test("contractor clarification token is job-specific and needs no account", async () => {
  const state =
    await mockServices.procurementClarification.getContractorClarification(
      "clarification-token",
    );
  assert.deepEqual(state.access.allowedResources, [
    "invitation",
    "own_response",
    "clarification_thread",
    "own_quote_versions",
  ]);
  assert.deepEqual(state.access.deniedResources, [
    "other_repairs",
    "other_contractors",
    "landlord_comparison",
    "competing_prices",
  ]);
  assert.equal(state.access.repairId, state.currentResponse.repairId);
});

test("opening quote revision creates a complete prefilled Version 2 draft", () => {
  const response = contractorClarificationFixture.currentResponse;
  const original = response.submittedData as SubmittedRepairQuote;
  const draft = createProposalRevisionDraft(response);
  assert.equal(draft.sourceResponseId, response.responseId);
  assert.equal(draft.sourceVersion, 1);
  assert.equal(draft.draftVersion, 2);
  assert.deepEqual(draft.quote.workItems, original.workItems);
  assert.equal(draft.quote.labourAmount, original.labourAmount);
  assert.equal(draft.quote.materialsAmount, original.materialsAmount);
  assert.deepEqual(draft.quote.mainMaterials, original.mainMaterials);
  assert.deepEqual(draft.quote.extraCharges, original.extraCharges);
  assert.deepEqual(draft.quote.exclusions, original.exclusions);
  assert.equal(draft.quote.priceStatus, original.priceStatus);
  assert.equal(draft.quote.startAvailability, original.startAvailability);
  assert.equal(draft.quote.vatRate, original.vatRate);
  assert.equal(draft.quote.quoteValidity, original.quoteValidity);
  assert.deepEqual(
    draft.quote.supportingAttachments,
    original.supportingAttachments ?? [],
  );
  draft.quote.workItems[0].label = "Changed only in draft";
  assert.notEqual(draft.quote.workItems[0].label, original.workItems[0].label);
});

test("clarification shortcuts map to relevant quote sections without limiting edits", () => {
  assert.deepEqual(
    sectionsForClarificationQuestions(
      ["duration_missing", "warranty_missing"],
      [
        "How long will the work take?",
        "Is a warranty included and what does it cover?",
      ],
    ),
    ["duration", "guarantee"],
  );
  assert.deepEqual(
    sectionsForClarificationQuestions(
      [],
      ["Please confirm the labour cost and exclusions."],
    ),
    ["costs", "exclusions"],
  );
});

test("revision validation uses underlying costs and calculated totals", () => {
  const response = contractorClarificationFixture.currentResponse;
  const original = response.submittedData as SubmittedRepairQuote;
  const draft = createProposalRevisionDraft(response);
  assert.equal(validateQuoteRevisionDraft(draft.quote).valid, false);
  draft.quote.duration = "One day";
  draft.quote.guaranteePosition = "yes";
  draft.quote.guaranteeDuration = "12 months";
  const ready = validateQuoteRevisionDraft(draft.quote);
  assert.equal(ready.valid, true);
  assert.equal(ready.totals.total, moneyToMajor(original.finalTotal));
  draft.quote.labourAmount = "300";
  const recalculated = validateQuoteRevisionDraft(draft.quote);
  assert.equal(recalculated.totals.subtotal, 420);
  assert.equal(recalculated.totals.vatAmount, 84);
  assert.equal(recalculated.totals.total, 504);
});

test("revision change detection omits unchanged fields and generates factual summary", () => {
  const response = contractorClarificationFixture.currentResponse;
  const original = response.submittedData as SubmittedRepairQuote;
  const draft = createProposalRevisionDraft(response);
  assert.deepEqual(detectQuoteFieldChanges(original, draft.quote), []);
  draft.quote.duration = "One day";
  draft.quote.guaranteePosition = "yes";
  draft.quote.guaranteeDuration = "12 months";
  const changes = detectQuoteFieldChanges(original, draft.quote);
  assert.deepEqual(
    changes.map((change) => change.field),
    ["duration", "guarantee"],
  );
  assert.equal(changes[0].before, "Not stated");
  assert.equal(changes[0].after, "One day");
  assert.match(revisionSummary(changes), /Duration added; Warranty added/);
});

test("Version 2 draft autosave is typed and failed save leaves the draft intact", async () => {
  const draft = createProposalRevisionDraft(
    contractorClarificationFixture.currentResponse,
  );
  draft.quote.duration = "One day";
  draft.changedFields = detectQuoteFieldChanges(
    contractorClarificationFixture.currentResponse
      .submittedData as SubmittedRepairQuote,
    draft.quote,
  );
  const saved =
    await mockServices.procurementClarification.saveRevisionDraft(
      "clarification-token",
      draft,
    );
  assert.ok(saved.lastSavedAt);
  await assert.rejects(
    mockServices.procurementClarification.saveRevisionDraft(
      "invalid-token",
      draft,
    ),
    /not valid/i,
  );
  assert.equal(draft.quote.duration, "One day");
});

test("complete revision UI stays collapsed, calculated and review-gated", async () => {
  const [experience, editor, css] = await Promise.all([
    readFile(
      new URL("../components/ContractorProcurementStates.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/ContractorQuoteRevisionEditor.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of [
    "Work included",
    "Costs",
    "Materials",
    "Additional charges",
    "Exclusions",
    "Price status",
    "Availability",
    "Duration",
    "Warranty",
    "VAT",
    "Quote validity",
    "Supporting document",
  ]) {
    assert.match(editor, new RegExp(label));
  }
  assert.match(editor, /const \[openSection, setOpenSection\]/);
  assert.match(editor, /Questions from the landlord/);
  assert.match(editor, /Go to \{sectionLabels\[shortcut\]\.toLowerCase\(\)\}/);
  assert.match(editor, /Landlord asked about this/);
  assert.match(editor, /calculateContractorQuote\(quote\)/);
  assert.match(editor, /The final total is not directly editable/);
  assert.doesNotMatch(editor, /label="Final total"/);
  assert.match(experience, /Review changes/);
  assert.match(experience, /View complete updated quote|QuoteRevisionReview/);
  assert.match(experience, /I have checked the updated work, costs and conditions/);
  assert.match(experience, /Submit updated quote/);
  assert.doesNotMatch(experience, /Reason for revision/);
  assert.match(css, /\.quote-revision-questions[\s\S]*position: sticky/);
  assert.match(
    css,
    /@media \(max-width: 700px\)[\s\S]*\.quote-revision-questions[\s\S]*position: static/,
  );
});

test("landlord questions remain visible while the contractor updates a quote", async () => {
  const component = await readFile(
    new URL("../components/ContractorProcurementStates.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    component,
    /action === "revise"[\s\S]*ContractorQuoteRevisionEditor[\s\S]*landlordQuestions\.map/,
  );
  assert.match(component, /highlightedSections=\{highlightedRevisionSections\}/);
  assert.match(component, /revisionHeadingRef\.current\?\.scrollIntoView/);
});

test("contractor can answer clarification without revising the quote", async () => {
  const result =
    await mockServices.procurementClarification.submitClarificationAnswer(
      "clarification-token",
      {
        idempotencyKey: "test-answer-only",
        answers: contractorClarificationFixture.thread.messages.map(
          (message, index) => ({
            questionId: message.messageId,
            answer:
              index === 0
                ? "One working day."
                : "A 12-month workmanship warranty is included.",
          }),
        ),
      },
    );
  assert.equal(result.thread.status, "answer_received");
  assert.equal(
    contractorClarificationFixture.currentResponse.version,
    1,
  );
});

test("contractor revision creates active Version 2 and retains Version 1", async () => {
  const quote = structuredClone(
    contractorClarificationFixture.currentResponse
      .submittedData as SubmittedRepairQuote,
  );
  quote.duration = "One working day";
  quote.guaranteePosition = "yes";
  quote.guaranteeDuration = "12 months";
  const original =
    contractorClarificationFixture.currentResponse
      .submittedData as SubmittedRepairQuote;
  const changedFields = detectQuoteFieldChanges(original, quote);
  const revised =
    await mockServices.procurementClarification.submitRevisedResponse(
      "clarification-token",
      {
        context: {
          invitationId:
            contractorClarificationFixture.currentResponse.invitationId,
          repairId: contractorClarificationFixture.currentResponse.repairId,
          contractorId:
            contractorClarificationFixture.currentResponse.contractorId,
          responseId:
            contractorClarificationFixture.currentResponse.responseId,
          sourceVersion:
            contractorClarificationFixture.currentResponse.version,
          reason: "landlord_clarification",
        },
        quote,
        changedFields,
        revisionSummary: revisionSummary(changedFields),
        idempotencyKey: "test-revision-v2",
      },
  );
  assert.equal(revised.version, 2);
  assert.equal(Boolean(revised.revisionReason?.length), true);
  const state =
    await mockServices.procurementClarification.getContractorClarification(
      "clarification-token",
    );
  assert.equal(state.versions.length, 2);
  assert.equal(state.versions[0].status, "superseded");
  assert.equal(state.versions[0].response.version, 1);
  assert.equal(state.versions[1].status, "active");
  assert.equal(state.currentResponse.version, 2);
});

test("contractor reconfirmation creates an agreed scope with one invariant total", async () => {
  const result =
    await mockServices.contractorReconfirmation.confirmSelection(
      "selection-token",
      { idempotencyKey: "test-confirm-selection" },
    );
  assert.equal(result.reconfirmation.status, "contractor_confirmed");
  assert.ok(result.agreedScope);
  assert.equal(
    agreedScopePreservesQuoteTotal(
      result.reconfirmation.selection,
      result.agreedScope,
    ),
    true,
  );
  assert.equal(
    result.agreedScope.finalTotal.amountMinor,
    (result.reconfirmation.selection.selectedResponse
      .submittedData as SubmittedRepairQuote).finalTotal.amountMinor,
  );
});

test("contractor can propose availability or withdraw through the same token", async () => {
  const availability =
    await mockServices.contractorReconfirmation.proposeAvailability(
      "selection-token",
      {
        options: ["Monday 17 August after 13:00"],
        idempotencyKey: "test-availability",
      },
    );
  assert.equal(
    availability.reconfirmation.status,
    "contractor_proposed_availability",
  );
  const withdrawn = await mockServices.contractorReconfirmation.withdraw(
    "selection-token",
    "Capacity changed",
  );
  assert.equal(withdrawn.reconfirmation.status, "contractor_withdrew");
});

test("confirmed repair progress preserves agreed quote and response history access", async () => {
  const progress = await mockServices.repairProgress.getProgress("rs-1047");
  assert.equal(progress.repair.stage, "repair_in_progress");
  assert.equal(progress.currentStage, "appointment_agreed");
  assert.ok(progress.updates.length >= 2);
  assert.equal(
    progress.agreedScope.finalTotal.amountMinor,
    (selectionFixture.selectedResponse.submittedData as SubmittedRepairQuote)
      .finalTotal.amountMinor,
  );
});

test("quote, inspection and follow-up decisions use centred accessible modals", async () => {
  const [comparison, decisions, modal, css] = await Promise.all([
    readFile(
      new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/ResponseDecisionModals.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../components/DecisionModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(comparison, /QuoteDecisionModal/);
  assert.match(comparison, /InspectionDecisionModal/);
  assert.match(comparison, /function FollowUpModal/);
  assert.match(
    comparison,
    /function FollowUpModal[\s\S]*<DecisionModal/,
  );
  assert.doesNotMatch(comparison, /function FollowUpDrawer/);
  assert.match(decisions, /Proceed with this quote/);
  assert.match(decisions, /Ask contractor to confirm/);
  assert.match(decisions, /Ask a question/);
  assert.match(decisions, /Decline inspection/);
  assert.match(decisions, /Proceed with inspection/);
  assert.match(decisions, /Ask contractor to confirm inspection/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /focusableSelector/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(css, /\.decision-modal[\s\S]*width: min\(860px, 100%\)/);
  assert.match(css, /\.decision-modal[\s\S]*max-height: 85vh/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*height: 100dvh/);
});

test("contractor brief remains a drawer while decision content uses modals", async () => {
  const comparison = await readFile(
    new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    comparison,
    /\{drawer && \([\s\S]*<DetailDrawer/,
  );
  assert.match(
    comparison,
    /decisionModal\.kind === "quote"[\s\S]*<QuoteDecisionModal/,
  );
});

test("import review is keyboard-operable and retains draft on failed save", async () => {
  const component = await readFile(
    new URL("../components/ExternalQuoteImportModal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /PDF, JPEG, PNG or HEIC/);
  assert.match(component, /Use mocked emailed document/);
  assert.match(component, /Extracted from document/);
  assert.match(component, /Corrected by landlord/);
  assert.match(component, /Not stated/);
  assert.match(component, /I have reviewed the extracted fields/);
  assert.match(component, /setStage\("review"\)/);
  assert.doesNotMatch(
    component,
    /catch[\s\S]{0,300}setDraft\(undefined\)/,
  );
});

test("comparison keeps operator-only identities out and import in context", async () => {
  const comparison = await readFile(
    new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(comparison, /bundle\.inactiveResponses/);
  assert.match(comparison, /Import a quote/);
  assert.match(comparison, /Draft \{topFollowUpIssues\.length\} follow-up/);
  assert.doesNotMatch(comparison, /Things to clarify/);
});

test("responsive procurement UI includes readable cards, keyboard rail and reduced motion", async () => {
  const [component, css] = await Promise.all([
    readFile(
      new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(component, /Previous contractor response/);
  assert.match(component, /Next contractor response/);
  assert.match(css, /grid-auto-columns: minmax\(380px, 420px\)/);
  assert.match(css, /\.clean-quote-card__work li[\s\S]*font-size: 1rem/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("canonical procurement types and required service boundaries are exported once", async () => {
  const [procurement, sharedTypes, contracts] = await Promise.all([
    readFile(new URL("../domain/procurement.ts", import.meta.url), "utf8"),
    readFile(new URL("../domain/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../services/contracts.ts", import.meta.url), "utf8"),
  ]);
  for (const typeName of [
    "UserCapability",
    "AttachmentSummary",
    "PriceStatus",
    "Guarantee",
    "RepairStage",
    "RepairSummary",
    "RepairDraft",
    "Repair",
    "ContractorBrief",
    "RepairQuote",
    "InspectionRequest",
    "ClarificationMessage",
    "ClarificationThread",
    "ProposalVersion",
    "ExternalProposal",
    "RepairSelection",
    "ContractorReconfirmation",
    "AgreedScope",
    "RepairProgressUpdate",
    "RepairProgress",
  ]) {
    assert.match(procurement, new RegExp(`(?:type|interface) ${typeName}\\b`));
  }
  for (const typeName of [
    "Contractor",
    "ContractorInvitation",
    "SubmittedContractorResponse",
    "ContractorQuestion",
  ]) {
    assert.match(sharedTypes, new RegExp(`interface ${typeName}\\b`));
  }
  assert.match(sharedTypes, /export type \{ Currency, Money, VAT, VATMode \}/);
  assert.equal((sharedTypes.match(/interface ProposalVersion\b/g) ?? []).length, 0);
  for (const serviceName of [
    "AuthService",
    "LandlordRepairService",
    "ContractorBriefService",
    "ContractorInvitationService",
    "ContractorResponseService",
    "ProposalComparisonService",
    "ClarificationService",
    "ExternalQuoteImportService",
    "RepairSelectionService",
    "ContractorReconfirmationService",
    "RepairProgressService",
    "OperatorSourcingService",
  ]) {
    assert.match(contracts, new RegExp(`interface ${serviceName}\\b`));
  }
});

test("application components consume services and retired comparison implementations stay removed", async () => {
  const [landlord, comparison, procurementPages, css, packageSource] =
    await Promise.all([
      readFile(new URL("../components/LandlordApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../components/ResponseComparisonPage.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/LandlordProcurementPages.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);
  const applicationDataSources = [landlord, comparison, procurementPages].join("\n");
  assert.doesNotMatch(
    applicationDataSources,
    /from ["']@\/data\/(?:fixtures|procurementFixtures|responseFixtures)/,
  );
  assert.doesNotMatch(landlord, /ProposalWorkspace|QuoteUploadFlow|ClarificationFlow/);
  assert.doesNotMatch(css, /\.comparison-table|\.response-comparison-table/);
  assert.match(packageSource, /@clerk\/nextjs/);
  assert.doesNotMatch(packageSource, /drizzle-orm|drizzle-kit/);
});

test("operator sourcing stays review-led and never defaults to automatic broadcasting", async () => {
  const plan = await mockServices.operatorSourcing.getLaunchPlan();
  assert.deepEqual(plan.workflow, [
    "backend_proposes_shortlist",
    "operator_reviews_shortlist",
    "operator_approves_invitations",
    "backend_sends_and_tracks_invitations",
    "operator_handles_exceptions",
  ]);
  assert.equal(plan.automaticBroadcasting, false);
  assert.equal(plan.launchInterface, "legacy_operator_workspace");
  assert.deepEqual(plan.matchingSignals, [
    "trade_or_specialism",
    "service_area",
    "job_category",
    "active_or_paused",
    "opt_out_status",
    "invitation_history",
    "known_availability_or_capacity",
  ]);
});

test("backend handoff documentation is present in apps/web and docs/", async () => {
  const documents = await Promise.all(
    [
      ["../README.md"],
      ["../../../docs/FRONTEND_ROUTE_MAP.md"],
      ["../../../docs/FRONTEND_STATE_MATRIX.md"],
      ["../../../docs/DOMAIN_MODEL.md"],
      ["../../../docs/MOCK_SERVICE_CONTRACTS.md"],
      ["../../../docs/AUTHORIZATION_MODEL.md"],
      ["../../../docs/BACKEND_INTEGRATION_CHECKLIST.md"],
      ["../../../docs/CLAUDE_BACKEND_HANDOFF.md"],
      ["../../../docs/KNOWN_LIMITATIONS.md"],
    ].map(([path]) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.equal(documents.every((content) => content.length > 500), true);
  assert.match(documents[6], /proposed and not implemented/i);
  assert.match(documents[7], /do not rewrite the frontend/i);
  assert.match(documents[8], /not a production-ready system/i);
});

test("repair-list relative-update formatting uses real current time, not a fixed historical anchor", async () => {
  const { formatUpdatedAt } = await import("../components/LandlordProcurementPages");

  const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
  assert.equal(formatUpdatedAt(threeHoursAgo), "3 hours ago");

  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  assert.equal(formatUpdatedAt(oneHourAgo), "1 hour ago");

  // Regression guard: this previously anchored against a hardcoded
  // "2026-08-04T11:00:00.000Z" instead of the real clock, so a value from
  // one hour ago would have formatted as whatever offset happened to
  // exist between that fixed date and now — asserting against a value
  // computed from Date.now() itself is what catches a reintroduced
  // fixed anchor (it would drift from "1 hour ago" as real time passes).
});
