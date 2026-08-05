import { inspectionDecisionFixture } from "@/data/workflowFixtures";
import { defaultResponseBundle } from "@/data/responseFixtures";
import type {
  AlternativeAttendanceRequest,
  AvailabilityWindow,
  ConfirmInspectionRequest,
  InspectionConfirmation,
  InspectionDecision,
  ProceedWithInspectionRequest,
} from "@/domain/procurement";
import type {
  ContractorInspectionService,
  LandlordInspectionService,
} from "../contracts";
import { requireContractorTask } from "./contractorTaskMock";

type InspectionWorkflowState = {
  decision: InspectionDecision;
  confirmation?: InspectionConfirmation;
};

const states = new Map<string, InspectionWorkflowState>([
  [
    inspectionDecisionFixture.inspectionDecisionId,
    { decision: structuredClone(inspectionDecisionFixture) },
  ],
]);

export function resetInspectionMockState() {
  states.clear();
  states.set(inspectionDecisionFixture.inspectionDecisionId, {
    decision: structuredClone(inspectionDecisionFixture),
  });
}

function inspectionResponse(responseId: string) {
  return defaultResponseBundle.inspections.find(
    (record) => record.response.responseId === responseId,
  );
}

function getState(inspectionDecisionId: string): InspectionWorkflowState {
  const state = states.get(inspectionDecisionId);
  if (!state) throw new Error("Inspection decision not found.");
  return state;
}

export class MockLandlordInspectionService
  implements LandlordInspectionService
{
  async proceedWithInspection(
    repairId: string,
    inspectionResponseId: string,
    request: ProceedWithInspectionRequest,
  ): Promise<InspectionDecision> {
    const response = inspectionResponse(inspectionResponseId);
    if (!response || response.response.repairId !== repairId) {
      throw new Error("Inspection response not found for this repair.");
    }
    if (!request.preferredAttendanceWindows.length) {
      throw new Error("Choose at least one attendance window.");
    }
    const submitted = response.response.submittedData;
    if (!("finalFee" in submitted)) {
      throw new Error("The selected response is not an inspection request.");
    }
    const decision: InspectionDecision = {
      inspectionDecisionId:
        inspectionResponseId === inspectionDecisionFixture.inspectionResponseId
          ? inspectionDecisionFixture.inspectionDecisionId
          : `inspection-decision-${inspectionResponseId}`,
      repairId,
      invitationId: response.response.invitationId,
      contractorId: response.response.contractorId,
      inspectionResponseId,
      acceptedFee: structuredClone(submitted.finalFee),
      vat: structuredClone(submitted.vat),
      feeDeduction:
        submitted.deductionPosition === "partial"
          ? {
              mode: "partial",
              amount: {
                amountMinor: Math.round(
                  Number(submitted.deductionAmount || 0) * 100,
                ),
                currency: "GBP",
              },
            }
          : {
              mode:
                submitted.deductionPosition === "full" ||
                submitted.deductionPosition === "none" ||
                submitted.deductionPosition === "depends"
                  ? submitted.deductionPosition
                  : "depends",
            },
      preferredAttendanceWindows: structuredClone(
        request.preferredAttendanceWindows,
      ),
      accessContact: request.accessContact
        ? structuredClone(request.accessContact)
        : undefined,
      accessRequirements: [...request.accessRequirements],
      status: "awaiting_contractor_confirmation",
      requestedAt: new Date().toISOString(),
    };
    states.set(decision.inspectionDecisionId, { decision });
    return structuredClone(decision);
  }

  async declineInspection(
    repairId: string,
    inspectionResponseId: string,
    _reason?: string,
  ): Promise<InspectionDecision> {
    void _reason;
    const response = inspectionResponse(inspectionResponseId);
    if (!response || response.response.repairId !== repairId) {
      throw new Error("Inspection response not found for this repair.");
    }
    const base = structuredClone(inspectionDecisionFixture);
    const decision = {
      ...base,
      inspectionDecisionId: `inspection-decision-${inspectionResponseId}`,
      repairId,
      invitationId: response.response.invitationId,
      contractorId: response.response.contractorId,
      inspectionResponseId,
      status: "declined_by_landlord" as const,
    };
    states.set(decision.inspectionDecisionId, { decision });
    return structuredClone(decision);
  }

  async getDecision(
    repairId: string,
    inspectionDecisionId: string,
  ): Promise<InspectionDecision> {
    const state = getState(inspectionDecisionId);
    if (state.decision.repairId !== repairId) {
      throw new Error("Inspection decision not found for this repair.");
    }
    return structuredClone(state.decision);
  }

  async acceptAlternativeAttendance(
    repairId: string,
    inspectionDecisionId: string,
    window: AvailabilityWindow,
  ): Promise<InspectionDecision> {
    const state = getState(inspectionDecisionId);
    if (
      state.decision.repairId !== repairId ||
      state.confirmation?.status !== "alternative_proposed" ||
      !state.confirmation.proposedWindows?.some(
        (candidate) => candidate.windowId === window.windowId,
      )
    ) {
      throw new Error("The proposed attendance window is not available.");
    }
    state.decision = {
      ...state.decision,
      preferredAttendanceWindows: [structuredClone(window)],
      status: "contractor_confirmed",
    };
    state.confirmation = {
      ...state.confirmation,
      status: "confirmed",
      confirmedWindow: structuredClone(window),
    };
    return structuredClone(state.decision);
  }
}

export class MockContractorInspectionService
  implements ContractorInspectionService
{
  async getConfirmationTask(token: string): Promise<InspectionDecision> {
    const task = await requireContractorTask(token, [
      "inspection_confirmation",
    ]);
    if (!task.inspectionDecisionId) {
      throw new Error("Inspection confirmation context is incomplete.");
    }
    return structuredClone(getState(task.inspectionDecisionId).decision);
  }

  async confirmInspection(
    token: string,
    request: ConfirmInspectionRequest,
  ): Promise<InspectionConfirmation> {
    const task = await requireContractorTask(token, [
      "inspection_confirmation",
    ]);
    const state = getState(task.inspectionDecisionId!);
    if (
      !state.decision.preferredAttendanceWindows.some(
        (window) => window.windowId === request.confirmedWindow.windowId,
      )
    ) {
      throw new Error("Confirm one of the requested attendance windows.");
    }
    const confirmation: InspectionConfirmation = {
      inspectionDecisionId: state.decision.inspectionDecisionId,
      contractorId: task.contractorId,
      status: "confirmed",
      confirmedWindow: structuredClone(request.confirmedWindow),
      respondedAt: new Date().toISOString(),
    };
    state.confirmation = confirmation;
    state.decision = {
      ...state.decision,
      status: "contractor_confirmed",
    };
    return structuredClone(confirmation);
  }

  async proposeAlternativeAttendance(
    token: string,
    request: AlternativeAttendanceRequest,
  ): Promise<InspectionConfirmation> {
    const task = await requireContractorTask(token, [
      "inspection_confirmation",
    ]);
    if (!request.proposedWindows.length) {
      throw new Error("Propose at least one alternative attendance window.");
    }
    const state = getState(task.inspectionDecisionId!);
    const confirmation: InspectionConfirmation = {
      inspectionDecisionId: state.decision.inspectionDecisionId,
      contractorId: task.contractorId,
      status: "alternative_proposed",
      proposedWindows: structuredClone(request.proposedWindows),
      contractorNote: request.contractorNote?.trim(),
      respondedAt: new Date().toISOString(),
    };
    state.confirmation = confirmation;
    state.decision = {
      ...state.decision,
      status: "contractor_proposed_changes",
    };
    return structuredClone(confirmation);
  }

  async declineInspection(
    token: string,
    reason?: string,
  ): Promise<InspectionConfirmation> {
    const task = await requireContractorTask(token, [
      "inspection_confirmation",
    ]);
    const state = getState(task.inspectionDecisionId!);
    const confirmation: InspectionConfirmation = {
      inspectionDecisionId: state.decision.inspectionDecisionId,
      contractorId: task.contractorId,
      status: "declined",
      contractorNote: reason?.trim(),
      respondedAt: new Date().toISOString(),
    };
    state.confirmation = confirmation;
    state.decision = {
      ...state.decision,
      status: "declined_by_contractor",
    };
    return structuredClone(confirmation);
  }
}

export const landlordInspectionService = new MockLandlordInspectionService();
export const contractorInspectionService =
  new MockContractorInspectionService();
