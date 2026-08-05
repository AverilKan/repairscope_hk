"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContractorClarificationState,
  ContractorReconfirmation,
  ResolvedContractorTask,
} from "@/domain/procurement";
import { createSubmittedRepairQuote } from "@/domain/contractorQuote";
import {
  createProposalRevisionDraft,
  detectQuoteFieldChanges,
  revisionSummary,
  sectionsForClarificationQuestions,
  validateQuoteRevisionDraft,
  type ProposalRevisionDraft,
} from "@/domain/quoteRevision";
import type { SubmittedRepairQuote } from "@/domain/types";
import {
  formatMoney as formatCanonicalMoney,
  moneyFromMajor,
  type Money,
} from "@/domain/money";
import { repairScopeServices } from "@/services";
import {
  ContractorQuoteRevisionEditor,
  QuoteRevisionReview,
} from "./ContractorQuoteRevisionEditor";
import { StatusPill } from "./SiteShell";
import { SelectionQuoteRevision } from "@/features/contractor-revision/SelectionQuoteRevision";

const formatMoney = (amount: Money | number) =>
  formatCanonicalMoney(
    typeof amount === "number" ? moneyFromMajor(amount) : amount,
  );

function SecureLinkNotice() {
  return (
    <div className="secure-link-notice">
      <span aria-hidden="true">↗</span>
      <p>
        This private invitation link gives access to this job only. No account
        is needed, and other contractors, repairs and prices are not available.
      </p>
    </div>
  );
}

function CurrentQuote({
  quote,
  version,
  highlighted = false,
}: {
  quote: SubmittedRepairQuote;
  version: number;
  highlighted?: boolean;
}) {
  return (
    <section className={`contractor-current-quote ${highlighted ? "is-highlighted" : ""}`}>
      <header>
        <div>
          <p className="eyebrow">Current active quote</p>
          <h2>Version {version}</h2>
        </div>
        <strong>{formatMoney(quote.finalTotal)}</strong>
      </header>
      <div className="contractor-current-quote__grid">
        <section>
          <h3>Work scope</h3>
          <ol>
            {quote.workItems.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ol>
        </section>
        <dl>
          <div>
            <dt>VAT</dt>
            <dd>
              {quote.costSnapshot.vat.mode === "not_charged"
                ? "Not charged"
                : quote.costSnapshot.vat.amount
                  ? formatMoney(quote.costSnapshot.vat.amount)
                  : "Not stated"}
            </dd>
          </div>
          <div>
            <dt>Exclusions</dt>
            <dd>{quote.exclusions.join(", ") || "None stated"}</dd>
          </div>
          <div>
            <dt>Possible changes</dt>
            <dd>
              {[...quote.priceChangeReasons, quote.priceChangeNote]
                .filter(Boolean)
                .join(", ") || "None stated"}
            </dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{quote.startAvailability || quote.laterStartDate}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{quote.duration || "Not stated"}</dd>
          </div>
          <div>
            <dt>Warranty</dt>
            <dd>
              {quote.guaranteePosition === "yes"
                ? quote.guaranteeDuration || "Included"
                : "Not stated"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

type ClarificationAction =
  | "overview"
  | "answer"
  | "answer_review"
  | "revise"
  | "revision_review"
  | "inspection"
  | "withdraw"
  | "success";

export function ContractorClarificationExperience({
  token,
  task,
}: {
  token: string;
  task: ResolvedContractorTask;
}) {
  const [data, setData] = useState<ContractorClarificationState>();
  const [error, setError] = useState("");
  const [action, setAction] = useState<ClarificationAction>("overview");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revisionDraft, setRevisionDraft] =
    useState<ProposalRevisionDraft>();
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionConfirmed, setRevisionConfirmed] = useState(false);
  const [showCompleteRevision, setShowCompleteRevision] = useState(false);
  const [revisionSaveState, setRevisionSaveState] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [inspectionReason, setInspectionReason] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const submittingRef = useRef(false);
  const revisionHeadingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    repairScopeServices.clarifications
      .getContractorClarification(token)
      .then((result) => {
        if (!active) return;
        setData(result);
        setAnswers(
          Object.fromEntries(
            result.thread.messages
              .filter((message) => message.sender === "landlord")
              .map((message) => [message.messageId, ""]),
          ),
        );
      })
      .catch(() => setError("This private follow-up is not available."));
    return () => {
      active = false;
    };
  }, [token]);

  const landlordQuestions = useMemo(
    () =>
      data?.thread.messages.filter(
        (message) => message.sender === "landlord",
      ) ?? [],
    [data?.thread.messages],
  );
  const quote = data?.currentResponse.submittedData as
    | SubmittedRepairQuote
    | undefined;

  const revisionChanges = useMemo(() => {
    if (!quote || !revisionDraft) return [];
    return detectQuoteFieldChanges(quote, revisionDraft.quote);
  }, [quote, revisionDraft]);
  const revisionValidation = useMemo(
    () =>
      revisionDraft
        ? validateQuoteRevisionDraft(revisionDraft.quote)
        : undefined,
    [revisionDraft],
  );
  const highlightedRevisionSections = useMemo(
    () =>
      sectionsForClarificationQuestions(
        data?.thread.issueKeys ?? [],
        landlordQuestions.map((question) => question.body),
      ),
    [data?.thread.issueKeys, landlordQuestions],
  );
  const generatedRevisionSummary = useMemo(
    () => revisionSummary(revisionChanges),
    [revisionChanges],
  );

  useEffect(() => {
    if (!revisionDraft) return;
    const timeout = window.setTimeout(async () => {
      try {
        await repairScopeServices.clarifications.saveRevisionDraft(
          token,
          {
            ...revisionDraft,
            changedFields: revisionChanges,
          },
        );
        setRevisionSaveState("saved");
      } catch {
        setRevisionSaveState("error");
      }
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [revisionDraft, revisionChanges, token]);

  useEffect(() => {
    if (action !== "revise") return;
    const frame = window.requestAnimationFrame(() => {
      revisionHeadingRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [action]);

  const openRevision = () => {
    if (!data) return;
    setRevisionDraft((current) =>
      current ?? createProposalRevisionDraft(data.currentResponse),
    );
    setRevisionNote("");
    setRevisionConfirmed(false);
    setShowCompleteRevision(false);
    setRevisionSaveState("saving");
    setError("");
    setAction("revise");
  };

  const submitAnswers = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await repairScopeServices.clarifications.submitClarificationAnswer(
        token,
        {
          idempotencyKey: `answer-${data?.thread.clarificationId}`,
          answers: landlordQuestions.map((question) => ({
            questionId: question.messageId,
            answer: answers[question.messageId] ?? "",
          })),
        },
      );
      setSuccessTitle("Answers sent — quote unchanged");
      setAction("success");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The answers could not be sent.",
      );
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const submitRevision = async () => {
    if (
      !revisionDraft ||
      !revisionValidation?.valid ||
      !revisionConfirmed ||
      !revisionChanges.length ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
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
              reason: "landlord_clarification",
            },
            quote: createSubmittedRepairQuote(revisionDraft.quote),
            changedFields: revisionChanges,
            revisionSummary: generatedRevisionSummary,
            note: revisionNote,
            idempotencyKey: `revision-${revisionDraft.sourceResponseId}-v${revisionDraft.draftVersion}`,
          },
        );
      setSuccessTitle("Updated quote submitted");
      setData((current) =>
        current
          ? {
              ...current,
              currentResponse: response,
              versions: [
                ...current.versions.map((version) => ({
                  ...version,
                  status: "superseded" as const,
                })),
                {
                  version: response.version,
                  response,
                  createdAt: response.submittedAt,
                  revisionReason: response.revisionReason,
                  changeSummary: response.changeSummary ?? [],
                  status: "active",
                },
              ],
            }
          : current,
      );
      setAction("success");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The revision could not be sent.",
      );
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  if (error && !data) {
    return (
      <main className="contractor-procurement-page">
        <section className="contractor-token-error" role="alert">
          <h1>Private follow-up unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!data || !quote) {
    return (
      <main className="contractor-procurement-page">
        <p className="response-loading" role="status">
          Opening your private follow-up…
        </p>
      </main>
    );
  }

  return (
    <main className="contractor-procurement-page">
      <header className="contractor-procurement-header">
        <div>
          <p className="eyebrow">
            Private repair response · {task.repairId.toUpperCase()}
          </p>
          <h1>
            {action === "success" ? successTitle : "More information requested"}
          </h1>
          <p>
            {action === "success"
              ? "The landlord can now review this response in the repair record."
              : "The landlord has asked focused questions about your submitted quote."}
          </p>
        </div>
        <StatusPill tone={action === "success" ? "good" : "attention"}>
          {action === "success" ? "Submitted" : "Reply requested"}
        </StatusPill>
      </header>
      <SecureLinkNotice />

      {action === "overview" && (
        <>
          <section className="contractor-clarification-card">
            <div className="contractor-clarification-card__heading">
              <div>
                <span>Response deadline</span>
                <strong>{data.thread.responseDeadline}</strong>
              </div>
              <span>{landlordQuestions.length} questions</span>
            </div>
            <ol>
              {landlordQuestions.map((question) => (
                <li key={question.messageId}>{question.body}</li>
              ))}
            </ol>
          </section>
          <CurrentQuote
            highlighted
            quote={quote}
            version={data.currentResponse.version}
          />
          <div className="contractor-procurement-actions">
            <button className="button" onClick={() => setAction("answer")} type="button">
              Answer without changing quote
            </button>
            <button
              className="button button--secondary"
              onClick={openRevision}
              type="button"
            >
              Update quote
            </button>
            <button
              className="button button--secondary"
              onClick={() => setAction("inspection")}
              type="button"
            >
              Request an inspection
            </button>
            <button className="text-button" onClick={() => setAction("withdraw")} type="button">
              Withdraw quote
            </button>
          </div>
        </>
      )}

      {(action === "answer" || action === "answer_review") && (
        <section className="contractor-action-panel">
          <p className="eyebrow">Answer only · Version 1 remains active</p>
          <h2>
            {action === "answer" ? "Answer the landlord questions" : "Review your answers"}
          </h2>
          {landlordQuestions.map((question) => (
            <label key={question.messageId}>
              <span>{question.body}</span>
              {action === "answer" ? (
                <textarea
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.messageId]: event.target.value,
                    }))
                  }
                  rows={3}
                  value={answers[question.messageId] ?? ""}
                />
              ) : (
                <strong>{answers[question.messageId]}</strong>
              )}
            </label>
          ))}
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-procurement-actions">
            <button
              className="button button--secondary"
              onClick={() =>
                setAction(action === "answer" ? "overview" : "answer")
              }
              type="button"
            >
              {action === "answer" ? "Cancel" : "Edit answers"}
            </button>
            {action === "answer" ? (
              <button
                className="button"
                disabled={landlordQuestions.some(
                  (question) => !(answers[question.messageId] ?? "").trim(),
                )}
                onClick={() => setAction("answer_review")}
                type="button"
              >
                Review answers
              </button>
            ) : (
              <button
                className="button"
                disabled={submitting}
                onClick={() => void submitAnswers()}
                type="button"
              >
                {submitting ? "Submitting…" : "Submit answers"}
              </button>
            )}
          </div>
        </section>
      )}

      {action === "revise" && revisionDraft && (
        <>
          <section className="quote-revision-heading" ref={revisionHeadingRef}>
            <p className="eyebrow">Version {revisionDraft.draftVersion} draft</p>
            <h2>Update the complete quote</h2>
            <p>
              Every answer from Version {revisionDraft.sourceVersion} is
              prefilled. Open only the sections you need to change.
            </p>
          </section>
          <ContractorQuoteRevisionEditor
            highlightedSections={highlightedRevisionSections}
            landlordQuestions={landlordQuestions.map(
              (question) => question.body,
            )}
            onChange={(nextQuote) =>
              {
                setRevisionSaveState("saving");
                setRevisionDraft((current) =>
                  current
                    ? {
                        ...current,
                        quote: nextQuote,
                        changedFields: quote
                          ? detectQuoteFieldChanges(quote, nextQuote)
                          : [],
                      }
                    : current,
                );
              }
            }
            quote={revisionDraft.quote}
            saveState={revisionSaveState}
          />
          {revisionValidation && !revisionValidation.valid && (
            <p className="field-error quote-revision-validation" role="status">
              Complete the open landlord-question fields and any other missing
              required quote details before reviewing the update.
            </p>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-procurement-actions quote-revision-actions">
            <button
              className="button button--secondary"
              onClick={() => setAction("overview")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={
                !revisionValidation?.valid ||
                revisionValidation.incompleteCustomCost ||
                !revisionChanges.length
              }
              onClick={() => {
                setRevisionConfirmed(false);
                setShowCompleteRevision(false);
                setAction("revision_review");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              type="button"
            >
              Review changes
            </button>
          </div>
        </>
      )}

      {action === "revision_review" && revisionDraft && (
        <section className="contractor-action-panel quote-revision-review">
          <p className="eyebrow">
            Version {revisionDraft.draftVersion} · Final check
          </p>
          <h2>Check your changes</h2>
          <p>
            Unchanged fields are omitted below. Version{" "}
            {revisionDraft.sourceVersion} remains available and is not
            overwritten.
          </p>
          <QuoteRevisionReview
            changes={revisionChanges}
            expanded={showCompleteRevision}
            onExpandedChange={setShowCompleteRevision}
            quote={revisionDraft.quote}
          />
          <section className="revision-generated-summary">
            <span>Generated change summary</span>
            <strong>{generatedRevisionSummary}</strong>
          </section>
          <label className="contractor-inline-field">
            <span>Add a note about these changes — optional</span>
            <textarea
              onChange={(event) => setRevisionNote(event.target.value)}
              rows={3}
              value={revisionNote}
            />
          </label>
          <label className="submission-confirmation">
            <input
              checked={revisionConfirmed}
              onChange={(event) =>
                setRevisionConfirmed(event.target.checked)
              }
              type="checkbox"
            />
            <span>
              I have checked the updated work, costs and conditions shown
              above.
            </span>
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-procurement-actions">
            <button
              className="button button--secondary"
              disabled={submitting}
              onClick={() => setAction("revise")}
              type="button"
            >
              Edit updated quote
            </button>
            <button
              className="button"
              disabled={!revisionConfirmed || submitting}
              onClick={() => void submitRevision()}
              type="button"
            >
              {submitting ? "Submitting updated quote…" : "Submit updated quote"}
            </button>
          </div>
        </section>
      )}

      {action === "inspection" && (
        <section className="contractor-action-panel">
          <p className="eyebrow">Alternative response</p>
          <h2>Request an inspection</h2>
          <p>
            Explain why the current quote should be replaced by an inspection
            request.
          </p>
          <label>
            <span>Reason and practical next step</span>
            <textarea
              onChange={(event) => setInspectionReason(event.target.value)}
              rows={5}
              value={inspectionReason}
            />
          </label>
          <div className="contractor-procurement-actions">
            <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
              Cancel
            </button>
            <button
              className="button"
              disabled={!inspectionReason.trim()}
              onClick={() => {
                setSuccessTitle("Inspection request sent");
                setAction("success");
              }}
              type="button"
            >
              Submit inspection request
            </button>
          </div>
        </section>
      )}

      {action === "withdraw" && (
        <section className="contractor-action-panel">
          <p className="eyebrow">Withdraw response</p>
          <h2>Withdraw this quote?</h2>
          <label>
            <span>Reason — optional</span>
            <textarea
              onChange={(event) => setWithdrawReason(event.target.value)}
              rows={3}
              value={withdrawReason}
            />
          </label>
          <div className="contractor-procurement-actions">
            <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
              Keep quote active
            </button>
            <button
              className="button"
              onClick={() => {
                setSuccessTitle("Quote withdrawn");
                setAction("success");
              }}
              type="button"
            >
              Confirm withdrawal
            </button>
          </div>
        </section>
      )}

      {action === "success" && (
        <section className="contractor-action-panel contractor-action-panel--success">
          <span aria-hidden="true">✓</span>
          <h2>{successTitle}</h2>
          <p>
            {successTitle === "Updated quote submitted"
              ? "The landlord will review the changes before deciding whether to proceed."
              : "This update belongs only to this invitation, repair and response."}
          </p>
          <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
            View current response
          </button>
        </section>
      )}
    </main>
  );
}

type ReconfirmationAction =
  | "overview"
  | "confirm"
  | "availability"
  | "revise"
  | "withdraw"
  | "success";

export function ContractorReconfirmationExperience({
  token,
  task,
}: {
  token: string;
  task: ResolvedContractorTask;
}) {
  const [data, setData] = useState<ContractorReconfirmation>();
  const [action, setAction] = useState<ReconfirmationAction>("overview");
  const [confirmed, setConfirmed] = useState(false);
  const [availability, setAvailability] = useState([
    "Thursday 13 August, 08:00–12:00",
    "",
  ]);
  const [note, setNote] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [error, setError] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    repairScopeServices.reconfirmations
      .getReconfirmation(token)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => setError("This confirmation request is not available."));
    return () => {
      active = false;
    };
  }, [token]);

  const quote = data?.selection.selectedResponse
    .submittedData as SubmittedRepairQuote | undefined;

  const confirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result =
        await repairScopeServices.reconfirmations.confirmSelection(token, {
          idempotencyKey: `confirm-${data?.selection.selectionId}`,
        });
      setData(result.reconfirmation);
      setSuccessTitle("Price and availability confirmed");
      setAction("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const propose = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result =
        await repairScopeServices.reconfirmations.proposeAvailability(token, {
          options: availability,
          note,
          idempotencyKey: `availability-${data?.selection.selectionId}`,
        });
      setData(result.reconfirmation);
      setSuccessTitle("Different availability sent for landlord review");
      setAction("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Availability was not sent.");
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    setSubmitting(true);
    const result = await repairScopeServices.reconfirmations.withdraw(
      token,
      withdrawReason,
    );
    setData(result.reconfirmation);
    setSuccessTitle("Response withdrawn");
    setAction("success");
    setSubmitting(false);
  };

  if (!data || !quote) {
    return (
      <main className="contractor-procurement-page">
        {error ? (
          <section className="contractor-token-error" role="alert">
            <h1>Confirmation unavailable</h1>
            <p>{error}</p>
          </section>
        ) : (
          <p className="response-loading" role="status">
            Opening the confirmation request…
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="contractor-procurement-page">
      <header className="contractor-procurement-header">
        <div>
          <p className="eyebrow">
            Private selection request · {task.repairId.toUpperCase()}
          </p>
          <h1>
            {action === "success"
              ? successTitle
              : "Landlord would like to proceed"}
          </h1>
          <p>
            Reconfirm the exact selected response before an agreed repair scope
            is created.
          </p>
        </div>
        <StatusPill tone={action === "success" ? "good" : "attention"}>
          {action === "success" ? "Update sent" : "Confirmation requested"}
        </StatusPill>
      </header>
      <SecureLinkNotice />

      {(action === "overview" || action === "confirm") && (
        <>
          <CurrentQuote
            highlighted={action === "confirm"}
            quote={quote}
            version={data.selection.responseVersion}
          />
          {action === "confirm" && (
            <label className="contractor-confirm-check">
              <input
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>
                I confirm that this price, scope and stated availability remain
                valid.
              </span>
            </label>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-procurement-actions">
            {action === "overview" ? (
              <>
                <button className="button" onClick={() => setAction("confirm")} type="button">
                  Confirm price and availability
                </button>
                <button className="button button--secondary" onClick={() => setAction("availability")} type="button">
                  Propose different availability
                </button>
                <button className="button button--secondary" onClick={() => setAction("revise")} type="button">
                  Revise quote
                </button>
                <button className="text-button" onClick={() => setAction("withdraw")} type="button">
                  Withdraw
                </button>
              </>
            ) : (
              <>
                <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
                  Back
                </button>
                <button
                  className="button"
                  disabled={!confirmed || submitting}
                  onClick={() => void confirm()}
                  type="button"
                >
                  {submitting ? "Confirming…" : "Send final confirmation"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {action === "availability" && (
        <section className="contractor-action-panel">
          <p className="eyebrow">Timing change</p>
          <h2>Propose practical availability</h2>
          {availability.map((option, index) => (
            <label key={index}>
              <span>Option {index + 1}</span>
              <input
                onChange={(event) =>
                  setAvailability((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                placeholder="For example, Monday 17 August after 13:00"
                value={option}
              />
            </label>
          ))}
          <label>
            <span>Note — optional</span>
            <textarea
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
            />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="contractor-procurement-actions">
            <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
              Cancel
            </button>
            <button
              className="button"
              disabled={!availability.some((option) => option.trim()) || submitting}
              onClick={() => void propose()}
              type="button"
            >
              {submitting ? "Sending…" : "Send availability for review"}
            </button>
          </div>
        </section>
      )}

      {action === "revise" && (
        <SelectionQuoteRevision
          onCancel={() => setAction("overview")}
          onSubmitted={(response) => {
            setData((current) =>
              current
                ? {
                    ...current,
                    status: "contractor_revised_quote",
                    updatedAt: new Date().toISOString(),
                  }
                : current,
            );
            setSuccessTitle(
              `Revised quote Version ${response.version} sent for landlord review`,
            );
            setAction("success");
          }}
          reconfirmation={data}
          task={task}
          token={token}
        />
      )}

      {action === "withdraw" && (
        <section className="contractor-action-panel">
          <p className="eyebrow">Withdraw selection</p>
          <h2>Tell the landlord you cannot proceed?</h2>
          <label>
            <span>Reason — optional</span>
            <textarea
              onChange={(event) => setWithdrawReason(event.target.value)}
              rows={3}
              value={withdrawReason}
            />
          </label>
          <div className="contractor-procurement-actions">
            <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
              Keep response active
            </button>
            <button
              className="button"
              disabled={submitting}
              onClick={() => void withdraw()}
              type="button"
            >
              Confirm withdrawal
            </button>
          </div>
        </section>
      )}

      {action === "success" && (
        <section className="contractor-action-panel contractor-action-panel--success">
          <span aria-hidden="true">✓</span>
          <h2>{successTitle}</h2>
          <p>
            {data.status === "contractor_confirmed"
              ? "An immutable agreed scope has been created from the exact selected response."
              : "The landlord must review this update before the repair can proceed."}
          </p>
          <button className="button button--secondary" onClick={() => setAction("overview")} type="button">
            View selected response
          </button>
        </section>
      )}
    </main>
  );
}
