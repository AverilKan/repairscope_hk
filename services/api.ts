import type { RepairScopeServices } from "./contracts";

export type RepairScopeApiConfig = {
  baseUrl: string;
};

/**
 * Backend integration seam. Claude can replace this placeholder with fetch
 * adapters without changing any component imports.
 */
export function createApiRepairScopeServices(
  config: RepairScopeApiConfig,
): RepairScopeServices {
  void config;
  throw new Error(
    "The RepairScope API adapter is intentionally not implemented in this frontend-only export.",
  );
}
