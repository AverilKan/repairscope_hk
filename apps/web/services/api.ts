import type { RepairScopeServices } from "./contracts";

export type RepairScopeApiConfig = {
  baseUrl: string;
};

/**
 * Thrown by every method of every unimplemented API-adapter service. Callers
 * (components, tests) can catch this specifically to distinguish "not wired
 * up yet" from a real runtime failure.
 */
export class ApiCapabilityUnavailableError extends Error {
  constructor(public readonly capability: string) {
    super(
      `RepairScope API adapter capability "${capability}" is not implemented yet. ` +
        "Use the mock services (services/index.ts default) until the corresponding backend endpoint exists.",
    );
    this.name = "ApiCapabilityUnavailableError";
  }
}

/**
 * Builds a stub that satisfies interface `T`'s shape at compile time, but
 * throws ApiCapabilityUnavailableError for every method call at runtime.
 * Each of RepairScopeServices' ~19 service interfaces gets one of these
 * until its real fetch-backed implementation lands (see
 * docs/CLAUDE_BACKEND_HANDOFF.md's phased order) — implementing every
 * method by hand today would only have to be rewritten per phase anyway.
 */
function createUnavailableApiService<T extends object>(serviceName: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return () => {
        throw new ApiCapabilityUnavailableError(`${serviceName}.${property}`);
      };
    },
  });
}

/**
 * Backend integration seam. Every member below is a typed stub — replace
 * each with a real fetch adapter as its backend phase lands, without
 * changing any component import or the RepairScopeServices shape.
 */
export function createApiRepairScopeServices(
  config: RepairScopeApiConfig,
): RepairScopeServices {
  if (!config.baseUrl) {
    throw new Error(
      "createApiRepairScopeServices requires a non-empty baseUrl (see NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL).",
    );
  }
  return {
    auth: createUnavailableApiService("auth"),
    landlordRepairs: createUnavailableApiService("landlordRepairs"),
    contractorBriefs: createUnavailableApiService("contractorBriefs"),
    contractorTasks: createUnavailableApiService("contractorTasks"),
    contractorInvitations: createUnavailableApiService("contractorInvitations"),
    contractorResponses: createUnavailableApiService("contractorResponses"),
    comparisons: createUnavailableApiService("comparisons"),
    clarifications: createUnavailableApiService("clarifications"),
    inspections: createUnavailableApiService("inspections"),
    contractorInspections: createUnavailableApiService("contractorInspections"),
    externalQuotes: createUnavailableApiService("externalQuotes"),
    selections: createUnavailableApiService("selections"),
    reconfirmations: createUnavailableApiService("reconfirmations"),
    progress: createUnavailableApiService("progress"),
    operatorSourcing: createUnavailableApiService("operatorSourcing"),
    classification: createUnavailableApiService("classification"),
    questionnaire: createUnavailableApiService("questionnaire"),
    repairIntake: createUnavailableApiService("repairIntake"),
    contractorWorkSuggestions: createUnavailableApiService("contractorWorkSuggestions"),
  };
}
