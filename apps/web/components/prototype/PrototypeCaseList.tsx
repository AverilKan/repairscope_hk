"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { prototypeCases } from "@/data/prototypeFixtures";
import {
  PROTOTYPE_CASE_STATUS_LABELS,
  readPrototypeCaseState,
  type PrototypeCaseState,
} from "@/domain/prototype/caseState";

export function PrototypeCaseList() {
  // Case status/notes live in localStorage, so they cannot be read during
  // server rendering — load them client-side after mount, same pattern the
  // owner journey uses for its own localStorage-backed state.
  const [states, setStates] = useState<Record<string, PrototypeCaseState> | null>(null);

  useEffect(() => {
    // Deferred via setTimeout(0) rather than setState synchronously in the
    // effect body — matches the same hydration-safe pattern already used
    // by LandlordApp's own localStorage-backed state (LandlordHome).
    const timer = window.setTimeout(() => {
      const next: Record<string, PrototypeCaseState> = {};
      for (const proto of prototypeCases) {
        next[proto.caseReference] = readPrototypeCaseState(proto.caseReference);
      }
      setStates(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <table className="proto-case-list">
      <thead>
        <tr>
          <th>Case</th>
          <th>Category</th>
          <th>District</th>
          <th>Submitted</th>
          <th>Owner / contact</th>
          <th>Status</th>
          <th>Evidence</th>
          <th>Last update</th>
        </tr>
      </thead>
      <tbody>
        {prototypeCases.map((proto) => {
          const state = states?.[proto.caseReference];
          const brief = proto.brief;
          return (
            <tr key={proto.caseReference}>
              <td>
                <Link href={`/prototype/operator/${proto.caseReference}`}>{proto.caseReference}</Link>
              </td>
              <td>{brief.category ?? "—"}</td>
              <td>{brief.propertyDetails?.district ?? "—"}</td>
              <td>{formatTimestamp(proto.submittedAt)}</td>
              <td>{proto.ownerName}</td>
              <td>
                <span className={`proto-status-pill proto-status-pill--${state?.status ?? "new"}`}>
                  {PROTOTYPE_CASE_STATUS_LABELS[state?.status ?? "new"]}
                </span>
              </td>
              <td>{brief.hasEvidence === "yes" ? "Yes" : brief.hasEvidence === "no" ? "No" : "—"}</td>
              <td>{state ? lastUpdateSummary(state) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}

function lastUpdateSummary(state: PrototypeCaseState): string {
  const bits: string[] = [];
  if (state.internalNotes.trim()) bits.push("notes");
  if (state.contractors.length > 0) bits.push(`${state.contractors.length} contractor(s)`);
  if (state.nextAction.trim()) bits.push("next action set");
  return bits.length > 0 ? bits.join(" · ") : "No activity yet";
}
