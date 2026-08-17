"use client";

// Slice 3 — proposal comparison. Reads live from the case's existing
// contractor records (see domain/operatorCaseState.ts's proposalContractors)
// — there is no separate proposal/comparison data store, so editing a
// contractor's price/approach/etc. in the Slice 2 editor above is reflected
// here automatically on the next render. This component owns only three
// pieces of its own state: the free-text "Key differences", "Questions
// still unresolved" and "RepairScope note" fields, which the caller persists
// as part of the same per-case OperatorCaseState.
//
// Deliberately no winner/ranking/scoring of any kind — see the module's own
// task scope. Proposals with fundamentally different scope (e.g. "replace
// now" vs "inspect first") are shown side by side without being forced into
// a false apples-to-apples comparison.

import { proposalContractors, type OperatorContractor } from "@/domain/operatorCaseState";

const NOT_STATED = "Not stated";

function textOrNotStated(value: string | undefined): string {
  return value && value.trim() !== "" ? value : NOT_STATED;
}

function formatHkDollars(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK")}`;
}

/** Matches the exact presentation the task specifies: "HK$1,500 fixed",
 * "HK$1,500 estimate", "HK$1,500–2,500", "No price yet" — no midpoint, no
 * average, no normalization across price types. */
function formatProposalPrice(contractor: OperatorContractor): string {
  switch (contractor.priceType) {
    case "no-price":
      return "No price yet";
    case "fixed":
      return typeof contractor.price === "number" ? `${formatHkDollars(contractor.price)} fixed` : NOT_STATED;
    case "estimate":
      return typeof contractor.price === "number" ? `${formatHkDollars(contractor.price)} estimate` : NOT_STATED;
    case "range":
      return typeof contractor.priceMin === "number" && typeof contractor.priceMax === "number"
        ? `${formatHkDollars(contractor.priceMin)}–${formatHkDollars(contractor.priceMax)}`
        : NOT_STATED;
    default:
      return NOT_STATED;
  }
}

function formatGuarantee(contractor: OperatorContractor): string {
  if (contractor.guaranteeStatus === "yes") {
    return contractor.guaranteeDetails && contractor.guaranteeDetails.trim() !== ""
      ? `Yes — ${contractor.guaranteeDetails}`
      : "Yes";
  }
  if (contractor.guaranteeStatus === "no") return "No";
  return NOT_STATED;
}

function contractorHeading(contractor: OperatorContractor): string {
  const name = contractor.name.trim() || "Unnamed contractor";
  return contractor.trade ? `${name} · ${contractor.trade}` : name;
}

// Row order matches the task's own "Likely rows" list, minus a separate
// "Price type" row — the single Price row already states the type inline
// (see formatProposalPrice/PRICE PRESENTATION in the task) — and minus an
// "Inspection needed" row: a contractor with responseType "proposal
// provided" never carries inspectionRequirement (see applyContractorPatch's
// conditional clearing), so that row would always read "Not stated" for
// every contractor in every case. Any inspection nuance the contractor
// actually mentioned remains visible via "Original contractor response".
const COMPARISON_ROWS: { label: string; render: (contractor: OperatorContractor) => string }[] = [
  { label: "Proposed approach", render: (c) => textOrNotStated(c.proposedApproach) },
  { label: "Price", render: formatProposalPrice },
  { label: "What's included", render: (c) => textOrNotStated(c.inclusions) },
  { label: "What's excluded", render: (c) => textOrNotStated(c.exclusions) },
  { label: "What could change the price", render: (c) => textOrNotStated(c.priceChangeFactors) },
  { label: "Expected duration", render: (c) => textOrNotStated(c.expectedDuration) },
  { label: "Earliest start", render: (c) => textOrNotStated(c.earliestStart) },
  { label: "Guarantee", render: formatGuarantee },
  { label: "Original contractor response", render: (c) => textOrNotStated(c.originalResponse) },
];

function proposalCountMessage(proposalCount: number, totalCount: number): string {
  if (proposalCount === 0) return "No contractor proposals have been recorded yet.";
  if (proposalCount === 1) return "One proposal has been recorded. Add another proposal to compare.";
  return `${proposalCount} of ${totalCount} contractor${totalCount === 1 ? "" : "s"} have provided proposals.`;
}

export function ProposalComparison({
  contractors,
  keyDifferences,
  unresolvedQuestions,
  repairScopeNote,
  onKeyDifferencesChange,
  onUnresolvedQuestionsChange,
  onRepairScopeNoteChange,
}: {
  contractors: OperatorContractor[];
  keyDifferences: string;
  unresolvedQuestions: string;
  repairScopeNote: string;
  onKeyDifferencesChange: (value: string) => void;
  onUnresolvedQuestionsChange: (value: string) => void;
  onRepairScopeNoteChange: (value: string) => void;
}) {
  const proposals = proposalContractors(contractors);

  return (
    <div className="op-comparison">
      <p className="op-comparison__hint">{proposalCountMessage(proposals.length, contractors.length)}</p>

      {proposals.length > 0 && (
        <div className="op-comparison-table-wrap">
          <table className="op-comparison-table">
            <thead>
              <tr>
                <th scope="col">Contractor</th>
                {proposals.map((contractor) => (
                  <th key={contractor.id} scope="col">
                    {contractorHeading(contractor)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {proposals.map((contractor) => (
                    <td key={contractor.id}>{row.render(contractor)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label>
        Key differences
        <textarea
          value={keyDifferences}
          onChange={(event) => onKeyDifferencesChange(event.target.value)}
          placeholder="What actually differs between these proposals, and why it matters…"
        />
      </label>
      <label>
        Questions still unresolved
        <textarea
          value={unresolvedQuestions}
          onChange={(event) => onUnresolvedQuestionsChange(event.target.value)}
          placeholder="What do we still need to confirm before the owner can decide?"
        />
      </label>
      <label>
        RepairScope note
        <textarea
          value={repairScopeNote}
          onChange={(event) => onRepairScopeNoteChange(event.target.value)}
          placeholder="Neutral context only…"
        />
      </label>
      <p className="op-panel__hint">
        Record neutral context only. Do not state that a cause or diagnosis is confirmed unless it actually is.
      </p>
    </div>
  );
}
