"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clarificationIssueKeys,
  clarificationQuestionIsPrivate,
  type ComparisonIssueKey,
} from "@/domain/landlordClarification";
import type {
  ClarificationSubmissionResult,
  DraftedClarificationQuestion,
} from "@/domain/procurement";
import {
  activeRepairQuotes,
  formatSubmittedVat,
  importedResponseRecord,
  latestSubmittedResponse,
  missingQuoteDetails,
  submittedInspection,
  submittedRepairQuote,
  type InspectionResponseRecord,
  type RepairQuoteRecord,
  type RepairResponseBundle,
  type ResponseComparisonState,
} from "@/domain/responseComparison";
import type { SubmittedRepairQuote } from "@/domain/types";
import {
  formatMoney as formatCanonicalMoney,
  moneyFromMajor,
  moneyToMajor,
  type Money,
} from "@/domain/money";
import { repairScopeServices } from "@/services";
import { DecisionModal } from "./DecisionModal";
import { BackLink } from "./SiteShell";
import { ExternalQuoteImportModal } from "./ExternalQuoteImportModal";
import {
  InspectionDecisionModal,
  QuoteDecisionModal,
} from "./ResponseDecisionModals";

const demoStates: [ResponseComparisonState, string][] = [
  ["no_responses", "No responses"],
  ["one_quote", "One quote"],
  ["three_quotes", "Three quotes"],
  ["quotes_and_inspection", "Quotes + inspection"],
  ["question", "Question awaiting answer"],
  ["revised", "Revised quote"],
];

const showPrototypeControls =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_REPAIRSCOPE_DEMO_MODE !== "false";

type ResponseFilter = "all" | "quotes" | "inspections";
type MatrixTopic =
  | "total"
  | "vat"
  | "price"
  | "work"
  | "labour"
  | "materials"
  | "testing"
  | "other"
  | "making_good"
  | "exclusions"
  | "start"
  | "duration"
  | "warranty"
  | "validity";

interface MatrixCellData {
  content: ReactNode;
  issueKey?: ComparisonIssueKey;
  uncertain?: boolean;
}

type ResponseRailItem =
  | { kind: "quote"; record: RepairQuoteRecord }
  | { kind: "inspection"; record: InspectionResponseRecord };

const matrixTopics: { key: MatrixTopic; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "vat", label: "VAT" },
  { key: "price", label: "Price status" },
  { key: "work", label: "Work included" },
  { key: "labour", label: "Labour" },
  { key: "materials", label: "Materials" },
  { key: "testing", label: "Testing or certification" },
  { key: "other", label: "Other charges" },
  { key: "making_good", label: "Making-good" },
  { key: "exclusions", label: "Main exclusions" },
  { key: "start", label: "Earliest start" },
  { key: "duration", label: "Duration" },
  { key: "warranty", label: "Warranty" },
  { key: "validity", label: "Quote validity" },
];

const formatMoney = (amount: Money | number) =>
  formatCanonicalMoney(
    typeof amount === "number" ? moneyFromMajor(amount) : amount,
  );

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

function quotePriceStatus(quote: SubmittedRepairQuote) {
  if (quote.priceStatus === "fixed") return "Fixed price";
  if (quote.priceStatus === "estimate") return "Estimate";
  if (quote.priceStatus === "may_change") return "Price may change";
  return "Not stated";
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

function materialsStatusLabel(quote: SubmittedRepairQuote) {
  if (quote.materialsStatus === "confirmed") return "Confirmed";
  if (quote.materialsStatus === "estimated") return "Estimated";
  if (quote.materialsStatus === "to_confirm") return "To be confirmed";
  return "Not stated";
}

function exclusionItems(quote: SubmittedRepairQuote) {
  return [
    ...quote.exclusions.filter((item) => item !== "Nothing else is excluded"),
    ...(quote.otherExclusion.trim() ? [quote.otherExclusion.trim()] : []),
  ];
}

function materialItems(quote: SubmittedRepairQuote) {
  return [
    ...quote.mainMaterials.filter((item) => item !== "Something else"),
    ...(quote.customMaterial.trim() ? [quote.customMaterial.trim()] : []),
  ];
}

function quoteCompleteness(quote: SubmittedRepairQuote) {
  return [
    quote.workItems.length > 0,
    Number.isSafeInteger(quote.finalTotal.amountMinor) &&
      Boolean(quote.costSnapshot.vat.mode),
    Boolean(quote.duration.trim()),
    Boolean(quote.guaranteePosition),
    exclusionItems(quote).length > 0,
    Boolean(quote.materialsStatus),
    Boolean(quote.priceStatus),
  ].filter(Boolean).length;
}

const followUpIssueLabels: Record<ComparisonIssueKey, string> = {
  duration_missing: "duration",
  warranty_missing: "warranty",
  estimate_price: "estimate change conditions",
  price_may_change: "price change conditions",
  materials_uncertain: "materials",
  vat_unclear: "VAT",
  exclusions_unclear: "exclusions",
  source_work_excluded: "whether the underlying source is addressed",
  making_good_unclear: "whether making-good is included",
};

function naturalList(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function QuoteCard({
  record,
  awaitingReply,
  onView,
  onFollowUp,
}: {
  record: RepairQuoteRecord;
  awaitingReply: boolean;
  onView: (trigger: HTMLButtonElement) => void;
  onFollowUp: (trigger: HTMLButtonElement) => void;
}) {
  const quote = submittedRepairQuote(record);
  const missing = missingQuoteDetails(quote);
  const exclusions = exclusionItems(quote);
  const priceUncertain =
    quote.priceStatus === "estimate" || quote.priceStatus === "may_change";
  const materialsUncertain =
    quote.materialsStatus === "estimated" ||
    quote.materialsStatus === "to_confirm";

  return (
    <article
      className="clean-response-card clean-quote-card"
      data-response-record={record.id}
    >
      <header className="clean-quote-card__header">
        <div>
          <h3>{record.contractor.displayName}</h3>
          <p>{record.contractor.trade}</p>
        </div>
        <div className="clean-quote-card__badges">
          {latestSubmittedResponse(record).source !== "contractor_portal" && (
            <span className="clean-source-badge">Imported quote</span>
          )}
          {record.versions.length > 1 && (
            <span className="clean-version-badge">
              Version {record.latestVersion}
            </span>
          )}
        </div>
      </header>

      <div
        className={`clean-quote-card__price ${
          priceUncertain ? "is-uncertain" : ""
        }`}
      >
        <span>{quotePriceStatus(quote)}</span>
        <strong>{formatMoney(quote.finalTotal)}</strong>
        <small>{formatSubmittedVat(quote)}</small>
      </div>

      <section className="clean-quote-card__work">
        <h4>What they will do</h4>
        <ul>
          {quote.workItems.slice(0, 3).map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
        {quote.workItems.length > 3 && (
          <small>+ {quote.workItems.length - 3} more work items</small>
        )}
      </section>

      <dl className="clean-quote-card__facts">
        <div>
          <dt>Start</dt>
          <dd>{quoteStart(quote)}</dd>
        </div>
        <div className={!quote.duration.trim() ? "is-uncertain" : ""}>
          <dt>Duration</dt>
          <dd>{quote.duration || "Not stated"}</dd>
        </div>
        <div className={!quote.guaranteePosition ? "is-uncertain" : ""}>
          <dt>Guarantee</dt>
          <dd>{warrantyLabel(quote)}</dd>
        </div>
        <div className={materialsUncertain ? "is-uncertain" : ""}>
          <dt>Materials</dt>
          <dd>{materialsStatusLabel(quote)}</dd>
        </div>
      </dl>

      <div className="clean-quote-card__status">
        <span>
          {exclusions.length}{" "}
          {exclusions.length === 1 ? "exclusion" : "exclusions"}
        </span>
        <span className={missing.length ? "needs-checking" : ""}>
          {missing.length
            ? `${missing.length} ${missing.length === 1 ? "detail needs" : "details need"} checking`
            : "No important details missing"}
        </span>
      </div>

      <footer className="clean-quote-card__actions">
        <button
          className="button button--secondary"
          onClick={(event) => onView(event.currentTarget)}
          type="button"
        >
          View quote
        </button>
        <button
          className="button clean-follow-up-button"
          disabled={awaitingReply}
          onClick={(event) => onFollowUp(event.currentTarget)}
          type="button"
        >
          {awaitingReply ? "Awaiting reply" : "Follow up"}
        </button>
      </footer>
    </article>
  );
}

function matrixCellData(
  record: RepairQuoteRecord,
  topic: MatrixTopic,
): MatrixCellData {
  const quote = submittedRepairQuote(record);
  const clarificationIssues = clarificationIssueKeys(
    latestSubmittedResponse(record),
  );
  const exclusions = exclusionItems(quote);
  const materials = materialItems(quote);
  const testing = quote.extraCharges
    .filter((charge) => charge.type === "testing")
    .reduce((total, charge) => total + Number(charge.amount || 0), 0);
  const nonTestingExtras = Math.max(
    moneyToMajor(quote.costSnapshot.extras) - testing,
    0,
  );
  const scope = quote.workItems.map((item) => item.label);
  const scopeText = scope.join(" ");
  const makingGoodIncluded =
    /make good|making.good|patch|plaster|redecorat|finish coat|stain block/i.test(
      scopeText,
    );
  const makingGoodExcluded = exclusions.some((item) =>
    /making.good|decoration|redecorat|plaster/i.test(item),
  );

  if (topic === "total") {
    return { content: <strong>{formatMoney(quote.finalTotal)}</strong> };
  }
  if (topic === "vat") {
    const vatUnclear = clarificationIssues.includes("vat_unclear");
    return {
      content: formatSubmittedVat(quote),
      issueKey: vatUnclear ? "vat_unclear" : undefined,
      uncertain: vatUnclear,
    };
  }
  if (topic === "price") {
    const uncertain =
      quote.priceStatus === "estimate" || quote.priceStatus === "may_change";
    const issueKey =
      quote.priceStatus === "estimate" &&
      clarificationIssues.includes("estimate_price")
        ? "estimate_price"
        : quote.priceStatus === "may_change" &&
            clarificationIssues.includes("price_may_change")
          ? "price_may_change"
          : undefined;
    return {
      content: quotePriceStatus(quote),
      issueKey,
      uncertain,
    };
  }
  if (topic === "work") {
    return {
      content: (
        <details>
          <summary>View scope</summary>
          <ul>{scope.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ),
    };
  }
  if (topic === "labour") {
    return { content: formatMoney(quote.costSnapshot.labour) };
  }
  if (topic === "materials") {
    const uncertain =
      quote.materialsStatus === "estimated" ||
      quote.materialsStatus === "to_confirm" ||
      !quote.materialsStatus;
    return {
      content: (
        <>
          <strong>{formatMoney(quote.costSnapshot.materials)}</strong>
          <span>{materialsStatusLabel(quote)}</span>
          {materials.length > 0 && <small>{materials.slice(0, 2).join(" · ")}</small>}
        </>
      ),
      issueKey: clarificationIssues.includes("materials_uncertain")
        ? "materials_uncertain"
        : undefined,
      uncertain,
    };
  }
  if (topic === "testing") {
    return {
      content: testing ? formatMoney(testing) : "Not itemised",
      uncertain: !testing,
    };
  }
  if (topic === "other") {
    return {
      content: nonTestingExtras
        ? formatMoney(nonTestingExtras)
        : "No other charges itemised",
    };
  }
  if (topic === "making_good") {
    return {
      content: makingGoodIncluded
        ? "Included"
        : makingGoodExcluded
          ? "Excluded"
          : "Not stated",
      issueKey: clarificationIssues.includes("making_good_unclear")
        ? "making_good_unclear"
        : undefined,
      uncertain: !makingGoodIncluded && !makingGoodExcluded,
    };
  }
  if (topic === "exclusions") {
    return {
      content: exclusions.length ? (
        <details>
          <summary>
            {exclusions.length}{" "}
            {exclusions.length === 1 ? "exclusion" : "exclusions"}
          </summary>
          <ul>{exclusions.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : (
        "No exclusions stated"
      ),
      issueKey: clarificationIssues.includes("exclusions_unclear")
        ? "exclusions_unclear"
        : clarificationIssues.includes("source_work_excluded")
          ? "source_work_excluded"
          : undefined,
    };
  }
  if (topic === "start") return { content: quoteStart(quote) };
  if (topic === "duration") {
    return {
      content: quote.duration || "Not stated",
      issueKey: !quote.duration ? "duration_missing" : undefined,
      uncertain: !quote.duration,
    };
  }
  if (topic === "warranty") {
    return {
      content: warrantyLabel(quote),
      issueKey: !quote.guaranteePosition ? "warranty_missing" : undefined,
      uncertain: !quote.guaranteePosition,
    };
  }
  return {
    content: quote.quoteValidity || "Not stated",
    uncertain: !quote.quoteValidity,
  };
}

function MatrixCell({
  record,
  topic,
  onClarify,
}: {
  record: RepairQuoteRecord;
  topic: MatrixTopic;
  onClarify: (
    issueKey: ComparisonIssueKey,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const cell = matrixCellData(record, topic);
  return (
    <div className={`clean-matrix-value ${cell.uncertain ? "is-uncertain" : ""}`}>
      {cell.content}
      {cell.issueKey && (
        <button
          onClick={(event) => onClarify(cell.issueKey!, event.currentTarget)}
          type="button"
        >
          Ask contractor to clarify
        </button>
      )}
    </div>
  );
}

function DetailedComparison({
  records,
  onClarify,
}: {
  records: RepairQuoteRecord[];
  onClarify: (
    record: RepairQuoteRecord,
    issueKey: ComparisonIssueKey,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const [mobileRecordId, setMobileRecordId] = useState(records[0]?.id ?? "");
  const mobileRecord =
    records.find((record) => record.id === mobileRecordId) ?? records[0];

  return (
    <section className="clean-detailed-comparison" id="detailed-comparison">
      <header>
        <div>
          <h2>Detailed comparison</h2>
          <p>Read one topic across all submitted repair quotes.</p>
        </div>
      </header>

      <div className="clean-matrix-desktop">
        <table>
          <caption className="sr-only">
            Detailed comparison of active repair quotes
          </caption>
          <thead>
            <tr>
              <th scope="col">Comparison topic</th>
              {records.map((record) => (
                <th key={record.id} scope="col">
                  {record.contractor.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixTopics.map((topic) => (
              <tr key={topic.key}>
                <th scope="row">{topic.label}</th>
                {records.map((record) => (
                  <td key={record.id}>
                    <MatrixCell
                      onClarify={(issueKey, trigger) =>
                        onClarify(record, issueKey, trigger)
                      }
                      record={record}
                      topic={topic.key}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mobileRecord && (
        <div className="clean-matrix-mobile">
          <label>
            <span>Contractor</span>
            <select
              onChange={(event) => setMobileRecordId(event.target.value)}
              value={mobileRecord.id}
            >
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.contractor.displayName}
                </option>
              ))}
            </select>
          </label>
          <dl>
            {matrixTopics.map((topic) => (
              <div key={topic.key}>
                <dt>{topic.label}</dt>
                <dd>
                  <MatrixCell
                    onClarify={(issueKey, trigger) =>
                      onClarify(mobileRecord, issueKey, trigger)
                    }
                    record={mobileRecord}
                    topic={topic.key}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function InspectionCard({
  record,
  onView,
}: {
  record: InspectionResponseRecord;
  onView: (trigger: HTMLButtonElement) => void;
}) {
  const inspection = submittedInspection(record);
  return (
    <article
      className="clean-response-card clean-inspection-card"
      data-response-record={record.id}
    >
      <div className="clean-inspection-card__label">
        <strong>Inspection required</strong>
        <span>Not a repair quote</span>
      </div>
      <h3>{record.contractor.displayName}</h3>
      <div className="clean-inspection-card__fee">
        <strong>{formatMoney(inspection.finalFee)}</strong>
        <span>VAT {inspection.vat.mode.replaceAll("_", " ")}</span>
      </div>
      <p className="clean-inspection-card__why">
        <strong>Why</strong>
        <span>{inspection.reasons.join(" · ")}</span>
      </p>
      <dl className="clean-inspection-card__facts">
        <div>
          <dt>Fee deducted if appointed</dt>
          <dd>
            {inspection.deductionPosition === "full"
              ? "Yes, in full"
              : inspection.deductionPosition || "Not stated"}
          </dd>
        </div>
        <div>
          <dt>Can attend</dt>
          <dd>{inspection.preferredWindows.find(Boolean) || "Not stated"}</dd>
        </div>
        <div>
          <dt>Repair quote after visit</dt>
          <dd>{inspection.proposalTiming || "Not stated"}</dd>
        </div>
      </dl>
      <button
        className="button button--secondary"
        onClick={(event) => onView(event.currentTarget)}
        type="button"
      >
        View inspection request
      </button>
    </article>
  );
}

type DetailDrawerContent = { kind: "brief" };
type DecisionModalContent =
  | { kind: "quote"; record: RepairQuoteRecord }
  | { kind: "inspection"; record: InspectionResponseRecord };

function DrawerShell({
  title,
  eyebrow,
  children,
  onClose,
  className = "",
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="response-drawer-backdrop" onMouseDown={onClose}>
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className={`response-drawer ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="response-drawer__header">
          <div>
            <p>{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label="Close drawer"
            className="response-drawer__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            ×
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="response-drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailDrawer({
  bundle,
  onClose,
}: {
  bundle: RepairResponseBundle;
  onClose: () => void;
}) {
  return (
    <DrawerShell
      eyebrow={`Repair ${bundle.repairReference}`}
      onClose={onClose}
      title="Contractor brief"
    >
      <div className="response-drawer__body">
        <DrawerSection title="Summary">
          <p>{bundle.brief.summary}</p>
        </DrawerSection>
        <DrawerSection title="Reported facts">
          <ul>
            {bundle.brief.reportedFacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </DrawerSection>
        <DrawerSection title="Important unknowns">
          <ul>
            {bundle.brief.importantUnknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </DrawerSection>
        <DrawerSection title="Location and access">
          <p>
            {bundle.brief.approximateArea} · {bundle.brief.occupancy}
          </p>
          <p>{bundle.brief.accessOverview}</p>
        </DrawerSection>
        <DrawerSection title="Evidence shared">
          <p>{bundle.brief.evidence.length} landlord-supplied files</p>
        </DrawerSection>
        <div className="clean-drawer-actions">
          <button
            className="button button--secondary"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

function FollowUpModal({
  bundle,
  records,
  initialRecordId,
  initialIssueKeys,
  onClose,
  onSent,
}: {
  bundle: RepairResponseBundle;
  records: RepairQuoteRecord[];
  initialRecordId: string;
  initialIssueKeys?: ComparisonIssueKey[];
  onClose: () => void;
  onSent: (
    responseId: string,
    result: ClarificationSubmissionResult,
  ) => void;
}) {
  const [recordId, setRecordId] = useState(initialRecordId);
  const [questions, setQuestions] =
    useState<DraftedClarificationQuestion[]>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<ClarificationSubmissionResult>();
  const [error, setError] = useState("");
  const record = records.find((item) => item.id === recordId) ?? records[0];
  const response = record ? latestSubmittedResponse(record) : undefined;

  useEffect(() => {
    if (!response) return;
    let active = true;
    const issueKeys =
      record.id === initialRecordId && initialIssueKeys?.length
        ? initialIssueKeys
        : clarificationIssueKeys(response);
    repairScopeServices.clarifications
      .draftQuestions(response.responseId, issueKeys)
      .then((result) => {
        if (active) setQuestions(result);
      });
    return () => {
      active = false;
    };
  }, [initialIssueKeys, initialRecordId, record.id, response]);

  if (!record || !response) return null;

  const selectedQuestions =
    questions?.filter(
      (question) => question.selected && question.text.trim().length > 0,
    ) ?? [];

  const updateQuestion = (
    id: string,
    patch: Partial<DraftedClarificationQuestion>,
  ) => {
    setQuestions((current) =>
      current?.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    );
  };

  const send = async () => {
    const competitorNames = records
      .filter((candidate) => candidate.contractor.id !== record.contractor.id)
      .map((candidate) => candidate.contractor.displayName);
    if (
      selectedQuestions.some(
        (question) =>
          !clarificationQuestionIsPrivate(question.text, competitorNames),
      )
    ) {
      setError(
        "Keep this follow-up private: remove references to other contractors or their prices.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await repairScopeServices.clarifications.sendClarification(
        bundle.repairId,
        response.responseId,
        selectedQuestions.map(({ id, text }) => ({ id, text })),
      );
      setSent(result);
      onSent(response.responseId, result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The mock follow-up could not be sent.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DecisionModal
      className="clean-follow-up-modal"
      eyebrow={`Private follow-up · ${bundle.repairReference}`}
      footer={
        sent ? (
          <button className="button" onClick={onClose} type="button">
            Return to quotes
          </button>
        ) : (
          <>
            <button
              className="button button--secondary"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={!selectedQuestions.length || submitting}
              onClick={() => void send()}
              type="button"
            >
              {submitting ? "Sending follow-up…" : "Send follow-up"}
            </button>
          </>
        )
      }
      onClose={onClose}
      title={`Follow up with ${record.contractor.displayName}`}
    >
      <div className="clean-follow-up-content">
        {sent ? (
          <section className="clean-follow-up-success" role="status">
            <span aria-hidden="true">✓</span>
            <h3>Follow-up sent</h3>
            <p>
              This quote is now marked as awaiting a reply. Its missing fields
              remain visible until the contractor replies or submits a revision.
            </p>
          </section>
        ) : (
          <>
            {records.length > 1 && (
              <div className="clean-follow-up-grouping">
                <p>
                  Each contractor receives a separate private message. Choose
                  whose questions to review.
                </p>
                <label className="clean-follow-up-contractor">
                  <span>Contractor</span>
                  <select
                    onChange={(event) => {
                      setQuestions(undefined);
                      setRecordId(event.target.value);
                      setError("");
                    }}
                    value={record.id}
                  >
                    {records.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.contractor.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="clean-follow-up-context">
              <strong>{formatMoney(submittedRepairQuote(record).finalTotal)}</strong>
              <span>{quotePriceStatus(submittedRepairQuote(record))}</span>
              <p>
                Suggestions come only from this contractor’s structured response.
              </p>
            </div>

            {!questions ? (
              <p role="status">Drafting follow-up questions…</p>
            ) : (
              <>
                <fieldset className="clean-follow-up-questions">
                  <legend>Suggested questions</legend>
                  {questions.map((question) => (
                    <div className="clean-follow-up-question" key={question.id}>
                      <label>
                        <input
                          checked={question.selected}
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              selected: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        <span>Include this question</span>
                      </label>
                      <textarea
                        aria-label={`Question wording: ${question.text}`}
                        onChange={(event) =>
                          updateQuestion(question.id, {
                            text: event.target.value,
                          })
                        }
                        rows={2}
                        value={question.text}
                      />
                      <button
                        onClick={() =>
                          setQuestions((current) =>
                            current?.filter((item) => item.id !== question.id),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </fieldset>
                <button
                  className="clean-add-question"
                  onClick={() =>
                    setQuestions((current) => [
                      ...(current ?? []),
                      {
                        id: `custom-${Date.now()}`,
                        issueKey: "custom",
                        text: "",
                        selected: true,
                      },
                    ])
                  }
                  type="button"
                >
                  + Add another question
                </button>
              </>
            )}

            <section className="clean-follow-up-preview">
              <h3>Message preview</h3>
              {selectedQuestions.length ? (
                <ol>
                  {selectedQuestions.map((question) => (
                    <li key={question.id}>{question.text}</li>
                  ))}
                </ol>
              ) : (
                <p>Select or add at least one question.</p>
              )}
            </section>

            <p className="clean-follow-up-privacy">
              This message is private. The contractor will not see other quotes,
              prices or contractor details.
            </p>
            {error && <p className="field-error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </DecisionModal>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="clean-tab-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

export function ResponseComparisonPage({ repairId }: { repairId: string }) {
  const [state, setState] =
    useState<ResponseComparisonState>("quotes_and_inspection");
  const [bundle, setBundle] = useState<RepairResponseBundle>();
  const [error, setError] = useState("");
  const [responseFilter, setResponseFilter] =
    useState<ResponseFilter>("all");
  const [railIndex, setRailIndex] = useState(0);
  const [showMatrix, setShowMatrix] = useState(false);
  const [drawer, setDrawer] = useState<DetailDrawerContent>();
  const [decisionModal, setDecisionModal] =
    useState<DecisionModalContent>();
  const [showImport, setShowImport] = useState(false);
  const [followUp, setFollowUp] = useState<{
    recordId: string;
    issueKeys?: ComparisonIssueKey[];
  }>();
  const [clarifications, setClarifications] = useState<
    Record<string, ClarificationSubmissionResult>
  >({});
  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const followUpReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const importReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    repairScopeServices.comparisons
      .getForRepair(repairId, { state })
      .then((result) => {
        if (active) setBundle(result);
      })
      .catch(() => {
        if (active) {
          setBundle(undefined);
          setError(
            "This repair comparison is not available for the current account.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [repairId, state]);

  const quoteRecords = useMemo(() => {
    if (!bundle) return [];
    return activeRepairQuotes(bundle)
      .slice()
      .sort(
        (a, b) =>
          new Date(latestSubmittedResponse(b).submittedAt).getTime() -
          new Date(latestSubmittedResponse(a).submittedAt).getTime(),
      );
  }, [bundle]);

  const responseItems = useMemo<ResponseRailItem[]>(() => {
    if (!bundle) return [];
    return [
      ...quoteRecords.map(
        (record): ResponseRailItem => ({ kind: "quote", record }),
      ),
      ...bundle.inspections.map(
        (record): ResponseRailItem => ({ kind: "inspection", record }),
      ),
    ];
  }, [bundle, quoteRecords]);

  const filteredResponses = useMemo(
    () =>
      responseItems.filter((item) => {
        if (responseFilter === "all") return true;
        if (responseFilter === "quotes") return item.kind === "quote";
        return item.kind === "inspection";
      }),
    [responseFilter, responseItems],
  );

  if (error) {
    return (
      <main className="content-page response-comparison-page">
        <BackLink href="/landlord" label="Landlord home" />
        <section className="response-access-state" role="alert">
          <h1>Responses are not available</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="content-page response-comparison-page">
        <p className="response-loading" role="status">
          Loading contractor responses…
        </p>
      </main>
    );
  }

  const followUpCandidates = quoteRecords
    .map((record) => ({
      record,
      issues: clarificationIssueKeys(latestSubmittedResponse(record)),
    }))
    .filter((candidate) => candidate.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length);
  const topFollowUp = followUpCandidates[0];
  const topFollowUpRecord = topFollowUp?.record;
  const topFollowUpIssues = topFollowUp?.issues ?? [];
  const completeness = quoteRecords.map((record) => ({
    record,
    count: quoteCompleteness(submittedRepairQuote(record)),
  }));
  const highestCompleteness = completeness.length
    ? Math.max(...completeness.map((item) => item.count))
    : 0;
  const mostCompleteRecords = completeness
    .filter((item) => item.count === highestCompleteness)
    .map((item) => item.record);
  const lowestTotalRecord = quoteRecords
    .slice()
    .sort(
      (a, b) =>
        submittedRepairQuote(a).finalTotal.amountMinor -
        submittedRepairQuote(b).finalTotal.amountMinor,
    )[0];

  const openDetail = (
    content: DetailDrawerContent,
    trigger: HTMLButtonElement,
  ) => {
    detailReturnFocusRef.current = trigger;
    setDrawer(content);
  };

  const closeDetail = () => {
    setDrawer(undefined);
    window.requestAnimationFrame(() => detailReturnFocusRef.current?.focus());
  };

  const openFollowUp = (
    record: RepairQuoteRecord,
    trigger: HTMLButtonElement,
    issueKeys?: ComparisonIssueKey[],
  ) => {
    followUpReturnFocusRef.current = trigger;
    setFollowUp({ recordId: record.id, issueKeys });
  };

  const closeFollowUp = () => {
    setFollowUp(undefined);
    window.requestAnimationFrame(() => followUpReturnFocusRef.current?.focus());
  };

  const scrollRailTo = (nextIndex: number) => {
    const rail = railRef.current;
    if (!rail || !filteredResponses.length) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    const bounded = Math.max(0, Math.min(nextIndex, cards.length - 1));
    cards[bounded]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
    setRailIndex(bounded);
  };

  const updateRailPosition = () => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    if (!cards.length) return;
    const current = cards.reduce(
      (nearest, card, index) =>
        Math.abs(card.offsetLeft - rail.scrollLeft) <
        Math.abs(cards[nearest].offsetLeft - rail.scrollLeft)
          ? index
          : nearest,
      0,
    );
    setRailIndex(current);
  };

  return (
    <>
      <main className="content-page response-comparison-page">
        <BackLink
          href={`/landlord/repairs/${repairId}/status`}
          label="Repair status"
        />

        <header className="clean-response-header">
          <div>
            <h1>{bundle.repairTitle}</h1>
            <p>
              Repair {bundle.repairReference} · {responseItems.length} contractor{" "}
              {responseItems.length === 1 ? "response" : "responses"} · Updated{" "}
              {formatDate(bundle.lastUpdatedAt)}
            </p>
          </div>
          <button
            className="button button--secondary"
            onClick={(event) =>
              openDetail({ kind: "brief" }, event.currentTarget)
            }
            type="button"
          >
            View contractor brief
          </button>
        </header>

        <section className="clean-response-surface">
          <div className="clean-response-workspace">
            {quoteRecords.length > 0 && (
              <section className="clean-at-a-glance">
                <div>
                  <h2>At a glance</h2>
                  <p>
                    Factual positions from the submitted responses, without
                    ranking contractor quality.
                  </p>
                </div>
                <div className="clean-at-a-glance__items">
                  <article>
                    <span>
                      {mostCompleteRecords.length === 1
                        ? "Most complete response"
                        : "Most complete responses"}
                    </span>
                    <strong>
                      {mostCompleteRecords
                        .map((record) => record.contractor.displayName)
                        .join(" and ")}
                    </strong>
                    <p>
                      Key scope, price, duration, guarantee, exclusions and
                      materials fields are stated.
                    </p>
                  </article>
                  {lowestTotalRecord && (
                    <article>
                      <span>Lowest submitted repair total</span>
                      <strong>
                        {lowestTotalRecord.contractor.displayName} ·{" "}
                        {formatMoney(
                          submittedRepairQuote(lowestTotalRecord).finalTotal,
                        )}
                      </strong>
                      <p>
                        {quotePriceStatus(
                          submittedRepairQuote(lowestTotalRecord),
                        )}
                      </p>
                    </article>
                  )}
                  <article className="clean-at-a-glance__follow-up">
                    <span>Needs clarification</span>
                    {topFollowUpRecord ? (
                      <>
                        <strong>{topFollowUpRecord.contractor.displayName}</strong>
                        <p>
                          {topFollowUpIssues.length}{" "}
                          {topFollowUpIssues.length === 1 ? "detail" : "details"}{" "}
                          to confirm:{" "}
                          {naturalList(
                            topFollowUpIssues.map(
                              (issue) => followUpIssueLabels[issue],
                            ),
                          )}
                          .
                        </p>
                      </>
                    ) : (
                      <>
                        <strong>No follow-up needed</strong>
                        <p>
                          No submitted quote currently has a genuine missing or
                          uncertain field.
                        </p>
                      </>
                    )}
                  </article>
                </div>
                <p className="clean-at-a-glance__note">
                  Prices may cover different work. These labels describe the
                  submitted information, not contractor quality or technical
                  correctness.
                </p>
              </section>
            )}

            {bundle.questions.length > 0 && (
              <section
                aria-labelledby="contractor-questions-heading"
                className="clean-question-notice"
              >
                <div>
                  <span>{bundle.questions.length}</span>
                  <div>
                    <h2 id="contractor-questions-heading">
                      Contractor{" "}
                      {bundle.questions.length === 1
                        ? "question"
                        : "questions"}{" "}
                      awaiting an answer
                    </h2>
                    <p>
                      Reply before comparing final repair proposals where
                      possible.
                    </p>
                  </div>
                </div>
                <ul>
                  {bundle.questions.map((question) => (
                    <li key={question.id}>
                      <strong>{question.contractor.displayName}</strong>
                      <span>{question.question}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              aria-labelledby="contractor-responses-heading"
              className="clean-response-rail-section"
            >
              <header className="clean-response-rail-header">
                <div>
                  <h2 id="contractor-responses-heading">
                    Contractor responses
                  </h2>
                  <p>Review each response, then compare specific details.</p>
                </div>
                <div className="clean-response-heading-actions">
                  <button
                    className="button button--secondary"
                    onClick={(event) => {
                      importReturnFocusRef.current = event.currentTarget;
                      setShowImport(true);
                    }}
                    type="button"
                  >
                    Import a quote
                  </button>
                  {topFollowUpRecord && (
                    <button
                      className="button button--secondary"
                      onClick={(event) =>
                        openFollowUp(
                          topFollowUpRecord,
                          event.currentTarget,
                          topFollowUpIssues,
                        )
                      }
                      type="button"
                    >
                      Draft {topFollowUpIssues.length} follow-up{" "}
                      {topFollowUpIssues.length === 1
                        ? "question"
                        : "questions"}
                    </button>
                  )}
                </div>
                <div
                  aria-label="Filter contractor responses"
                  className="clean-response-filters"
                  role="group"
                >
                  {(
                    [
                      ["all", "All responses"],
                      ["quotes", "Repair quotes"],
                      ["inspections", "Inspection requests"],
                    ] as [ResponseFilter, string][]
                  ).map(([value, label]) => (
                    <button
                      aria-pressed={responseFilter === value}
                      key={value}
                      onClick={() => {
                        setResponseFilter(value);
                        setRailIndex(0);
                        railRef.current?.scrollTo({
                          left: 0,
                          behavior: "smooth",
                        });
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="clean-rail-position">
                  <button
                    aria-label="Previous contractor response"
                    disabled={railIndex === 0}
                    onClick={() => scrollRailTo(railIndex - 1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <span aria-live="polite">
                    {filteredResponses.length ? railIndex + 1 : 0} of{" "}
                    {filteredResponses.length}
                  </span>
                  <button
                    aria-label="Next contractor response"
                    disabled={railIndex >= filteredResponses.length - 1}
                    onClick={() => scrollRailTo(railIndex + 1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>
              </header>

              {filteredResponses.length ? (
                <div
                  aria-label="Contractor response cards"
                  className="clean-response-rail"
                  onScroll={updateRailPosition}
                  onWheel={(event) => {
                    if (
                      Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
                      event.currentTarget.scrollWidth >
                        event.currentTarget.clientWidth
                    ) {
                      event.preventDefault();
                      event.currentTarget.scrollLeft += event.deltaY;
                    }
                  }}
                  ref={railRef}
                  tabIndex={0}
                >
                  {filteredResponses.map((item) =>
                    item.kind === "quote" ? (
                      <QuoteCard
                        awaitingReply={Boolean(
                          clarifications[
                            latestSubmittedResponse(item.record).responseId
                          ],
                        )}
                        key={item.record.id}
                        onFollowUp={(trigger) =>
                          openFollowUp(item.record, trigger)
                        }
                        onView={(trigger) =>
                          {
                            detailReturnFocusRef.current = trigger;
                            setDecisionModal({
                              kind: "quote",
                              record: item.record,
                            });
                          }
                        }
                        record={item.record}
                      />
                    ) : (
                      <InspectionCard
                        key={item.record.id}
                        onView={(trigger) =>
                          {
                            detailReturnFocusRef.current = trigger;
                            setDecisionModal({
                              kind: "inspection",
                              record: item.record,
                            });
                          }
                        }
                        record={item.record}
                      />
                    ),
                  )}
                </div>
              ) : (
                <EmptyState title="No responses in this view">
                  New repair quotes and inspection requests will appear here.
                </EmptyState>
              )}
            </section>

            {quoteRecords.length > 0 && (
              <>
                <div className="clean-compare-action">
                  <button
                    aria-expanded={showMatrix}
                    aria-controls="detailed-comparison"
                    className="button button--secondary"
                    onClick={() => setShowMatrix((current) => !current)}
                    type="button"
                  >
                    {showMatrix ? "Hide detailed comparison" : "Compare details"}
                  </button>
                </div>

                {showMatrix && (
                  <DetailedComparison
                    onClarify={(record, issueKey, trigger) =>
                      openFollowUp(record, trigger, [issueKey])
                    }
                    records={quoteRecords}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </main>

      {showPrototypeControls && (
        <aside
          aria-label="Prototype state control"
          className="clean-dev-toolbar"
          data-prototype-control
        >
          <label htmlFor="response-demo-state">Demo state</label>
          <select
            id="response-demo-state"
            onChange={(event) => {
              setState(event.target.value as ResponseComparisonState);
              setResponseFilter("all");
              setRailIndex(0);
              railRef.current?.scrollTo({ left: 0, behavior: "smooth" });
              setShowMatrix(false);
              setDrawer(undefined);
              setDecisionModal(undefined);
              setFollowUp(undefined);
              setClarifications({});
            }}
            value={state}
          >
            {demoStates.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </aside>
      )}

      {drawer && (
        <DetailDrawer bundle={bundle} onClose={closeDetail} />
      )}

      {decisionModal &&
        (decisionModal.kind === "quote" ? (
          <QuoteDecisionModal
            bundle={bundle}
            clarification={
              clarifications[
                latestSubmittedResponse(decisionModal.record).responseId
              ]
            }
            onClose={() => {
              setDecisionModal(undefined);
              window.requestAnimationFrame(() =>
                detailReturnFocusRef.current?.focus(),
              );
            }}
            onFollowUp={(record) => {
              followUpReturnFocusRef.current = detailReturnFocusRef.current;
              setDecisionModal(undefined);
              setFollowUp({ recordId: record.id });
            }}
            onSwitchQuote={(record) =>
              setDecisionModal({ kind: "quote", record })
            }
            quoteRecords={quoteRecords}
            record={decisionModal.record}
          />
        ) : (
          <InspectionDecisionModal
            bundle={bundle}
            onClose={() => {
              setDecisionModal(undefined);
              window.requestAnimationFrame(() =>
                detailReturnFocusRef.current?.focus(),
              );
            }}
            record={decisionModal.record}
          />
        ))}

      {showImport && (
        <ExternalQuoteImportModal
          onAdded={(response, businessName) =>
            setBundle((current) =>
              current
                ? {
                    ...current,
                    lastUpdatedAt: response.submittedAt,
                    repairQuotes: [
                      ...current.repairQuotes,
                      importedResponseRecord(response, businessName),
                    ],
                  }
                : current,
            )
          }
          onClose={() => {
            setShowImport(false);
            window.requestAnimationFrame(() =>
              importReturnFocusRef.current?.focus(),
            );
          }}
          repairId={bundle.repairId}
        />
      )}

      {followUp && (
        <FollowUpModal
          bundle={bundle}
          initialIssueKeys={followUp.issueKeys}
          initialRecordId={followUp.recordId}
          key={`${followUp.recordId}-${followUp.issueKeys?.join("-") ?? "all"}`}
          onClose={closeFollowUp}
          onSent={(responseId, result) =>
            setClarifications((current) => ({
              ...current,
              [responseId]: result,
            }))
          }
          records={quoteRecords}
        />
      )}
    </>
  );
}
