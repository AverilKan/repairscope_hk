"use client";

// /contractor/respond/[token] — two entirely separate code paths.
//
// MOCK MODE (NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE unset or "mock"):
// unchanged from Commit B — `token` is treated purely as a demo case
// reference ("demo-token" aliases the RS-MOCK01 fixture), fetched via the
// existing mock-aware useOperatorSubmissionService(), built into a brief
// via the original buildStage1ContractorBrief({issueCategory,
// generatedBrief}) call. Still never talks to a real backend.
//
// REAL API MODE (T2 Commit 2): `token` is a real, high-entropy contractor
// request bearer secret. This path calls ONLY the public, unauthenticated
// T1 endpoints (services/contractor/ContractorRequestPublicService.ts) —
// no repair-submissions list/get, no operator endpoints, no RS reference
// lookup. The public GET response is the sole data source for what this
// page renders; see domain/stage1SnapshotAdapter.ts for how its
// controlled-ID-only Stage1SnapshotV1 becomes the same Stage1ContractorBrief
// shape the (already twice-audited) form already renders. There is no
// fallback to mock/demo data if the real API call fails — a network error
// shows a truthful "couldn't load" state, never fixture content.

import { useEffect, useState } from "react";
import { PageIntro, StatusPill } from "@/components/SiteShell";
import { isApiDataSource } from "@/components/LegacyDemoNotice";
import { useLanguage } from "@/components/LanguageContext";
import { buildStage1ContractorBrief, type Stage1ContractorBrief } from "@/domain/stage1ContractorBrief";
import { stage1ContractorBriefFromSnapshot } from "@/domain/stage1SnapshotAdapter";
import {
  ContractorRequestNotFoundError,
  ContractorRequestUnsupportedStage1VersionError,
} from "@/domain/contractorRequestPublic";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import { useContractorRequestPublicService } from "@/services/contractor/useContractorRequestPublicService";
import { ContractorResponseForm } from "./ContractorResponseForm";

const DEMO_TOKEN_ALIASES: Record<string, string> = {
  "demo-token": "RS-MOCK01",
};

export function ContractorResponseRoute({ token }: { token: string }) {
  if (isApiDataSource()) {
    return <RealContractorResponseRoute token={token} />;
  }
  return <MockContractorResponseRouteContent token={token} />;
}

// --- Mock mode (unchanged) -------------------------------------------

type MockLoadState =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "ready"; brief: Stage1ContractorBrief };

function MockContractorResponseRouteContent({ token }: { token: string }) {
  const service = useOperatorSubmissionService();
  const [state, setState] = useState<MockLoadState>({ phase: "loading" });
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
          { issueCategory: detail.issueCategory, generatedBrief: detail.generatedBrief },
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

// --- Real API mode (T2 Commit 2) --------------------------------------

type RealLoadState =
  | { phase: "loading" }
  | { phase: "invalid" }
  | { phase: "unsupported" }
  | { phase: "network-error" }
  | { phase: "open"; brief: Stage1ContractorBrief }
  | { phase: "responded" }
  | { phase: "inactive" }; // revoked or expired — see module comment: not
  // useful/actionable for the contractor to distinguish, matches the
  // architecture review's own "no need to distinguish" decision.

function RealContractorResponseRoute({ token }: { token: string }) {
  const service = useContractorRequestPublicService();
  const { lang } = useLanguage();
  const [state, setState] = useState<RealLoadState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    service
      .getRequest(token)
      .then((view) => {
        if (cancelled) return;
        switch (view.status) {
          case "open":
            setState(
              view.stage1
                ? { phase: "open", brief: stage1ContractorBriefFromSnapshot(view.stage1, lang) }
                : { phase: "invalid" },
            );
            return;
          case "responded":
            setState({ phase: "responded" });
            return;
          case "revoked":
          case "expired":
            setState({ phase: "inactive" });
            return;
          default:
            setState({ phase: "invalid" });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setState(
          error instanceof ContractorRequestNotFoundError
            ? { phase: "invalid" }
            : error instanceof ContractorRequestUnsupportedStage1VersionError
              ? { phase: "unsupported" }
              : { phase: "network-error" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [service, token, lang]);

  if (state.phase === "loading") {
    return <p role="status">Opening this invitation…</p>;
  }

  if (state.phase === "invalid") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="This link isn't valid."
          description="The link may be out of date or mistyped. Ask RepairScope or the person who sent it for a new one."
          aside={<StatusPill tone="neutral">Invitation unavailable</StatusPill>}
        />
      </main>
    );
  }

  if (state.phase === "network-error") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="Couldn't load this invitation."
          description="Something went wrong reaching RepairScope. Please check your connection and try again."
          aside={<StatusPill tone="neutral">Try again</StatusPill>}
        />
      </main>
    );
  }

  if (state.phase === "unsupported") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="This repair request uses a version that this page can't open."
          description="Ask RepairScope or the person who sent the link for help."
          aside={<StatusPill tone="neutral">Unsupported request version</StatusPill>}
        />
      </main>
    );
  }

  if (state.phase === "responded") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="You've already submitted a response for this request."
          description="Thank you — RepairScope has recorded your response."
          aside={<StatusPill tone="neutral">Already responded</StatusPill>}
        />
      </main>
    );
  }

  if (state.phase === "inactive") {
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response"
          title="This link is no longer active."
          description="Ask RepairScope or the person who sent it for a new link."
          aside={<StatusPill tone="neutral">Link unavailable</StatusPill>}
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
      <ContractorResponseForm
        brief={state.brief}
        submission={{
          submit: (payload) => service.submitResponseWithReconciliation(token, payload),
        }}
      />
    </main>
  );
}
