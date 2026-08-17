"use client";

// Repurposes /contractor/respond/[token] for the new HK contractor
// prototype (Commit B — see ContractorResponseForm.tsx's own comment).
// There is no production token/invitation architecture yet, so `token`
// here is treated purely as a demo case reference — "demo-token" aliases
// the same RS-MOCK01 fixture the rest of the app's demos use. This route
// only ever renders in local/mock mode (isApiDataSource() gates it, same
// as the other legacy-adjacent surfaces cleaned up in Commit A); in real
// API mode it must not become an unauthenticated way to look up a real
// case, so it shows the same "not available" notice instead.

import { useEffect, useState } from "react";
import { PageIntro, StatusPill } from "@/components/SiteShell";
import { isApiDataSource, LegacyDemoNotice } from "@/components/LegacyDemoNotice";
import { buildStage1ContractorBrief, type Stage1ContractorBrief } from "@/domain/stage1ContractorBrief";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import { ContractorResponseForm } from "./ContractorResponseForm";

const DEMO_TOKEN_ALIASES: Record<string, string> = {
  "demo-token": "RS-MOCK01",
};

type LoadState =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "ready"; brief: Stage1ContractorBrief };

export function ContractorResponseRoute({ token }: { token: string }) {
  if (isApiDataSource()) {
    return <LegacyDemoNotice title="Contractor response" />;
  }
  return <ContractorResponseRouteContent token={token} />;
}

function ContractorResponseRouteContent({ token }: { token: string }) {
  const service = useOperatorSubmissionService();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const caseReference = DEMO_TOKEN_ALIASES[token] ?? token;

  useEffect(() => {
    let cancelled = false;
    service
      .list()
      .then((summaries) => {
        const match = summaries.find((summary) => summary.publicReference === caseReference);
        if (!match) throw new Error("not found");
        return service.get(match.id);
      })
      .then((detail) => {
        if (cancelled) return;
        const brief = buildStage1ContractorBrief(
          { issueCategory: detail.issueCategory, generatedBrief: detail.generatedBrief, safetyFlags: detail.safetyFlags },
          "en",
        );
        setState({ phase: "ready", brief });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ phase: "not-found" });
      });
    return () => {
      cancelled = true;
    };
  }, [service, caseReference]);

  if (state.phase === "loading") {
    return <p role="status">Opening this invitation…</p>;
  }

  if (state.phase === "not-found") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="This invitation is not available."
          description="The link may be out of date. Local/demo mode only recognises the demo case."
          aside={<StatusPill tone="neutral">Invitation unavailable</StatusPill>}
        />
      </main>
    );
  }

  return (
    <main className="content-page">
      <PageIntro
        eyebrow="Contractor response"
        title="Tell RepairScope how you'd like to respond."
        description="This takes a couple of minutes. Other contractors cannot see your response, price or identity."
        aside={<StatusPill tone="neutral">No account required</StatusPill>}
      />
      <ContractorResponseForm brief={state.brief} />
    </main>
  );
}
