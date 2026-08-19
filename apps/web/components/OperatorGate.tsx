"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import {
  CurrentUserForbiddenError,
  CurrentUserUnauthenticatedError,
  type CurrentRepairScopeUser,
} from "@/services/identity/CurrentUserService";
import { useCurrentUserService } from "@/services/identity/useCurrentUserService";

/** Same mock-mode bypass rationale as LandlordAccountGate — mock mode has
 * no real Clerk session and was never meant to require one. */
function usesRealIdentity(): boolean {
  return (process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock") === "api";
}

const MOCK_DATA_SOURCE_OPERATOR: CurrentRepairScopeUser = {
  id: "mock-operator",
  displayName: null,
  primaryEmail: null,
  capabilities: [
    { capability: "operator", source: "system", grantedAt: new Date().toISOString() },
  ],
  accountMemberships: [],
};

function hasOperatorCapability(user: CurrentRepairScopeUser): boolean {
  return user.capabilities.some((c) => c.capability === "operator");
}

/**
 * UX boundary only, same as LandlordAccountGate — FastAPI's
 * AuthorizationService.require_operator (see apps/api/app/api/routes/
 * repair_submissions.py) remains the real security boundary. This exists so
 * a signed-out or non-operator visitor sees an appropriate state instead of
 * a screen that then fails every request.
 */
export function OperatorGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserService = useCurrentUserService();

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "active" }
    | { status: "forbidden" }
    | { status: "error" }
  >(() =>
    usesRealIdentity()
      ? { status: "loading" }
      : hasOperatorCapability(MOCK_DATA_SOURCE_OPERATOR)
        ? { status: "active" }
        : { status: "forbidden" },
  );

  useEffect(() => {
    if (!usesRealIdentity()) return;
    if (!isLoaded) return;
    if (!isSignedIn) {
      const returnPath = encodeURIComponent(pathname ?? "/operator");
      router.push(`/sign-in?redirect_url=${returnPath}`);
      return;
    }

    let cancelled = false;
    currentUserService
      .getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        setState(hasOperatorCapability(user) ? { status: "active" } : { status: "forbidden" });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof CurrentUserUnauthenticatedError) {
          const returnPath = encodeURIComponent(pathname ?? "/operator");
          router.push(`/sign-in?redirect_url=${returnPath}`);
          return;
        }
        if (error instanceof CurrentUserForbiddenError) {
          setState({ status: "forbidden" });
          return;
        }
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentUserService is re-created per render; re-running on every render would loop.
  }, [isLoaded, isSignedIn, pathname, router]);

  if (state.status === "loading") {
    return (
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Operator review</p>
          <h1>Checking access&hellip;</h1>
        </section>
      </main>
    );
  }

  if (state.status === "forbidden") {
    return (
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Operator review</p>
          <h1>This account doesn&rsquo;t have operator access</h1>
          <p>Sign in with an operator account to review submissions.</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Operator review</p>
          <h1>Couldn&rsquo;t load your account</h1>
          <p>Something went wrong reaching SimpleFix. Please try again in a moment.</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
