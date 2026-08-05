import assert from "node:assert/strict";
import test from "node:test";
import { demoOpportunity } from "../data/fixtures";
import {
  contractorClarificationFixture,
  extractedExternalProposalFixture,
} from "../data/procurementFixtures";
import { defaultResponseBundle } from "../data/responseFixtures";
import {
  addMoney,
  calculateEmbeddedVat,
  calculateVatAdded,
  moneyFromMajor,
  moneyToMajor,
} from "../domain/money";
import {
  createSubmittedInspectionRequest,
  createSubmittedRepairQuote,
} from "../domain/contractorQuote";
import {
  createProposalRevisionDraft,
  detectQuoteFieldChanges,
  quoteDraftFromSubmitted,
  revisionSummary,
} from "../domain/quoteRevision";
import type {
  ReviewedExternalProposalDraft,
} from "../domain/procurement";
import type {
  ContractorResponseDraft,
  SubmittedRepairQuote,
} from "../domain/types";
import { createMockRepairScopeServices } from "../services";

function responseDraft(): ContractorResponseDraft {
  const quote = contractorClarificationFixture.currentResponse
    .submittedData as SubmittedRepairQuote;
  return {
    responseType: "repair_quote",
    repairQuoteDraft: quoteDraftFromSubmitted(quote),
    inspectionDraft: {
      reasons: [],
      otherReason: "",
      note: "",
      inspectionFee: "",
      vatTreatment: "",
      deductionPosition: "",
      deductionAmount: "",
      attendance: "",
      preferredWindows: [],
      accessRequired: [],
      otherAccess: "",
      proposalTiming: "",
    },
    questionDraft: { question: "", context: "" },
    declineDraft: { reason: "", note: "" },
    contractorDetails: demoOpportunity.contractor,
  };
}

test("contractor quote submission resolves an opaque task and confirms the same immutable total", async () => {
  const services = createMockRepairScopeServices();
  const task = await services.contractorTasks.resolveToken("demo-token");
  assert.equal(task.taskType, "new_opportunity");
  const draft = responseDraft();
  const expected = createSubmittedRepairQuote(draft.repairQuoteDraft).finalTotal;
  const result = await services.contractorResponses.submitResponse(
    "demo-token",
    { draft, idempotencyKey: "interaction-submit-once" },
  );
  const duplicate = await services.contractorResponses.submitResponse(
    "demo-token",
    { draft, idempotencyKey: "interaction-submit-once" },
  );
  assert.equal(result.response.invitationId, task.invitationId);
  assert.equal(result.response.repairId, task.repairId);
  assert.deepEqual(
    (result.response.submittedData as SubmittedRepairQuote).finalTotal,
    expected,
  );
  assert.equal(duplicate.duplicate, true);
});

test("expired, unknown and suggestively named tokens cannot submit or grant a task type", async () => {
  const services = createMockRepairScopeServices();
  const expired = await services.contractorTasks.resolveToken("expired-token");
  assert.equal(expired.tokenStatus, "expired");
  await assert.rejects(
    services.contractorResponses.submitResponse("expired-token", {
      draft: responseDraft(),
      idempotencyKey: "interaction-expired-submit",
    }),
    /expired/i,
  );
  await assert.rejects(
    services.contractorTasks.resolveToken(
      "this-name-looks-like-inspection_confirmation",
    ),
    /not valid/i,
  );
});

test("clarification creates Version 2 on the same invitation while Version 1 remains viewable", async () => {
  const services = createMockRepairScopeServices();
  const current = contractorClarificationFixture.currentResponse;
  await services.clarifications.sendClarification(
    current.repairId,
    current.responseId,
    [{ id: "duration", text: "Please confirm the expected duration." }],
  );
  const task = await services.contractorTasks.resolveToken(
    "clarification-token",
  );
  const before = await services.clarifications.getContractorClarification(
    "clarification-token",
  );
  const revision = createProposalRevisionDraft(before.currentResponse);
  revision.quote.duration = "One working day";
  revision.quote.guaranteePosition = "yes";
  revision.quote.guaranteeDuration = "12 months";
  const original = before.currentResponse.submittedData as SubmittedRepairQuote;
  const changes = detectQuoteFieldChanges(original, revision.quote);
  const response = await services.clarifications.submitRevisedResponse(
    "clarification-token",
    {
      context: {
        invitationId: task.invitationId,
        repairId: task.repairId,
        contractorId: task.contractorId,
        responseId: task.responseId!,
        sourceVersion: task.activeResponseVersion!,
        reason: "landlord_clarification",
      },
      quote: createSubmittedRepairQuote(revision.quote),
      changedFields: changes,
      revisionSummary: revisionSummary(changes),
      idempotencyKey: "interaction-clarification-revision",
    },
  );
  const after = await services.clarifications.getContractorClarification(
    "clarification-token",
  );
  const comparison = await services.comparisons.getForRepair(current.repairId);
  const matchingRecord = comparison.repairQuotes.find((record) =>
    record.versions.some(
      (version) => version.invitationId === current.invitationId,
    ),
  );
  assert.equal(response.invitationId, task.invitationId);
  assert.equal(response.repairId, task.repairId);
  assert.equal(after.versions[0].version, 1);
  assert.equal(after.versions.at(-1)?.version, 2);
  assert.equal(matchingRecord?.latestVersion, 2);
});

test("a contractor revision cannot escape its validated invitation scope", async () => {
  const services = createMockRepairScopeServices();
  const task = await services.contractorTasks.resolveToken(
    "clarification-token",
  );
  const quote = contractorClarificationFixture.currentResponse
    .submittedData as SubmittedRepairQuote;
  await assert.rejects(
    services.clarifications.submitRevisedResponse("clarification-token", {
      context: {
        invitationId: task.invitationId,
        repairId: task.repairId,
        contractorId: "contractor-from-another-invitation",
        responseId: task.responseId!,
        sourceVersion: task.activeResponseVersion!,
        reason: "landlord_clarification",
      },
      quote,
      changedFields: [
        {
          field: "duration",
          label: "Duration",
          before: "Not stated",
          after: "One day",
          summary: "Duration added",
        },
      ],
      revisionSummary: "Duration added",
      idempotencyKey: "interaction-wrong-contractor",
    }),
    /does not match this invitation/i,
  );
});

test("selection changes require explicit landlord acceptance of the exact response version", async () => {
  const services = createMockRepairScopeServices();
  const task = await services.contractorTasks.resolveToken("selection-token");
  const reconfirmation =
    await services.reconfirmations.getReconfirmation("selection-token");
  const original = reconfirmation.selection
    .selectedResponse.submittedData as SubmittedRepairQuote;
  const draft = quoteDraftFromSubmitted(original);
  draft.labourAmount = String(Number(draft.labourAmount) + 100);
  const revisedQuote = createSubmittedRepairQuote(draft);
  const changes = detectQuoteFieldChanges(original, draft);

  const revised = await services.clarifications.submitRevisedResponse(
    "selection-token",
    {
      context: {
        invitationId: task.invitationId,
        repairId: task.repairId,
        contractorId: task.contractorId,
        responseId: task.responseId!,
        sourceVersion: task.activeResponseVersion!,
        reason: "selection_reconfirmation",
      },
      quote: revisedQuote,
      changedFields: changes,
      revisionSummary: revisionSummary(changes),
      idempotencyKey: "interaction-selection-revision",
    },
  );
  const review = await services.selections.reviewContractorChanges(
    task.repairId,
    task.selectionId!,
  );
  assert.equal(review.status, "pending");
  assert.equal(
    reconfirmation.selection.responseVersion,
    task.activeResponseVersion,
  );
  await assert.rejects(
    services.selections.acceptRevisedResponse(
      task.repairId,
      task.selectionId!,
      revised.responseId,
      revised.version - 1,
    ),
    /exact proposed response version/i,
  );
  const accepted = await services.selections.acceptRevisedResponse(
    task.repairId,
    task.selectionId!,
    revised.responseId,
    revised.version,
  );
  assert.equal(accepted.responseId, revised.responseId);
  assert.equal(accepted.responseVersion, revised.version);
  assert.deepEqual(
    (accepted.selectedResponse.submittedData as SubmittedRepairQuote)
      .finalTotal,
    revisedQuote.finalTotal,
  );
});

test("declining a revised selection preserves the originally selected response", async () => {
  const services = createMockRepairScopeServices();
  const task = await services.contractorTasks.resolveToken("selection-token");
  const before =
    await services.reconfirmations.getReconfirmation("selection-token");
  const original = before.selection.selectedResponse
    .submittedData as SubmittedRepairQuote;
  const draft = quoteDraftFromSubmitted(original);
  draft.labourAmount = String(Number(draft.labourAmount) + 75);
  const changes = detectQuoteFieldChanges(original, draft);
  await services.clarifications.submitRevisedResponse("selection-token", {
    context: {
      invitationId: task.invitationId,
      repairId: task.repairId,
      contractorId: task.contractorId,
      responseId: task.responseId!,
      sourceVersion: task.activeResponseVersion!,
      reason: "selection_reconfirmation",
    },
    quote: createSubmittedRepairQuote(draft),
    changedFields: changes,
    revisionSummary: revisionSummary(changes),
    idempotencyKey: "interaction-selection-revision-decline",
  });
  const declined = await services.selections.declineContractorChanges(
    task.repairId,
    task.selectionId!,
    "Keep the original selected quote.",
  );
  assert.equal(declined.responseId, before.selection.responseId);
  assert.equal(declined.responseVersion, before.selection.responseVersion);
  assert.deepEqual(
    (declined.selectedResponse.submittedData as SubmittedRepairQuote)
      .finalTotal,
    original.finalTotal,
  );
});

test("availability-only changes can be accepted or declined without changing the selected quote", async () => {
  const services = createMockRepairScopeServices();
  const before =
    await services.reconfirmations.getReconfirmation("selection-token");
  const proposal = await services.reconfirmations.proposeAvailability(
    "selection-token",
    {
      options: ["Monday 17 August after 13:00"],
      note: "The earlier slot is no longer available.",
      idempotencyKey: "interaction-availability",
    },
  );
  const review = await services.selections.reviewContractorChanges(
    before.selection.repairId,
    before.selection.selectionId,
  );
  assert.equal(proposal.reconfirmation.status, "contractor_proposed_availability");
  const accepted = await services.selections.acceptProposedAvailability(
    before.selection.repairId,
    before.selection.selectionId,
    review.proposedAvailability!,
  );
  assert.equal(accepted.responseId, before.selection.responseId);
  assert.equal(accepted.responseVersion, before.selection.responseVersion);
  await services.reconfirmations.proposeAvailability("selection-token", {
    options: ["Wednesday 19 August after 09:00"],
    idempotencyKey: "interaction-availability-decline",
  });
  const declined = await services.selections.declineContractorChanges(
    before.selection.repairId,
    before.selection.selectionId,
    "The proposed time is not suitable.",
  );
  assert.equal(declined.responseId, before.selection.responseId);
  assert.equal(declined.responseVersion, before.selection.responseVersion);
});

test("inspection approval, contractor alternative and landlord acceptance use canonical transitions", async () => {
  const services = createMockRepairScopeServices();
  const record = defaultResponseBundle.inspections[0];
  const requestedWindows = [
    {
      windowId: "inspection-window-thursday",
      startsAt: "2026-08-13T08:00:00.000Z",
      endsAt: "2026-08-13T11:00:00.000Z",
      label: "Thursday 08:00–11:00",
    },
  ];
  const decision = await services.inspections.proceedWithInspection(
    record.response.repairId,
    record.response.responseId,
    {
      preferredAttendanceWindows: requestedWindows,
      accessRequirements: ["Rear yard", "Loft hatch"],
    },
  );
  const contractorTask =
    await services.contractorInspections.getConfirmationTask(
      "inspection-confirmation-token",
    );
  assert.equal(decision.status, "awaiting_contractor_confirmation");
  assert.equal(contractorTask.inspectionDecisionId, decision.inspectionDecisionId);

  const alternative = {
    windowId: "inspection-alt-monday",
    startsAt: "2026-08-17T09:00:00.000Z",
    endsAt: "2026-08-17T12:00:00.000Z",
    label: "Monday 09:00–12:00",
  };
  const proposed =
    await services.contractorInspections.proposeAlternativeAttendance(
      "inspection-confirmation-token",
      { proposedWindows: [alternative], contractorNote: "Crew availability" },
    );
  assert.equal(proposed.status, "alternative_proposed");
  const accepted = await services.inspections.acceptAlternativeAttendance(
    decision.repairId,
    decision.inspectionDecisionId,
    alternative,
  );
  assert.equal(accepted.status, "contractor_confirmed");
  assert.equal(accepted.preferredAttendanceWindows[0].windowId, alternative.windowId);
});

test("contractor can confirm one of the landlord inspection windows", async () => {
  const services = createMockRepairScopeServices();
  const record = defaultResponseBundle.inspections[0];
  const requestedWindow = {
    windowId: "inspection-window-thursday",
    startsAt: "2026-08-13T08:00:00.000Z",
    endsAt: "2026-08-13T11:00:00.000Z",
    label: "Thursday 08:00–11:00",
  };
  const decision = await services.inspections.proceedWithInspection(
    record.response.repairId,
    record.response.responseId,
    {
      preferredAttendanceWindows: [requestedWindow],
      accessRequirements: ["Rear yard"],
    },
  );
  const confirmed = await services.contractorInspections.confirmInspection(
    "inspection-confirmation-token",
    { confirmedWindow: requestedWindow },
  );
  const updated = await services.inspections.getDecision(
    decision.repairId,
    decision.inspectionDecisionId,
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(updated.status, "contractor_confirmed");
  assert.equal(confirmed.confirmedWindow?.windowId, requestedWindow.windowId);
});

test("authorization is resolved inside the service container and a second repair is not tied to RS-1047", async () => {
  const unauthorised = createMockRepairScopeServices({
    authScenario: "unauthorised_landlord",
  });
  const contractor = createMockRepairScopeServices({
    authScenario: "contractor_invitation",
  });
  const authorised = createMockRepairScopeServices();
  await assert.rejects(
    unauthorised.comparisons.getForRepair("rs-1047"),
    /access denied/i,
  );
  await assert.rejects(
    contractor.comparisons.getForRepair("rs-1047"),
    /access denied/i,
  );
  const second = await authorised.comparisons.getForRepair("rs-1052");
  assert.equal(second.repairId, "rs-1052");
  assert.equal(second.repairReference, "RS–1052");
  assert.ok(
    second.repairQuotes.every((record) =>
      record.versions.every((response) => response.repairId === "rs-1052"),
    ),
  );
});

test("money and VAT calculations use rounded integer minor units", () => {
  const subtotal = addMoney([moneyFromMajor(300), moneyFromMajor(80)]);
  const added = calculateVatAdded(subtotal, 2000);
  const embedded = calculateEmbeddedVat(moneyFromMajor(456), 2000);
  assert.equal(subtotal.amountMinor, 38000);
  assert.equal(added.amountMinor, 7600);
  assert.equal(embedded.amountMinor, 7600);
  assert.equal(moneyToMajor(addMoney([subtotal, added])), 456);
});

function reviewedExternalDraft(
  sourceId: string,
): ReviewedExternalProposalDraft {
  const extracted = extractedExternalProposalFixture({
    sourceId,
    fileName: `${sourceId}.pdf`,
    mimeType: "application/pdf",
    importedFrom: "upload",
    uploadedAt: "2026-08-05T09:00:00.000Z",
  });
  return { ...extracted, reviewed: true };
}

test("external quote VAT included, VAT added and VAT unclear remain distinct", async () => {
  const services = createMockRepairScopeServices();

  const included = reviewedExternalDraft("vat-included");
  included.vat = {
    value: {
      mode: "included",
      rateBasisPoints: 2000,
      amount: moneyFromMajor(187.5),
    },
    state: "corrected_by_landlord",
  };
  included.vatAmount = {
    value: 187.5,
    state: "corrected_by_landlord",
  };
  included.finalTotal = {
    value: 1125,
    state: "corrected_by_landlord",
  };

  const added = reviewedExternalDraft("vat-added");

  const unclear = reviewedExternalDraft("vat-unclear");
  unclear.vat = {
    value: { mode: "not_stated" },
    state: "not_stated",
  };
  unclear.vatAmount = { value: null, state: "not_stated" };

  const includedResponse = await services.externalQuotes.saveExternalProposal(
    "rs-1047",
    included,
  );
  const addedResponse = await services.externalQuotes.saveExternalProposal(
    "rs-1047",
    added,
  );
  const unclearResponse = await services.externalQuotes.saveExternalProposal(
    "rs-1047",
    unclear,
  );
  const includedQuote =
    includedResponse.submittedData as SubmittedRepairQuote;
  const addedQuote = addedResponse.submittedData as SubmittedRepairQuote;
  const unclearQuote =
    unclearResponse.submittedData as SubmittedRepairQuote;

  assert.equal(includedQuote.costSnapshot.vat.mode, "included");
  assert.equal(includedQuote.finalTotal.amountMinor, 112500);
  assert.equal(addedQuote.costSnapshot.vat.mode, "added");
  assert.equal(addedQuote.finalTotal.amountMinor, 135000);
  assert.equal(unclearQuote.costSnapshot.vat.mode, "not_stated");
  assert.equal(unclearQuote.finalTotal.amountMinor, 135000);
  assert.equal(includedResponse.source, "landlord_upload");
});

test("inspection fees distinguish VAT included from VAT added", () => {
  const base = responseDraft().inspectionDraft;
  const included = createSubmittedInspectionRequest({
    ...base,
    inspectionFee: "95",
    vatTreatment: "included",
  });
  const added = createSubmittedInspectionRequest({
    ...base,
    inspectionFee: "95",
    vatTreatment: "added",
  });
  assert.equal(included.vat.mode, "included");
  assert.equal(included.finalFee.amountMinor, 9500);
  assert.equal(included.vat.amount?.amountMinor, 1583);
  assert.equal(added.vat.mode, "added");
  assert.equal(added.vat.amount?.amountMinor, 1900);
  assert.equal(added.finalFee.amountMinor, 11400);
});

test("an agreed scope references only the confirmed accepted response version", async () => {
  const services = createMockRepairScopeServices();
  const result = await services.reconfirmations.confirmSelection(
    "selection-token",
    { idempotencyKey: "interaction-final-confirmation" },
  );
  assert.ok(result.agreedScope);
  assert.equal(
    result.agreedScope.selectionId,
    result.reconfirmation.selection.selectionId,
  );
  assert.equal(
    result.agreedScope.selectedResponseVersion,
    result.reconfirmation.selection.responseVersion,
  );
  assert.equal(
    result.agreedScope.contractorConfirmation.status,
    "contractor_confirmed",
  );
  assert.equal(
    result.agreedScope.proposalSource,
    result.reconfirmation.selection.selectedResponse.source,
  );
});
