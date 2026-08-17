// A small, shared "not available in this mode" screen for the old UK
// reference-prototype procurement routes (list/status/responses/selection/
// confirmation/progress/completed, and the standalone /contractor,
// /contractor/quotes landing pages). Those routes still render real,
// working UI — but against mock/fixture data entirely disconnected from
// real HK owner cases and the current OperatorContractor model (see the
// reconciliation report). Left reachable in normal API/public mode, they
// would misleadingly present themselves as genuine RepairScope
// functionality. This notice replaces their content ONLY when
// NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api; in local/mock mode (the default)
// they continue to render exactly as before, so the reference UI remains
// inspectable without being deleted.
import { PageIntro, StatusPill } from "./SiteShell";

export function LegacyDemoNotice({ title }: { title: string }) {
  return (
    <main className="content-page">
      <PageIntro
        eyebrow="Reference prototype"
        title={title}
        description="This screen is part of an earlier reference prototype and is not connected to real RepairScope cases. It is only shown in local/demo mode."
        aside={<StatusPill tone="neutral">Not available</StatusPill>}
      />
    </main>
  );
}

/** Mirrors the (process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock")
 * === "api" check already duplicated at each real/mock decision point in
 * this codebase (OperatorGate, LandlordAccountGate, useOperatorSubmissionService)
 * — kept as its own tiny inline-style function here rather than factored
 * into a fourth shared module, matching the existing per-file convention. */
export function isApiDataSource(): boolean {
  return (process.env.NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE ?? "mock") === "api";
}
