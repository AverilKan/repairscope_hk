"use client";

import { useMemo, useState } from "react";
import { createSubmittedRepairQuote } from "@/domain/contractorQuote";
import type {
  ContractorReconfirmation,
  ResolvedContractorTask,
} from "@/domain/procurement";
import {
  createProposalRevisionDraft,
  detectQuoteFieldChanges,
  revisionSummary,
  validateQuoteRevisionDraft,
} from "@/domain/quoteRevision";
import type { SubmittedContractorResponse } from "@/domain/types";
import { repairScopeServices } from "@/services";
import {
  ContractorQuoteRevisionEditor,
  QuoteRevisionReview,
} from "@/components/ContractorQuoteRevisionEditor";

export function SelectionQuoteRevision({
  token,
  task,
  reconfirmation,
  onCancel,
  onSubmitted,
}: {
  token: string;
  task: ResolvedContractorTask;
  reconfirmation: ContractorReconfirmation;
  onCancel: () => void;
  onSubmitted: (response: SubmittedContractorResponse) => void;
}) {
  const original = reconfirmation.selection.selectedResponse;
  const [draft, setDraft] = useState(() =>
    createProposalRevisionDraft(original),
  );
  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [confirmed, setConfirmed] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "error"
  >("saved");

  const originalQuote = original.submittedData;
  if (!("costSnapshot" in originalQuote)) {
    throw new Error("Only a repair quote can be revised.");
  }
  const changes = useMemo(
    () => detectQuoteFieldChanges(originalQuote, draft.quote),
    [draft.quote, originalQuote],
  );
  const validation = useMemo(
    () => validateQuoteRevisionDraft(draft.quote),
    [draft.quote],
  );

  const update = async (quote: typeof draft.quote) => {
    const next = {
      ...draft,
      quote,
      changedFields: detectQuoteFieldChanges(originalQuote, quote),
    };
    setDraft(next);
    setSaveState("saving");
    try {
      await repairScopeServices.clarifications.saveRevisionDraft(token, next);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const submit = async () => {
    if (!validation.valid || !changes.length || !confirmed || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response =
        await repairScopeServices.clarifications.submitRevisedResponse(
          token,
          {
            context: {
              invitationId: task.invitationId,
              repairId: task.repairId,
              contractorId: task.contractorId,
              responseId: task.responseId!,
              sourceVersion: task.activeResponseVersion!,
              reason: "selection_reconfirmation",
            },
            quote: createSubmittedRepairQuote(draft.quote),
            changedFields: changes,
            revisionSummary: revisionSummary(changes),
            idempotencyKey: `selection-revision-${task.invitationId}-v${draft.draftVersion}`,
          },
        );
      onSubmitted(response);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The revised quote could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "review") {
    return (
      <section className="contractor-action-panel">
        <p className="eyebrow">Version {draft.draftVersion} review</p>
        <h2>Review the revised quote</h2>
        <QuoteRevisionReview
          changes={changes}
          expanded={showComplete}
          onExpandedChange={setShowComplete}
          quote={draft.quote}
        />
        <label className="contractor-confirm-check">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>
            I confirm this is the complete replacement for Version{" "}
            {draft.sourceVersion}.
          </span>
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="contractor-procurement-actions">
          <button
            className="button button--secondary"
            disabled={submitting}
            onClick={() => setStage("edit")}
            type="button"
          >
            Back to quote
          </button>
          <button
            className="button"
            disabled={!confirmed || submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? "Submitting…" : "Submit revised quote"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="quote-revision-heading">
        <p className="eyebrow">Version {draft.draftVersion} draft</p>
        <h2>Update the complete quote</h2>
        <p>
          Version {draft.sourceVersion} remains preserved until the landlord
          explicitly accepts this revision.
        </p>
      </section>
      <ContractorQuoteRevisionEditor
        highlightedSections={[]}
        landlordQuestions={[
          "Update any price, scope, exclusions, timing or warranty terms that have changed.",
        ]}
        onChange={(quote) => void update(quote)}
        quote={draft.quote}
        saveState={saveState}
      />
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="contractor-procurement-actions quote-revision-actions">
        <button
          className="button button--secondary"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button"
          disabled={!validation.valid || !changes.length}
          onClick={() => setStage("review")}
          type="button"
        >
          Review revised quote
        </button>
      </div>
    </>
  );
}

