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
import type { OwnerVisibleProposal } from "@/domain/contractorResponse";
import { localize, lt, type Lang, type LocalizedText } from "@/domain/i18n";

// The formatting helpers, COMPARISON_ROWS and ProposalComparisonTable below
// are typed against OwnerVisibleProposal (a narrower Pick<> over
// OperatorContractor — see domain/contractorResponse.ts) rather than the
// full OperatorContractor, purely so they type-check for both the operator
// comparison (real OperatorContractor values, which structurally satisfy
// the narrower shape) and the owner preview (Commit C, which only ever
// holds OwnerVisibleProposal values and must never even have the
// opportunity to read contactReference/status/notes).

const NOT_STATED: LocalizedText = lt("未提供", "Not stated");

// The following formatting helpers and ProposalComparisonTable are
// exported so the owner-facing preview (components/owner/OwnerProposalPreview.tsx,
// Commit C) can render the exact same "compare side by side" view without
// a second proposal-comparison implementation — see that component's own
// comment.
//
// LOCALIZATION (HK follow-up pass): every helper below takes an optional
// `lang` parameter that defaults to "en" — this preserves
// OwnerProposalPreview's existing (unchanged) English behavior for every
// call site that doesn't pass one, while letting ProposalComparison (the
// operator surface) pass `lang="zh"` explicitly. The underlying values
// (price semantics, guarantee status, row ordering) are untouched — only
// the label/text presentation is language-aware.

export function textOrNotStated(value: string | undefined, lang: Lang = "en"): string {
  return value && value.trim() !== "" ? value : localize(NOT_STATED, lang);
}

export function formatHkDollars(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK")}`;
}

/** Matches the exact presentation the task specifies: "HK$1,500 fixed",
 * "HK$1,500 estimate", "HK$1,500–2,500", "No price yet" — no midpoint, no
 * average, no normalization across price types. */
export function formatProposalPrice(contractor: OwnerVisibleProposal, lang: Lang = "en"): string {
  switch (contractor.priceType) {
    case "no-price":
      return localize(lt("暫時未能報價", "No price yet"), lang);
    case "fixed":
      return typeof contractor.price === "number"
        ? localize(lt(`${formatHkDollars(contractor.price)}（固定價格）`, `${formatHkDollars(contractor.price)} fixed`), lang)
        : localize(NOT_STATED, lang);
    case "estimate":
      return typeof contractor.price === "number"
        ? localize(lt(`${formatHkDollars(contractor.price)}（估算價格）`, `${formatHkDollars(contractor.price)} estimate`), lang)
        : localize(NOT_STATED, lang);
    case "range":
      return typeof contractor.priceMin === "number" && typeof contractor.priceMax === "number"
        ? `${formatHkDollars(contractor.priceMin)}–${formatHkDollars(contractor.priceMax)}`
        : localize(NOT_STATED, lang);
    default:
      return localize(NOT_STATED, lang);
  }
}

export function formatGuarantee(contractor: OwnerVisibleProposal, lang: Lang = "en"): string {
  if (contractor.guaranteeStatus === "yes") {
    return contractor.guaranteeDetails && contractor.guaranteeDetails.trim() !== ""
      ? localize(lt(`有 — ${contractor.guaranteeDetails}`, `Yes — ${contractor.guaranteeDetails}`), lang)
      : localize(lt("有", "Yes"), lang);
  }
  if (contractor.guaranteeStatus === "no") return localize(lt("沒有", "No"), lang);
  return localize(NOT_STATED, lang);
}

export function contractorHeading(contractor: OwnerVisibleProposal, lang: Lang = "en"): string {
  const name = contractor.name.trim() || localize(lt("未命名師傅", "Unnamed contractor"), lang);
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
export const COMPARISON_ROWS: { label: LocalizedText; render: (contractor: OwnerVisibleProposal, lang?: Lang) => string }[] = [
  { label: lt("建議處理方法", "Proposed approach"), render: (c, lang) => textOrNotStated(c.proposedApproach, lang) },
  { label: lt("價格", "Price"), render: formatProposalPrice },
  { label: lt("包括項目", "What's included"), render: (c, lang) => textOrNotStated(c.inclusions, lang) },
  { label: lt("不包括項目", "What's excluded"), render: (c, lang) => textOrNotStated(c.exclusions, lang) },
  {
    label: lt("可能影響價格的因素", "What could change the price"),
    render: (c, lang) => textOrNotStated(c.priceChangeFactors, lang),
  },
  { label: lt("預計工期", "Expected duration"), render: (c, lang) => textOrNotStated(c.expectedDuration, lang) },
  { label: lt("最早可開始時間", "Earliest start"), render: (c, lang) => textOrNotStated(c.earliestStart, lang) },
  { label: lt("保養", "Guarantee"), render: formatGuarantee },
  {
    label: lt("師傅原本的回覆", "Original contractor response"),
    render: (c, lang) => textOrNotStated(c.originalResponse, lang),
  },
];

// LOCALIZATION (HK validation-pilot pass): proposalCountMessage and the
// three editable notes fields below are operator-only chrome — never
// rendered by components/owner/OwnerProposalPreview.tsx (it shows the
// SAME note text read-only, via its own headings, not these labels) — so
// these are safely in scope. ProposalComparisonTable/COMPARISON_ROWS and
// the format* helpers above ARE reused directly by OwnerProposalPreview
// to render actual owner-visible proposal content, which is out of this
// pass's scope (see the module comment on OwnerProposalPreview and this
// session's final report for that boundary call) — left untouched.
function proposalCountMessage(proposalCount: number, totalCount: number): string {
  if (proposalCount === 0) return "暫時未有記錄任何師傅報價。";
  if (proposalCount === 1) return "已經記錄一個報價，需要多於一個報價才可以比較。";
  return `${totalCount} 位師傅之中，${proposalCount} 位已提供報價。`;
}

/** Just the topic × contractor table — no count message, no editable
 * notes. Reused by ProposalComparison (operator) and OwnerProposalPreview
 * (owner, Commit C) so there is exactly one comparison table
 * implementation. Renders nothing when `contractors` is empty; the caller
 * decides what empty-state message (if any) belongs above it.
 *
 * `lang` defaults to "en" — OwnerProposalPreview does not pass one, so
 * owner-visible rendering is byte-for-byte unchanged by this prop's
 * addition. The operator's own ProposalComparison passes `lang="zh"`. */
export function ProposalComparisonTable({
  contractors,
  lang = "en",
}: {
  contractors: OwnerVisibleProposal[];
  lang?: Lang;
}) {
  if (contractors.length === 0) return null;
  return (
    <div className="op-comparison-table-wrap">
      <table className="op-comparison-table">
        <thead>
          <tr>
            <th scope="col">{localize(lt("師傅", "Contractor"), lang)}</th>
            {contractors.map((contractor) => (
              <th key={contractor.id} scope="col">
                {contractorHeading(contractor, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row) => (
            <tr key={row.label.en}>
              <th scope="row">{localize(row.label, lang)}</th>
              {contractors.map((contractor) => (
                <td key={contractor.id}>{row.render(contractor, lang)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

      <ProposalComparisonTable contractors={proposals} lang="zh" />

      <label>
        主要分別
        <textarea
          value={keyDifferences}
          onChange={(event) => onKeyDifferencesChange(event.target.value)}
          placeholder="這些報價實際上有什麼分別，以及為何重要…"
        />
      </label>
      <label>
        仍需確認的問題
        <textarea
          value={unresolvedQuestions}
          onChange={(event) => onUnresolvedQuestionsChange(event.target.value)}
          placeholder="業主決定之前，還有什麼需要確認？"
        />
      </label>
      <label>
        修理易備註
        <textarea
          value={repairScopeNote}
          onChange={(event) => onRepairScopeNoteChange(event.target.value)}
          placeholder="只填寫中立的背景資料…"
        />
      </label>
      <p className="op-panel__hint">
        只記錄中立的背景資料。除非已經確定，否則不要斷定成因或診斷已經確認。
      </p>
    </div>
  );
}
