import { createMockCoreServices, type MockAuthScenario } from "./mock";
import type { RepairScopeServices } from "./contracts";
import { contractorTaskService } from "./mocks/contractorTaskMock";
import {
  contractorInspectionService,
  landlordInspectionService,
  resetInspectionMockState,
} from "./mocks/inspectionMock";
import { createApiRepairScopeServices } from "./api";

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

const VALID_DATA_SOURCES = ["mock", "api"] as const;
type RepairScopeDataSource = (typeof VALID_DATA_SOURCES)[number];

function resolveDataSource(): RepairScopeDataSource {
  const raw = process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock";
  if (!VALID_DATA_SOURCES.includes(raw as RepairScopeDataSource)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE "${raw}". ` +
        `Expected one of: ${VALID_DATA_SOURCES.join(", ")}.`,
    );
  }
  return raw as RepairScopeDataSource;
}

function createRepairScopeServices(): RepairScopeServices {
  const dataSource = resolveDataSource();
  if (dataSource === "mock") {
    return createMockRepairScopeServices({ authScenario: "authorised_landlord" });
  }
  const baseUrl = process.env.NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL ?? "";
  return createApiRepairScopeServices({ baseUrl });
}

export const repairScopeServices = createRepairScopeServices();

export type { RepairScopeServices } from "./contracts";
export { createApiRepairScopeServices } from "./api";
