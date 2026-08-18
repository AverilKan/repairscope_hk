"use client";

import { useMemo } from "react";
import { useIdentityTokenProvider } from "@/services/identity/useIdentityTokenProvider";
import {
  ApiContractorRequestOperatorService,
  type ContractorRequestOperatorService,
} from "./ContractorRequestOperatorService";

/** Only ever used in real API mode (NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api)
 * — there is no mock fixture model for contractor_requests (mock-mode
 * submissions have no real backend id to attach one to), so
 * components/operator/OperatorCaseWorkspace.tsx gates the "Send request
 * link" controls behind isApiDataSource() rather than this hook branching
 * internally. Same Clerk-backed Bearer wiring as
 * services/operator/useOperatorSubmissionService.ts's API branch. */
export function useContractorRequestOperatorService(): ContractorRequestOperatorService {
  const tokenProvider = useIdentityTokenProvider();
  const baseUrl = process.env.NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL ?? "";

  return useMemo(
    () => new ApiContractorRequestOperatorService(baseUrl, tokenProvider),
    [baseUrl, tokenProvider],
  );
}
