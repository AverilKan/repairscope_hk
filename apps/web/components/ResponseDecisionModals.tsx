"use client";

import { useState, type ReactNode } from "react";
import type { ClarificationSubmissionResult } from "@/domain/procurement";
import {
  formatSubmittedVat,
  latestSubmittedResponse,
  submittedInspection,
  submittedRepairQuote,
  type InspectionResponseRecord,
  type RepairQuoteRecord,
  type RepairResponseBundle,
} from "@/domain/responseComparison";
import type { SubmittedRepairQuote } from "@/domain/types";
import {
  formatMoney as formatCanonicalMoney,
  moneyFromMajor,
  type Money,
} from "@/domain/money";
import { repairScopeServices } from "@/services";
import { DecisionModal } from "./DecisionModal";
import { StatusPill } from "./SiteShell";

const showPrototypeControls =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_REPAIRSCOPE_DEMO_MODE !== "false";

const formatMoney = (amount: Money | number) =>
  formatCanonicalMoney(
    typeof amount === "number" ? moneyFromMajor(amount) : amount,
  );

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="decision-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function quoteStart(quote: SubmittedRepairQuote) {
  return quote.startAvailability || quote.laterStartDate || "Not stated";
}

function warrantyLabel(quote: SubmittedRepairQuote) {
  if (quote.guaranteePosition === "yes") {
    return quote.guaranteeDuration || "Included — duration not stated";
  }
  if (quote.guaranteePosition === "no") return "No warranty included";
  if (quote.guaranteePosition === "not_applicable") return "Not applicable";
  return "Not stated";
}

function materialItems(quote: SubmittedRepairQuote) {
  return [...quote.mainMaterials, quote.customMaterial].filter(Boolean);
}

function exclusionItems(quote: SubmittedRepairQuote) {
  return [...quote.exclusions, quote.otherExclusion].filter(Boolean);
}

type FollowUpResultState =
  | "none"
  | "awaiting_reply"
  | "answer_received"
  | "revised_quote_received"
  | "inspection_requested"
  | "quote_withdrawn";

export function QuoteDecisionModal({
  bundle,
  record,
  quoteRecords,
  clarification,
  onClose,
  onFollowUp,
  onSwitchQuote,
}: {
  bundle: RepairResponseBundle;
  record: RepairQuoteRecord;
  quoteRecords: RepairQuoteRecord[];
  clarification?: ClarificationSubmissionResult;
  onClose: () => void;
  onFollowUp: (record: RepairQuoteRecord) => void;
  onSwitchQuote: (record: RepairQuoteRecord) => void;
}) {
  const response = latestSubmittedResponse(record);
  const quote = submittedRepairQuote(record);
  const [mode, setMode] = useState<"detail" | "selection" | "awaiting">(
    "detail",
  );
  const [submitting, setSubmitting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [followUpState, setFollowUpState] = useState<FollowUpResultState>(
    clarification ? "awaiting_reply" : "none",
  );
  const currentIndex = quoteRecords.findIndex((item) => item.id === record.id);

  const askToConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSelectionError("");
    try {
      await repairScopeServices.selections.selectResponse(
        bundle.repairId,
        response.responseId,
        response.version,
      );
      setMode("awaiting");
    } catch (caught) {
      setSelectionError(
        caught instanceof Error
          ? caught.message
          : "The selection request could not be sent.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "selection"
      ? "Review this selection"
      : mode === "awaiting"
        ? "Selected — awaiting contractor confirmation"
        : `${record.contractor.displayName} quote`;

  return (
    <DecisionModal
      eyebrow={
        mode === "detail"
          ? `Repair ${bundle.repairReference} · Response version ${response.version}`
          : `Selection review · Version ${response.version}`
      }
      footer={
        mode === "detail" ? (
          <>
            <button
              className="button button--secondary"
              disabled={followUpState === "awaiting_reply"}
              onClick={() => onFollowUp(record)}
              type="button"
            >
              {followUpState === "awaiting_reply" ? "Awaiting reply" : "Follow up"}
            </button>
            <button className="button" onClick={() => setMode("selection")} type="button">
              Proceed with this quote
            </button>
          </>
        ) : mode === "selection" ? (
          <>
            <button
              className="button button--secondary"
              disabled={submitting}
              onClick={() => setMode("detail")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={submitting}
              onClick={() => void askToConfirm()}
              type="button"
            >
              {submitting ? "Sending request…" : "Ask contractor to confirm"}
            </button>
          </>
        ) : (
          <>
            <button className="button button--secondary" onClick={onClose} type="button">
              Close
            </button>
            <a
              className="button"
              href={`/landlord/repairs/${bundle.repairId}/confirmation`}
            >
              Open confirmation status
            </a>
          </>
        )
      }
      onClose={onClose}
      title={title}
    >
      {mode === "detail" && (
        <>
          <div className="decision-quote-switcher" aria-label="Quote switcher">
            <button
              disabled={currentIndex <= 0}
              onClick={() => onSwitchQuote(quoteRecords[currentIndex - 1])}
              type="button"
            >
              ← Previous quote
            </button>
            <span>
              {currentIndex + 1} of {quoteRecords.length}
            </span>
            <button
              disabled={currentIndex >= quoteRecords.length - 1}
              onClick={() => onSwitchQuote(quoteRecords[currentIndex + 1])}
              type="button"
            >
              Next quote →
            </button>
          </div>

          <div className="decision-total">
            <div>
              <span>
                {quote.priceStatus === "fixed"
                  ? "Fixed price"
                  : quote.priceStatus === "estimate"
                    ? "Estimate"
                    : "Price may change"}
              </span>
              <strong>{formatMoney(quote.finalTotal)}</strong>
              <small>{formatSubmittedVat(quote)}</small>
            </div>
            <dl>
              <div>
                <dt>Contractor</dt>
                <dd>{record.contractor.displayName}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(response.submittedAt)}</dd>
              </div>
            </dl>
          </div>

          <DetailSection title="All work items">
            <ol>
              {quote.workItems.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ol>
          </DetailSection>

          <DetailSection title="Full cost breakdown">
            <dl className="decision-costs">
              <div>
                <dt>Labour</dt>
                <dd>{formatMoney(quote.costSnapshot.labour)}</dd>
              </div>
              <div>
                <dt>Materials</dt>
                <dd>{formatMoney(quote.costSnapshot.materials)}</dd>
              </div>
              {quote.extraCharges.map((charge) => (
                <div key={charge.id}>
                  <dt>{charge.label || "Other charge"}</dt>
                  <dd>{formatMoney(Number(charge.amount || 0))}</dd>
                </div>
              ))}
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(quote.costSnapshot.subtotal)}</dd>
              </div>
              <div>
                <dt>VAT</dt>
                <dd>
                  {quote.costSnapshot.vat.amount
                    ? formatMoney(quote.costSnapshot.vat.amount)
                    : "Not stated"}
                </dd>
              </div>
              <div className="is-total">
                <dt>Final total</dt>
                <dd>{formatMoney(quote.finalTotal)}</dd>
              </div>
            </dl>
          </DetailSection>

          <div className="decision-detail-grid">
            <DetailSection title="Materials">
              {materialItems(quote).length ? (
                <ul>
                  {materialItems(quote).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Not stated</p>
              )}
              <p>Certainty: {quote.materialsStatus || "Not stated"}</p>
            </DetailSection>
            <DetailSection title="Exclusions">
              {exclusionItems(quote).length ? (
                <ul>
                  {exclusionItems(quote).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Not stated</p>
              )}
            </DetailSection>
            <DetailSection title="Reasons price could change">
              {quote.priceChangeReasons.length || quote.priceChangeNote ? (
                <>
                  <ul>
                    {quote.priceChangeReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {quote.priceChangeNote && <p>{quote.priceChangeNote}</p>}
                </>
              ) : (
                <p>None stated</p>
              )}
            </DetailSection>
            <DetailSection title="Timing">
              <dl>
                <div>
                  <dt>Earliest availability</dt>
                  <dd>{quoteStart(quote)}</dd>
                </div>
                <div>
                  <dt>Expected duration</dt>
                  <dd>{quote.duration || "Not stated"}</dd>
                </div>
              </dl>
            </DetailSection>
            <DetailSection title="Warranty and validity">
              <p>{warrantyLabel(quote)}</p>
              {quote.guaranteeNote && <p>{quote.guaranteeNote}</p>}
              <p>Quote validity: {quote.quoteValidity || "Not stated"}</p>
            </DetailSection>
            <DetailSection title="Supporting attachment">
              {quote.supportingAttachments?.length ? (
                <ul>
                  {quote.supportingAttachments.map((attachment) => (
                    <li key={attachment.id}>{attachment.name}</li>
                  ))}
                </ul>
              ) : (
                <p>No supporting attachment supplied.</p>
              )}
            </DetailSection>
          </div>

          <DetailSection title="Follow-up status">
            {followUpState === "none" && (
              <p>No follow-up has been sent for this response.</p>
            )}
            {followUpState === "awaiting_reply" && (
              <>
                <StatusPill tone="attention">Awaiting reply</StatusPill>
                <ul>
                  {clarification?.thread.messages
                    .filter((message) => message.sender === "landlord")
                    .map((message) => (
                      <li key={message.messageId}>{message.body}</li>
                    ))}
                </ul>
              </>
            )}
            {followUpState === "answer_received" && (
              <div className="follow-up-result">
                <StatusPill tone="good">Answer received</StatusPill>
                <p>
                  “The work should take one day. We include a 12-month
                  workmanship warranty.”
                </p>
                <small>Duration and warranty are now resolved.</small>
              </div>
            )}
            {followUpState === "revised_quote_received" && (
              <div className="follow-up-result">
                <StatusPill tone="attention">Revised quote received</StatusPill>
                <p>
                  Review the active Version {record.latestVersion}; earlier
                  versions remain available below.
                </p>
              </div>
            )}
            {followUpState === "inspection_requested" && (
              <StatusPill tone="attention">
                Contractor requested inspection
              </StatusPill>
            )}
            {followUpState === "quote_withdrawn" && (
              <StatusPill tone="attention">Quote withdrawn</StatusPill>
            )}
            {showPrototypeControls && (
              <label className="prototype-inline-state" data-prototype-control>
                <span>Preview result state</span>
                <select
                  onChange={(event) =>
                    setFollowUpState(event.target.value as FollowUpResultState)
                  }
                  value={followUpState}
                >
                  <option value="none">No follow-up</option>
                  <option value="awaiting_reply">Awaiting reply</option>
                  <option value="answer_received">Answer received</option>
                  <option value="revised_quote_received">
                    Revised quote received
                  </option>
                  <option value="inspection_requested">
                    Inspection requested
                  </option>
                  <option value="quote_withdrawn">Quote withdrawn</option>
                </select>
              </label>
            )}
          </DetailSection>

          {record.versions.length > 1 && (
            <DetailSection title="Previous versions">
              <div className="quote-version-list">
                {record.versions
                  .slice()
                  .reverse()
                  .map((version) => (
                    <details key={version.responseId}>
                      <summary>
                        Version {version.version} ·{" "}
                        {formatDateTime(version.submittedAt)}
                      </summary>
                      <p>
                        Submitted total:{" "}
                        {formatMoney(
                          (version.submittedData as SubmittedRepairQuote)
                            .finalTotal,
                        )}
                      </p>
                      {version.changeSummary?.length && (
                        <ul>
                          {version.changeSummary.map((change) => (
                            <li key={change}>{change}</li>
                          ))}
                        </ul>
                      )}
                    </details>
                  ))}
              </div>
            </DetailSection>
          )}
        </>
      )}

      {mode === "selection" && (
        <div className="selection-review">
          <div className="selection-review__notice">
            <strong>You are not appointing the contractor yet</strong>
            <p>
              You are asking the contractor to confirm that this price, scope
              and availability are still valid. The repair is not appointed
              until they confirm.
            </p>
          </div>
          <div className="decision-total">
            <div>
              <span>Selected response total</span>
              <strong>{formatMoney(quote.finalTotal)}</strong>
              <small>{formatSubmittedVat(quote)}</small>
            </div>
            <dl>
              <div>
                <dt>Contractor</dt>
                <dd>{record.contractor.displayName}</dd>
              </div>
              <div>
                <dt>Quote version</dt>
                <dd>Version {response.version}</dd>
              </div>
            </dl>
          </div>
          <DetailSection title="Final work scope">
            <ol>
              {quote.workItems.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ol>
          </DetailSection>
          <dl className="selection-review__facts">
            <div>
              <dt>Materials</dt>
              <dd>{materialItems(quote).join(", ") || "Not stated"}</dd>
            </div>
            <div>
              <dt>Exclusions</dt>
              <dd>{exclusionItems(quote).join(", ") || "None stated"}</dd>
            </div>
            <div>
              <dt>Possible price changes</dt>
              <dd>
                {[...quote.priceChangeReasons, quote.priceChangeNote]
                  .filter(Boolean)
                  .join(", ") || "None stated"}
              </dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{quoteStart(quote)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{quote.duration || "Not stated"}</dd>
            </div>
            <div>
              <dt>Warranty</dt>
              <dd>{warrantyLabel(quote)}</dd>
            </div>
          </dl>
          {selectionError && (
            <p className="field-error" role="alert">{selectionError}</p>
          )}
        </div>
      )}

      {mode === "awaiting" && (
        <div className="selection-success" role="status">
          <span aria-hidden="true">✓</span>
          <h3>Selected — awaiting contractor confirmation</h3>
          <p>
            {record.contractor.displayName} has been asked to reconfirm Version{" "}
            {response.version}. Other responses remain preserved in the repair
            history.
          </p>
          <dl>
            <div>
              <dt>Selected total</dt>
              <dd>{formatMoney(quote.finalTotal)}</dd>
            </div>
            <div>
              <dt>Request status</dt>
              <dd>Confirmation requested</dd>
            </div>
          </dl>
        </div>
      )}
    </DecisionModal>
  );
}

type InspectionMode =
  | "detail"
  | "question"
  | "question_sent"
  | "decline"
  | "declined"
  | "review"
  | "awaiting";

export function InspectionDecisionModal({
  bundle,
  record,
  onClose,
}: {
  bundle: RepairResponseBundle;
  record: InspectionResponseRecord;
  onClose: () => void;
}) {
  const inspection = submittedInspection(record);
  const [mode, setMode] = useState<InspectionMode>("detail");
  const [question, setQuestion] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [attendance, setAttendance] = useState(
    inspection.preferredWindows[0] ?? "",
  );
  const [accessContact, setAccessContact] = useState(
    "Alex Morgan · 07712 345678",
  );
  const [accessInformation, setAccessInformation] = useState(
    inspection.accessRequired.join(", "),
  );
  const [submitting, setSubmitting] = useState(false);
  const [inspectionDecisionId, setInspectionDecisionId] = useState("");
  const [serviceError, setServiceError] = useState("");

  const title =
    mode === "question"
      ? "Ask about the inspection"
      : mode === "decline"
        ? "Decline this inspection"
        : mode === "review"
          ? "Review the inspection request"
          : mode === "awaiting"
            ? "Inspection requested — awaiting contractor confirmation"
            : mode === "declined"
              ? "Inspection declined"
              : mode === "question_sent"
                ? "Question sent privately"
                : `${record.contractor.displayName} inspection`;

  const attendanceWindows = inspection.preferredWindows
    .filter(Boolean)
    .map((label, index) => ({
      windowId: `landlord-window-${index + 1}`,
      startsAt: "",
      endsAt: "",
      label,
    }));

  const submitInspection = async () => {
    if (submitting) return;
    setSubmitting(true);
    setServiceError("");
    try {
      const decision =
        await repairScopeServices.inspections.proceedWithInspection(
          bundle.repairId,
          record.response.responseId,
          {
            preferredAttendanceWindows: attendanceWindows.filter(
              (window) => window.label === attendance,
            ),
            accessContact: {
              name: accessContact,
            },
            accessRequirements: accessInformation
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          },
        );
      setInspectionDecisionId(decision.inspectionDecisionId);
      setMode("awaiting");
    } catch (caught) {
      setServiceError(
        caught instanceof Error
          ? caught.message
          : "The inspection confirmation request could not be sent.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const declineInspection = async () => {
    if (submitting) return;
    setSubmitting(true);
    setServiceError("");
    try {
      const decision = await repairScopeServices.inspections.declineInspection(
        bundle.repairId,
        record.response.responseId,
        declineReason,
      );
      setInspectionDecisionId(decision.inspectionDecisionId);
      setMode("declined");
    } catch (caught) {
      setServiceError(
        caught instanceof Error
          ? caught.message
          : "The inspection could not be declined.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DecisionModal
      eyebrow={`Repair ${bundle.repairReference} · Inspection decision`}
      footer={
        mode === "detail" ? (
          <>
            <button className="button button--secondary" onClick={() => setMode("question")} type="button">
              Ask a question
            </button>
            <button className="button button--secondary" onClick={() => setMode("decline")} type="button">
              Decline inspection
            </button>
            <button className="button" onClick={() => setMode("review")} type="button">
              Proceed with inspection
            </button>
          </>
        ) : mode === "question" ? (
          <>
            <button className="button button--secondary" onClick={() => setMode("detail")} type="button">
              Cancel
            </button>
            <button
              className="button"
              disabled={!question.trim()}
              onClick={() => setMode("question_sent")}
              type="button"
            >
              Send private question
            </button>
          </>
        ) : mode === "decline" ? (
          <>
            <button className="button button--secondary" onClick={() => setMode("detail")} type="button">
              Keep inspection available
            </button>
            <button
              className="button"
              disabled={submitting}
              onClick={() => void declineInspection()}
              type="button"
            >
              {submitting ? "Declining…" : "Confirm decline"}
            </button>
          </>
        ) : mode === "review" ? (
          <>
            <button
              className="button button--secondary"
              disabled={submitting}
              onClick={() => setMode("detail")}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={
                !attendance.trim() ||
                !accessContact.trim() ||
                !accessInformation.trim() ||
                submitting
              }
              onClick={() => void submitInspection()}
              type="button"
            >
              {submitting
                ? "Sending request…"
                : "Ask contractor to confirm inspection"}
            </button>
          </>
        ) : (
          <button className="button" onClick={onClose} type="button">
            Close
          </button>
        )
      }
      onClose={onClose}
      title={title}
    >
      {mode === "detail" && (
        <>
          <StatusPill tone="attention">
            Inspection request — not a repair quote
          </StatusPill>
          <div className="decision-total">
            <div>
              <span>Accepted inspection fee</span>
              <strong>{formatMoney(inspection.finalFee)}</strong>
              <small>VAT {inspection.vat.mode.replaceAll("_", " ")}</small>
            </div>
            <dl>
              <div>
                <dt>Contractor</dt>
                <dd>{record.contractor.displayName}</dd>
              </div>
              <div>
                <dt>Expected attendance</dt>
                <dd>{inspection.attendance || "Not stated"}</dd>
              </div>
            </dl>
          </div>
          <div className="decision-detail-grid">
            <DetailSection title="Why inspection is required">
              <ul>
                {inspection.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {inspection.note && <p>{inspection.note}</p>}
            </DetailSection>
            <DetailSection title="Fee deduction">
              <p>
                {inspection.deductionPosition === "full"
                  ? `The full ${formatMoney(inspection.finalFee)} fee will be deducted if appointed.`
                  : `Deduction position: ${inspection.deductionPosition || "Not stated"}`}
              </p>
            </DetailSection>
            <DetailSection title="Attendance options">
              <ul>
                {inspection.preferredWindows.filter(Boolean).map((window) => (
                  <li key={window}>{window}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Access requirements">
              <ul>
                {inspection.accessRequired.map((access) => (
                  <li key={access}>{access}</li>
                ))}
              </ul>
              {inspection.otherAccess && <p>{inspection.otherAccess}</p>}
            </DetailSection>
            <DetailSection title="Repair quote after inspection">
              <p>{inspection.proposalTiming || "Not stated"}</p>
            </DetailSection>
          </div>
        </>
      )}

      {mode === "question" && (
        <div className="inspection-decision-form">
          <p>
            This question is private. Other contractors will not see it or the
            inspection response.
          </p>
          <label>
            <span>Your question</span>
            <textarea
              autoFocus
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              value={question}
            />
          </label>
        </div>
      )}

      {mode === "decline" && (
        <div className="inspection-decision-form">
          <p>
            Declining this inspection does not change or reveal any other
            contractor response.
          </p>
          <label>
            <span>Reason — optional</span>
            <textarea
              onChange={(event) => setDeclineReason(event.target.value)}
              rows={4}
              value={declineReason}
            />
          </label>
        </div>
      )}

      {mode === "review" && (
        <div className="inspection-review">
          <div className="selection-review__notice">
            <strong>Review before requesting confirmation</strong>
            <p>
              This is not live appointment booking. The contractor must still
              confirm the inspection.
            </p>
          </div>
          <dl className="selection-review__facts">
            <div>
              <dt>Accepted fee</dt>
              <dd>{formatMoney(inspection.finalFee)}</dd>
            </div>
            <div>
              <dt>VAT</dt>
              <dd>{inspection.vat.mode.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Fee deduction</dt>
              <dd>
                {inspection.deductionPosition === "full"
                  ? "Deducted in full if appointed"
                  : inspection.deductionPosition}
              </dd>
            </div>
          </dl>
          <label>
            <span>Preferred attendance window</span>
            <select
              onChange={(event) => setAttendance(event.target.value)}
              value={attendance}
            >
              {inspection.preferredWindows.filter(Boolean).map((window) => (
                <option key={window}>{window}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Access contact</span>
            <input
              onChange={(event) => setAccessContact(event.target.value)}
              value={accessContact}
            />
          </label>
          <label>
            <span>Required access information</span>
            <textarea
              onChange={(event) => setAccessInformation(event.target.value)}
              rows={3}
              value={accessInformation}
            />
          </label>
        </div>
      )}

      {(mode === "question_sent" ||
        mode === "declined" ||
        mode === "awaiting") && (
        <div className="selection-success" role="status">
          <span aria-hidden="true">✓</span>
          <h3>
            {mode === "question_sent"
              ? "Question sent privately"
              : mode === "declined"
                ? "Inspection declined"
                : "Inspection requested — awaiting contractor confirmation"}
          </h3>
          <p>
            {mode === "question_sent"
              ? question
              : mode === "declined"
                ? declineReason || "No decline reason was added."
                : `${record.contractor.displayName} has been asked to confirm ${attendance}.`}
          </p>
          {inspectionDecisionId && (
            <small>Decision reference: {inspectionDecisionId}</small>
          )}
        </div>
      )}
      {serviceError && (
        <p className="field-error" role="alert">
          {serviceError}
        </p>
      )}
    </DecisionModal>
  );
}
