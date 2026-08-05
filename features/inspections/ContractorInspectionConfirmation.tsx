"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/domain/money";
import type {
  AvailabilityWindow,
  InspectionDecision,
} from "@/domain/procurement";
import { repairScopeServices } from "@/services";
import { StatusPill } from "@/components/SiteShell";

type View =
  | "loading"
  | "review"
  | "alternative"
  | "decline"
  | "confirmed"
  | "proposed"
  | "declined"
  | "error";

function localWindow(id: string, label: string): AvailabilityWindow {
  return {
    windowId: id,
    startsAt: "2026-08-17T09:00:00.000Z",
    endsAt: "2026-08-17T12:00:00.000Z",
    label,
  };
}

export function ContractorInspectionConfirmation({
  token,
}: {
  token: string;
}) {
  const [decision, setDecision] = useState<InspectionDecision>();
  const [view, setView] = useState<View>("loading");
  const [selectedWindowId, setSelectedWindowId] = useState("");
  const [alternative, setAlternative] = useState("Monday 09:00–12:00");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorInspections
      .getConfirmationTask(token)
      .then((result) => {
        if (!active) return;
        setDecision(result);
        setSelectedWindowId(
          result.preferredAttendanceWindows[0]?.windowId ?? "",
        );
        setView("review");
      })
      .catch(() => {
        if (active) setView("error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (action: "confirm" | "alternative" | "decline") => {
    if (!decision || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (action === "confirm") {
        const confirmedWindow = decision.preferredAttendanceWindows.find(
          (window) => window.windowId === selectedWindowId,
        );
        if (!confirmedWindow) throw new Error("Choose an attendance window.");
        await repairScopeServices.contractorInspections.confirmInspection(
          token,
          { confirmedWindow },
        );
        setView("confirmed");
      } else if (action === "alternative") {
        await repairScopeServices.contractorInspections.proposeAlternativeAttendance(
          token,
          {
            proposedWindows: [
              localWindow("contractor-alternative-1", alternative.trim()),
            ],
            contractorNote: note,
          },
        );
        setView("proposed");
      } else {
        await repairScopeServices.contractorInspections.declineInspection(
          token,
          note,
        );
        setView("declined");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The inspection response could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (view === "loading") {
    return (
      <main className="contractor-loading" role="status">
        <span className="contractor-loading__mark" aria-hidden="true">
          RS
        </span>
        <p>Opening the inspection confirmation…</p>
      </main>
    );
  }

  if (view === "error" || !decision) {
    return (
      <main className="content-page contractor-state-page">
        <h1>This inspection confirmation is not available</h1>
        <p>The private invitation may be invalid, expired, revoked or closed.</p>
      </main>
    );
  }

  if (view === "confirmed" || view === "proposed" || view === "declined") {
    return (
      <main className="content-page contractor-state-page">
        <StatusPill tone={view === "declined" ? "attention" : "good"}>
          Response saved
        </StatusPill>
        <h1>
          {view === "confirmed"
            ? "Inspection confirmed"
            : view === "proposed"
              ? "Another time proposed"
              : "Inspection declined"}
        </h1>
        <p>
          {view === "proposed"
            ? "The landlord must accept the proposed time before the inspection is confirmed."
            : "The landlord can now see this inspection response."}
        </p>
      </main>
    );
  }

  return (
    <main className="content-page contractor-state-page">
      <header>
        <p className="eyebrow">Private inspection confirmation</p>
        <h1>Confirm the inspection</h1>
        <p>Review the accepted terms and the landlord’s requested times.</p>
      </header>

      <section className="contractor-current-quote">
        <header>
          <div>
            <p className="eyebrow">Final payable inspection fee</p>
            <h2>{formatMoney(decision.acceptedFee)}</h2>
          </div>
          <StatusPill tone="attention">Inspection only</StatusPill>
        </header>
        <dl className="selection-facts">
          <div>
            <dt>VAT</dt>
            <dd>
              {decision.vat.mode === "included"
                ? "Included"
                : decision.vat.mode === "added"
                  ? "Added"
                  : decision.vat.mode === "not_charged"
                    ? "Not charged"
                    : "Not stated"}
            </dd>
          </div>
          <div>
            <dt>Fee deduction</dt>
            <dd>{decision.feeDeduction.mode}</dd>
          </div>
          <div>
            <dt>Access requirements</dt>
            <dd>{decision.accessRequirements.join(", ")}</dd>
          </div>
        </dl>
      </section>

      {view === "review" && (
        <section className="contractor-confirmation-panel">
          <h2>Requested attendance</h2>
          {decision.preferredAttendanceWindows.map((window) => (
            <label className="contractor-option" key={window.windowId}>
              <input
                checked={selectedWindowId === window.windowId}
                name="inspection-window"
                onChange={() => setSelectedWindowId(window.windowId)}
                type="radio"
              />
              <span>{window.label}</span>
            </label>
          ))}
          <div className="contractor-review-actions">
            <button
              className="button button--secondary"
              onClick={() => setView("decline")}
              type="button"
            >
              Decline
            </button>
            <button
              className="button button--secondary"
              onClick={() => setView("alternative")}
              type="button"
            >
              Propose another time
            </button>
            <button
              className="button"
              disabled={!selectedWindowId || submitting}
              onClick={() => void submit("confirm")}
              type="button"
            >
              {submitting ? "Confirming…" : "Confirm inspection"}
            </button>
          </div>
        </section>
      )}

      {(view === "alternative" || view === "decline") && (
        <section className="contractor-confirmation-panel">
          <h2>
            {view === "alternative"
              ? "Propose another time"
              : "Decline inspection"}
          </h2>
          {view === "alternative" && (
            <label>
              <span>Alternative attendance window</span>
              <input
                onChange={(event) => setAlternative(event.target.value)}
                value={alternative}
              />
            </label>
          )}
          <label>
            <span>{view === "decline" ? "Reason — optional" : "Note — optional"}</span>
            <textarea
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              value={note}
            />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-review-actions">
            <button
              className="button button--secondary"
              disabled={submitting}
              onClick={() => setView("review")}
              type="button"
            >
              Back
            </button>
            <button
              className="button"
              disabled={
                submitting ||
                (view === "alternative" && alternative.trim().length < 3)
              }
              onClick={() =>
                void submit(view === "alternative" ? "alternative" : "decline")
              }
              type="button"
            >
              {submitting
                ? "Saving…"
                : view === "alternative"
                  ? "Send proposed time"
                  : "Confirm decline"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

