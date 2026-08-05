"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import type { IdentityTokenProvider } from "./IdentityTokenProvider";

/**
 * Real Clerk-backed IdentityTokenProvider. Clerk's own useAuth().getToken
 * always re-reads the live, Clerk-managed session — this wrapper adds no
 * caching or storage of its own, so every call reflects the current
 * sign-in state without ever holding onto a token itself.
 */
export function useIdentityTokenProvider(): IdentityTokenProvider {
  const { getToken } = useAuth();

  return useMemo<IdentityTokenProvider>(
    () => ({
      getToken: () => getToken(),
    }),
    [getToken],
  );
}
