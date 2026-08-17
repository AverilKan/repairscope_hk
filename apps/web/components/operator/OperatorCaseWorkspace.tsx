"use client";

import { useEffect, useState } from "react";
import { GeneratedBriefDocument } from "@/components/GeneratedBriefDocument";
import { ProposalComparison } from "@/components/operator/ProposalComparison";
import { StatusPill } from "@/components/SiteShell";
import { parseContractorResponseExport, type ContractorResponsePayload } from "@/domain/contractorResponse";
import {
  applyContractorPatch,
  createOperatorContractor,
  emptyOperatorCaseState,
  OPERATOR_CASE_STATUS_LABELS,
  OPERATOR_CASE_STATUSES,
  OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS,
  OPERATOR_CONTRACTOR_RESPONSE_TYPES,
  OPERATOR_CONTRACTOR_STATUS_LABELS,
  OPERATOR_CONTRACTOR_STATUSES,
  OPERATOR_GUARANTEE_STATUS_LABELS,
  OPERATOR_GUARANTEE_STATUSES,
  OPERATOR_INSPECTION_REQUIREMENT_LABELS,
  OPERATOR_INSPECTION_REQUIREMENTS,
  OPERATOR_PRICE_TYPE_LABELS,
  OPERATOR_PRICE_TYPES,
  readOperatorCaseState,
  writeOperatorCaseState,
  type OperatorCaseState,
  type OperatorCaseStatus,
  type OperatorContractor,
  type OperatorContractorResponseType,
  type OperatorContractorStatus,
  type OperatorGuaranteeStatus,
  type OperatorInspectionRequirement,
  type OperatorPriceType,
} from "@/domain/operatorCaseState";
import {
  OperatorSubmissionNotFoundError,
  type OperatorSubmissionDetail,
  type SubmissionClosedReason,
  type SubmissionStatus,
} from "@/domain/operatorSubmission";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import type { OperatorSubmissionService } from "@/services/operator/OperatorSubmissionService";

const STATUS_OPTIONS: { value: Exclude<SubmissionStatus, "new">; label: string }[] = [
  { value: "reviewing", label: "Reviewing" },
  { value: "pursuing", label: "Worth pursuing" },
  { value: "needs_landlord_information", label: "Needs landlord information" },
  { value: "closed", label: "Not suitable right now" },
];

const CLOSED_REASON_OPTIONS: { value: SubmissionClosedReason; label: string }[] = [
  { value: "urgent", label: "Urgent — referred elsewhere" },
  { value: "outside_current_scope", label: "Outside current scope" },
  { value: "not_currently_viable", label: "Not currently viable" },
  { value: "outside_service_area", label: "Outside service area" },
  { value: "duplicate", label: "Duplicate submission" },
  { value: "other", label: "Other" },
];

function backendStatusTone(status: SubmissionStatus): "neutral" | "good" | "attention" | "ink" {
  if (status === "pursuing") return "good";
  if (status === "closed") return "neutral";
  if (status === "needs_landlord_information") return "attention";
  return "ink";
}

type LoadState =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "error"; message: string }
  | { phase: "ready"; detail: OperatorSubmissionDetail };

/**
 * The real case detail — resolved by public reference (RS-XXXXXX), which
 * the backend does not yet expose a lookup-by-reference endpoint for (see
 * task scope: no speculative backend work for this). Resolved client-side:
 * list() to find the matching summary's internal id, then get(id) for the
 * full detail. The owner's own submission (brief, questionnaire answers,
 * contact, consent) is rendered strictly read-only here — only the
 * backend's own status/internal-review-notes (via the existing
 * updateStatus API) and this component's own local-only workflow state are
 * editable.
 */
export function OperatorCaseWorkspace({
  caseReference,
  service: injectedService,
}: {
  caseReference: string;
  /** Test-only seam — see OperatorCaseList's own injectedService comment. */
  service?: OperatorSubmissionService;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see OperatorCaseList's identical, justified pattern.
  const service = injectedService ?? useOperatorSubmissionService();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  // Backend status-editing form state (separate from the local workflow
  // state below — see the "Backend submission status" section).
  const [backendNotes, setBackendNotes] = useState("");
  const [closedReason, setClosedReason] = useState<SubmissionClosedReason | "">("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Local-only operator workflow state.
  const [local, setLocal] = useState<OperatorCaseState>(() => emptyOperatorCaseState(caseReference));
  const [localLoaded, setLocalLoaded] = useState(false);
  // Which contractor cards are currently expanded for editing — purely a
  // view concern, not persisted.
  const [expandedContractorIds, setExpandedContractorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // No setState here to reset to "loading" on a caseReference change —
    // the initial state is already "loading", and the page
    // (app/operator/[caseReference]/page.tsx) renders this component with
    // key={caseReference}, so a genuinely different case is a fresh mount
    // rather than a prop update on the same instance. (An earlier version
    // of this effect called setState({phase:"loading"}) here, deferred via
    // setTimeout(0) to satisfy a lint rule — that deferral raced the
    // service call below: list()/get() over an already-resolved mock
    // promise could resolve and setState "ready" via microtasks before the
    // setTimeout(0) macrotask fired, which then overwrote "ready" back to
    // "loading" forever. Fixed by removing the redundant reset instead.)
    service
      .list()
      .then((summaries) => {
        const match = summaries.find((summary) => summary.publicReference === caseReference);
        if (!match) throw new OperatorSubmissionNotFoundError();
        return service.get(match.id);
      })
      .then((detail) => {
        if (cancelled) return;
        setState({ phase: "ready", detail });
        setBackendNotes(detail.internalReviewNotes ?? "");
        setClosedReason(detail.closedReason ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof OperatorSubmissionNotFoundError) {
          setState({ phase: "not-found" });
          return;
        }
        setState({ phase: "error", message: "Could not load this submission from RepairScope." });
      });
    return () => {
      cancelled = true;
    };
  }, [service, caseReference]);

  useEffect(() => {
    // Deferred via setTimeout(0) rather than setState synchronously in the
    // effect body — matches the same hydration-safe pattern already used
    // by LandlordApp's own localStorage-backed state (LandlordHome).
    const timer = window.setTimeout(() => {
      setLocal(readOperatorCaseState(caseReference));
      setLocalLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [caseReference]);

  useEffect(() => {
    if (!localLoaded) return; // don't overwrite storage with the placeholder empty state before hydration
    writeOperatorCaseState(local);
  }, [local, localLoaded]);

  const applyBackendStatus = async (status: Exclude<SubmissionStatus, "new">) => {
    if (state.phase !== "ready") return;
    if (status === "closed" && !closedReason) {
      setSaveStatus("error");
      setSaveError("Choose a reason before closing this submission.");
      return;
    }
    setSaveStatus("saving");
    setSaveError("");
    try {
      const updated = await service.updateStatus(state.detail.id, {
        status,
        internalReviewNotes: backendNotes || undefined,
        closedReason: status === "closed" ? (closedReason as SubmissionClosedReason) : undefined,
      });
      setState({ phase: "ready", detail: updated });
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      setSaveError("Could not update this submission. Please try again.");
    }
  };

  const updateLocalField = <K extends keyof OperatorCaseState>(key: K, value: OperatorCaseState[K]) => {
    setLocal((current) => ({ ...current, [key]: value }));
  };

  const addContractor = () => {
    const created = createOperatorContractor("");
    setLocal((current) => ({
      ...current,
      contractors: [...current.contractors, created],
    }));
    setExpandedContractorIds((current) => new Set(current).add(created.id));
  };

  // Always routes through applyContractorPatch so switching response type,
  // price type, or guarantee status clears whatever is no longer relevant —
  // see that function's own comment for the exact clearing policy. This
  // patches the SAME record by id — editing never creates a new contractor.
  const updateContractor = (id: string, patch: Partial<OperatorContractor>) => {
    setLocal((current) => ({
      ...current,
      contractors: current.contractors.map((c) => (c.id === id ? applyContractorPatch(c, patch) : c)),
    }));
  };

  const removeContractor = (id: string) => {
    setLocal((current) => ({
      ...current,
      contractors: current.contractors.filter((c) => c.id !== id),
    }));
    setExpandedContractorIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const toggleContractorExpanded = (id: string) => {
    setExpandedContractorIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (state.phase === "loading") {
    return <p role="status">Loading…</p>;
  }

  if (state.phase === "not-found") {
    return (
      <p className="field-error" role="alert">
        No submission found for {caseReference}.
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <p className="field-error" role="alert">
        {state.message}
      </p>
    );
  }

  const detail = state.detail;

  return (
    <div className="op-case-workspace">
      <header className="op-case-workspace__header">
        <div>
          <h1>{detail.publicReference}</h1>
          <p className="op-case-workspace__meta">
            {detail.issueCategory} · submitted {formatTimestamp(detail.createdAt)}
          </p>
        </div>
        <StatusPill tone={backendStatusTone(detail.status)}>{detail.status}</StatusPill>
      </header>

      {detail.safetyFlags.length > 0 && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">Safety flags</div>
          <p>{detail.safetyFlags.join(", ")}</p>
        </div>
      )}

      {/* The owner's own submission — brief, contact, consent — is
          rendered strictly read-only below. Nothing in this section writes
          back to the submission. */}
      <section className="op-panel" aria-label="Owner submission">
        <h2>Owner submission (read-only)</h2>
        {/* Reuses the same concise semantic summary the owner review and
            post-submission confirmation screens show (variant="owner") —
            no separate operator-specific formatter. showDraftReference is
            suppressed: that row is the pre-submission CLIENT journey UUID,
            not a backend identifier, and would only compete with the real
            RS-XXXXXX reference already shown in this page's own header. */}
        <GeneratedBriefDocument brief={detail.generatedBrief} variant="owner" showDraftReference={false} />

        <dl className="operator-review__facts">
          <div>
            <dt>Landlord</dt>
            <dd>{detail.landlordName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{detail.landlordEmail}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{detail.landlordPhone}</dd>
          </div>
          <div>
            <dt>Postcode</dt>
            <dd>{detail.propertyPostcode ?? "Not applicable"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{detail.propertyAddress ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Preferred contact</dt>
            <dd>{detail.preferredContactMethod}</dd>
          </div>
          <div>
            <dt>Access notes</dt>
            <dd>{detail.accessNotes ?? "None"}</dd>
          </div>
          <div>
            <dt>Evidence notes</dt>
            <dd>{detail.evidenceNotes ?? "None described"}</dd>
          </div>
          <div>
            <dt>Consent to contact</dt>
            <dd>{detail.consentToContact ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Consent to share with contractors</dt>
            <dd>{detail.consentToShareWithContractors ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Questionnaire version</dt>
            <dd>{detail.questionnaireVersion}</dd>
          </div>
        </dl>

        <details className="operator-review__answers">
          <summary>Show raw answers</summary>
          <pre>{JSON.stringify(detail.questionnaireAnswers, null, 2)}</pre>
        </details>
      </section>

      <div className="op-case-workspace__columns">
        <section className="op-panel" aria-label="Backend submission status">
          <h2>Backend submission status</h2>
          <p className="op-panel__hint">
            Saved to RepairScope and visible wherever this submission is reviewed — distinct from the local
            workflow status below, which stays on this device only.
          </p>
          <label>
            Internal review notes (saved to RepairScope)
            <textarea
              rows={4}
              value={backendNotes}
              onChange={(event) => setBackendNotes(event.target.value)}
            />
          </label>
          <label>
            Closed reason (required to close)
            <select
              value={closedReason}
              onChange={(event) => setClosedReason(event.target.value as SubmissionClosedReason | "")}
            >
              <option value="">Select a reason…</option>
              {CLOSED_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {saveStatus === "error" && (
            <p className="field-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="operator-review__actions">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="button button--secondary"
                disabled={saveStatus === "saving"}
                onClick={() => void applyBackendStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="op-panel" aria-label="Local operator working area">
          <h2>Local working notes</h2>
          <p className="op-panel__hint">Stays on this device only — never sent to RepairScope.</p>
          <label>
            Local workflow status
            <select
              value={local.status}
              onChange={(event) => updateLocalField("status", event.target.value as OperatorCaseStatus)}
            >
              {OPERATOR_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OPERATOR_CASE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Internal notes
            <textarea
              value={local.internalNotes}
              onChange={(event) => updateLocalField("internalNotes", event.target.value)}
              placeholder="Anything worth remembering about this case…"
            />
          </label>
          <label>
            Unresolved questions
            <textarea
              value={local.unresolvedQuestions}
              onChange={(event) => updateLocalField("unresolvedQuestions", event.target.value)}
              placeholder="What is still unclear internally?"
            />
          </label>
          <label>
            Owner follow-up questions
            <textarea
              value={local.ownerFollowUpQuestions}
              onChange={(event) => updateLocalField("ownerFollowUpQuestions", event.target.value)}
              placeholder="What do we still need to ask the owner?"
            />
          </label>
          <label>
            Next action
            <textarea
              value={local.nextAction}
              onChange={(event) => updateLocalField("nextAction", event.target.value)}
              placeholder="What happens next, and who does it?"
            />
          </label>
          <label>
            Follow-up date (optional)
            <input
              type="date"
              value={local.followUpDate ?? ""}
              onChange={(event) => updateLocalField("followUpDate", event.target.value || undefined)}
            />
          </label>
        </section>
      </div>

      <section className="op-panel op-panel--wide" aria-label="Contractors considered">
        <div className="op-panel__heading-row">
          <h2>Contractors considered</h2>
          <button type="button" onClick={addContractor}>
            + Add contractor
          </button>
        </div>
        <p className="op-panel__hint">Local tracking only — no contractor accounts or invitations yet.</p>
        {local.contractors.length === 0 ? (
          <p>No contractors added yet.</p>
        ) : (
          <div className="op-contractor-list">
            {local.contractors.map((contractor) => (
              <ContractorCard
                key={contractor.id}
                contractor={contractor}
                expanded={expandedContractorIds.has(contractor.id)}
                onToggleExpanded={() => toggleContractorExpanded(contractor.id)}
                onUpdate={(patch) => updateContractor(contractor.id, patch)}
                onRemove={() => removeContractor(contractor.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="op-panel op-panel--wide" aria-label="Proposal comparison">
        <h2>Proposal comparison</h2>
        <ProposalComparison
          contractors={local.contractors}
          keyDifferences={local.comparisonKeyDifferences ?? ""}
          unresolvedQuestions={local.comparisonUnresolvedQuestions ?? ""}
          repairScopeNote={local.comparisonRepairScopeNote ?? ""}
          onKeyDifferencesChange={(value) => updateLocalField("comparisonKeyDifferences", value)}
          onUnresolvedQuestionsChange={(value) => updateLocalField("comparisonUnresolvedQuestions", value)}
          onRepairScopeNoteChange={(value) => updateLocalField("comparisonRepairScopeNote", value)}
        />
      </section>
    </div>
  );
}

function formatHkDollars(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK")}`;
}

/** A short, at-a-glance line for the collapsed card — what a founder scanning
 * the list actually wants to know without opening every contractor. */
function summarizeContractor(contractor: OperatorContractor): string | null {
  switch (contractor.responseType) {
    case "interested":
      return "Interested";
    case "needs-inspection":
      return contractor.inspectionRequirement
        ? `Needs inspection — ${OPERATOR_INSPECTION_REQUIREMENT_LABELS[contractor.inspectionRequirement]}`
        : "Needs inspection";
    case "needs-more-information":
      return "Needs more information";
    case "not-suitable":
      return "Not suitable";
    case "proposal-provided": {
      if (contractor.priceType === "fixed" || contractor.priceType === "estimate") {
        if (typeof contractor.price === "number") {
          const prefix = contractor.priceType === "estimate" ? "Est. " : "";
          return `Proposal — ${prefix}${formatHkDollars(contractor.price)}`;
        }
      }
      if (contractor.priceType === "range") {
        const { priceMin, priceMax } = contractor;
        if (typeof priceMin === "number" && typeof priceMax === "number") {
          return `Proposal — ${formatHkDollars(priceMin)}–${formatHkDollars(priceMax)}`;
        }
      }
      return "Proposal provided";
    }
    default:
      return null;
  }
}

function ContractorCard({
  contractor,
  expanded,
  onToggleExpanded,
  onUpdate,
  onRemove,
}: {
  contractor: OperatorContractor;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (patch: Partial<OperatorContractor>) => void;
  onRemove: () => void;
}) {
  const responseSummary = summarizeContractor(contractor);

  // The persisted range invariant (priceMin <= priceMax) is enforced in
  // applyContractorPatch, so an attempted edit that would invert it is
  // never committed — see handlePriceMinChange/handlePriceMaxChange below.
  // These two hold the operator's raw typed text ONLY while their attempt
  // is invalid, so the input keeps showing what they typed (with an inline
  // error) instead of silently reverting or wiping the other, still-valid
  // bound. `null` means "not overridden — show the persisted value."
  const [priceMinDraft, setPriceMinDraft] = useState<string | null>(null);
  const [priceMaxDraft, setPriceMaxDraft] = useState<string | null>(null);

  const parseOptionalAmount = (raw: string): number | undefined => {
    if (raw === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const wouldInvertRange = (candidateMin: number | undefined, candidateMax: number | undefined): boolean =>
    candidateMin !== undefined && candidateMax !== undefined && candidateMin > candidateMax;

  const handlePriceMinChange = (raw: string) => {
    const candidate = parseOptionalAmount(raw);
    if (wouldInvertRange(candidate, contractor.priceMax)) {
      setPriceMinDraft(raw);
      return;
    }
    setPriceMinDraft(null);
    onUpdate({ priceMin: candidate });
  };

  const handlePriceMaxChange = (raw: string) => {
    const candidate = parseOptionalAmount(raw);
    if (wouldInvertRange(contractor.priceMin, candidate)) {
      setPriceMaxDraft(raw);
      return;
    }
    setPriceMaxDraft(null);
    onUpdate({ priceMax: candidate });
  };

  const rangeInvalid = priceMinDraft !== null || priceMaxDraft !== null;

  // Import bridge (Commit B): a contractor fills in the standalone guided
  // form and copies a small structured export; the founder pastes it here
  // against the SAME contractor record they're already looking at. Preview
  // before commit, then onUpdate — the same callback the manual editor
  // above already uses — merges it via applyContractorPatch, so operator-
  // owned fields (name/trade/contactReference/status/notes) can never be
  // touched by an import, exactly as by manual editing.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ContractorResponsePayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const previewImport = () => {
    const result = parseContractorResponseExport(importText);
    if (!result.ok) {
      setImportError(result.error);
      setImportPreview(null);
      return;
    }
    setImportError(null);
    setImportPreview(result.payload);
  };

  const confirmImport = () => {
    if (!importPreview) return;
    onUpdate(importPreview);
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setImportError(null);
  };

  const cancelImport = () => {
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setImportError(null);
  };

  return (
    <div className="op-contractor-card">
      <div className="op-contractor-card__summary">
        <div>
          <div className="op-contractor-card__heading">
            {contractor.name || "Unnamed contractor"}
            {contractor.trade ? <span className="op-contractor-card__trade"> · {contractor.trade}</span> : null}
          </div>
          <p className="op-contractor-card__meta">
            <span>{OPERATOR_CONTRACTOR_STATUS_LABELS[contractor.status]}</span>
            {responseSummary && <span>{responseSummary}</span>}
            {contractor.earliestStart && <span>Earliest start: {contractor.earliestStart}</span>}
          </p>
        </div>
        <div className="op-contractor-card__actions">
          <button type="button" onClick={onToggleExpanded}>
            {expanded ? "Collapse" : "Edit"}
          </button>
          <button type="button" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? "Cancel import" : "Import response"}
          </button>
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="op-contractor-card__import">
          <p className="op-panel__hint">
            Paste the response the contractor copied from their own form. Nothing is changed until you confirm —
            this never overwrites the name, trade, contact reference, contact status or your own notes above.
          </p>
          <label>
            Pasted response
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
                setImportError(null);
              }}
              placeholder="Paste the contractor's exported response here…"
            />
          </label>
          <div className="op-contractor-card__import-actions">
            <button type="button" onClick={previewImport} disabled={!importText.trim()}>
              Preview
            </button>
            <button type="button" onClick={cancelImport}>
              Cancel
            </button>
          </div>
          {importError && (
            <p className="field-error" role="alert">
              {importError}
            </p>
          )}
          {importPreview && (
            <div className="op-contractor-card__import-preview">
              <p>This will update:</p>
              <ul>
                {Object.entries(importPreview).map(([key, value]) => (
                  <li key={key}>
                    <strong>{key}</strong>: {String(value)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={confirmImport}>
                Confirm import
              </button>
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="op-contractor-card__form">
          <label>
            Contractor name
            <input
              value={contractor.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
              aria-label="Contractor name"
              placeholder="Contractor name"
            />
          </label>
          <div className="op-contractor-card__row">
            <label>
              Trade
              <input
                value={contractor.trade ?? ""}
                onChange={(event) => onUpdate({ trade: event.target.value })}
                placeholder="e.g. plumber"
              />
            </label>
            <label>
              Contact reference
              <input
                value={contractor.contactReference ?? ""}
                onChange={(event) => onUpdate({ contactReference: event.target.value })}
                placeholder="e.g. WhatsApp / phone note"
              />
            </label>
          </div>

          <label>
            Contact / sourcing status
            <select
              value={contractor.status}
              onChange={(event) => onUpdate({ status: event.target.value as OperatorContractorStatus })}
            >
              {OPERATOR_CONTRACTOR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OPERATOR_CONTRACTOR_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Current response
            <select
              value={contractor.responseType ?? ""}
              onChange={(event) => {
                // Leaving proposal-provided hides the range inputs (see
                // applyContractorPatch, which also clears the persisted
                // priceMin/priceMax) — drop any invalid draft-in-progress
                // with them, rather than leaving it to resurface if the
                // operator switches back.
                setPriceMinDraft(null);
                setPriceMaxDraft(null);
                onUpdate({
                  responseType: (event.target.value || undefined) as OperatorContractorResponseType | undefined,
                });
              }}
            >
              <option value="">Not yet responded</option>
              {OPERATOR_CONTRACTOR_RESPONSE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          {contractor.responseType === "needs-inspection" && (
            <label>
              Inspection requirement
              <select
                value={contractor.inspectionRequirement ?? ""}
                onChange={(event) =>
                  onUpdate({
                    inspectionRequirement: (event.target.value || undefined) as
                      | OperatorInspectionRequirement
                      | undefined,
                  })
                }
              >
                <option value="">Select…</option>
                {OPERATOR_INSPECTION_REQUIREMENTS.map((requirement) => (
                  <option key={requirement} value={requirement}>
                    {OPERATOR_INSPECTION_REQUIREMENT_LABELS[requirement]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {contractor.responseType === "needs-more-information" && (
            <label>
              What information do they need?
              <textarea
                value={contractor.informationNeeded ?? ""}
                onChange={(event) => onUpdate({ informationNeeded: event.target.value })}
              />
            </label>
          )}

          {contractor.responseType === "proposal-provided" && (
            <>
              <label>
                Price type
                <select
                  value={contractor.priceType ?? ""}
                  onChange={(event) => {
                    // Leaving "range" hides the min/max inputs and clears
                    // them in persisted state — drop any pending invalid
                    // draft along with them.
                    setPriceMinDraft(null);
                    setPriceMaxDraft(null);
                    onUpdate({ priceType: (event.target.value || undefined) as OperatorPriceType | undefined });
                  }}
                >
                  <option value="">Select…</option>
                  {OPERATOR_PRICE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {OPERATOR_PRICE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              {(contractor.priceType === "fixed" || contractor.priceType === "estimate") && (
                <label>
                  Price (HK$)
                  <input
                    type="number"
                    min={0}
                    value={contractor.price ?? ""}
                    onChange={(event) => onUpdate({ price: parseOptionalAmount(event.target.value) })}
                  />
                </label>
              )}

              {contractor.priceType === "range" && (
                <div className="op-contractor-card__row">
                  <label>
                    Price range — minimum (HK$)
                    <input
                      type="number"
                      min={0}
                      value={priceMinDraft ?? contractor.priceMin ?? ""}
                      onChange={(event) => handlePriceMinChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Price range — maximum (HK$)
                    <input
                      type="number"
                      min={0}
                      value={priceMaxDraft ?? contractor.priceMax ?? ""}
                      onChange={(event) => handlePriceMaxChange(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {rangeInvalid && (
                <p className="field-error" role="alert">
                  The minimum price can&apos;t be greater than the maximum — this value wasn&apos;t saved. The last
                  valid range is kept.
                </p>
              )}

              <label>
                Proposed approach
                <textarea
                  value={contractor.proposedApproach ?? ""}
                  onChange={(event) => onUpdate({ proposedApproach: event.target.value })}
                />
              </label>
              <label>
                What&apos;s included
                <textarea
                  value={contractor.inclusions ?? ""}
                  onChange={(event) => onUpdate({ inclusions: event.target.value })}
                />
              </label>
              <label>
                What&apos;s excluded
                <textarea
                  value={contractor.exclusions ?? ""}
                  onChange={(event) => onUpdate({ exclusions: event.target.value })}
                />
              </label>
              <label>
                What could change the price
                <textarea
                  value={contractor.priceChangeFactors ?? ""}
                  onChange={(event) => onUpdate({ priceChangeFactors: event.target.value })}
                />
              </label>
              <label>
                Expected duration
                <input
                  value={contractor.expectedDuration ?? ""}
                  onChange={(event) => onUpdate({ expectedDuration: event.target.value })}
                  placeholder="e.g. 1 day, 2–3 visits"
                />
              </label>
              <label>
                Earliest start
                <input
                  value={contractor.earliestStart ?? ""}
                  onChange={(event) => onUpdate({ earliestStart: event.target.value })}
                  placeholder="e.g. Tomorrow afternoon, within 3 days, after inspection"
                />
              </label>
              <label>
                Guarantee
                <select
                  value={contractor.guaranteeStatus ?? ""}
                  onChange={(event) =>
                    onUpdate({
                      guaranteeStatus: (event.target.value || undefined) as OperatorGuaranteeStatus | undefined,
                    })
                  }
                >
                  <option value="">Select…</option>
                  {OPERATOR_GUARANTEE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {OPERATOR_GUARANTEE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              {contractor.guaranteeStatus === "yes" && (
                <label>
                  Guarantee details
                  <textarea
                    value={contractor.guaranteeDetails ?? ""}
                    onChange={(event) => onUpdate({ guaranteeDetails: event.target.value })}
                  />
                </label>
              )}
            </>
          )}

          <label>
            Original contractor response — what did they say?
            <textarea
              value={contractor.originalResponse ?? ""}
              onChange={(event) => onUpdate({ originalResponse: event.target.value })}
              placeholder="Paste or paraphrase what the contractor actually said…"
            />
          </label>

          <label>
            Operator notes
            <textarea
              value={contractor.notes}
              onChange={(event) => onUpdate({ notes: event.target.value })}
              placeholder="Notes copied manually from WhatsApp, calls, etc."
            />
          </label>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}
