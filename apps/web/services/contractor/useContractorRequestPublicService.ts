"use client";

import { useMemo } from "react";
import {
  ApiContractorRequestPublicService,
  type ContractorRequestPublicService,
} from "./ContractorRequestPublicService";

/** Only ever used in real API mode (NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api)
 * — components/contractor/ContractorResponseRoute.tsx keeps mock mode on
 * its own, entirely separate, unchanged code path (see that file), so
 * there is no mock implementation of this service to switch to. */
export function useContractorRequestPublicService(): ContractorRequestPublicService {
  const baseUrl = process.env.NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL ?? "";
  return useMemo(() => new ApiContractorRequestPublicService(baseUrl), [baseUrl]);
}
