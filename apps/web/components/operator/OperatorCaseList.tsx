"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OperatorSubmissionService } from "@/services/operator/OperatorSubmissionService";
import type { OperatorSubmissionSummary } from "@/domain/operatorSubmission";
import {
  OPERATOR_CASE_STATUS_LABELS,
  readOperatorCaseState,
  type OperatorCaseState,
} from "@/domain/operatorCaseState";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import { StatusPill } from "@/components/SiteShell";

// The real case list — always sourced from the backend via
// OperatorSubmissionService (mock or real API depending on
// NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE; see useOperatorSubmissionService).
// No fixture/demo cases are ever mixed in here — mock mode's own "obviously
// not real" signal is the single MockOperatorSubmissionService fixture
// (RS-MOCK01), not a second parallel set of fake cases layered on top.
export function OperatorCaseList({ service: injectedService }: { service?: OperatorSubmissionService } = {}) {
  // injectedService is a test-only seam (see tests/operator-components.test.tsx)
  // so component tests can stub API responses/failures without a
  // ClerkProvider in the tree — useOperatorSubmissionService transitively
  // calls Clerk's useAuth(), which throws outside <ClerkProvider>, so it
  // must not be called at all when a test override is supplied. Each call
  // site always passes the same thing (a prop, not a value that changes
  // across this instance's renders), so this is safe despite the static
  // lint rule being unable to prove it.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const service = injectedService ?? useOperatorSubmissionService();
  const [submissions, setSubmissions] = useState<OperatorSubmissionSummary[] | null>(null);
  const [error, setError] = useState("");
  // Local operator workflow status/notes live in localStorage — read
  // client-side after mount, same as the owner journey's own
  // localStorage-backed state (see components/LandlordApp.tsx's
  // LandlordHome for the same setTimeout(0)-deferred pattern).
  const [localStates, setLocalStates] = useState<Record<string, OperatorCaseState> | null>(null);

  useEffect(() => {
    let cancelled = false;
    service
      .list()
      .then((result) => {
        if (cancelled) return;
        setSubmissions(result);
        // Deferred via setTimeout(0) rather than setState synchronously
        // within the effect/then body — matches the same hydration-safe
        // pattern already used by LandlordApp's own localStorage-backed
        // state (LandlordHome).
        window.setTimeout(() => {
          if (cancelled) return;
          const next: Record<string, OperatorCaseState> = {};
          for (const submission of result) {
            next[submission.publicReference] = readOperatorCaseState(submission.publicReference);
          }
          setLocalStates(next);
        }, 0);
      })
      .catch(() => {
        if (!cancelled) setError("未能載入 RepairScope 嘅維修個案。");
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

  if (error) {
    return (
      <p className="field-error" role="alert">
        {error}
      </p>
    );
  }

  if (submissions === null) {
    return <p role="status">個案載入緊…</p>;
  }

  if (submissions.length === 0) {
    return <p>暫時未有個案。</p>;
  }

  return (
    <table className="op-case-list">
      <thead>
        <tr>
          <th>個案</th>
          <th>類別</th>
          <th>郵區</th>
          <th>提交時間</th>
          <th>業主／聯絡</th>
          <th>安全</th>
          <th>後台狀態</th>
          <th>本機工作流程狀態</th>
          <th>本機活動</th>
        </tr>
      </thead>
      <tbody>
        {submissions.map((submission) => {
          const local = localStates?.[submission.publicReference];
          return (
            <tr key={submission.id}>
              <td>
                <Link href={`/operator/${submission.publicReference}`}>{submission.publicReference}</Link>
              </td>
              <td>{submission.issueCategory}</td>
              <td>{submission.propertyPostcode ?? "—"}</td>
              <td>{formatTimestamp(submission.createdAt)}</td>
              <td>{submission.landlordName}</td>
              <td>
                {submission.safetyFlags.length > 0 ? (
                  <StatusPill tone="attention">已標記</StatusPill>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <StatusPill tone={backendStatusTone(submission.status)}>{submission.status}</StatusPill>
              </td>
              <td>
                <span className={`op-case-status-pill op-case-status-pill--${local?.status ?? "new"}`}>
                  {OPERATOR_CASE_STATUS_LABELS[local?.status ?? "new"].zh}
                </span>
              </td>
              <td>{local ? localActivitySummary(local) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function backendStatusTone(status: OperatorSubmissionSummary["status"]): "neutral" | "good" | "attention" | "ink" {
  if (status === "pursuing") return "good";
  if (status === "closed") return "neutral";
  if (status === "needs_landlord_information") return "attention";
  return "ink";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}

function localActivitySummary(state: OperatorCaseState): string {
  const bits: string[] = [];
  if (state.internalNotes.trim()) bits.push("已有備註");
  if (state.contractors.length > 0) bits.push(`${state.contractors.length} 位師傅`);
  if (state.nextAction.trim()) bits.push("已定下一步行動");
  return bits.length > 0 ? bits.join(" · ") : "暫時未有本機活動";
}
