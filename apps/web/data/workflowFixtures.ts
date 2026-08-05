import { moneyFromMajor } from "@/domain/money";
import type {
  InspectionDecision,
  ResolvedContractorTask,
} from "@/domain/procurement";
import {
  contractorClarificationFixture,
  reconfirmationFixture,
} from "./procurementFixtures";
import { demoOpportunity } from "./fixtures";
import { defaultResponseBundle } from "./responseFixtures";

const inspectionRecord = defaultResponseBundle.inspections[0];

export const contractorTaskFixtures: Readonly<
  Record<string, ResolvedContractorTask>
> = {
  "demo-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "valid",
    taskType: "new_opportunity",
  },
  "autosave-fail-once": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "valid",
    taskType: "new_opportunity",
  },
  "fail-once": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "valid",
    taskType: "new_opportunity",
  },
  "one-question-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "valid",
    taskType: "new_opportunity",
  },
  "clarification-token": {
    invitationId: contractorClarificationFixture.access.invitationId,
    repairId: contractorClarificationFixture.access.repairId,
    contractorId: contractorClarificationFixture.access.contractorId,
    tokenStatus: "valid",
    taskType: "clarification",
    responseId: contractorClarificationFixture.currentResponse.responseId,
    activeResponseVersion:
      contractorClarificationFixture.currentResponse.version,
    clarificationThreadId:
      contractorClarificationFixture.thread.clarificationId,
  },
  "selection-token": {
    invitationId: reconfirmationFixture.access.invitationId,
    repairId: reconfirmationFixture.access.repairId,
    contractorId: reconfirmationFixture.access.contractorId,
    tokenStatus: "valid",
    taskType: "selection_reconfirmation",
    responseId: reconfirmationFixture.selection.responseId,
    activeResponseVersion: reconfirmationFixture.selection.responseVersion,
    selectionId: reconfirmationFixture.selection.selectionId,
  },
  "inspection-confirmation-token": {
    invitationId: inspectionRecord.response.invitationId,
    repairId: inspectionRecord.response.repairId,
    contractorId: inspectionRecord.response.contractorId,
    tokenStatus: "valid",
    taskType: "inspection_confirmation",
    responseId: inspectionRecord.response.responseId,
    activeResponseVersion: inspectionRecord.response.version,
    inspectionDecisionId: "inspection-decision-harbour-1",
  },
  "expired-opportunity-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "expired",
    taskType: "new_opportunity",
  },
  "expired-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "expired",
    taskType: "new_opportunity",
  },
  "revoked-opportunity-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "revoked",
    taskType: "new_opportunity",
  },
  "revoked-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "revoked",
    taskType: "new_opportunity",
  },
  "closed-opportunity-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "closed",
    taskType: "new_opportunity",
  },
  "closed-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "closed",
    taskType: "new_opportunity",
  },
  "submitted-token": {
    invitationId: demoOpportunity.invitationId,
    repairId: demoOpportunity.repairId,
    contractorId: demoOpportunity.contractorId,
    tokenStatus: "closed",
    taskType: "new_opportunity",
  },
};

export const inspectionDecisionFixture: InspectionDecision = {
  inspectionDecisionId: "inspection-decision-harbour-1",
  repairId: inspectionRecord.response.repairId,
  invitationId: inspectionRecord.response.invitationId,
  contractorId: inspectionRecord.response.contractorId,
  inspectionResponseId: inspectionRecord.response.responseId,
  acceptedFee: moneyFromMajor(95),
  vat: {
    mode: "included",
    rateBasisPoints: 2000,
    amount: moneyFromMajor(15.83),
  },
  feeDeduction: { mode: "full" },
  preferredAttendanceWindows: [
    {
      windowId: "inspection-window-thursday",
      startsAt: "2026-08-13T08:00:00.000Z",
      endsAt: "2026-08-13T11:00:00.000Z",
      label: "Thursday 08:00–11:00",
    },
    {
      windowId: "inspection-window-friday",
      startsAt: "2026-08-14T13:00:00.000Z",
      endsAt: "2026-08-14T16:00:00.000Z",
      label: "Friday 13:00–16:00",
    },
  ],
  accessContact: {
    name: "Alex Morgan",
    telephone: "07712 345678",
  },
  accessRequirements: ["Rear yard", "Loft hatch"],
  status: "awaiting_contractor_confirmation",
  requestedAt: "2026-08-04T11:15:00.000Z",
};
