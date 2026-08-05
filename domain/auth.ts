import type { UserCapability } from "./procurement";

export interface RepairScopeIdentity {
  userId: string;
  emailVerified: boolean;
  capabilities: UserCapability[];
  permittedRepairIds: string[];
}

export type RepairAccessDecision =
  | "sign_in_required"
  | "verification_required"
  | "capability_required"
  | "access_denied"
  | "allowed";

export function repairAccessDecision({
  identity,
  repairId,
}: {
  identity?: RepairScopeIdentity | null;
  repairId: string;
}): RepairAccessDecision {
  if (!identity) return "sign_in_required";
  if (!identity.emailVerified) return "verification_required";
  if (!identity.capabilities.includes("landlord")) {
    return "capability_required";
  }
  if (!identity.permittedRepairIds.includes(repairId)) {
    return "access_denied";
  }
  return "allowed";
}
