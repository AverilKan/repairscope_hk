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

/**
 * Mock data source (the default for local dev and every existing
 * unit/Playwright test) has its own self-contained, Clerk-free fixture
 * data and mock auth scenario (see services/mock.ts) — it was never meant
 * to be reachable only via a real Clerk session. The real gate only
 * applies once the app is actually talking to the real API (and therefore
 * real Clerk-verified accounts).
 */
function usesRealIdentity(): boolean {
  return (process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock") === "api";
}

const MOCK_DATA_SOURCE_USER: CurrentRepairScopeUser = {
  id: "mock-landlord",
  displayName: null,
  primaryEmail: null,
  capabilities: [],
  accountMemberships: [],
};

/**
 * UX boundary only. FastAPI (get_current_principal, see
 * apps/api/app/auth/dependencies.py) remains the real security boundary —
 * this component exists so a signed-out or suspended visitor sees an
 * appropriate state instead of a workspace that then fails every request,
 * not to enforce authorization itself.
 */
export function LandlordAccountGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserService = useCurrentUserService();

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "active"; user: CurrentRepairScopeUser }
    | { status: "forbidden" }
    | { status: "error" }
  >(() =>
    usesRealIdentity() ? { status: "loading" } : { status: "active", user: MOCK_DATA_SOURCE_USER },
  );

  useEffect(() => {
    if (!usesRealIdentity()) return;
    if (!isLoaded) return;
    if (!isSignedIn) {
      const returnPath = encodeURIComponent(pathname ?? "/landlord/repairs");
      router.push(`/sign-in?redirect_url=${returnPath}`);
      return;
    }

    let cancelled = false;
    currentUserService
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ status: "active", user });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof CurrentUserUnauthenticatedError) {
          const returnPath = encodeURIComponent(pathname ?? "/landlord/repairs");
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
          <p className="eyebrow">Landlord account access</p>
          <h1>Checking your account&hellip;</h1>
        </section>
      </main>
    );
  }

  if (state.status === "forbidden") {
    return (
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Landlord account access</p>
          <h1>This account can&rsquo;t access SimpleFix right now</h1>
          <p>
            Your SimpleFix account has been suspended or deactivated. If
            you think this is a mistake, contact support.
          </p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Landlord account access</p>
          <h1>Couldn&rsquo;t load your account</h1>
          <p>
            Something went wrong reaching SimpleFix. Please try again in a
            moment.
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
