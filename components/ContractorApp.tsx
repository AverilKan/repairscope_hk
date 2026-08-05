"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ContractorIdentity,
  ContractorInvitation,
  ContractorResponseDraft,
  ContractorResponseType,
  SubmittedContractorResponse,
  SubmittedInspectionRequest,
  SubmittedRepairQuote,
  WorkItemSuggestion,
} from "@/domain/types";
import { formatMoney as formatCanonicalMoney } from "@/domain/money";
import {
  calculateContractorQuote,
  createSubmittedRepairQuote,
  toggleContractorExclusion,
} from "@/domain/contractorQuote";
import {
  contractorQuestionHasProgressed,
  contractorQuestionRequiresConfirmation,
  workItemsConfirmationLabel,
  type ContractorQuestionType,
} from "@/domain/contractorProgression";
import { repairScopeServices } from "@/services";
import { SharedAuthShell } from "./SharedAuthShell";

type DemoState =
  | "valid"
  | "quote"
  | "inspection"
  | "question_answered"
  | "submitted"
  | "expired"
  | "closed";

type FormPhase = "answering" | "review" | "submitted";

const showPrototypeControls =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_REPAIRSCOPE_DEMO_MODE !== "false";

const EMPTY_QUOTE: ContractorResponseDraft["repairQuoteDraft"] = {
  workItems: [],
  labourAmount: "",
  materialsAmount: "",
  mainMaterials: [],
  customMaterial: "",
  materialsStatus: "",
  itemiseMaterials: false,
  materialCostItems: [],
  otherChargesReviewed: false,
  extraCharges: [],
  exclusions: [],
  otherExclusion: "",
  priceStatus: "",
  priceChangeReasons: [],
  otherPriceChangeReason: "",
  priceChangeNote: "",
  startAvailability: "",
  laterStartDate: "",
  duration: "",
  guaranteePosition: "",
  guaranteeDuration: "",
  guaranteeNote: "",
  vatRegistered: "",
  vatIncluded: "",
  vatRate: "",
  customVatRate: "",
};

const EMPTY_INSPECTION: ContractorResponseDraft["inspectionDraft"] = {
  reasons: [],
  otherReason: "",
  note: "",
  inspectionFee: "",
  vatTreatment: "",
  deductionPosition: "",
  deductionAmount: "",
  attendance: "",
  preferredWindows: ["", "", ""],
  accessRequired: [],
  otherAccess: "",
  proposalTiming: "",
};

function createDraft(contractor: ContractorIdentity): ContractorResponseDraft {
  return {
    inspectionDraft: { ...EMPTY_INSPECTION, preferredWindows: ["", "", ""] },
    repairQuoteDraft: { ...EMPTY_QUOTE },
    questionDraft: { question: "", context: "" },
    declineDraft: { reason: "", note: "" },
    contractorDetails: { ...contractor },
  };
}

const responseChoices: Array<{
  value: ContractorResponseType;
  title: string;
  hint: string;
}> = [
  {
    value: "repair_quote",
    title: "I can quote for the repair",
    hint: "Select the work and enter your costs.",
  },
  {
    value: "inspection",
    title: "I need to inspect the property first",
    hint: "Explain the visit, fee and next step.",
  },
  {
    value: "question",
    title: "I need more information",
    hint: "Ask one focused question before responding.",
  },
  {
    value: "decline",
    title: "I cannot take this job",
    hint: "Close the opportunity in under 20 seconds.",
  },
];

const responseLabels: Record<ContractorResponseType, string> = {
  repair_quote: "Repair quote",
  inspection: "Site inspection request",
  question: "Contractor question",
  decline: "Declined opportunity",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

function formatMoney(amount: string, vat: string) {
  const numeric = Number(amount || 0);
  const amountLabel = Number.isFinite(numeric)
    ? formatCurrency(numeric)
    : "Not supplied";
  if (vat === "added") {
    const total = numeric * 1.2;
    return `${amountLabel} + VAT · ${formatCurrency(total)} total (demo calculation)`;
  }
  if (vat === "included") return `${amountLabel} · VAT included`;
  if (vat === "not_registered") return `${amountLabel} · Not VAT registered`;
  return amountLabel;
}

function BriefContent({ invitation }: { invitation: ContractorInvitation }) {
  const brief = invitation.sanitisedBrief;
  return (
    <>
      <div className="contractor-brief__heading">
        <div>
          <p className="eyebrow">Private job brief</p>
          <h2>{brief.category}</h2>
        </div>
        <span className="contractor-deadline">
          Respond by <strong>{invitation.responseDeadline}</strong>
        </span>
      </div>
      <dl className="contractor-brief__facts">
        <div>
          <dt>Area</dt>
          <dd>{brief.approximateArea}</dd>
        </div>
        <div>
          <dt>Urgency</dt>
          <dd>{brief.urgency}</dd>
        </div>
        <div>
          <dt>Property</dt>
          <dd>{brief.occupancy}</dd>
        </div>
      </dl>
      <section>
        <h3>Problem brief</h3>
        <p className="contractor-brief__summary">{brief.summary}</p>
      </section>
      <section>
        <h3>Reported facts</h3>
        <ul>
          {brief.reportedFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Important unknowns</h3>
        <ul>
          {brief.importantUnknowns.map((unknown) => (
            <li key={unknown}>{unknown}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Photos and evidence</h3>
        <div className="contractor-evidence">
          {brief.evidence.map((item) => (
            <div key={item.id}>
              <span aria-hidden="true">IMG</span>
              <strong>{item.name}</strong>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Access overview</h3>
        <p>{brief.accessOverview}</p>
      </section>
      <p className="contractor-brief__privacy">
        Exact address and private contact details are not included at this
        stage.
      </p>
    </>
  );
}

function BriefDrawer({
  invitation,
  open,
  onClose,
}: {
  invitation: ContractorInvitation;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="brief-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Job brief"
        aria-modal="true"
        className="brief-drawer"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          autoFocus
          className="brief-drawer__close"
          type="button"
          onClick={onClose}
          aria-label="Close job brief"
        >
          Close
        </button>
        <BriefContent invitation={invitation} />
      </section>
    </div>
  );
}

export function StatusPanel({
  status,
}: {
  status: ContractorInvitation["tokenStatus"] | "submitted";
}) {
  const content = {
    invalid: {
      eyebrow: "Invitation unavailable",
      title: "This invitation link is not valid.",
      copy: "Check that the complete link was opened. If it still does not work, ask the person who invited you for a new link.",
    },
    expired: {
      eyebrow: "Invitation expired",
      title: "The response window has ended.",
      copy: "Your saved response has not been submitted. Contact RepairScope if the landlord has agreed to extend the deadline.",
    },
    revoked: {
      eyebrow: "Invitation withdrawn",
      title: "This private invitation is no longer active.",
      copy: "The opportunity may have changed or been withdrawn. Contact RepairScope if you believe this is an error.",
    },
    closed: {
      eyebrow: "Opportunity closed",
      title: "The landlord is no longer collecting responses.",
      copy: "No response can be submitted through this link.",
    },
    submitted: {
      eyebrow: "Response already submitted",
      title: "A response has already been recorded.",
      copy: "This invitation cannot create a second response. Contact RepairScope if you need help with the submitted details.",
    },
    valid: {
      eyebrow: "",
      title: "",
      copy: "",
    },
  }[status];

  return (
    <main className="contractor-status-page">
      <section className="contractor-status-panel">
        <span className="contractor-status-panel__mark" aria-hidden="true">
          !
        </span>
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.copy}</p>
        <a className="button button--secondary" href="mailto:support@example.com">
          Contact support
        </a>
      </section>
    </main>
  );
}

function SingleChoice({
  legend,
  value,
  options,
  onChange,
  hint,
  name,
  onCommit,
}: {
  legend: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  hint?: string;
  name: string;
  onCommit?: (value: string) => void;
}) {
  return (
    <fieldset className="contractor-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="field-help">{hint}</p>}
      <div className="contractor-option-grid">
        {options.map(([optionValue, label]) => (
          <label
            className={`contractor-option ${value === optionValue ? "contractor-option--selected" : ""}`}
            key={optionValue}
          >
            <input
              checked={value === optionValue}
              name={name}
              type="radio"
              value={optionValue}
              onChange={() => {
                onChange(optionValue);
                onCommit?.(optionValue);
              }}
              onClick={() => {
                if (value === optionValue) onCommit?.(optionValue);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MultiChoice({
  legend,
  values,
  options,
  onChange,
  hint,
}: {
  legend: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const toggle = (option: string) => {
    onChange(
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    );
  };
  return (
    <fieldset className="contractor-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="field-help">{hint}</p>}
      <div className="contractor-option-grid">
        {options.map((option) => (
          <label
            className={`contractor-option ${values.includes(option) ? "contractor-option--selected" : ""}`}
            key={option}
          >
            <input
              checked={values.includes(option)}
              type="checkbox"
              onChange={() => toggle(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function QuestionConfirmationAction({
  questionType,
  label,
  valid,
  onConfirm,
  message,
}: {
  questionType: ContractorQuestionType;
  label: string;
  valid: boolean;
  onConfirm: () => void;
  message?: string;
}) {
  if (!contractorQuestionRequiresConfirmation(questionType)) return null;
  return (
    <div className="contractor-confirmation-action">
      {message && (
        <p className="field-error" role="status">
          {message}
        </p>
      )}
      <button
        className="button"
        type="button"
        disabled={!valid}
        onClick={onConfirm}
      >
        {label}
      </button>
    </div>
  );
}

function ProgressiveQuestion({
  number,
  eyebrow,
  children,
  complete = false,
  expanded = true,
  title,
  summary,
  summaryItems,
  onChange,
}: {
  number: number;
  eyebrow: string;
  children: ReactNode;
  complete?: boolean;
  expanded?: boolean;
  title?: string;
  summary?: string;
  summaryItems?: string[];
  onChange?: () => void;
}) {
  if (complete && !expanded) {
    return (
      <section className="contractor-question-summary" data-progressive-question>
        <div className="progressive-question__number progressive-question__number--complete" aria-hidden="true">
          ✓
        </div>
        <div className="contractor-question-summary__content">
          <p>{title ?? eyebrow}</p>
          {summaryItems?.length ? (
            <ul>
              {summaryItems.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <strong>{summary || "Answered"}</strong>
          )}
        </div>
        <button className="text-button" type="button" onClick={onChange}>
          Change
        </button>
      </section>
    );
  }
  return (
    <section
      className="progressive-question"
      data-progressive-question
      aria-labelledby={`contractor-question-${number}`}
    >
      <div className="progressive-question__number" aria-hidden="true">
        {String(number).padStart(2, "0")}
      </div>
      <div>
        <div className="progressive-question__heading">
          <p className="eyebrow">{eyebrow}</p>
        </div>
        <div id={`contractor-question-${number}`}>{children}</div>
      </div>
    </section>
  );
}

function IdentityDetails({
  details,
  onChange,
}: {
  details: ContractorIdentity;
  onChange: (details: ContractorIdentity) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="contractor-identity">
      <div>
        <p className="eyebrow">Responding as</p>
        <h3>{details.businessName}</h3>
        <p>
          {details.name}
          <br />
          {details.email}
          <br />
          {details.telephone}
        </p>
      </div>
      <button
        className="text-button"
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing((value) => !value)}
      >
        {editing ? "Keep these details" : "Change details"}
      </button>
      {editing && (
        <div className="contractor-identity__fields">
          {(
            [
              ["businessName", "Business name", "text"],
              ["name", "Contact name", "text"],
              ["email", "Email", "email"],
              ["telephone", "Telephone", "tel"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type={type}
                value={details[key]}
                onChange={(event) =>
                  onChange({ ...details, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <p className="identity-review-note">
            Changed identity details may require review before the response is
            released.
          </p>
        </div>
      )}
    </section>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="contractor-review-row">
      <dt>{label}</dt>
      <dd>{value || "Not supplied"}</dd>
    </div>
  );
}

function ContractorResponseExperience({
  invitation,
  token,
}: {
  invitation: ContractorInvitation;
  token: string;
}) {
  const [draft, setDraft] = useState(() => createDraft(invitation.contractor));
  const [phase, setPhase] = useState<FormPhase>("answering");
  const [pendingType, setPendingType] = useState<ContractorResponseType>();
  const [editingResponseType, setEditingResponseType] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedContractorResponse>();
  const [authOpen, setAuthOpen] = useState(false);
  const [confirmedSubmission, setConfirmedSubmission] = useState(false);
  const [workSuggestions, setWorkSuggestions] = useState<WorkItemSuggestion[]>(
    [],
  );
  const [demoState, setDemoState] = useState<DemoState>("valid");
  const initialRender = useRef(true);
  const visibleQuestionCount = useRef(0);
  const questionScrollReady = useRef(false);
  const idempotencyKey = useRef(
    `contractor-response-${invitation.invitationId}-v1`,
  );

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorWorkSuggestions
      .suggestWorkItems(invitation.sanitisedBrief)
      .then((items) => {
        if (active) setWorkSuggestions(items);
      });
    return () => {
      active = false;
    };
  }, [invitation.sanitisedBrief]);

  const updateDraft = (patch: Partial<ContractorResponseDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const updateQuote = (
    patch: Partial<ContractorResponseDraft["repairQuoteDraft"]>,
  ) =>
    setDraft((current) => ({
      ...current,
      repairQuoteDraft: { ...current.repairQuoteDraft, ...patch },
    }));
  const updateInspection = (
    patch: Partial<ContractorResponseDraft["inspectionDraft"]>,
  ) =>
    setDraft((current) => ({
      ...current,
      inspectionDraft: { ...current.inspectionDraft, ...patch },
    }));

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await repairScopeServices.contractorResponses.saveDraft(token, draft);
        setSaveState("saved");
      } catch {
        setSaveState("error");
        window.setTimeout(async () => {
          try {
            await repairScopeServices.contractorResponses.saveDraft(token, draft);
            setSaveState("saved");
          } catch {
            setSaveState("error");
          }
        }, 1200);
      }
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [draft, token]);

  useEffect(() => {
    const questions = document.querySelectorAll<HTMLElement>(
      "[data-progressive-question]",
    );
    if (!questionScrollReady.current) {
      visibleQuestionCount.current = questions.length;
      questionScrollReady.current = true;
      return;
    }
    if (questions.length > visibleQuestionCount.current) {
      const newest = questions.item(questions.length - 1);
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.setTimeout(
        () =>
          newest?.scrollIntoView({
            behavior: reducedMotion ? "auto" : "smooth",
            block: "center",
          }),
        80,
      );
    }
    visibleQuestionCount.current = questions.length;
  });

  const revealNext = (message: string) => {
    setAnnouncement(message);
  };

  const branchHasProgress = (type: ContractorResponseType | undefined) => {
    if (type === "repair_quote") {
      return Boolean(
        draft.repairQuoteDraft.workItems.length ||
          draft.repairQuoteDraft.labourAmount ||
          draft.repairQuoteDraft.materialsAmount,
      );
    }
    if (type === "inspection") {
      return Boolean(
        draft.inspectionDraft.reasons.length ||
          draft.inspectionDraft.inspectionFee,
      );
    }
    if (type === "question") return Boolean(draft.questionDraft.question);
    if (type === "decline") return Boolean(draft.declineDraft.reason);
    return false;
  };

  const chooseResponseType = (type: ContractorResponseType) => {
    if (
      draft.responseType &&
      draft.responseType !== type &&
      branchHasProgress(draft.responseType)
    ) {
      setPendingType(type);
      return;
    }
    updateDraft({ responseType: type });
    setEditingResponseType(false);
    setPhase("answering");
    revealNext(`${responseLabels[type]} questions are now available.`);
  };

  const applyBranchSwitch = () => {
    if (!pendingType) return;
    updateDraft({ responseType: pendingType });
    setEditingResponseType(false);
    setPendingType(undefined);
    setPhase("answering");
    revealNext(
      `${responseLabels[pendingType]} questions are now available. Your previous branch is retained as an inactive draft.`,
    );
  };

  const quote = draft.repairQuoteDraft;
  const inspection = draft.inspectionDraft;
  const quoteStages = {
    work:
      quote.workItems.length > 0 &&
      quote.workItems.every((item) => item.label.trim().length >= 2),
    costs:
      quote.labourAmount.trim() !== "" &&
      quote.materialsAmount.trim() !== "",
    materials:
      Number(quote.materialsAmount || 0) <= 0 ||
      (quote.mainMaterials.length > 0 &&
        Boolean(quote.materialsStatus) &&
        (!quote.itemiseMaterials ||
          (quote.materialCostItems.length > 0 &&
            quote.materialCostItems.every(
              (item) => item.label.trim() && item.amount.trim(),
            )))),
    charges:
      quote.otherChargesReviewed &&
      quote.extraCharges.every(
        (charge) =>
          charge.amount.trim() &&
          (charge.type !== "other" || charge.label.trim()),
      ),
    exclusions:
      quote.exclusions.length > 0 &&
      (!quote.exclusions.includes("Something else") ||
        quote.otherExclusion.trim().length > 1),
    price:
      Boolean(quote.priceStatus) &&
      (quote.priceStatus === "fixed" ||
        quote.priceChangeReasons.length > 0) &&
      (!quote.priceChangeReasons.includes("Something else") ||
        quote.otherPriceChangeReason.trim().length > 1),
    start:
      Boolean(quote.startAvailability) &&
      (quote.startAvailability !== "Later" || Boolean(quote.laterStartDate)),
    duration: Boolean(quote.duration),
    guarantee:
      Boolean(quote.guaranteePosition) &&
      (quote.guaranteePosition !== "yes" ||
        Boolean(quote.guaranteeDuration)),
    vat:
      Boolean(quote.vatRegistered) &&
      (quote.vatRegistered === "no" ||
        (Boolean(quote.vatIncluded) &&
          Boolean(quote.vatRate) &&
          (quote.vatRate !== "other" ||
            quote.customVatRate.trim().length > 0))),
  };
  const quoteReady = Object.values(quoteStages).every(Boolean);

  const inspectionStages = {
    reasons:
      inspection.reasons.length > 0 &&
      (!inspection.reasons.includes("Other") ||
        inspection.otherReason.trim().length >= 3),
    fee: Boolean(inspection.inspectionFee && inspection.vatTreatment),
    deduction:
      Boolean(inspection.deductionPosition) &&
      (inspection.deductionPosition !== "partial" ||
        Boolean(inspection.deductionAmount)),
    attendance:
      Boolean(inspection.attendance) &&
      (inspection.attendance !== "Select preferred dates" ||
        inspection.preferredWindows.some(Boolean)),
    access:
      inspection.accessRequired.length > 0 &&
      (!inspection.accessRequired.includes("Other") ||
        inspection.otherAccess.trim().length >= 3),
    timing: Boolean(inspection.proposalTiming),
  };
  const inspectionReady = Object.values(inspectionStages).every(Boolean);

  const activeReady =
    draft.responseType === "repair_quote"
      ? quoteReady
      : draft.responseType === "inspection"
        ? inspectionReady
        : false;

  const submitResponse = async () => {
    if (submitting || !activeReady || !confirmedSubmission) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await repairScopeServices.contractorResponses.submitResponse(token, {
        idempotencyKey: idempotencyKey.current,
        draft,
      });
      setSubmitted(result.response);
      setPhase("submitted");
    } catch {
      setSubmitError(
        "Your response could not be submitted. Nothing has been cleared—check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setDemo = (state: DemoState) => {
    setDemoState(state);
    setPhase("answering");
    setAnnouncement("");
    setQuestionSent(false);
    setDeclined(false);
    setSubmitted(undefined);
    setQuestionAnswer("");
    if (state === "quote") {
      setDraft((current) => ({
        ...current,
        responseType: "repair_quote",
        repairQuoteDraft: {
          ...current.repairQuoteDraft,
          workItems: [
            {
              id: "demo-work-1",
              suggestionId: "work-suggestion-1",
              label: "Test the affected sockets",
            },
          ],
        },
      }));
    } else if (state === "inspection") {
      setDraft((current) => ({
        ...current,
        responseType: "inspection",
        inspectionDraft: {
          ...current.inspectionDraft,
          reasons: ["Testing or diagnostic equipment is required"],
        },
      }));
    } else if (state === "question_answered") {
      setDraft((current) => ({ ...current, responseType: undefined }));
      setQuestionAnswer(
        "Both sockets are on the same kitchen circuit. The tenant has stopped using them and can provide access on weekday afternoons.",
      );
    } else if (state === "submitted") {
      setDraft((current) => ({ ...current, responseType: "repair_quote" }));
      setSubmitted({
        responseId: "response-demo",
        invitationId: invitation.invitationId,
        repairId: invitation.repairId,
        contractorId: invitation.contractorId,
        source: "contractor_portal",
        responseType: "repair_quote",
        submittedData: createSubmittedRepairQuote(quote),
        submittedAt: new Date().toISOString(),
        status: "submitted",
        version: 1,
      });
      setPhase("submitted");
    } else {
      setDraft(createDraft(invitation.contractor));
    }
  };

  if (phase === "submitted" && submitted) {
    const submittedData = submitted.submittedData;
    const isSubmittedQuote = submitted.responseType === "repair_quote";
    const total = isSubmittedQuote
      ? (submittedData as SubmittedRepairQuote).finalTotal
      : (submittedData as SubmittedInspectionRequest).finalFee;
    return (
      <>
        <main className="contractor-status-page">
          <section className="contractor-success-panel">
            <span className="success-mark" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">
              {isSubmittedQuote ? "Quote submitted" : "Response submitted"}
            </p>
            <h1>
              Your {isSubmittedQuote ? "quote" : "response"} is with the
              landlord.
            </h1>
            <p>
              The landlord will review contractor quotes privately. They may
              ask for more information before making a decision.
            </p>
            <dl className="submitted-summary">
              <ReviewRow
                label="Response type"
                value={responseLabels[submitted.responseType]}
              />
              <ReviewRow
                label="Submitted"
                value={new Date(submitted.submittedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
              <ReviewRow
                label="Business"
                value={draft.contractorDetails.businessName}
              />
              <ReviewRow
                label={isSubmittedQuote ? "Total quote" : "Inspection fee"}
                value={formatCanonicalMoney(total)}
              />
              <ReviewRow label="Status" value="Submitted" />
            </dl>
            <div className="contractor-success-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setPhase("review")}
              >
                View quote
              </button>
              <button
                className="button"
                type="button"
                onClick={() => setAuthOpen(true)}
              >
                Manage my quotes
              </button>
            </div>
          </section>
        </main>
        <SharedAuthShell
          context="contractor"
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          prefill={{
            email: draft.contractorDetails.email,
            name: draft.contractorDetails.name,
            businessName: draft.contractorDetails.businessName,
          }}
          invitation={{
            kind: "validated_contractor_invitation",
            invitationId: invitation.invitationId,
            contractorId: invitation.contractorId,
            verifiedEmail: invitation.contractor.email,
            status: invitation.tokenStatus === "valid" ? "validated" : "invalid",
          }}
          submittedQuoteId={submitted.responseId}
        />
      </>
    );
  }

  const brief = invitation.sanitisedBrief;
  return (
    <main className="contractor-response-page">
      <div className="contractor-mobile-summary">
        <strong>
          {brief.category} · {brief.approximateArea} · {brief.urgency}
        </strong>
        <button type="button" onClick={() => setDrawerOpen(true)}>
          View job details
        </button>
      </div>
      <div className="contractor-response-layout">
        <aside className="contractor-brief" aria-label="Contractor job brief">
          <BriefContent invitation={invitation} />
        </aside>
        <section className="contractor-response-form">
          <div className="contractor-form-intro">
            <div>
              <p className="eyebrow">Private contractor response</p>
              <h1>Review the job and respond</h1>
              <p>
                This usually takes between 2 and 5 minutes. Other contractors
                cannot see your response, identity or price.
              </p>
            </div>
            <span
              className={`contractor-save-state contractor-save-state--${saveState}`}
              role="status"
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Could not save — retrying"
                  : "Saved"}
            </span>
          </div>

          {showPrototypeControls && (
            <div className="contractor-demo-control" data-prototype-control>
              <label htmlFor="contractor-demo-state">Prototype state</label>
              <select
                id="contractor-demo-state"
                value={demoState}
                onChange={(event) => setDemo(event.target.value as DemoState)}
              >
                <option value="valid">Valid new invitation</option>
                <option value="quote">Direct quote in progress</option>
                <option value="inspection">Inspection request in progress</option>
                <option value="question_answered">Landlord question answered</option>
                <option value="submitted">Response submitted</option>
                <option value="expired">Expired link</option>
                <option value="closed">Closed opportunity</option>
              </select>
            </div>
          )}

          {(demoState === "expired" || demoState === "closed") && (
            <div className="inline-status-panel">
              <strong>
                {demoState === "expired"
                  ? "This demonstration invitation has expired."
                  : "This demonstration opportunity is closed."}
              </strong>
              <p>
                Select another prototype state to continue testing the form.
              </p>
            </div>
          )}

          {questionAnswer && (
            <section className="landlord-answer-panel" aria-labelledby="landlord-answer-title">
              <p className="eyebrow">Landlord answer received</p>
              <h2 id="landlord-answer-title">More information is now available</h2>
              <p>{questionAnswer}</p>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setQuestionAnswer("");
                  updateDraft({ responseType: undefined });
                }}
              >
                Choose how to respond
              </button>
            </section>
          )}

          {!questionAnswer &&
            !questionSent &&
            !declined &&
            demoState !== "expired" &&
            demoState !== "closed" &&
            phase === "answering" && (
            <>
              <ProgressiveQuestion
                number={1}
                eyebrow="Your response"
                title="How can you respond to this job?"
                summary={
                  draft.responseType
                    ? responseChoices.find(
                        (choice) => choice.value === draft.responseType,
                      )?.title
                    : ""
                }
                complete={Boolean(draft.responseType)}
                expanded={
                  !draft.responseType ||
                  editingResponseType ||
                  Boolean(pendingType)
                }
                onChange={() => setEditingResponseType(true)}
              >
                <SingleChoice
                  legend="How can you respond to this job?"
                  name="response-type"
                  value={draft.responseType ?? ""}
                  onChange={(value) =>
                    chooseResponseType(value as ContractorResponseType)
                  }
                  onCommit={(value) => {
                    if (value === draft.responseType) {
                      setEditingResponseType(false);
                    }
                  }}
                  options={responseChoices.map((choice) => [
                    choice.value,
                    choice.title,
                  ])}
                />
                <div className="response-choice-hints" aria-hidden="true">
                  {responseChoices.map((choice) => (
                    <span key={choice.value}>{choice.hint}</span>
                  ))}
                </div>
              </ProgressiveQuestion>

              {pendingType && draft.responseType && (
                <section className="branch-switch-panel" role="alert">
                  <h2>Switch response type?</h2>
                  <p>
                    You have started a {responseLabels[draft.responseType].toLowerCase()}.
                    Switching to {responseLabels[pendingType].toLowerCase()} will
                    keep those answers as an inactive draft, but they will not
                    be included in your submission.
                  </p>
                  <div>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setPendingType(undefined)}
                    >
                      Keep current response
                    </button>
                    <button className="button" type="button" onClick={applyBranchSwitch}>
                      Switch and keep draft
                    </button>
                  </div>
                </section>
              )}

              {!pendingType && draft.responseType === "repair_quote" && (
                <QuoteBranch
                  quote={quote}
                  onReveal={revealNext}
                  stages={quoteStages}
                  suggestions={workSuggestions}
                  updateQuote={updateQuote}
                />
              )}

              {!pendingType && draft.responseType === "inspection" && (
                <InspectionBranch
                  inspection={inspection}
                  onReveal={revealNext}
                  stages={inspectionStages}
                  updateInspection={updateInspection}
                />
              )}

              {!pendingType && draft.responseType === "question" && (
                <ProgressiveQuestion number={2} eyebrow="One focused question">
                  <div className="contractor-text-answer">
                    <label htmlFor="contractor-question">
                      What do you need to know before you can respond?
                    </label>
                    <textarea
                      id="contractor-question"
                      rows={5}
                      value={draft.questionDraft.question}
                      onChange={(event) =>
                        updateDraft({
                          questionDraft: {
                            ...draft.questionDraft,
                            question: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <label className="contractor-inline-field">
                    <span>Optional supporting note</span>
                    <textarea
                      rows={3}
                      placeholder="Add any context that will help the landlord answer."
                      value={draft.questionDraft.context}
                      onChange={(event) =>
                        updateDraft({
                          questionDraft: {
                            ...draft.questionDraft,
                            context: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <p className="field-help">
                    Only one active unanswered contractor question is supported
                    in this prototype.
                  </p>
                  <div className="contractor-final-action">
                    <button
                      className="button"
                      type="button"
                      disabled={
                        questionSubmitting ||
                        draft.questionDraft.question.trim().length < 3
                      }
                      onClick={async () => {
                        if (questionSubmitting) return;
                        setQuestionSubmitting(true);
                      await repairScopeServices.contractorResponses.submitQuestion(
                        token,
                        draft.questionDraft,
                      );
                      setQuestionSent(true);
                        setQuestionSubmitting(false);
                    }}
                    >
                      {questionSubmitting ? "Sending question…" : "Send question"}
                    </button>
                  </div>
                </ProgressiveQuestion>
              )}

              {!pendingType && draft.responseType === "decline" && (
                <ProgressiveQuestion number={2} eyebrow="Optional feedback">
                  <SingleChoice
                    legend="Why are you declining?"
                    name="decline-reason"
                    value={draft.declineDraft.reason}
                    onChange={(reason) =>
                      updateDraft({
                        declineDraft: { ...draft.declineDraft, reason },
                      })
                    }
                    options={[
                      ["service-area", "Outside my service area"],
                      ["specialism", "Not my trade or specialism"],
                      ["availability", "No availability"],
                      ["too-small", "Job is too small"],
                      ["too-large", "Job is too large"],
                      ["information", "Insufficient information"],
                      ["equipment", "Requires specialist equipment"],
                      ["other", "Other"],
                    ]}
                  />
                  {draft.declineDraft.reason === "other" && (
                    <label className="contractor-inline-field">
                      <span>Optional note</span>
                      <textarea
                        rows={3}
                        value={draft.declineDraft.note}
                        onChange={(event) =>
                          updateDraft({
                            declineDraft: {
                              ...draft.declineDraft,
                              note: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="contractor-final-action">
                    <button
                      className="button"
                      type="button"
                      onClick={async () => {
                        await repairScopeServices.contractorResponses.declineOpportunity(
                          token,
                          draft.declineDraft,
                        );
                        setDeclined(true);
                      }}
                    >
                      Decline opportunity
                    </button>
                  </div>
                </ProgressiveQuestion>
              )}

              {activeReady && (
                <section className="contractor-ready-panel">
                  <div>
                    <p className="eyebrow">Answers complete</p>
                    <h2>
                      {draft.responseType === "repair_quote"
                        ? "Check your quote"
                        : "Review before submitting"}
                    </h2>
                    <p>
                      {draft.responseType === "repair_quote"
                        ? "Check the work, costs and exclusions as one complete quote."
                        : "Check the visit details as one complete response."}
                    </p>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setPhase("review");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    {draft.responseType === "repair_quote"
                      ? "Check quote"
                      : "Review response"}
                  </button>
                </section>
              )}
            </>
          )}

          {questionSent && (
            <section className="inline-confirmation">
              <span className="success-mark" aria-hidden="true">
                ✓
              </span>
              <p className="eyebrow">Question sent</p>
              <h2>RepairScope will let you know when an answer is available.</h2>
              <p>Your progress has been saved.</p>
            </section>
          )}

          {declined && (
            <section className="inline-confirmation">
              <span className="success-mark" aria-hidden="true">
                ✓
              </span>
              <p className="eyebrow">Opportunity declined</p>
              <h2>Thank you for letting us know.</h2>
            </section>
          )}

          {phase === "review" &&
            demoState !== "expired" &&
            demoState !== "closed" &&
            draft.responseType && (
            <ResponseReview
              confirmedSubmission={confirmedSubmission}
              draft={draft}
              onConfirmSubmission={setConfirmedSubmission}
              onEdit={() => setPhase("answering")}
              onIdentityChange={(contractorDetails) =>
                updateDraft({ contractorDetails })
              }
              onSubmit={submitResponse}
              onReturnToConfirmation={() => setPhase("submitted")}
              submittedView={Boolean(submitted)}
              submitError={submitError}
              submitting={submitting}
            />
          )}

          <div className="contractor-live-region" aria-live="polite">
            {announcement}
          </div>
        </section>
      </div>
      <BriefDrawer
        invitation={invitation}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </main>
  );
}

const extraChargeOptions = [
  ["testing", "Testing or certificate"],
  ["callout", "Call-out"],
  ["waste", "Waste removal"],
  ["making_good", "Repairing plaster, walls or paint"],
  ["access", "Scaffolding or access equipment"],
  ["parking", "Parking or permits"],
  ["other", "Other cost"],
] as const;

const materialSuggestions = [
  "Replacement socket fittings",
  "Back boxes",
  "Cable or wiring",
  "Fixings and small materials",
];

function QuoteMoneyInput({
  id,
  label,
  value,
  readOnly = false,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="quote-money-input" htmlFor={id}>
      <span>{label}</span>
      <span className="money-field">
        <span aria-hidden="true">£</span>
        <input
          id={id}
          inputMode="decimal"
          min="0"
          readOnly={readOnly}
          step="0.01"
          type="number"
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function QuoteTotals({
  quote,
  final = false,
}: {
  quote: ContractorResponseDraft["repairQuoteDraft"];
  final?: boolean;
}) {
  const totals = calculateContractorQuote(quote);
  return (
    <dl className={`quote-totals ${final ? "quote-totals--final" : ""}`}>
      <ReviewRow label="Labour" value={formatCurrency(totals.labour)} />
      <ReviewRow label="Materials" value={formatCurrency(totals.materials)} />
      {totals.extras > 0 && (
        <ReviewRow
          label="Other charges"
          value={formatCurrency(totals.extras)}
        />
      )}
      <ReviewRow
        label="Subtotal"
        value={formatCurrency(totals.subtotal)}
      />
      {quote.vatRegistered && (
        <ReviewRow
          label="VAT"
          value={
            totals.vatMode === "not_charged"
              ? "Not charged"
              : `${formatCurrency(totals.vatAmount)} at ${totals.vatRate}% ${
                  totals.vatMode === "included" ? "included" : "added"
                }`
          }
        />
      )}
      {final && (
        <ReviewRow label="Total quote" value={formatCurrency(totals.total)} />
      )}
    </dl>
  );
}

function QuoteBranch({
  quote,
  onReveal,
  stages,
  suggestions,
  updateQuote,
}: {
  quote: ContractorResponseDraft["repairQuoteDraft"];
  onReveal: (message: string) => void;
  stages: Record<string, boolean>;
  suggestions: WorkItemSuggestion[];
  updateQuote: (
    patch: Partial<ContractorResponseDraft["repairQuoteDraft"]>,
  ) => void;
}) {
  const [editingStep, setEditingStep] = useState<string>();
  const [settledSteps, setSettledSteps] = useState<string[]>([]);
  const [customWork, setCustomWork] = useState("");

  const settle = (step: string) =>
    setSettledSteps((current) =>
      current.includes(step) ? current : [...current, step],
    );
  const isExpanded = (step: string, complete: boolean) =>
    editingStep === step || !complete;
  const edit = (step: string) => setEditingStep(step);
  const done = () => setEditingStep(undefined);
  const confirmStep = (step: string, nextMessage: string) => {
    const firstConfirmation = !settledSteps.includes(step);
    settle(step);
    done();
    onReveal(firstConfirmation ? nextMessage : "Updated answer saved.");
  };

  const workComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.work,
    settledSteps.includes("work"),
  );
  const costsComplete = contractorQuestionHasProgressed(
    "text_or_numeric",
    stages.costs,
    settledSteps.includes("costs"),
  );
  const materialsComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.materials,
    settledSteps.includes("materials"),
  );
  const chargesComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.charges,
    settledSteps.includes("charges"),
  );
  const exclusionsComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.exclusions,
    settledSteps.includes("exclusions"),
  );
  const priceComplete = contractorQuestionHasProgressed(
    quote.priceStatus === "fixed" ? "single_choice" : "multi_select",
    stages.price,
    settledSteps.includes("price"),
  );
  const startComplete = contractorQuestionHasProgressed(
    quote.startAvailability === "Later"
      ? "text_or_numeric"
      : "single_choice",
    stages.start,
    settledSteps.includes("start"),
  );
  const durationComplete = contractorQuestionHasProgressed(
    "single_choice",
    stages.duration,
    true,
  );
  const guaranteeComplete = contractorQuestionHasProgressed(
    "single_choice",
    stages.guarantee,
    true,
  );
  const vatComplete = contractorQuestionHasProgressed(
    quote.vatRate === "other" ? "text_or_numeric" : "single_choice",
    stages.vat,
    settledSteps.includes("vat"),
  );

  const toggleSuggestion = (suggestion: WorkItemSuggestion) => {
    const selected = quote.workItems.some(
      (item) => item.suggestionId === suggestion.id,
    );
    updateQuote({
      workItems: selected
        ? quote.workItems.filter(
            (item) => item.suggestionId !== suggestion.id,
          )
        : [
            ...quote.workItems,
            {
              id: `work-${suggestion.id}`,
              suggestionId: suggestion.id,
              label: suggestion.label,
            },
          ],
    });
  };

  const moveWorkItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quote.workItems.length) return;
    const workItems = [...quote.workItems];
    [workItems[index], workItems[nextIndex]] = [
      workItems[nextIndex],
      workItems[index],
    ];
    updateQuote({ workItems });
  };

  const toggleExclusion = (option: string) => {
    const exclusions = toggleContractorExclusion(quote.exclusions, option);
    updateQuote({
      exclusions,
      otherExclusion: exclusions.includes("Something else")
        ? quote.otherExclusion
        : "",
    });
  };

  const addExtraCharge = (
    type: ContractorResponseDraft["repairQuoteDraft"]["extraCharges"][number]["type"],
    label: string,
  ) => {
    if (quote.extraCharges.some((charge) => charge.type === type)) return;
    updateQuote({
      otherChargesReviewed: true,
      extraCharges: [
        ...quote.extraCharges,
        {
          id: `charge-${type}`,
          type,
          label: type === "other" ? "" : label,
          amount: "",
        },
      ],
    });
  };

  const totals = calculateContractorQuote(quote);
  const workItemsValid =
    quote.workItems.length > 0 &&
    quote.workItems.every((item) => item.label.trim().length >= 2);
  const pendingCustomWork = customWork.length > 0;

  return (
    <>
      <ProgressiveQuestion
        number={2}
        eyebrow="Work"
        title="What work will you do?"
        summary={quote.workItems.map((item) => item.label).join(" · ")}
        summaryItems={quote.workItems.map((item) => item.label)}
        complete={workComplete}
        expanded={isExpanded("work", workComplete)}
        onChange={() => edit("work")}
      >
        <fieldset className="contractor-fieldset">
          <legend>What work will you do?</legend>
          <p className="field-help">
            Select the work included in your quote. You can edit the wording or
            add something else.
          </p>
          <p className="quote-suggestion-label">Suggested from the job details</p>
          <div className="contractor-option-grid">
            {suggestions.map((suggestion) => {
              const selected = quote.workItems.some(
                (item) => item.suggestionId === suggestion.id,
              );
              return (
                <label
                  className={`contractor-option ${
                    selected ? "contractor-option--selected" : ""
                  }`}
                  key={suggestion.id}
                >
                  <input
                    checked={selected}
                    type="checkbox"
                    onChange={() => toggleSuggestion(suggestion)}
                  />
                  <span>{suggestion.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {quote.workItems.length > 0 && (
          <div className="selected-work-items">
            <h3>Work in your quote</h3>
            {quote.workItems.map((item, index) => (
              <div className="editable-work-item" key={item.id}>
                <input
                  aria-label={`Work item ${index + 1}`}
                  value={item.label}
                  onChange={(event) =>
                    updateQuote({
                      workItems: quote.workItems.map((current) =>
                        current.id === item.id
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
                <div>
                  <button
                    aria-label={`Move ${item.label} up`}
                    disabled={index === 0}
                    type="button"
                    onClick={() => moveWorkItem(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${item.label} down`}
                    disabled={index === quote.workItems.length - 1}
                    type="button"
                    onClick={() => moveWorkItem(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      updateQuote({
                        workItems: quote.workItems.filter(
                          (current) => current.id !== item.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="custom-work-item">
          <label htmlFor="custom-work-item">+ Add something else</label>
          <div>
            <input
              id="custom-work-item"
              value={customWork}
              onChange={(event) => setCustomWork(event.target.value)}
            />
            <button
              className="button button--secondary"
              disabled={customWork.trim().length < 2}
              type="button"
              onClick={() => {
                updateQuote({
                  workItems: [
                    ...quote.workItems,
                    {
                      id: `custom-work-${quote.workItems.length + 1}`,
                      label: customWork.trim(),
                    },
                  ],
                });
                setCustomWork("");
              }}
            >
              Add work item
            </button>
          </div>
        </div>
        {quote.workItems.some((item) => item.label.trim().length < 2) && (
          <p className="field-error" role="status">
            Every work item needs a short description before continuing.
          </p>
        )}
        <QuestionConfirmationAction
          questionType="multi_select"
          label={workItemsConfirmationLabel(
            quote.workItems.length,
            settledSteps.includes("work"),
          )}
          valid={workItemsValid && !pendingCustomWork}
          message={
            pendingCustomWork
              ? "Add this work item or clear the field before continuing."
              : undefined
          }
          onConfirm={() =>
            confirmStep("work", "Main costs question revealed.")
          }
        />
      </ProgressiveQuestion>

      {workComplete && (
        <ProgressiveQuestion
          number={3}
          eyebrow="Costs"
          title="Enter your main costs"
          summary={`Labour ${formatCurrency(
            Number(quote.labourAmount || 0),
          )} · Materials ${formatCurrency(totals.materials)}`}
          complete={costsComplete}
          expanded={isExpanded("costs", costsComplete)}
          onChange={() => edit("costs")}
        >
          <fieldset className="contractor-fieldset">
            <legend>Enter your main costs</legend>
            <div className="quote-main-costs">
              <QuoteMoneyInput
                id="quote-labour"
                label="Labour"
                value={quote.labourAmount}
                onChange={(labourAmount) => updateQuote({ labourAmount })}
              />
              <QuoteMoneyInput
                id="quote-materials"
                label="Materials"
                value={
                  quote.itemiseMaterials
                    ? totals.materials.toFixed(2)
                    : quote.materialsAmount
                }
                readOnly={quote.itemiseMaterials}
                onChange={(materialsAmount) =>
                  updateQuote({ materialsAmount })
                }
              />
            </div>
          </fieldset>
          <QuoteTotals quote={quote} />
          <QuestionConfirmationAction
            questionType="text_or_numeric"
            label={
              settledSteps.includes("costs")
                ? "Update main costs"
                : "Continue with these costs"
            }
            valid={stages.costs}
            onConfirm={() =>
              confirmStep("costs", "Materials question revealed.")
            }
          />
        </ProgressiveQuestion>
      )}

      {costsComplete && Number(quote.materialsAmount || 0) > 0 && (
        <ProgressiveQuestion
          number={4}
          eyebrow="Materials"
          title="What are the main materials?"
          summary={`${[
            ...quote.mainMaterials.filter(
              (material) => material !== "Something else",
            ),
            quote.customMaterial,
          ]
            .filter(Boolean)
            .join(", ")} · ${
            quote.materialsStatus === "confirmed"
              ? "Confirmed"
              : quote.materialsStatus === "estimated"
                ? "Estimated"
                : "To be confirmed"
          }`}
          complete={materialsComplete}
          expanded={isExpanded("materials", materialsComplete)}
          onChange={() => edit("materials")}
        >
          <MultiChoice
            legend="What are the main materials?"
            values={quote.mainMaterials}
            onChange={(mainMaterials) => updateQuote({ mainMaterials })}
            options={[...materialSuggestions, "Something else"]}
          />
          {quote.mainMaterials.includes("Something else") && (
            <label className="contractor-inline-field">
              <span>Add another material</span>
              <input
                value={quote.customMaterial}
                onChange={(event) =>
                  updateQuote({ customMaterial: event.target.value })
                }
              />
            </label>
          )}
          <button
            className="quote-optional-toggle"
            type="button"
            aria-expanded={quote.itemiseMaterials}
            onClick={() => {
              const itemiseMaterials = !quote.itemiseMaterials;
              updateQuote({
                itemiseMaterials,
                materialCostItems:
                  itemiseMaterials && quote.materialCostItems.length === 0
                    ? [
                        {
                          id: "material-row-1",
                          label: "",
                          quantity: "",
                          amount: "",
                          status: "confirmed",
                        },
                      ]
                    : quote.materialCostItems,
              });
            }}
          >
            {quote.itemiseMaterials ? "Use one combined materials cost" : "List individual material costs — optional"}
          </button>
          {quote.itemiseMaterials && (
            <div className="material-cost-rows">
              {quote.materialCostItems.map((item, index) => (
                <div className="material-cost-row" key={item.id}>
                  <label>
                    <span>Material or group</span>
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateQuote({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? { ...current, label: event.target.value }
                                : current,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Quantity — optional</span>
                    <input
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) =>
                        updateQuote({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? { ...current, quantity: event.target.value }
                                : current,
                          ),
                        })
                      }
                    />
                  </label>
                  <QuoteMoneyInput
                    id={`material-amount-${index}`}
                    label="Amount"
                    value={item.amount}
                    onChange={(amount) =>
                      updateQuote({
                        materialCostItems: quote.materialCostItems.map(
                          (current) =>
                            current.id === item.id
                              ? { ...current, amount }
                              : current,
                        ),
                      })
                    }
                  />
                  <label>
                    <span>Cost status</span>
                    <select
                      value={item.status}
                      onChange={(event) =>
                        updateQuote({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? {
                                    ...current,
                                    status: event.target.value as
                                      | "confirmed"
                                      | "estimated"
                                      | "to_confirm",
                                  }
                                : current,
                          ),
                        })
                      }
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="estimated">Estimated</option>
                      <option value="to_confirm">To be confirmed</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      updateQuote({
                        materialCostItems: quote.materialCostItems.filter(
                          (current) => current.id !== item.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  updateQuote({
                    materialCostItems: [
                      ...quote.materialCostItems,
                      {
                        id: `material-row-${quote.materialCostItems.length + 1}`,
                        label: "",
                        quantity: "",
                        amount: "",
                        status: "confirmed",
                      },
                    ],
                  })
                }
              >
                + Add material row
              </button>
            </div>
          )}
          <SingleChoice
            legend="Is this materials cost confirmed?"
            name="materials-status"
            value={quote.materialsStatus}
            onChange={(materialsStatus) => {
              updateQuote({
                materialsStatus: materialsStatus as
                  | "confirmed"
                  | "estimated"
                  | "to_confirm",
              });
            }}
            options={[
              ["confirmed", "Yes, confirmed"],
              ["estimated", "Estimated cost"],
              ["to_confirm", "To be confirmed after attending"],
            ]}
          />
          <QuestionConfirmationAction
            questionType="multi_select"
            label={
              settledSteps.includes("materials")
                ? "Update selected materials"
                : "Continue with selected materials"
            }
            valid={stages.materials}
            onConfirm={() =>
              confirmStep("materials", "Other charges question revealed.")
            }
          />
        </ProgressiveQuestion>
      )}

      {costsComplete &&
        (Number(quote.materialsAmount || 0) <= 0 || materialsComplete) && (
          <ProgressiveQuestion
            number={5}
            eyebrow="Other costs"
            title="Any other separate charges?"
            summary={
              quote.extraCharges.length
                ? quote.extraCharges
                    .map(
                      (charge) =>
                        `${charge.label || "Other cost"} ${formatCurrency(
                          Number(charge.amount || 0),
                        )}`,
                    )
                    .join(" · ")
                : "No other separate charges"
            }
            complete={chargesComplete}
            expanded={isExpanded("charges", chargesComplete)}
            onChange={() => edit("charges")}
          >
            <fieldset className="contractor-fieldset">
              <legend>Any other separate charges?</legend>
              <p className="field-help">
                Add only charges that are separate from labour and materials.
              </p>
              <div className="quote-add-charge-grid">
                {extraChargeOptions.map(([type, label]) => (
                  <button
                    className="button button--secondary"
                    disabled={quote.extraCharges.some(
                      (charge) => charge.type === type,
                    )}
                    key={type}
                    type="button"
                    onClick={() => addExtraCharge(type, label)}
                  >
                    + {label}
                  </button>
                ))}
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() =>
                    updateQuote({
                      otherChargesReviewed: true,
                      extraCharges: [],
                    })
                  }
                >
                  No other separate charges
                </button>
              </div>
            </fieldset>
            {quote.extraCharges.map((charge) => (
              <div className="extra-charge-row" key={charge.id}>
                {charge.type === "other" && (
                  <label>
                    <span>Short label</span>
                    <input
                      value={charge.label}
                      onChange={(event) =>
                        updateQuote({
                          extraCharges: quote.extraCharges.map((current) =>
                            current.id === charge.id
                              ? { ...current, label: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                  </label>
                )}
                <QuoteMoneyInput
                  id={`charge-${charge.type}`}
                  label={charge.label || "Other cost"}
                  value={charge.amount}
                  onChange={(amount) =>
                    updateQuote({
                      extraCharges: quote.extraCharges.map((current) =>
                        current.id === charge.id
                          ? { ...current, amount }
                          : current,
                      ),
                    })
                  }
                />
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    updateQuote({
                      extraCharges: quote.extraCharges.filter(
                        (current) => current.id !== charge.id,
                      ),
                      otherChargesReviewed: true,
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <QuoteTotals quote={quote} />
            <QuestionConfirmationAction
              questionType="multi_select"
              label={
                settledSteps.includes("charges")
                  ? "Update extra charges"
                  : quote.extraCharges.length > 0
                    ? "Continue with added charges"
                    : "Continue without extra charges"
              }
              valid={stages.charges}
              onConfirm={() =>
                confirmStep("charges", "Exclusions question revealed.")
              }
            />
          </ProgressiveQuestion>
        )}

      {chargesComplete && (
        <ProgressiveQuestion
          number={6}
          eyebrow="Not included"
          title="What is not included?"
          summary={[
            ...quote.exclusions,
            quote.exclusions.includes("Something else")
              ? quote.otherExclusion
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          complete={exclusionsComplete}
          expanded={isExpanded("exclusions", exclusionsComplete)}
          onChange={() => edit("exclusions")}
        >
          <fieldset className="contractor-fieldset">
            <legend>What is not included?</legend>
            <div className="contractor-option-grid">
              {[
                "Repairing plaster, walls or paint afterwards",
                "Hidden damage found after work starts",
                "Additional faults not described in the job",
                "Scaffolding or specialist access",
                "Moving furniture or stored belongings",
                "Nothing else is excluded",
                "Something else",
              ].map((option) => {
                const selected = quote.exclusions.includes(option);
                return (
                  <label
                    className={`contractor-option ${
                      selected ? "contractor-option--selected" : ""
                    }`}
                    key={option}
                  >
                    <input
                      checked={selected}
                      type="checkbox"
                      onChange={() => toggleExclusion(option)}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {quote.exclusions.includes("Something else") && (
            <label className="contractor-inline-field">
              <span>What else is not included?</span>
              <input
                value={quote.otherExclusion}
                onChange={(event) =>
                  updateQuote({ otherExclusion: event.target.value })
                }
              />
            </label>
          )}
          <QuestionConfirmationAction
            questionType="multi_select"
            label={
              settledSteps.includes("exclusions")
                ? "Update these exclusions"
                : "Continue with these exclusions"
            }
            valid={stages.exclusions}
            onConfirm={() =>
              confirmStep("exclusions", "Price question revealed.")
            }
          />
        </ProgressiveQuestion>
      )}

      {exclusionsComplete && (
        <ProgressiveQuestion
          number={7}
          eyebrow="Price"
          title="Could the price increase?"
          summary={
            quote.priceStatus === "fixed"
              ? "Fixed price"
              : quote.priceStatus === "may_change"
                ? "Price may change"
                : "Estimate"
          }
          complete={stages.price}
          expanded={isExpanded("price", priceComplete)}
          onChange={() => edit("price")}
        >
          <SingleChoice
            legend="Could the price increase after you attend or start work?"
            name="quote-price-status"
            value={quote.priceStatus}
            onChange={(priceStatus) =>
              updateQuote({
                priceStatus: priceStatus as
                  | "fixed"
                  | "may_change"
                  | "estimate",
                priceChangeReasons:
                  priceStatus === "fixed" ? [] : quote.priceChangeReasons,
              })
            }
            onCommit={(priceStatus) => {
              if (priceStatus === "fixed") {
                settle("price");
                done();
              }
            }}
            options={[
              ["fixed", "No, this is a fixed price"],
              ["may_change", "Yes, in some situations"],
              ["estimate", "This is an estimate"],
            ]}
          />
          {quote.priceStatus && quote.priceStatus !== "fixed" && (
            <>
              <MultiChoice
                legend="What could change the price?"
                values={quote.priceChangeReasons}
                onChange={(priceChangeReasons) =>
                  updateQuote({ priceChangeReasons })
                }
                options={[
                  "Hidden damage",
                  "More faults are found",
                  "More parts or materials are needed",
                  "Access is harder than expected",
                  "The existing work is unsafe or unsuitable",
                  "Extra work is requested",
                  "Something else",
                ]}
              />
              {quote.priceChangeReasons.includes("Something else") && (
                <label className="contractor-inline-field">
                  <span>What else could change the price?</span>
                  <input
                    value={quote.otherPriceChangeReason}
                    onChange={(event) =>
                      updateQuote({
                        otherPriceChangeReason: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label className="contractor-inline-field">
                <span>Optional note</span>
                <textarea
                  rows={3}
                  value={quote.priceChangeNote}
                  onChange={(event) =>
                    updateQuote({ priceChangeNote: event.target.value })
                  }
                />
              </label>
              <QuestionConfirmationAction
                questionType="multi_select"
                label={
                  settledSteps.includes("price")
                    ? "Update these reasons"
                    : "Continue with these reasons"
                }
                valid={stages.price}
                onConfirm={() =>
                  confirmStep("price", "Start date question revealed.")
                }
              />
            </>
          )}
        </ProgressiveQuestion>
      )}

      {priceComplete && (
        <ProgressiveQuestion
          number={8}
          eyebrow="Start date"
          title="When could you start?"
          summary={
            quote.startAvailability === "Later"
              ? quote.laterStartDate
              : quote.startAvailability
          }
          complete={startComplete}
          expanded={isExpanded("start", startComplete)}
          onChange={() => edit("start")}
        >
          <SingleChoice
            legend="When could you start?"
            name="quote-start"
            value={quote.startAvailability}
            onChange={(startAvailability) =>
              updateQuote({ startAvailability })
            }
            onCommit={(startAvailability) => {
              if (startAvailability !== "Later") done();
            }}
            options={[
              ["Within 24 hours", "Within 24 hours"],
              ["Within 2–3 days", "Within 2–3 days"],
              ["Within one week", "Within one week"],
              ["Within two weeks", "Within two weeks"],
              ["Later", "Later"],
              ["Contact me to arrange", "Contact me to arrange"],
            ]}
          />
          {quote.startAvailability === "Later" && (
            <>
              <label className="contractor-inline-field">
                <span>Earliest start date</span>
                <input
                  type="date"
                  value={quote.laterStartDate}
                  onChange={(event) =>
                    updateQuote({ laterStartDate: event.target.value })
                  }
                />
              </label>
              <QuestionConfirmationAction
                questionType="text_or_numeric"
                label={
                  settledSteps.includes("start")
                    ? "Update start date"
                    : "Continue with this start date"
                }
                valid={stages.start}
                onConfirm={() =>
                  confirmStep("start", "Job duration question revealed.")
                }
              />
            </>
          )}
        </ProgressiveQuestion>
      )}

      {startComplete && (
        <ProgressiveQuestion
          number={9}
          eyebrow="Time needed"
          title="How long should the job take?"
          summary={quote.duration}
          complete={durationComplete}
          expanded={isExpanded("duration", durationComplete)}
          onChange={() => edit("duration")}
        >
          <SingleChoice
            legend="How long should the job take?"
            name="quote-duration"
            value={quote.duration}
            onChange={(duration) => updateQuote({ duration })}
            onCommit={done}
            options={[
              ["Under 2 hours", "Under 2 hours"],
              ["Half a day", "Half a day"],
              ["One day", "One day"],
              ["2–3 days", "2–3 days"],
              ["More than 3 days", "More than 3 days"],
              ["Not sure yet", "Not sure yet"],
            ]}
          />
        </ProgressiveQuestion>
      )}

      {durationComplete && (
        <ProgressiveQuestion
          number={10}
          eyebrow="Warranty"
          title="Is a warranty included?"
          summary={
            quote.guaranteePosition === "yes"
              ? `Yes · ${quote.guaranteeDuration}`
              : quote.guaranteePosition === "no"
                ? "No"
                : "Not applicable"
          }
          complete={guaranteeComplete}
          expanded={isExpanded("guarantee", guaranteeComplete)}
          onChange={() => edit("guarantee")}
        >
          <SingleChoice
            legend="Is a warranty included?"
            name="quote-guarantee"
            value={quote.guaranteePosition}
            onChange={(guaranteePosition) =>
              updateQuote({
                guaranteePosition: guaranteePosition as
                  | "yes"
                  | "no"
                  | "not_applicable",
              })
            }
            onCommit={(guaranteePosition) => {
              if (guaranteePosition !== "yes") done();
            }}
            options={[
              ["yes", "Yes"],
              ["no", "No"],
              ["not_applicable", "Not applicable"],
            ]}
          />
          {quote.guaranteePosition === "yes" && (
            <>
              <label className="contractor-inline-field">
                <span>What is covered? — optional</span>
                <textarea
                  rows={3}
                  value={quote.guaranteeNote}
                  onChange={(event) =>
                    updateQuote({ guaranteeNote: event.target.value })
                  }
                />
              </label>
              <SingleChoice
                legend="How long is the warranty?"
                name="quote-guarantee-duration"
                value={quote.guaranteeDuration}
                onChange={(guaranteeDuration) =>
                  updateQuote({ guaranteeDuration })
                }
                onCommit={done}
                options={[
                  ["3 months", "3 months"],
                  ["6 months", "6 months"],
                  ["12 months", "12 months"],
                  ["2 years", "2 years"],
                  ["Other", "Other"],
                ]}
              />
            </>
          )}
        </ProgressiveQuestion>
      )}

      {guaranteeComplete && (
        <ProgressiveQuestion
          number={11}
          eyebrow="VAT"
          title="VAT"
          summary={
            quote.vatRegistered === "no"
              ? "Not VAT registered"
              : `${quote.vatIncluded === "yes" ? "VAT included" : "VAT added"} at ${
                  quote.vatRate === "other"
                    ? quote.customVatRate
                    : quote.vatRate
                }%`
          }
          complete={stages.vat}
          expanded={isExpanded("vat", vatComplete)}
          onChange={() => edit("vat")}
        >
          <SingleChoice
            legend="Are you VAT registered?"
            name="quote-vat-registered"
            value={quote.vatRegistered}
            onChange={(vatRegistered) =>
              updateQuote({
                vatRegistered: vatRegistered as "yes" | "no",
                vatIncluded:
                  vatRegistered === "no" ? "" : quote.vatIncluded,
              })
            }
            onCommit={(vatRegistered) => {
              if (vatRegistered === "no") done();
            }}
            options={[
              ["no", "No"],
              ["yes", "Yes"],
            ]}
          />
          {quote.vatRegistered === "yes" && (
            <>
              <SingleChoice
                legend="Do the prices above already include VAT?"
                name="quote-vat-included"
                value={quote.vatIncluded}
                onChange={(vatIncluded) =>
                  updateQuote({
                    vatIncluded: vatIncluded as "yes" | "no",
                  })
                }
                options={[
                  ["yes", "Yes, VAT is included"],
                  ["no", "No, add VAT"],
                ]}
              />
              {quote.vatIncluded && (
                <SingleChoice
                  legend="VAT rate"
                  name="quote-vat-rate"
                  value={quote.vatRate}
                  onChange={(vatRate) =>
                    updateQuote({
                      vatRate: vatRate as "20" | "5" | "0" | "other",
                    })
                  }
                  onCommit={(vatRate) => {
                    if (vatRate !== "other") done();
                  }}
                  options={[
                    ["20", "20%"],
                    ["5", "5%"],
                    ["0", "0%"],
                    ["other", "Other"],
                  ]}
                />
              )}
              {quote.vatRate === "other" && (
                <>
                  <label className="contractor-inline-field">
                    <span>VAT percentage</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      type="number"
                      value={quote.customVatRate}
                      onChange={(event) =>
                        updateQuote({ customVatRate: event.target.value })
                      }
                    />
                  </label>
                  <QuestionConfirmationAction
                    questionType="text_or_numeric"
                    label={
                      settledSteps.includes("vat")
                        ? "Update VAT rate"
                        : "Continue with this VAT rate"
                    }
                    valid={stages.vat}
                    onConfirm={() =>
                      confirmStep("vat", "Quote questions complete.")
                    }
                  />
                </>
              )}
            </>
          )}
          {quote.vatRegistered && <QuoteTotals quote={quote} final />}
        </ProgressiveQuestion>
      )}
    </>
  );
}

function InspectionBranch({
  inspection,
  stages,
  updateInspection,
  onReveal,
}: {
  inspection: ContractorResponseDraft["inspectionDraft"];
  stages: Record<string, boolean>;
  updateInspection: (
    patch: Partial<ContractorResponseDraft["inspectionDraft"]>,
  ) => void;
  onReveal: (message: string) => void;
}) {
  const [editingStep, setEditingStep] = useState<string>();
  const [settledSteps, setSettledSteps] = useState<string[]>([]);
  let number = 2;
  const settle = (step: string) =>
    setSettledSteps((current) =>
      current.includes(step) ? current : [...current, step],
    );
  const confirmStep = (step: string, nextMessage: string) => {
    const firstConfirmation = !settledSteps.includes(step);
    settle(step);
    setEditingStep(undefined);
    onReveal(firstConfirmation ? nextMessage : "Updated answer saved.");
  };
  const expanded = (step: string, complete: boolean) =>
    editingStep === step || !complete;
  const reasonsComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.reasons,
    settledSteps.includes("reasons"),
  );
  const accessComplete = contractorQuestionHasProgressed(
    "multi_select",
    stages.access,
    settledSteps.includes("access"),
  );
  const feeComplete = contractorQuestionHasProgressed(
    "text_or_numeric",
    stages.fee,
    settledSteps.includes("fee"),
  );
  const deductionComplete = contractorQuestionHasProgressed(
    inspection.deductionPosition === "partial"
      ? "text_or_numeric"
      : "single_choice",
    stages.deduction,
    settledSteps.includes("deduction"),
  );
  const attendanceComplete = contractorQuestionHasProgressed(
    inspection.attendance === "Select preferred dates"
      ? "text_or_numeric"
      : "single_choice",
    stages.attendance,
    settledSteps.includes("attendance"),
  );
  return (
    <>
      <ProgressiveQuestion
        number={number++}
        eyebrow="Inspection reason"
        title="Why is an inspection required?"
        summary={inspection.reasons.join(" · ")}
        complete={reasonsComplete}
        expanded={expanded("reasons", reasonsComplete)}
        onChange={() => setEditingStep("reasons")}
      >
        <MultiChoice
          legend="Why is an inspection required?"
          values={inspection.reasons}
          onChange={(reasons) => updateInspection({ reasons })}
          options={[
            "The cause cannot be confirmed remotely",
            "Testing or diagnostic equipment is required",
            "Access to the affected area is required",
            "Measurements are required",
            "The existing installation condition must be checked",
            "Other",
          ]}
        />
        {inspection.reasons.includes("Other") && (
          <label className="contractor-inline-field">
            <span>Explain the other reason</span>
            <textarea
              id="inspection-other-reason"
              rows={3}
              value={inspection.otherReason}
              onChange={(event) =>
                updateInspection({ otherReason: event.target.value })
              }
            />
          </label>
        )}
        <label className="contractor-inline-field">
          <span>Optional note</span>
          <textarea
            rows={3}
            value={inspection.note}
            onChange={(event) => updateInspection({ note: event.target.value })}
          />
        </label>
        <QuestionConfirmationAction
          questionType="multi_select"
          label={
            settledSteps.includes("reasons")
              ? "Update inspection reasons"
              : "Continue with these reasons"
          }
          valid={stages.reasons}
          onConfirm={() =>
            confirmStep("reasons", "Inspection fee question revealed.")
          }
        />
      </ProgressiveQuestion>
      {reasonsComplete && (
        <ProgressiveQuestion
          number={number++}
          eyebrow="Inspection cost"
          title="What will the inspection cost?"
          summary={formatMoney(
            inspection.inspectionFee,
            inspection.vatTreatment,
          )}
          complete={feeComplete}
          expanded={expanded("fee", feeComplete)}
          onChange={() => setEditingStep("fee")}
        >
          <div className="contractor-inline-grid">
            <label className="contractor-inline-field">
              <span>Inspection fee in GBP</span>
              <span className="money-field">
                <span aria-hidden="true">£</span>
                <input
                  min="0"
                  inputMode="decimal"
                  type="number"
                  value={inspection.inspectionFee}
                  onChange={(event) =>
                    updateInspection({ inspectionFee: event.target.value })
                  }
                />
              </span>
            </label>
            <SingleChoice
              legend="VAT treatment"
              name="inspection-vat"
              value={inspection.vatTreatment}
              onChange={(vatTreatment) =>
                updateInspection({
                  vatTreatment: vatTreatment as
                    | "included"
                    | "added"
                    | "not_registered",
                })
              }
              options={[
                ["included", "VAT included"],
                ["added", "VAT added separately"],
                ["not_registered", "Not VAT registered"],
              ]}
            />
          </div>
          <QuestionConfirmationAction
            questionType="text_or_numeric"
            label={
              settledSteps.includes("fee")
                ? "Update inspection cost"
                : "Continue with this inspection cost"
            }
            valid={stages.fee}
            onConfirm={() =>
              confirmStep("fee", "Fee deduction question revealed.")
            }
          />
        </ProgressiveQuestion>
      )}
      {feeComplete && (
        <ProgressiveQuestion
          number={number++}
          eyebrow="Fee deduction"
          title="Will the fee be deducted if appointed?"
          summary={
            inspection.deductionPosition === "partial"
              ? `Partly · £${inspection.deductionAmount}`
              : inspection.deductionPosition
          }
          complete={deductionComplete}
          expanded={expanded("deduction", deductionComplete)}
          onChange={() => setEditingStep("deduction")}
        >
          <SingleChoice
            legend="Will the inspection fee be deducted from the repair cost if appointed?"
            name="inspection-deduction"
            value={inspection.deductionPosition}
            onChange={(deductionPosition) =>
              {
                updateInspection({
                  deductionPosition: deductionPosition as
                    | "full"
                    | "partial"
                    | "none"
                    | "depends",
                });
                if (deductionPosition === "partial") {
                  setEditingStep("deduction");
                }
              }
            }
            onCommit={(deductionPosition) => {
              if (deductionPosition !== "partial") {
                setEditingStep(undefined);
              }
            }}
            options={[
              ["full", "Yes, the full inspection fee will be deducted"],
              ["partial", "Part of the inspection fee will be deducted"],
              ["none", "No"],
              ["depends", "It depends on the repair required"],
            ]}
          />
          {inspection.deductionPosition === "partial" && (
            <label className="contractor-inline-field">
              <span>How much will be deducted?</span>
              <span className="money-field">
                <span aria-hidden="true">£</span>
                <input
                  min="0"
                  inputMode="decimal"
                  type="number"
                  value={inspection.deductionAmount}
                  onChange={(event) =>
                    updateInspection({ deductionAmount: event.target.value })
                  }
                />
              </span>
            </label>
          )}
          {inspection.deductionPosition === "partial" && (
            <QuestionConfirmationAction
              questionType="text_or_numeric"
              label={
                settledSteps.includes("deduction")
                  ? "Update fee deduction"
                  : "Continue with this deduction"
              }
              valid={stages.deduction}
              onConfirm={() =>
                confirmStep("deduction", "Availability question revealed.")
              }
            />
          )}
        </ProgressiveQuestion>
      )}
      {deductionComplete && (
        <ProgressiveQuestion
          number={number++}
          eyebrow="Availability"
          title="When could you attend?"
          summary={
            inspection.attendance === "Select preferred dates"
              ? inspection.preferredWindows.filter(Boolean).join(" · ")
              : inspection.attendance
          }
          complete={attendanceComplete}
          expanded={expanded("attendance", attendanceComplete)}
          onChange={() => setEditingStep("attendance")}
        >
          <SingleChoice
            legend="When could you attend?"
            name="inspection-attendance"
            value={inspection.attendance}
            onChange={(attendance) => {
              updateInspection({ attendance });
              if (attendance === "Select preferred dates") {
                setEditingStep("attendance");
              }
            }}
            onCommit={(attendance) => {
              if (attendance !== "Select preferred dates") {
                setEditingStep(undefined);
              }
            }}
            options={[
              ["Within 24 hours", "Within 24 hours"],
              ["Within 2–3 days", "Within 2–3 days"],
              ["Within one week", "Within one week"],
              ["Select preferred dates", "Select preferred dates"],
              ["Contact me to arrange", "Contact me to arrange"],
            ]}
          />
          {inspection.attendance === "Select preferred dates" && (
            <>
              <div className="contractor-window-grid">
                {inspection.preferredWindows.map((windowValue, index) => (
                  <label className="contractor-inline-field" key={index}>
                    <span>Preferred window {index + 1}</span>
                    <input
                      placeholder="e.g. 12 Aug, 08:00–11:00"
                      value={windowValue}
                      onChange={(event) => {
                        const preferredWindows = [
                          ...inspection.preferredWindows,
                        ];
                        preferredWindows[index] = event.target.value;
                        updateInspection({ preferredWindows });
                      }}
                    />
                  </label>
                ))}
              </div>
              <QuestionConfirmationAction
                questionType="text_or_numeric"
                label={
                  settledSteps.includes("attendance")
                    ? "Update preferred dates"
                    : "Continue with these dates"
                }
                valid={stages.attendance}
                onConfirm={() =>
                  confirmStep("attendance", "Access question revealed.")
                }
              />
            </>
          )}
        </ProgressiveQuestion>
      )}
      {attendanceComplete && (
        <ProgressiveQuestion
          number={number++}
          eyebrow="Access"
          title="What access will you require?"
          summary={inspection.accessRequired.join(" · ")}
          complete={accessComplete}
          expanded={expanded("access", accessComplete)}
          onChange={() => setEditingStep("access")}
        >
          <MultiChoice
            legend="What access will you require?"
            values={inspection.accessRequired}
            onChange={(accessRequired) => updateInspection({ accessRequired })}
            options={[
              "Internal access",
              "Loft access",
              "External access",
              "Access to utilities or controls",
              "Tenant or landlord present",
              "Other",
            ]}
          />
          {inspection.accessRequired.includes("Other") && (
            <label className="contractor-inline-field">
              <span>Describe the other access needed</span>
              <textarea
                id="inspection-other-access"
                rows={3}
                value={inspection.otherAccess}
                onChange={(event) =>
                  updateInspection({ otherAccess: event.target.value })
                }
              />
            </label>
          )}
          <QuestionConfirmationAction
            questionType="multi_select"
            label={
              settledSteps.includes("access")
                ? "Update selected access needs"
                : "Continue with selected access needs"
            }
            valid={stages.access}
            onConfirm={() =>
              confirmStep("access", "Proposal timing question revealed.")
            }
          />
        </ProgressiveQuestion>
      )}
      {accessComplete && (
        <ProgressiveQuestion
          number={number++}
          eyebrow="Next step"
          title="When would the repair quote follow?"
          summary={inspection.proposalTiming}
          complete={stages.timing}
          expanded={expanded("timing", stages.timing)}
          onChange={() => setEditingStep("timing")}
        >
          <SingleChoice
            legend="When would the repair proposal follow?"
            name="inspection-timing"
            value={inspection.proposalTiming}
            onChange={(proposalTiming) =>
              updateInspection({ proposalTiming })
            }
            onCommit={() => setEditingStep(undefined)}
            options={[
              ["During the inspection", "During the inspection"],
              ["The same working day", "The same working day"],
              ["Within one working day", "Within one working day"],
              ["Within 2–3 working days", "Within 2–3 working days"],
              ["Other", "Other"],
            ]}
          />
        </ProgressiveQuestion>
      )}
    </>
  );
}

function ResponseReview({
  draft,
  onEdit,
  onSubmit,
  submitting,
  submitError,
  confirmedSubmission,
  onConfirmSubmission,
  onIdentityChange,
  submittedView,
  onReturnToConfirmation,
}: {
  draft: ContractorResponseDraft;
  onEdit: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
  confirmedSubmission: boolean;
  onConfirmSubmission: (confirmed: boolean) => void;
  onIdentityChange: (details: ContractorIdentity) => void;
  submittedView: boolean;
  onReturnToConfirmation: () => void;
}) {
  const quote = draft.repairQuoteDraft;
  const inspection = draft.inspectionDraft;
  const isQuote = draft.responseType === "repair_quote";
  const totals = calculateContractorQuote(quote);
  return (
    <section className="contractor-review-section">
      <div className="contractor-review-heading">
        <p className="eyebrow">{isQuote ? "Final check" : "Review response"}</p>
        <h2>{isQuote ? "Check your quote" : "Site inspection request"}</h2>
        <p>
          Check the complete response below. Nothing is submitted until you
          confirm and use the final action.
        </p>
      </div>
      {isQuote ? (
        <div className="plain-quote-review">
          <section>
            <h3>Work</h3>
            <ol>
              {quote.workItems.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3>Costs</h3>
            <QuoteTotals quote={quote} />
            {quote.extraCharges.length > 0 && (
              <ul>
                {quote.extraCharges.map((charge) => (
                  <li key={charge.id}>
                    {charge.label || "Other cost"} ·{" "}
                    {formatCurrency(Number(charge.amount || 0))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Main materials</h3>
            <p>
              {[
                ...quote.mainMaterials.filter(
                  (material) => material !== "Something else",
                ),
                quote.customMaterial,
              ]
                .filter(Boolean)
                .join(", ") || "No materials cost entered"}
            </p>
            {Number(quote.materialsAmount || 0) > 0 && (
              <strong>
                {quote.materialsStatus === "confirmed"
                  ? "Confirmed"
                  : quote.materialsStatus === "estimated"
                    ? "Estimated"
                    : "To be confirmed after attending"}
              </strong>
            )}
          </section>
          <section>
            <h3>Not included</h3>
            <p>
              {[
                ...quote.exclusions.filter(
                  (exclusion) => exclusion !== "Something else",
                ),
                quote.otherExclusion,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </section>
          <section>
            <h3>Price status</h3>
            <strong>
              {quote.priceStatus === "fixed"
                ? "Fixed price"
                : quote.priceStatus === "may_change"
                  ? "Price may change"
                  : "Estimate"}
            </strong>
            {quote.priceChangeReasons.length > 0 && (
              <p>
                {[
                  ...quote.priceChangeReasons.filter(
                    (reason) => reason !== "Something else",
                  ),
                  quote.otherPriceChangeReason,
                  quote.priceChangeNote,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </section>
          <section>
            <h3>Timing</h3>
            <p>
              {quote.startAvailability === "Later"
                ? quote.laterStartDate
                : quote.startAvailability}{" "}
              · {quote.duration}
            </p>
          </section>
          <section>
            <h3>Warranty</h3>
            <p>
              {quote.guaranteePosition === "yes"
                ? `Yes · ${quote.guaranteeDuration}${
                    quote.guaranteeNote ? ` · ${quote.guaranteeNote}` : ""
                  }`
                : quote.guaranteePosition === "no"
                  ? "No"
                  : "Not applicable"}
            </p>
          </section>
          <section className="quote-review-total">
            <span>Total quote</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </section>
        </div>
      ) : (
        <dl className="contractor-review-list">
          <>
            <ReviewRow
              label="Inspection reason"
              value={[...inspection.reasons, inspection.otherReason]
                .filter(Boolean)
                .join(", ")}
            />
            <ReviewRow
              label="Inspection fee"
              value={formatMoney(
                inspection.inspectionFee,
                inspection.vatTreatment,
              )}
            />
            <ReviewRow
              label="Fee deduction"
              value={
                inspection.deductionPosition === "partial"
                  ? `Partial · £${inspection.deductionAmount}`
                  : inspection.deductionPosition
              }
            />
            <ReviewRow label="Availability" value={inspection.attendance} />
            <ReviewRow
              label="Access required"
              value={[...inspection.accessRequired, inspection.otherAccess]
                .filter(Boolean)
                .join(", ")}
            />
            <ReviewRow
              label="Expected proposal timing"
              value={inspection.proposalTiming}
            />
          </>
        </dl>
      )}
      <IdentityDetails
        details={draft.contractorDetails}
        onChange={onIdentityChange}
      />
      {submittedView ? (
        <div className="contractor-review-actions">
          <button
            className="button"
            type="button"
            onClick={onReturnToConfirmation}
          >
            Back to confirmation
          </button>
        </div>
      ) : (
        <>
          <label className="submission-confirmation">
            <input
              checked={confirmedSubmission}
              type="checkbox"
              onChange={(event) => onConfirmSubmission(event.target.checked)}
            />
            <span>
              {isQuote
                ? "I have checked the work, costs and exclusions shown above."
                : "I confirm that this response reflects the inspection I am proposing, including the assumptions shown above."}
            </span>
          </label>
          <p className="review-reassurance">
            Other contractors cannot see your response, price or identity.
          </p>
          {submitError && (
            <div className="submission-error" role="alert">
              <strong>Response not submitted</strong>
              <p>{submitError}</p>
            </div>
          )}
          <div className="contractor-review-actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={submitting}
              onClick={onEdit}
            >
              {isQuote ? "Change quote" : "Edit response"}
            </button>
            <button
              className="button"
              type="button"
              disabled={!confirmedSubmission || submitting}
              onClick={onSubmit}
            >
              {submitting
                ? "Submitting…"
                : isQuote
                  ? "Submit quote"
                  : "Submit inspection request"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function StandardContractorApp({
  token,
}: {
  token: string;
  resolvedTask?: import("@/domain/procurement").ResolvedContractorTask;
}) {
  const [invitation, setInvitation] = useState<ContractorInvitation>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorInvitations
      .getInvitation(token)
      .then((result) => {
        if (active) setInvitation(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const status = useMemo<
    ContractorInvitation["tokenStatus"] | "submitted" | undefined
  >(
    () =>
      error
        ? "invalid"
        : invitation?.currentResponseStatus === "submitted"
          ? "submitted"
          : invitation?.tokenStatus,
    [error, invitation],
  );

  return (
    <>
      {!invitation && !error ? (
        <main className="contractor-loading" aria-live="polite">
          <span className="contractor-loading__mark" aria-hidden="true">
            RS
          </span>
          <p>Opening your private job brief…</p>
        </main>
      ) : status && status !== "valid" ? (
        <StatusPanel status={status} />
      ) : invitation ? (
        <ContractorResponseExperience invitation={invitation} token={token} />
      ) : null}
    </>
  );
}
