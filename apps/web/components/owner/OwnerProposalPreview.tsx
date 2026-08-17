"use client";

// The owner proposal-return preview (RepairScope HK — "frontend structure"
// phase, Commit C). A pure presentation component: it receives clean props
// (case reference, already-filtered proposal-providing contractors as
// OwnerVisibleProposal, and the founder's own written notes) and knows
// nothing about operator localStorage, OperatorGate, backend status
// controls, or operator notes — see domain/contractorResponse.ts's
// OwnerVisibleProposal for the structural guarantee that operator-only
// fields (contactReference/status/notes) can never even be passed in. This
// makes the component reusable later once proposal data is server-backed —
// only the wrapper that supplies its props needs to change.
//
// UX: proposal cards first → view an individual proposal → optional
// side-by-side comparison (reusing ProposalComparisonTable from Slice 3 —
// no second proposal-comparison implementation) → the founder's own
// neutral explanation. No ranking, no automatic recommendation, no
// selection/acceptance workflow — see the task's own hard boundaries.

import { useState } from "react";
import {
  ProposalComparisonTable,
  formatGuarantee,
  formatProposalPrice,
  textOrNotStated,
} from "@/components/operator/ProposalComparison";
import type { OwnerVisibleProposal } from "@/domain/contractorResponse";

export function OwnerProposalPreview({
  caseReference,
  proposals,
  keyDifferences,
  unresolvedQuestions,
  repairScopeNote,
}: {
  caseReference: string;
  proposals: OwnerVisibleProposal[];
  keyDifferences: string;
  unresolvedQuestions: string;
  repairScopeNote: string;
}) {
  const [view, setView] = useState<"cards" | "compare">("cards");
  const [openId, setOpenId] = useState<string | null>(null);

  const hasNotes = Boolean(keyDifferences.trim() || unresolvedQuestions.trim() || repairScopeNote.trim());

  return (
    <div className="owner-proposal-preview">
      <header className="owner-proposal-preview__header">
        <h1>Proposals received</h1>
        <p className="owner-proposal-preview__case">{caseReference}</p>
      </header>

      {proposals.length === 0 && <p className="owner-proposal-preview__empty">No proposals have been recorded yet.</p>}

      {proposals.length > 0 && (
        <>
          <div className="owner-proposal-preview__toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
              Proposal cards
            </button>
            <button type="button" aria-pressed={view === "compare"} onClick={() => setView("compare")}>
              Compare side by side
            </button>
          </div>

          {view === "cards" && (
            <div className="owner-proposal-cards">
              {proposals.map((proposal) => (
                <OwnerProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  open={openId === proposal.id}
                  onToggle={() => setOpenId((current) => (current === proposal.id ? null : proposal.id))}
                />
              ))}
            </div>
          )}

          {view === "compare" && <ProposalComparisonTable contractors={proposals} />}
        </>
      )}

      {hasNotes && (
        <section className="owner-proposal-preview__notes" aria-label="RepairScope's explanation">
          <h2>What RepairScope can tell you</h2>
          {keyDifferences.trim() && (
            <div>
              <h3>Key differences</h3>
              <p>{keyDifferences}</p>
            </div>
          )}
          {unresolvedQuestions.trim() && (
            <div>
              <h3>Questions still unresolved</h3>
              <p>{unresolvedQuestions}</p>
            </div>
          )}
          {repairScopeNote.trim() && (
            <div>
              <h3>RepairScope note</h3>
              <p>{repairScopeNote}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function OwnerProposalCard({
  proposal,
  open,
  onToggle,
}: {
  proposal: OwnerVisibleProposal;
  open: boolean;
  onToggle: () => void;
}) {
  const name = proposal.name.trim() || "Unnamed contractor";
  return (
    <div className="owner-proposal-card">
      <div className="owner-proposal-card__heading">
        {name}
        {proposal.trade ? <span className="owner-proposal-card__trade"> · {proposal.trade}</span> : null}
      </div>
      <p className="owner-proposal-card__price">{formatProposalPrice(proposal)}</p>
      <p className="owner-proposal-card__approach">{textOrNotStated(proposal.proposedApproach)}</p>
      <dl className="owner-proposal-card__facts">
        <div>
          <dt>Duration</dt>
          <dd>{textOrNotStated(proposal.expectedDuration)}</dd>
        </div>
        <div>
          <dt>Earliest start</dt>
          <dd>{textOrNotStated(proposal.earliestStart)}</dd>
        </div>
        <div>
          <dt>Guarantee</dt>
          <dd>{formatGuarantee(proposal)}</dd>
        </div>
      </dl>
      <button type="button" onClick={onToggle}>
        {open ? "Hide details" : "View proposal"}
      </button>
      {open && (
        <dl className="owner-proposal-card__detail">
          <div>
            <dt>What&apos;s included</dt>
            <dd>{textOrNotStated(proposal.inclusions)}</dd>
          </div>
          <div>
            <dt>What&apos;s excluded</dt>
            <dd>{textOrNotStated(proposal.exclusions)}</dd>
          </div>
          <div>
            <dt>What could change the price</dt>
            <dd>{textOrNotStated(proposal.priceChangeFactors)}</dd>
          </div>
          <div>
            <dt>Original contractor response</dt>
            <dd>{textOrNotStated(proposal.originalResponse)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
