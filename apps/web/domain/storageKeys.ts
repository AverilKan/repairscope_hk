function safeId(value: string) {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error("Storage keys require a stable SimpleFix identifier.");
  }
  return id;
}

export function getRepairDraftStorageKey(repairId: string) {
  return `repairscope:repair:${safeId(repairId)}:draft`;
}

export function getRepairOwnerStorageKey(repairId: string) {
  return `repairscope:repair:${safeId(repairId)}:owner`;
}

