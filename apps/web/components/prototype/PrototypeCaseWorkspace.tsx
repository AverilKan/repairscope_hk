"use client";

import { useEffect, useState } from "react";
import { GeneratedBriefDocument } from "@/components/GeneratedBriefDocument";
import { findPrototypeCase } from "@/data/prototypeFixtures";
import {
  createPrototypeContractor,
  emptyPrototypeCaseState,
  PROTOTYPE_CASE_STATUS_LABELS,
  PROTOTYPE_CASE_STATUSES,
  PROTOTYPE_CONTRACTOR_STATUS_LABELS,
  PROTOTYPE_CONTRACTOR_STATUSES,
  readPrototypeCaseState,
  writePrototypeCaseState,
  type PrototypeCaseState,
  type PrototypeCaseStatus,
  type PrototypeContractor,
  type PrototypeContractorStatus,
} from "@/domain/prototype/caseState";

export function PrototypeCaseWorkspace({ caseReference }: { caseReference: string }) {
  const proto = findPrototypeCase(caseReference);

  // localStorage is only readable client-side — start from the same empty
  // shape the server would have rendered, then hydrate once mounted, so
  // there is no server/client markup mismatch.
  const [state, setState] = useState<PrototypeCaseState>(() => emptyPrototypeCaseState(caseReference));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Deferred via setTimeout(0) rather than setState synchronously in the
    // effect body — matches the same hydration-safe pattern already used
    // by LandlordApp's own localStorage-backed state (LandlordHome).
    const timer = window.setTimeout(() => {
      setState(readPrototypeCaseState(caseReference));
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [caseReference]);

  useEffect(() => {
    if (!loaded) return; // don't overwrite storage with the placeholder empty state before hydration
    writePrototypeCaseState(state);
  }, [state, loaded]);

  if (!proto) {
    return <p>No prototype case found for {caseReference}.</p>;
  }

  const updateField = <K extends keyof PrototypeCaseState>(key: K, value: PrototypeCaseState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  // Adds a blank, immediately-editable row rather than prompting for a name
  // up front — faster for manual entry, and keeps this a plain form
  // interaction (no native dialog) for both real use and testing.
  const addContractor = () => {
    setState((current) => ({
      ...current,
      contractors: [...current.contractors, createPrototypeContractor("")],
    }));
  };

  const updateContractor = (id: string, patch: Partial<PrototypeContractor>) => {
    setState((current) => ({
      ...current,
      contractors: current.contractors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removeContractor = (id: string) => {
    setState((current) => ({
      ...current,
      contractors: current.contractors.filter((c) => c.id !== id),
    }));
  };

  const brief = proto.brief;

  return (
    <div className="proto-workspace">
      <header className="proto-workspace__header">
        <div>
          <h1>{proto.caseReference}</h1>
          <p className="proto-workspace__meta">
            {brief.category ?? "—"} · {brief.propertyDetails?.district ?? "—"} · submitted{" "}
            {formatTimestamp(proto.submittedAt)}
          </p>
        </div>
        <label className="proto-workspace__status-select">
          Status
          <select
            value={state.status}
            onChange={(event) => updateField("status", event.target.value as PrototypeCaseStatus)}
          >
            {PROTOTYPE_CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROTOTYPE_CASE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="proto-workspace__columns">
        <section className="proto-panel" aria-label="Owner submission">
          <h2>Owner submission</h2>
          <div className="proto-panel__contact">
            <div>
              <strong>{proto.ownerName}</strong>
            </div>
            <div>{proto.ownerEmail}</div>
            <div>{proto.ownerPhone}</div>
          </div>
          <GeneratedBriefDocument brief={brief} variant="operator" />
        </section>

        <section className="proto-panel" aria-label="Operator working area">
          <h2>Operator working area</h2>
          <label>
            Internal notes
            <textarea
              value={state.internalNotes}
              onChange={(event) => updateField("internalNotes", event.target.value)}
              placeholder="Anything worth remembering about this case…"
            />
          </label>
          <label>
            Unresolved questions
            <textarea
              value={state.unresolvedQuestions}
              onChange={(event) => updateField("unresolvedQuestions", event.target.value)}
              placeholder="What is still unclear internally?"
            />
          </label>
          <label>
            Owner follow-up questions
            <textarea
              value={state.ownerFollowUpQuestions}
              onChange={(event) => updateField("ownerFollowUpQuestions", event.target.value)}
              placeholder="What do we still need to ask the owner?"
            />
          </label>
          <label>
            Next action
            <textarea
              value={state.nextAction}
              onChange={(event) => updateField("nextAction", event.target.value)}
              placeholder="What happens next, and who does it?"
            />
          </label>
          <label>
            Follow-up date (optional)
            <input
              type="date"
              value={state.followUpDate ?? ""}
              onChange={(event) => updateField("followUpDate", event.target.value || undefined)}
            />
          </label>
        </section>
      </div>

      <section className="proto-panel proto-panel--wide" aria-label="Contractors considered">
        <div className="proto-panel__heading-row">
          <h2>Contractors considered</h2>
          <button type="button" onClick={addContractor}>
            + Add contractor
          </button>
        </div>
        {state.contractors.length === 0 ? (
          <p>No contractors added yet.</p>
        ) : (
          <table className="proto-contractor-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Trade</th>
                <th>Contact reference</th>
                <th>Status</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.contractors.map((contractor) => (
                <tr key={contractor.id}>
                  <td>
                    <input
                      value={contractor.name}
                      onChange={(event) => updateContractor(contractor.id, { name: event.target.value })}
                      aria-label="Contractor name"
                      placeholder="Contractor name"
                    />
                  </td>
                  <td>
                    <input
                      value={contractor.trade ?? ""}
                      onChange={(event) => updateContractor(contractor.id, { trade: event.target.value })}
                      placeholder="e.g. plumber"
                    />
                  </td>
                  <td>
                    <input
                      value={contractor.contactReference ?? ""}
                      onChange={(event) =>
                        updateContractor(contractor.id, { contactReference: event.target.value })
                      }
                      placeholder="e.g. WhatsApp / phone note"
                    />
                  </td>
                  <td>
                    <select
                      value={contractor.status}
                      onChange={(event) =>
                        updateContractor(contractor.id, {
                          status: event.target.value as PrototypeContractorStatus,
                        })
                      }
                    >
                      {PROTOTYPE_CONTRACTOR_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PROTOTYPE_CONTRACTOR_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      value={contractor.notes}
                      onChange={(event) => updateContractor(contractor.id, { notes: event.target.value })}
                      placeholder="Notes copied manually from WhatsApp, calls, etc."
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => removeContractor(contractor.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="proto-panel proto-panel--wide" aria-label="Proposal comparison">
        <h2>Proposal comparison</h2>
        <p className="proto-panel__placeholder">Proposal comparison — not yet prototyped.</p>
      </section>
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
