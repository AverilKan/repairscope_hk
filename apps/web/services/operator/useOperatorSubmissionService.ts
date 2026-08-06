"use client";

import { useMemo } from "react";
import { useIdentityTokenProvider } from "@/services/identity/useIdentityTokenProvider";
import { ApiOperatorSubmissionService, type OperatorSubmissionService } from "./OperatorSubmissionService";
import { MockOperatorSubmissionService } from "./MockOperatorSubmissionService";

const mockService = new MockOperatorSubmissionService();

function usesRealIdentity(): boolean {
  return (process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock") === "api";
}

export function useOperatorSubmissionService(): OperatorSubmissionService {
  const tokenProvider = useIdentityTokenProvider();
  const baseUrl = process.env.NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL ?? "";

  return useMemo(() => {
    if (!usesRealIdentity()) return mockService;
    return new ApiOperatorSubmissionService(baseUrl, tokenProvider);
  }, [baseUrl, tokenProvider]);
}
