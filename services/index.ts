import { createMockCoreServices, type MockAuthScenario } from "./mock";
import type { RepairScopeServices } from "./contracts";
import { contractorTaskService } from "./mocks/contractorTaskMock";
import {
  contractorInspectionService,
  landlordInspectionService,
  resetInspectionMockState,
} from "./mocks/inspectionMock";

export type MockServiceConfiguration = {
  authScenario?: MockAuthScenario;
};

export function createMockRepairScopeServices(
  configuration: MockServiceConfiguration = {},
): RepairScopeServices {
  resetInspectionMockState();
  const core = createMockCoreServices(configuration);
  return {
    auth: core.auth,
    landlordRepairs: core.landlordRepairs,
    contractorBriefs: core.contractorBrief,
    contractorTasks: contractorTaskService,
    contractorInvitations: core.contractorInvitations,
    contractorResponses: core.contractorResponse,
    comparisons: core.proposalComparison,
    clarifications: core.procurementClarification,
    inspections: landlordInspectionService,
    contractorInspections: contractorInspectionService,
    externalQuotes: core.externalQuoteImport,
    selections: core.repairSelection,
    reconfirmations: core.contractorReconfirmation,
    progress: core.repairProgress,
    operatorSourcing: core.operatorSourcing,
    classification: core.classification,
    questionnaire: core.questionnaire,
    repairIntake: core.repair,
    contractorWorkSuggestions: core.contractorWorkSuggestions,
  };
}

export const repairScopeServices = createMockRepairScopeServices({
  authScenario: "authorised_landlord",
});

export type { RepairScopeServices } from "./contracts";
export { createApiRepairScopeServices } from "./api";
