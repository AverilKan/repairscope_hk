"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  AgreedScope,
  ContractorChangeReview,
  ContractorReconfirmation,
  ContractorReconfirmationStatus,
  RepairProgress,
  RepairSelection,
  RepairStage,
  RepairSummary,
} from "@/domain/procurement";
import type { SubmittedRepairQuote } from "@/domain/types";
import {
  formatMoney as formatCanonicalMoney,
  moneyFromMajor,
  type Money,
} from "@/domain/money";
import { repairScopeServices } from "@/services";
import { DecisionModal } from "./DecisionModal";
import { BackLink, StatusPill } from "./SiteShell";

const formatMoney = (amount: Money | number) =>
  formatCanonicalMoney(
    typeof amount === "number" ? moneyFromMajor(amount) : amount,
  );

const showPrototypeControls =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_REPAIRSCOPE_DEMO_MODE !== "false";

// `repairs` (the only state this formats) is populated exclusively via a
// client-side effect below — it's `undefined` during the initial SSR/
// hydration render, so this never runs before hydration completes and a
// real `new Date()` here can't produce a server/client mismatch.
export const formatUpdatedAt = (value: string) =>
  new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" }).format(
    -Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000)),
    "hour",
  );

const stageLabels: Record<RepairStage, string> = {
  draft: "Draft",
  brief_ready: "Brief ready",
  awaiting_sourcing: "Awaiting sourcing",
  sourcing: "Sourcing contractors",
  responses_received: "Responses received",
  clarification_required: "Clarification needed",
  selection_pending: "Selection pending",
  awaiting_contractor_confirmation: "Awaiting contractor confirmation",
  repair_in_progress: "Repair in progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

type RepairFilter =
  | "all"
  | "drafts"
  | "sourcing"
  | "responses"
  | "action"
  | "progress"
  | "completed";

const repairFilters: { id: RepairFilter; label: string; stages?: RepairStage[] }[] =
  [
    { id: "all", label: "All" },
    { id: "drafts", label: "Drafts", stages: ["draft", "brief_ready"] },
    {
      id: "sourcing",
      label: "Sourcing",
      stages: ["awaiting_sourcing", "sourcing"],
    },
    {
      id: "responses",
      label: "Responses ready",
      stages: ["responses_received"],
    },
    {
      id: "action",
      label: "Action needed",
      stages: ["brief_ready", "clarification_required", "selection_pending"],
    },
    {
      id: "progress",
      label: "Repair in progress",
      stages: ["repair_in_progress", "awaiting_contractor_confirmation"],
    },
    { id: "completed", label: "Completed", stages: ["completed"] },
  ];

export function LandlordRepairsPage() {
  const [activeFilter, setActiveFilter] = useState<RepairFilter>("all");
  const [postcodeFilter, setPostcodeFilter] = useState("all");
  const [postcodeOptions, setPostcodeOptions] = useState<string[]>([]);
  const [repairs, setRepairs] = useState<RepairSummary[]>();
  const [forcedState, setForcedState] = useState<"empty" | "failed">();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const filter = repairFilters.find((item) => item.id === activeFilter);
    const filters = {
      ...(filter?.stages ? { stages: filter.stages } : {}),
      ...(postcodeFilter !== "all" ? { postcode: postcodeFilter } : {}),
    };
    repairScopeServices.landlordRepairs
      .listRepairs(Object.keys(filters).length ? filters : undefined)
      .then((items) => {
        if (!active) return;
        setRepairs(items);
        if (activeFilter === "all" && postcodeFilter === "all") {
          setPostcodeOptions(
            Array.from(
              new Set(items.map((repair) => repair.propertyPostcode)),
            ).sort(),
          );
        }
      })
      .catch(() => {
        if (active) setForcedState("failed");
      });
    return () => {
      active = false;
    };
  }, [activeFilter, postcodeFilter, refreshKey]);

  const viewState =
    forcedState ??
    (repairs ? (repairs.length ? "ready" : "empty") : "loading");

  const retry = () => {
    setRepairs(undefined);
    setForcedState(undefined);
    setRefreshKey((current) => current + 1);
  };

  return (
    <main className="content-page repairs-index">
      <header className="repairs-index__header">
        <div>
          <p className="eyebrow">Signed-in landlord workspace</p>
          <h1>My repairs</h1>
          <p>
            Continue a repair from its current procurement or progress stage.
          </p>
        </div>
        <Link className="button" href="/landlord/repairs/new">
          Add new repair
        </Link>
      </header>

      <section aria-label="Filter repairs" className="repair-filter-bar">
        <label>
          <span>Repair stage</span>
          <select
            onChange={(event) => {
              setRepairs(undefined);
              setForcedState(undefined);
              setActiveFilter(event.target.value as RepairFilter);
            }}
            value={activeFilter}
          >
            {repairFilters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Property postcode</span>
          <select
            onChange={(event) => {
              setRepairs(undefined);
              setForcedState(undefined);
              setPostcodeFilter(event.target.value);
            }}
            value={postcodeFilter}
          >
            <option value="all">All postcodes</option>
            {postcodeOptions.map((postcode) => (
              <option key={postcode} value={postcode}>
                {postcode}
              </option>
            ))}
          </select>
        </label>
        {(activeFilter !== "all" || postcodeFilter !== "all") && (
          <button
            className="repair-filter-clear"
            onClick={() => {
              setRepairs(undefined);
              setForcedState(undefined);
              setActiveFilter("all");
              setPostcodeFilter("all");
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
        <span aria-live="polite" className="repair-filter-count">
          {repairs
            ? `${repairs.length} ${repairs.length === 1 ? "repair" : "repairs"}`
            : "Updating repairs…"}
        </span>
      </section>

      {viewState === "loading" && (
        <section className="repairs-list-state" role="status">
          <span className="repairs-list-state__mark" aria-hidden="true" />
          <h2>Loading your repairs…</h2>
          <p>Repair stages and latest updates are being retrieved.</p>
        </section>
      )}

      {viewState === "failed" && (
        <section className="repairs-list-state" role="alert">
          <h2>Your repairs could not be loaded</h2>
          <p>No information has been changed. Try the mock request again.</p>
          <button className="button button--secondary" onClick={retry} type="button">
            Try again
          </button>
        </section>
      )}

      {viewState === "empty" && (
        <section className="repairs-list-state">
          <h2>No repairs in this view</h2>
          <p>Choose another filter or start a new repair.</p>
          <Link className="button button--secondary" href="/landlord/repairs/new">
            Add new repair
          </Link>
        </section>
      )}

      {viewState === "ready" && repairs && (
        <section aria-label="Repairs" className="repairs-list">
          {repairs.map((repair) => (
            <Link
              className="repair-list-item"
              href={repair.destination}
              key={repair.repairId}
            >
              <div className="repair-list-item__main">
                <span
                  className={`repair-stage repair-stage--${repair.stage}`}
                >
                  {stageLabels[repair.stage]}
                </span>
                <h2>{repair.title}</h2>
                <p>{repair.propertyLabel}</p>
              </div>
              <div className="repair-list-item__update">
                <span>Latest update</span>
                <strong>{repair.latestUpdate}</strong>
                {repair.actionRequired && (
                  <small>Action: {repair.actionRequired}</small>
                )}
              </div>
              <time dateTime={repair.updatedAt}>
                Updated {formatUpdatedAt(repair.updatedAt)}
              </time>
              <span aria-hidden="true" className="repair-list-item__arrow">
                →
              </span>
            </Link>
          ))}
        </section>
      )}

      {showPrototypeControls && (
        <aside className="clean-dev-toolbar" data-prototype-control>
          <span>List state</span>
          <button onClick={() => setForcedState("empty")} type="button">
            Empty
          </button>
          <button onClick={() => setForcedState("failed")} type="button">
            Failed
          </button>
          <button onClick={retry} type="button">
            Ready
          </button>
        </aside>
      )}
    </main>
  );
}

function SelectedQuoteSummary({
  quote,
  agreed,
}: {
  quote: SubmittedRepairQuote;
  agreed?: AgreedScope;
}) {
  return (
    <div className="selection-quote-summary">
      <div className="selection-quote-summary__total">
        <span>{agreed ? "Agreed total" : "Selected total"}</span>
        <strong>{formatMoney(quote.finalTotal)}</strong>
        <small>
          {quote.costSnapshot.vat.mode === "not_charged"
            ? "VAT not charged"
            : quote.costSnapshot.vat.amount
              ? `${formatMoney(quote.costSnapshot.vat.amount)} VAT`
              : "VAT not stated"}
        </small>
      </div>
      <section>
        <h3>Final work scope</h3>
        <ol>
          {quote.workItems.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ol>
      </section>
      <dl className="selection-facts">
        <div>
          <dt>Materials</dt>
          <dd>
            {[...quote.mainMaterials, quote.customMaterial]
              .filter(Boolean)
              .join(", ") || "Not stated"}
          </dd>
        </div>
        <div>
          <dt>Exclusions</dt>
          <dd>
            {[...quote.exclusions, quote.otherExclusion]
              .filter(Boolean)
              .join(", ") || "None stated"}
          </dd>
        </div>
        <div>
          <dt>Possible price changes</dt>
          <dd>
            {[
              ...quote.priceChangeReasons,
              quote.otherPriceChangeReason,
              quote.priceChangeNote,
            ]
              .filter(Boolean)
              .join(", ") || "None stated"}
          </dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>
            {quote.startAvailability || quote.laterStartDate || "Not stated"}
          </dd>
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
              : quote.guaranteePosition || "Not stated"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function AwaitingConfirmationPage({ repairId }: { repairId: string }) {
  const [selection, setSelection] = useState<RepairSelection>();
  const [reconfirmation, setReconfirmation] =
    useState<ContractorReconfirmation>();
  const [status, setStatus] =
    useState<ContractorReconfirmationStatus>("confirmation_requested");
  const [selectionStatus, setSelectionStatus] =
    useState<RepairSelection["status"]>("confirmation_requested");
  const [loadError, setLoadError] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [changeReview, setChangeReview] =
    useState<ContractorChangeReview>();
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const quoteTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      repairScopeServices.selections.getSelection(repairId),
      repairScopeServices.reconfirmations.getForRepair(repairId),
    ])
      .then(([selectionResult, reconfirmationResult]) => {
        if (!active) return;
        setSelection(selectionResult);
        setReconfirmation(reconfirmationResult);
        setSelectionStatus(selectionResult.status);
        setStatus(reconfirmationResult.status);
      })
      .catch(() => {
        if (active) {
          setLoadError("The contractor confirmation status could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [repairId]);

  const statusCopy =
    status === "contractor_proposed_availability" ||
    status === "contractor_revised_quote"
      ? "Contractor proposed changes"
      : status === "contractor_withdrew"
        ? "Contractor withdrew"
        : status === "confirmation_expired"
          ? "Confirmation expired"
          : status === "contractor_confirmed"
            ? "Contractor confirmed"
            : "Waiting for contractor confirmation";

  const cancel = async () => {
    if (!selection) return;
    const result = await repairScopeServices.selections.cancelSelection(
      repairId,
      selection.selectionId,
    );
    setSelectionStatus(result.status);
  };

  const openChangeReview = async () => {
    setShowQuote(true);
    setReviewError("");
    try {
      const review =
        await repairScopeServices.selections.reviewContractorChanges(
          repairId,
          selection!.selectionId,
        );
      setChangeReview(review);
    } catch (caught) {
      setReviewError(
        caught instanceof Error
          ? caught.message
          : "The contractor changes could not be loaded.",
      );
    }
  };

  const declineChanges = async () => {
    if (reviewing || !changeReview) return;
    setReviewing(true);
    try {
      const unchanged =
        await repairScopeServices.selections.declineContractorChanges(
          repairId,
          selection!.selectionId,
        );
      setSelection(unchanged);
      setStatus("confirmation_requested");
      setShowQuote(false);
    } finally {
      setReviewing(false);
    }
  };

  const acceptChanges = async () => {
    if (reviewing || !changeReview) return;
    setReviewing(true);
    try {
      if (
        changeReview.proposedResponseId &&
        changeReview.proposedVersion
      ) {
        const accepted =
          await repairScopeServices.selections.acceptRevisedResponse(
            repairId,
            selection!.selectionId,
            changeReview.proposedResponseId,
            changeReview.proposedVersion,
          );
        setSelection(accepted);
        setStatus("confirmation_requested");
      } else if (changeReview.proposedAvailability?.length) {
        const accepted =
          await repairScopeServices.selections.acceptProposedAvailability(
            repairId,
            selection!.selectionId,
            changeReview.proposedAvailability,
          );
        setSelection(accepted);
        setStatus("contractor_confirmed");
      }
      setShowQuote(false);
    } finally {
      setReviewing(false);
    }
  };

  if (loadError) {
    return (
      <main className="content-page">
        <section className="repairs-list-state" role="alert">
          <h1>Confirmation unavailable</h1>
          <p>{loadError}</p>
        </section>
      </main>
    );
  }

  if (!selection || !reconfirmation) {
    return (
      <main className="content-page">
        <p className="response-loading" role="status">
          Loading contractor confirmation…
        </p>
      </main>
    );
  }

  const quote = selection.selectedResponse.submittedData as SubmittedRepairQuote;

  return (
    <>
      <main className="content-page selection-status-page">
        <BackLink href="/landlord/repairs" label="My repairs" />
        <header className="selection-status-header">
          <div>
            <p className="eyebrow">
              Repair {selection.repairId.toUpperCase()} · Selection status
            </p>
            <h1>{statusCopy}</h1>
            <p>
              {status === "confirmation_requested"
                ? "The selected response remains provisional until the contractor reconfirms its price, scope and availability."
                : "Review the latest contractor response before the repair moves forward."}
            </p>
          </div>
          <StatusPill
            tone={
              status === "contractor_confirmed"
                ? "good"
                : status === "contractor_withdrew"
                  ? "attention"
                  : "neutral"
            }
          >
            {selectionStatus === "cancelled" ? "Selection cancelled" : statusCopy}
          </StatusPill>
        </header>

        <section className="selection-status-card">
          <div className="selection-status-card__identity">
            <span>Selected contractor</span>
            <h2>{selection.contractorDisplayName}</h2>
            <p>Response version {selection.responseVersion}</p>
          </div>
          <dl>
            <div>
              <dt>Selected total</dt>
              <dd>{formatMoney(quote.finalTotal)}</dd>
            </div>
            <div>
              <dt>Scope summary</dt>
              <dd>{quote.workItems.length} stated work items</dd>
            </div>
            <div>
              <dt>Request sent</dt>
              <dd>
                {new Date(selection.selectedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            <div>
              <dt>Proposed availability</dt>
              <dd>{quote.startAvailability}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{statusCopy}</dd>
            </div>
          </dl>

          {(status === "contractor_proposed_availability" ||
            status === "contractor_revised_quote") && (
            <div className="selection-change-notice" role="status">
              <div>
                <strong>Contractor proposed changes</strong>
                <p>
                  The selected price, scope or timing has not been accepted
                  automatically.
                </p>
              </div>
              <button
                className="button"
                onClick={() => void openChangeReview()}
                type="button"
              >
                Review changes
              </button>
            </div>
          )}

          <div className="selection-status-actions">
            <button
              className="button button--secondary"
              onClick={() => {
                setChangeReview(undefined);
                setShowQuote(true);
              }}
              ref={quoteTriggerRef}
              type="button"
            >
              View selected quote
            </button>
            <Link
              className="button button--secondary"
              href={`/landlord/repairs/${repairId}/responses`}
            >
              View all responses
            </Link>
            {status === "confirmation_requested" &&
              selectionStatus !== "cancelled" && (
                <button className="text-button" onClick={() => void cancel()} type="button">
                  Cancel selection
                </button>
              )}
          </div>
        </section>

        {showPrototypeControls && (
          <aside className="clean-dev-toolbar" data-prototype-control>
            <label htmlFor="confirmation-demo-state">Contractor state</label>
            <select
              id="confirmation-demo-state"
              onChange={(event) =>
                setStatus(event.target.value as ContractorReconfirmationStatus)
              }
              value={status}
            >
              <option value="confirmation_requested">Confirmation requested</option>
              <option value="contractor_confirmed">Contractor confirmed</option>
              <option value="contractor_proposed_availability">
                New availability
              </option>
              <option value="contractor_revised_quote">Revised quote</option>
              <option value="contractor_withdrew">Contractor withdrew</option>
              <option value="confirmation_expired">Confirmation expired</option>
            </select>
          </aside>
        )}
      </main>

      {showQuote && (
        <DecisionModal
          eyebrow={`Selected response · Version ${selection.responseVersion}`}
          footer={
            <>
              {changeReview &&
              (status === "contractor_proposed_availability" ||
                status === "contractor_revised_quote") ? (
                <>
                  <Link
                    className="button button--secondary"
                    href={`/landlord/repairs/${repairId}/responses`}
                  >
                    Return to all responses
                  </Link>
                  <button
                    className="button button--secondary"
                    disabled={reviewing}
                    onClick={() => void declineChanges()}
                    type="button"
                  >
                    {status === "contractor_revised_quote"
                      ? "Decline revised quote"
                      : "Decline changes"}
                  </button>
                  <button
                    className="button"
                    disabled={reviewing}
                    onClick={() => void acceptChanges()}
                    type="button"
                  >
                    {reviewing
                      ? "Saving decision…"
                      : status === "contractor_revised_quote"
                        ? "Accept revised quote and ask contractor to confirm"
                        : "Accept new availability"}
                  </button>
                </>
              ) : (
                <button
                  className="button button--secondary"
                  onClick={() => setShowQuote(false)}
                  type="button"
                >
                  Close
                </button>
              )}
              {status === "contractor_confirmed" && !changeReview && (
                <Link
                  className="button"
                  href={`/landlord/repairs/${repairId}/progress`}
                >
                  Open repair progress
                </Link>
              )}
            </>
          }
          onClose={() => {
            setShowQuote(false);
            window.requestAnimationFrame(() => quoteTriggerRef.current?.focus());
          }}
          title={
            changeReview
              ? `Review changes from ${selection.contractorDisplayName}`
              : `${selection.contractorDisplayName} quote`
          }
        >
          {reviewError && (
            <p className="field-error" role="alert">
              {reviewError}
            </p>
          )}
          {changeReview?.proposedAvailability?.length ? (
            <div className="selection-review">
              <h3>Availability change</h3>
              <dl className="selection-review__facts">
                <div>
                  <dt>Originally requested</dt>
                  <dd>
                    {quote.startAvailability ||
                      quote.laterStartDate ||
                      "Not stated"}
                  </dd>
                </div>
                <div>
                  <dt>Contractor proposed</dt>
                  <dd>
                    {changeReview.proposedAvailability
                      .map((window) => window.label)
                      .join(", ")}
                  </dd>
                </div>
              </dl>
              <p>
                Price and work scope remain attached to Version{" "}
                {selection.responseVersion}.
              </p>
            </div>
          ) : changeReview?.proposedResponse?.responseType ===
            "repair_quote" ? (
            <div className="selection-review">
              <section>
                <h3>Selected Version {changeReview.originalVersion}</h3>
                <SelectedQuoteSummary quote={quote} />
              </section>
              <section>
                <h3>Proposed Version {changeReview.proposedVersion}</h3>
                <SelectedQuoteSummary
                  quote={
                    changeReview.proposedResponse
                      .submittedData as SubmittedRepairQuote
                  }
                />
              </section>
              <section>
                <h3>What changed</h3>
                <ul>
                  {changeReview.changeSummary.map((change) => (
                    <li key={`${change.field}-${change.label}`}>
                      <strong>{change.label}:</strong> {change.before} →{" "}
                      {change.after}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <SelectedQuoteSummary quote={quote} />
          )}
        </DecisionModal>
      )}
    </>
  );
}

const progressStages: {
  id: RepairProgress["currentStage"];
  label: string;
}[] = [
  { id: "contractor_appointed", label: "Contractor appointed" },
  { id: "appointment_agreed", label: "Appointment agreed" },
  { id: "work_underway", label: "Work underway" },
  { id: "work_reported_complete", label: "Work reported complete" },
  { id: "landlord_review", label: "Landlord review" },
  { id: "closed", label: "Closed" },
];

export function RepairProgressPage({
  repairId,
  completed = false,
}: {
  repairId: string;
  completed?: boolean;
}) {
  const [progress, setProgress] = useState<RepairProgress>();
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"agreed" | "history">();
  const returnFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    repairScopeServices.progress
      .getProgress(repairId)
      .then((result) => {
        if (!active) return;
        setProgress(
          completed
            ? {
                ...result,
                currentStage: "closed",
                repair: { ...result.repair, stage: "completed" },
              }
            : result,
        );
      })
      .catch(() => {
        if (active) setError("Repair progress could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [completed, repairId]);

  const currentStageIndex = progress
    ? progressStages.findIndex((stage) => stage.id === progress.currentStage)
    : -1;

  if (error) {
    return (
      <main className="content-page">
        <section className="repairs-list-state" role="alert">
          <h1>Progress unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!progress) {
    return (
      <main className="content-page">
        <p className="response-loading" role="status">
          Loading repair progress…
        </p>
      </main>
    );
  }

  const quote = progress.agreedScope;

  return (
    <>
      <main className="content-page progress-page">
        <BackLink href="/landlord/repairs" label="My repairs" />
        <header className="progress-header">
          <div>
            <p className="eyebrow">Repair {progress.repair.reference}</p>
            <h1>{progress.repair.title}</h1>
            <p>
              {progress.contractor.displayName} ·{" "}
              {formatMoney(quote.finalTotal)} ·{" "}
              {quote.confirmedAvailability}
            </p>
          </div>
          <StatusPill tone={completed ? "good" : "neutral"}>
            {progressStages[currentStageIndex]?.label}
          </StatusPill>
        </header>

        <div className="progress-actions">
          <button
            className="button button--secondary"
            onClick={(event) => {
              returnFocusRef.current = event.currentTarget;
              setModal("agreed");
            }}
            type="button"
          >
            View agreed quote
          </button>
          <button
            className="button button--secondary"
            onClick={(event) => {
              returnFocusRef.current = event.currentTarget;
              setModal("history");
            }}
            type="button"
          >
            View response history
          </button>
        </div>

        <section className="progress-timeline-section">
          <h2>Repair progress</h2>
          <ol className="progress-timeline">
            {progressStages.map((stage, index) => (
              <li
                className={
                  index < currentStageIndex
                    ? "is-complete"
                    : index === currentStageIndex
                      ? "is-current"
                      : ""
                }
                key={stage.id}
              >
                <span aria-hidden="true">
                  {index < currentStageIndex ? "✓" : index + 1}
                </span>
                <strong>{stage.label}</strong>
                <small>
                  {index < currentStageIndex
                    ? "Completed"
                    : index === currentStageIndex
                      ? "Current stage"
                      : "Not started"}
                </small>
              </li>
            ))}
          </ol>
        </section>

        <div className="progress-grid">
          <section className="agreed-work-card">
            <p className="eyebrow">Source of truth</p>
            <h2>Agreed work</h2>
            <p>
              Locked from response version {quote.selectedResponseVersion} when
              the contractor confirmed.
            </p>
            <dl className="selection-facts">
              <div>
                <dt>Final scope</dt>
                <dd>{quote.workItems.map((item) => item.label).join("; ")}</dd>
              </div>
              <div>
                <dt>Final price and VAT</dt>
                <dd>
                  {formatMoney(quote.finalTotal)} ·{" "}
                  {quote.vat.amount
                    ? `${formatMoney(quote.vat.amount)} VAT`
                    : "VAT not stated"}
                </dd>
              </div>
              <div>
                <dt>Materials</dt>
                <dd>{quote.materials.items.join(", ")}</dd>
              </div>
              <div>
                <dt>Exclusions</dt>
                <dd>{quote.exclusions.join(", ") || "None stated"}</dd>
              </div>
              <div>
                <dt>Price-change conditions</dt>
                <dd>
                  {quote.priceChangeReasons.join(", ") || "None stated"}
                </dd>
              </div>
              <div>
                <dt>Expected duration</dt>
                <dd>{quote.expectedDuration}</dd>
              </div>
              <div>
                <dt>Warranty</dt>
                <dd>
                  {quote.guarantee.duration || quote.guarantee.position}
                </dd>
              </div>
            </dl>
          </section>

          <section className="progress-updates">
            <h2>Updates</h2>
            <ol>
              {progress.updates
                .slice()
                .reverse()
                .map((update) => (
                  <li key={update.updateId}>
                    <span aria-hidden="true" />
                    <div>
                      <strong>{update.message}</strong>
                      <p>
                        {update.author} ·{" "}
                        {new Date(update.createdAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        </div>
      </main>

      {modal && (
        <DecisionModal
          eyebrow={
            modal === "agreed"
              ? "Immutable agreed scope"
              : "Preserved procurement history"
          }
          footer={
            <button
              className="button button--secondary"
              onClick={() => setModal(undefined)}
              type="button"
            >
              Close
            </button>
          }
          onClose={() => {
            setModal(undefined);
            window.requestAnimationFrame(() => returnFocusRef.current?.focus());
          }}
          title={
            modal === "agreed"
              ? `${progress.contractor.displayName} agreed quote`
              : "Response history"
          }
        >
          {modal === "agreed" ? (
            <SelectedQuoteSummary
              agreed={progress.agreedScope}
              quote={
                progress.selectedResponse
                  .submittedData as SubmittedRepairQuote
              }
            />
          ) : (
            <div className="response-history-list">
              <article>
                <StatusPill tone="neutral">Version 1</StatusPill>
                <h3>Initial repair quote</h3>
                <p>
                  The original submitted total is retained as superseded
                  history.
                </p>
              </article>
              <article>
                <StatusPill tone="good">Version 2 · Agreed</StatusPill>
                <h3>Scope expanded to include internal making-good</h3>
                <p>
                  Submitted, selected and agreed total:{" "}
                  {formatMoney(progress.agreedScope.finalTotal)}.
                </p>
              </article>
            </div>
          )}
        </DecisionModal>
      )}
    </>
  );
}
