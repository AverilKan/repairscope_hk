"use client";

import { useMemo } from "react";
import { ApiCurrentUserService, type CurrentUserService } from "./CurrentUserService";
import { useIdentityTokenProvider } from "./useIdentityTokenProvider";

/**
 * Composition point for CurrentUserService, mirroring services/index.ts's
 * env-driven wiring. Kept separate from RepairScopeServices/repairScopeServices
 * (a module-level singleton built at import time) because this service needs
 * a live Clerk session, which only exists inside a React tree under
 * ClerkProvider — components must go through this hook rather than fetching
 * /api/me directly.
 */
export function useCurrentUserService(): CurrentUserService {
  const tokenProvider = useIdentityTokenProvider();
  const baseUrl = process.env.NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL ?? "";

  return useMemo(
    () => new ApiCurrentUserService(baseUrl, tokenProvider),
    [baseUrl, tokenProvider],
  );
}
