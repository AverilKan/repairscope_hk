import { contractorTaskFixtures } from "@/data/workflowFixtures";
import type {
  ContractorTaskType,
  ResolvedContractorTask,
} from "@/domain/procurement";
import type { ContractorTaskService } from "../contracts";

export class UnknownContractorTokenError extends Error {
  constructor() {
    super("This private invitation link is not valid.");
    this.name = "UnknownContractorTokenError";
  }
}

export class ContractorTaskUnavailableError extends Error {
  constructor(status: ResolvedContractorTask["tokenStatus"]) {
    super(`This private invitation is ${status}.`);
    this.name = "ContractorTaskUnavailableError";
  }
}

export class MockContractorTaskService implements ContractorTaskService {
  async resolveToken(token: string): Promise<ResolvedContractorTask> {
    const task = contractorTaskFixtures[token];
    if (!task) throw new UnknownContractorTokenError();
    return structuredClone(task);
  }
}

export const contractorTaskService = new MockContractorTaskService();

export async function requireContractorTask(
  token: string,
  allowedTypes?: ContractorTaskType[],
): Promise<ResolvedContractorTask> {
  const task = await contractorTaskService.resolveToken(token);
  if (task.tokenStatus !== "valid") {
    throw new ContractorTaskUnavailableError(task.tokenStatus);
  }
  if (allowedTypes && !allowedTypes.includes(task.taskType)) {
    throw new Error("This invitation is not valid for the requested action.");
  }
  return task;
}

