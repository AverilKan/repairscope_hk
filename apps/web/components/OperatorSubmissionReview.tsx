"use client";

import { useEffect, useState } from "react";
import type {
  OperatorSubmissionDetail,
  OperatorSubmissionSummary,
  SubmissionClosedReason,
  SubmissionStatus,
} from "@/domain/operatorSubmission";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import { StatusPill } from "./SiteShell";

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

function statusTone(status: SubmissionStatus): "neutral" | "good" | "attention" | "ink" {
  if (status === "pursuing") return "good";
  if (status === "closed") return "neutral";
  if (status === "needs_landlord_information") return "attention";
  return "ink";
}

export function OperatorSubmissionReview() {
  const service = useOperatorSubmissionService();
  const [submissions, setSubmissions] = useState<OperatorSubmissionSummary[] | null>(null);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    service
      .list()
      .then((result) => {
        if (!cancelled) setSubmissions(result);
      })
      .catch(() => {
        if (!cancelled) setListError("Could not load submissions.");
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

  const refreshList = () => {
    service.list().then(setSubmissions).catch(() => setListError("Could not load submissions."));
  };

  return (
    <div className="operator-review">
      <section className="operator-review__list" aria-label="Recent submissions">
        {listError && (
          <p className="field-error" role="alert">
            {listError}
          </p>
        )}
        {submissions === null && !listError && <p role="status">Loading submissions…</p>}
        {submissions?.length === 0 && <p>No submissions yet.</p>}
        {submissions?.map((submission) => (
          <button
            key={submission.id}
            type="button"
            className={`operator-review__row ${selectedId === submission.id ? "operator-review__row--active" : ""}`}
            onClick={() => setSelectedId(submission.id)}
          >
            <div>
              <strong>{submission.publicReference}</strong>
              <span>{submission.landlordName}</span>
              <span>{submission.propertyPostcode}</span>
            </div>
            <div>
              {submission.safetyFlags.length > 0 && <StatusPill tone="attention">Safety flagged</StatusPill>}
              <StatusPill tone={statusTone(submission.status)}>{submission.status}</StatusPill>
            </div>
          </button>
        ))}
      </section>

      <section className="operator-review__detail" aria-label="Submission detail">
        {selectedId ? (
          <SubmissionDetailPanel
            key={selectedId}
            id={selectedId}
            onUpdated={refreshList}
          />
        ) : (
          <p>Select a submission to review it.</p>
        )}
      </section>
    </div>
  );
}

function SubmissionDetailPanel({ id, onUpdated }: { id: string; onUpdated: () => void }) {
  const service = useOperatorSubmissionService();
  const [detail, setDetail] = useState<OperatorSubmissionDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notes, setNotes] = useState("");
  const [closedReason, setClosedReason] = useState<SubmissionClosedReason | "">("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    service
      .get(id)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setNotes(result.internalReviewNotes ?? "");
        setClosedReason(result.closedReason ?? "");
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this submission.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, service]);

  const applyStatus = async (status: Exclude<SubmissionStatus, "new">) => {
    if (status === "closed" && !closedReason) {
      setSaveStatus("error");
      setSaveError("Choose a reason before closing this submission.");
      return;
    }
    setSaveStatus("saving");
    setSaveError("");
    try {
      const updated = await service.updateStatus(id, {
        status,
        internalReviewNotes: notes || undefined,
        closedReason: status === "closed" ? (closedReason as SubmissionClosedReason) : undefined,
      });
      setDetail(updated);
      setSaveStatus("idle");
      onUpdated();
    } catch {
      setSaveStatus("error");
      setSaveError("Could not update this submission. Please try again.");
    }
  };

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!detail) return <p role="status">Loading…</p>;

  return (
    <div className="operator-review__detail-content">
      <div className="operator-review__detail-header">
        <h2>{detail.publicReference}</h2>
        <StatusPill tone={statusTone(detail.status)}>{detail.status}</StatusPill>
      </div>

      {detail.safetyFlags.length > 0 && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">Safety flags</div>
          <p>{detail.safetyFlags.join(", ")}</p>
        </div>
      )}

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
          <dd>{detail.propertyPostcode}</dd>
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

      <div className="operator-review__brief">
        <p className="eyebrow">Generated brief</p>
        <pre>{JSON.stringify(detail.generatedBrief, null, 2)}</pre>
      </div>

      <div className="operator-review__answers">
        <p className="eyebrow">Questionnaire answers</p>
        <pre>{JSON.stringify(detail.questionnaireAnswers, null, 2)}</pre>
      </div>

      <label className="operator-review__notes-label">
        Internal review notes
        <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      <label className="operator-review__notes-label">
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
            onClick={() => void applyStatus(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
