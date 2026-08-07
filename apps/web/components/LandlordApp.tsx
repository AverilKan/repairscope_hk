"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryCards,
  questionnaireByCategory,
  QUESTIONNAIRE_VERSION,
} from "@/data/questionnaires";
import {
  correctionMeetsMinimumWords,
  isValidUkPostcode,
  normaliseUkPostcode,
} from "@/domain/rules";
import { classifyIssueReport } from "@/domain/classification";
import { buildRepairBrief } from "@/domain/brief";
import { getRepairDraftStorageKey } from "@/domain/storageKeys";
import type {
  IssueClassification,
  ProblemBrief,
  ProblemBriefCorrectionResult,
  RepairCategoryId,
  RepairIntakeDraft,
} from "@/domain/types";
import { repairScopeServices } from "@/services";
import { LandlordAccountGate } from "./LandlordAccountGate";
import {
  RepairSubmissionPanel,
  type RepairSubmissionPanelPrefill,
} from "./RepairSubmissionPanel";
import { QuestionnaireEngine } from "./QuestionnaireEngine";
import { ResponseComparisonPage } from "./ResponseComparisonPage";
import { BackLink, PageIntro, SiteShell, StatusPill } from "./SiteShell";
import {
  AwaitingConfirmationPage,
  LandlordRepairsPage,
  RepairProgressPage,
} from "./LandlordProcurementPages";

const defaultReport =
  "Tenant says a brown patch has appeared on the back bedroom ceiling. It drips after heavy rain, then stops. They noticed it three weeks ago.";

const categorySlugs = new Set<RepairCategoryId>(
  Object.keys(questionnaireByCategory) as RepairCategoryId[],
);

const pendingBriefDraftKey = "repairscope-pending-brief-draft-v1";

function savePendingBriefDraft(draft: RepairIntakeDraft) {
  window.localStorage.setItem(pendingBriefDraftKey, JSON.stringify(draft));
}

function readPendingBriefDraft(): RepairIntakeDraft | null {
  try {
    const stored = window.localStorage.getItem(pendingBriefDraftKey);
    if (!stored) return null;
    const draft = JSON.parse(stored) as RepairIntakeDraft;
    return draft.category && categorySlugs.has(draft.category) ? draft : null;
  } catch {
    return null;
  }
}

function clearPendingBriefDraft() {
  window.localStorage.removeItem(pendingBriefDraftKey);
}

function StartAndClassify({
  startFresh = false,
}: {
  startFresh?: boolean;
}) {
  const [report, setReport] = useState("");
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState("");
  const [phase, setPhase] = useState<
    "start" | "describe" | "processing" | "suggestion"
  >(startFresh ? "describe" : "start");
  const [classification, setClassification] =
    useState<IssueClassification | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<RepairCategoryId | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [categoryChangeWarning, setCategoryChangeWarning] = useState(false);
  const [reportChangeWarning, setReportChangeWarning] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [briefDraft, setBriefDraft] = useState<RepairIntakeDraft | null>(null);
  const [resumeDraft, setResumeDraft] = useState<RepairIntakeDraft | null>(null);
  const [error, setError] = useState("");
  const processingRef = useRef(false);
  const categoryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (startFresh) return;
    const restoreTimer = window.setTimeout(() => {
      const draft = readPendingBriefDraft();
      if (!draft?.category) return;
      const draftPostcode = draft.responses.postcode;
      const draftEvidence = draft.responses.evidenceNotes;
      setReport(draft.originalReport);
      if (typeof draftPostcode === "string") setPostcode(draftPostcode);
      if (typeof draftEvidence === "string") {
        setEvidenceNotes(draftEvidence);
      }
      setClassification({
        primaryCategory: draft.category,
        alternativeCategory: draft.alternativeCategory,
        symptoms: draft.extractedSymptoms,
        confidence: "medium",
        safetyFieldsPrefilled: false,
      });
      setSelectedCategory(draft.category);
      setShowCategoryPicker(false);
      setPhase("suggestion");
      setBriefDraft(draft);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [startFresh]);

  const initialResponses = useMemo(
    () => ({
      ...(postcode.trim() ? { postcode } : {}),
      ...(evidenceNotes.trim() ? { evidenceNotes } : {}),
    }),
    [evidenceNotes, postcode],
  );

  const revealCategory = () => {
    window.requestAnimationFrame(() => {
      categoryRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      categoryRef.current
        ?.querySelector<HTMLElement>("[data-category-heading]")
        ?.focus({ preventScroll: true });
    });
  };

  const classify = async () => {
    if (!report.trim()) {
      setError("Describe what has happened before continuing.");
      return;
    }
    if (postcode.trim() && !isValidUkPostcode(postcode)) {
      setPostcodeError("Enter a full UK postcode, for example WD17 1AA.");
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;
    setError("");
    setPostcodeError("");
    if (postcode.trim()) setPostcode(normaliseUkPostcode(postcode));
    setPhase("processing");
    // Category guessing is a pure local transformation (see
    // domain/classification.ts) — it never calls the deferred
    // repairScopeServices.classification API capability, so the public
    // intake flow works the same in mock and hosted API mode.
    const result = classifyIssueReport(report);
    setClassification(result);
    setShowCategoryPicker(true);
    setPhase("suggestion");
    processingRef.current = false;
    window.setTimeout(revealCategory, 40);
  };

  const chooseCategory = (category: RepairCategoryId) => {
    setSelectedCategory(category);
    setResumeDraft(null);
    setShowCategoryPicker(false);
    setCategoryChangeWarning(false);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".progressive-questionnaire")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }, 40);
  };

  const confirmCategoryChange = () => {
    if (selectedCategory) {
      window.localStorage.removeItem(
        getRepairDraftStorageKey(`draft-${selectedCategory}`),
      );
    }
    setSelectedCategory(null);
    setResumeDraft(null);
    setCategoryChangeWarning(false);
    setShowCategoryPicker(true);
    window.setTimeout(revealCategory, 40);
  };

  const confirmReportChange = () => {
    if (selectedCategory) {
      window.localStorage.removeItem(
        getRepairDraftStorageKey(`draft-${selectedCategory}`),
      );
    }
    setSelectedCategory(null);
    setClassification(null);
    setResumeDraft(null);
    setShowCategoryPicker(false);
    setReportChangeWarning(false);
    setPhase("describe");
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  if (briefDraft) {
    return (
      <GeneratedBriefReview
        draft={briefDraft}
        onEditAnswers={() => {
          setResumeDraft(briefDraft);
          setBriefDraft(null);
        }}
      />
    );
  }

  if (phase === "start") {
    return (
      <main>
        <section className="landlord-welcome">
          <div className="landlord-welcome__copy">
            <p className="eyebrow">Landlord workspace</p>
            <h1>Start with the problem, not a presumed fix.</h1>
            <p>
              Create a neutral contractor brief from a tenant message, or bring
              in a quote you already have. Nothing is shared until you review it.
            </p>
          </div>
          <div className="start-choices">
            <button
              className="start-choice"
              type="button"
              onClick={() => setPhase("describe")}
            >
              <span className="start-choice__number">01</span>
              <span>
                <strong>Report a new repair</strong>
                <small>Describe the symptoms and build a neutral brief</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <Link className="start-choice" href="/landlord/repairs">
              <span className="start-choice__number">02</span>
              <span>
                <strong>Review an existing repair</strong>
                <small>Compare responses or import an existing quote</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="active-repair-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Repair workspace</p>
              <h2>Continue an existing repair</h2>
            </div>
            <StatusPill tone="good">Stages and actions</StatusPill>
          </div>
          <Link className="repair-row" href="/landlord/repairs">
            <div className="repair-row__ref">Repairs</div>
            <div>
              <strong>Open the repair list</strong>
              <p>Filter by stage and property postcode</p>
            </div>
            <div className="repair-row__counts">
              <span>
                <strong>All</strong> stages
              </span>
              <span>
                <strong>Private</strong> quotes
              </span>
            </div>
            <span className="repair-row__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </section>
      </main>
    );
  }

  const suggested =
    classification && questionnaireByCategory[classification.primaryCategory];
  const selectedSchema =
    selectedCategory && questionnaireByCategory[selectedCategory];

  return (
    <main className="intake-stage progressive-intake">
      <BackLink href="/landlord" label="Landlord home" />
      <header className="progressive-intake__intro">
        <p className="eyebrow">New repair</p>
        <h1>Build the repair brief as the facts become clear.</h1>
        <p>
          Start with the tenant’s words. RepairScope will reveal only the
          questions relevant to this job.
        </p>
      </header>

      {phase === "describe" ? (
        <section className="intake-sequence intake-sequence--current">
          <span className="question-marker" aria-hidden="true">01</span>
          <div className="intake-sequence__body report-form">
            <p className="eyebrow">Problem report</p>
            <h2>What has happened at the property?</h2>
            <p className="report-form__intro">
              Paste the tenant’s message or describe every symptom you know.
              Avoid guessing the repair.
            </p>
            <label htmlFor="repair-report">Tenant message or description</label>
            <textarea
              id="repair-report"
              rows={6}
              value={report}
              placeholder={defaultReport}
              onChange={(event) => {
                setReport(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "report-error" : undefined}
            />
            {error && (
              <p className="field-error" id="report-error">
                {error}
              </p>
            )}
            <div className="report-form__row">
              <div className="text-field">
                <label htmlFor="initial-postcode">Postcode (optional now)</label>
                <input
                  id="initial-postcode"
                  value={postcode}
                  onChange={(event) => {
                    setPostcode(event.target.value);
                    setPostcodeError("");
                  }}
                  placeholder="e.g. WD17 1AA"
                  aria-invalid={Boolean(postcodeError)}
                  aria-describedby={
                    postcodeError ? "initial-postcode-error" : undefined
                  }
                />
                {postcodeError && (
                  <p className="field-error" id="initial-postcode-error">
                    {postcodeError}
                  </p>
                )}
              </div>
            </div>
            <div className="text-field">
              <label htmlFor="initial-evidence-notes">
                Photos, videos, reports or previous quotations (optional now)
              </label>
              <textarea
                id="initial-evidence-notes"
                rows={2}
                value={evidenceNotes}
                onChange={(event) => setEvidenceNotes(event.target.value)}
                placeholder="Describe any photos, videos, reports or previous quotations you have."
              />
            </div>
            <button className="button" type="button" onClick={classify}>
              Analyse problem
            </button>
          </div>
        </section>
      ) : (
        <section className="intake-sequence intake-sequence--complete">
          <span className="question-marker question-marker--complete" aria-hidden="true">✓</span>
          <div className="question-complete__content">
            <p>Problem report</p>
            <strong>{report}</strong>
            <small>
              {postcode || "Postcode not added"} ·{" "}
              {evidenceNotes.trim() ? "Evidence described" : "No evidence described yet"}
            </small>
          </div>
          <button
            className="text-button question-change"
            type="button"
            onClick={() =>
              selectedCategory
                ? setReportChangeWarning(true)
                : confirmReportChange()
            }
          >
            Change
          </button>
          {reportChangeWarning && (
            <div className="dependency-warning" role="alert">
              <strong>Re-analysing may change the question set.</strong>
              <p>
                Category-specific answers will be cleared. The report, postcode
                and uploaded files will remain.
              </p>
              <div>
                <button
                  className="button button--small"
                  type="button"
                  onClick={confirmReportChange}
                >
                  Edit report
                </button>
                <button
                  className="button button--ghost button--small"
                  type="button"
                  onClick={() => setReportChangeWarning(false)}
                >
                  Keep current report
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {phase === "processing" && (
        <section
          className="intake-sequence intake-sequence--current"
          role="status"
          aria-live="polite"
        >
          <span className="question-marker" aria-hidden="true">02</span>
          <div className="intake-sequence__body processing-inline">
            <span className="processing-orbit" aria-hidden="true" />
            <p className="eyebrow">Category check</p>
            <h2>Understanding the report…</h2>
            <p>Preserving the original message and organising its symptoms.</p>
          </div>
        </section>
      )}

      {phase === "suggestion" && classification && suggested && (
        <section
          className={`intake-sequence ${selectedCategory ? "intake-sequence--complete" : "intake-sequence--current"}`}
          ref={categoryRef}
        >
          <span
            className={`question-marker ${selectedCategory ? "question-marker--complete" : ""}`}
            aria-hidden="true"
          >
            {selectedCategory ? "✓" : "02"}
          </span>
          {selectedCategory && selectedSchema ? (
            <>
              <div className="question-complete__content">
                <p>Repair category</p>
                <strong>{selectedSchema.label}</strong>
                <small>Original report and extracted symptoms preserved</small>
              </div>
              <button
                className="text-button question-change"
                type="button"
                onClick={() => setCategoryChangeWarning(true)}
              >
                Change
              </button>
              {categoryChangeWarning && (
                <div className="dependency-warning" role="alert">
                  <strong>Changing category replaces these questions.</strong>
                  <p>
                    Category-specific answers will be cleared. Your problem
                    report, postcode and uploaded files will stay.
                  </p>
                  <div>
                    <button
                      className="button button--small"
                      type="button"
                      onClick={confirmCategoryChange}
                    >
                      Choose another category
                    </button>
                    <button
                      className="button button--ghost button--small"
                      type="button"
                      onClick={() => setCategoryChangeWarning(false)}
                    >
                      Keep {selectedSchema.shortLabel}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="intake-sequence__body category-suggestion">
              <p className="eyebrow">Suggested category</p>
              <h2 tabIndex={-1} data-category-heading>
                {suggested.label}
              </h2>
              <p>{suggested.description}</p>
              <div className="symptom-list" aria-label="Details identified">
                {classification.symptoms.map((symptom) => (
                  <span key={symptom}>{symptom}</span>
                ))}
              </div>
              <div className="category-suggestion__actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => chooseCategory(classification.primaryCategory)}
                >
                  Use {suggested.shortLabel}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setShowCategoryPicker((current) => !current)}
                  aria-expanded={showCategoryPicker}
                  aria-controls="alternative-category-list"
                >
                  {showCategoryPicker
                    ? "Hide other categories"
                    : "Choose another category"}
                </button>
              </div>
              {showCategoryPicker && (
                <div
                  className="manual-category-picker"
                  id="alternative-category-list"
                >
                  <p className="eyebrow">All repair routes</p>
                  <CategoryGrid compact onSelect={chooseCategory} />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {selectedCategory && selectedSchema && (
        <QuestionnaireEngine
          key={selectedCategory}
          schema={selectedSchema}
          originalReport={report}
          extractedSymptoms={classification?.symptoms ?? []}
          initialResponses={initialResponses}
          resumeDraft={resumeDraft ?? undefined}
          onComplete={(draft) => {
            savePendingBriefDraft(draft);
            setResumeDraft(null);
            setBriefDraft(draft);
          }}
        />
      )}
    </main>
  );
}

function CategoryGrid({
  compact = false,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: (category: RepairCategoryId) => void;
}) {
  return (
    <div className={`category-grid ${compact ? "category-grid--compact" : ""}`}>
      {categoryCards.map((category, index) => (
        <button
          key={category.category}
          className="category-card"
          type="button"
          onClick={() => onSelect?.(category.category)}
        >
          <span className="category-card__number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <strong>{category.label}</strong>
          {!compact && <p>{category.description}</p>}
          <span className="category-card__arrow" aria-hidden="true">
            ↗
          </span>
        </button>
      ))}
    </div>
  );
}

function QuestionnaireRoute({
  category,
}: {
  category: RepairCategoryId;
}) {
  const [briefDraft, setBriefDraft] = useState<RepairIntakeDraft | null>(null);
  const [resumeDraft, setResumeDraft] = useState<RepairIntakeDraft | null>(null);
  const schema = questionnaireByCategory[category];

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const draft = readPendingBriefDraft();
      if (draft?.category === category) setBriefDraft(draft);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [category]);

  if (briefDraft) {
    return (
      <GeneratedBriefReview
        draft={briefDraft}
        onEditAnswers={() => {
          setResumeDraft(briefDraft);
          setBriefDraft(null);
        }}
      />
    );
  }

  return (
    <main className="questionnaire-page">
      <div className="questionnaire-page__context">
        <span>{schema.label}</span>
        <Link href="/landlord/repairs/new">Start from a problem report</Link>
      </div>
      <QuestionnaireEngine
        schema={schema}
        originalReport={defaultReport}
        resumeDraft={resumeDraft ?? undefined}
        onComplete={(draft) => {
          savePendingBriefDraft(draft);
          setResumeDraft(null);
          setBriefDraft(draft);
        }}
      />
    </main>
  );
}

interface ResponsibilityRecord {
  recordedAs: string;
  basis: string;
  status: "Not independently determined";
}

const responsibilityLabels: Record<string, string> = {
  "landlord-manager": "Landlord or property manager",
  tenant: "Tenant",
  unclear: "Responsibility is unclear",
  disputed: "Responsibility is disputed",
  other: "Other arrangement",
};

const defaultResponsibilityRecord: ResponsibilityRecord = {
  recordedAs: "Landlord or property manager",
  basis: "The authorised repair manager has recorded the current understanding.",
  status: "Not independently determined",
};

function responsibilityFromDraft(
  draft: RepairIntakeDraft,
): ResponsibilityRecord {
  const selected =
    typeof draft.responses.repairResponsibility === "string"
      ? draft.responses.repairResponsibility
      : "";
  const basis =
    typeof draft.responses.responsibilityBasis === "string" &&
    draft.responses.responsibilityBasis.trim()
      ? draft.responses.responsibilityBasis.trim()
      : "No supporting basis has been recorded.";

  return {
    recordedAs: responsibilityLabels[selected] ?? "Not recorded",
    basis,
    status: "Not independently determined",
  };
}

function GeneratedBriefReview({
  draft,
  onEditAnswers,
}: {
  draft: RepairIntakeDraft;
  onEditAnswers: () => void;
}) {
  const [phase, setPhase] = useState<"generating" | "ready">("generating");
  const [brief, setBrief] = useState<ProblemBrief | null>(null);

  useEffect(() => {
    let active = true;
    // Brief building is a pure local transformation of the questionnaire
    // draft (see domain/brief.ts) — it never calls the deferred
    // repairScopeServices.contractorBriefs API capability, so the public
    // intake flow works the same in mock and hosted API mode. The short
    // delay preserves the existing "preparing your brief" UX beat.
    const generateTimer = window.setTimeout(() => {
      if (!active) return;
      setBrief(buildRepairBrief(draft));
      setPhase("ready");
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(generateTimer);
    };
  }, [draft]);

  if (phase === "generating" || !brief) {
    return (
      <main className="centered-stage">
        <div className="processing-card" role="status">
          <span className="processing-orbit" aria-hidden="true" />
          <p className="eyebrow">Brief preparation</p>
          <h1>Separating facts from unknowns…</h1>
          <p>No diagnosis or remedy will be invented.</p>
        </div>
      </main>
    );
  }

  return (
    <BriefReview
      brief={brief}
      draft={draft}
      onEditAnswers={onEditAnswers}
      responsibility={responsibilityFromDraft(draft)}
      authorityReviewRequired={draft.responses.role === "other-authorised"}
      authorityExplanation={
        typeof draft.responses.accountRoleExplanation === "string"
          ? draft.responses.accountRoleExplanation
          : undefined
      }
    />
  );
}

function BriefReviewRoute({ repairId }: { repairId: string }) {
  const [brief, setBrief] = useState<ProblemBrief>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorBriefs
      .getForRepair(repairId)
      .then((result) => {
        if (active) setBrief(result);
      })
      .catch(() => {
        if (active) setError("The contractor brief could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [repairId]);

  if (error) {
    return (
      <main className="content-page">
        <section className="repairs-list-state" role="alert">
          <h1>Brief unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!brief) {
    return (
      <main className="content-page">
        <p className="response-loading" role="status">
          Loading contractor brief…
        </p>
      </main>
    );
  }

  return <BriefReview brief={brief} />;
}

function BriefReview({
  brief,
  draft,
  onEditAnswers,
  responsibility = defaultResponsibilityRecord,
  authorityReviewRequired = false,
  authorityExplanation,
}: {
  brief: ProblemBrief;
  draft?: RepairIntakeDraft;
  onEditAnswers?: () => void;
  responsibility?: ResponsibilityRecord;
  authorityReviewRequired?: boolean;
  authorityExplanation?: string;
}) {
  const [correction, setCorrection] = useState("");
  const [currentBrief, setCurrentBrief] = useState(brief);
  const [correctionStatus, setCorrectionStatus] = useState<
    "idle" | "updating" | "success" | "error"
  >("idle");
  const [correctionError, setCorrectionError] = useState("");
  const [appliedCorrection, setAppliedCorrection] =
    useState<ProblemBriefCorrectionResult | null>(null);
  const correctionRef = useRef(false);
  const hasPendingCorrection = correction.trim().length > 0;
  const hasValidCorrection = correctionMeetsMinimumWords(correction);
  const submissionBlocked =
    hasPendingCorrection || correctionStatus === "updating";

  const applyCorrection = async () => {
    if (!hasValidCorrection || correctionRef.current) return;
    correctionRef.current = true;
    setCorrectionStatus("updating");
    setCorrectionError("");
    try {
      const result = await repairScopeServices.contractorBriefs.applyCorrection(
        currentBrief,
        correction,
      );
      setCurrentBrief(result.brief);
      setAppliedCorrection(result);
      setCorrection("");
      setCorrectionStatus("success");
    } catch {
      setCorrectionStatus("error");
      setCorrectionError(
        "The brief could not be updated. Your correction has been kept so you can try again.",
      );
    } finally {
      correctionRef.current = false;
    }
  };

  const contactPrefill: RepairSubmissionPanelPrefill = {
    fullName:
      typeof draft?.responses.contactName === "string"
        ? draft.responses.contactName
        : undefined,
    email:
      typeof draft?.responses.contactEmail === "string"
        ? draft.responses.contactEmail
        : undefined,
    phone:
      typeof draft?.responses.contactPhone === "string"
        ? draft.responses.contactPhone
        : undefined,
    postcode:
      typeof draft?.responses.postcode === "string"
        ? draft.responses.postcode
        : undefined,
  };

  // Strong emergency/immediate-risk signals, surfaced (not decided) for the
  // founder during manual review — never used here to reject or auto-route
  // the submission. See docs/PUBLIC_INGESTION_LAUNCH.md.
  const safetyFlags = [
    ...(draft?.safetyAcknowledgements
      .filter((acknowledgement) => acknowledgement.acknowledged)
      .map((acknowledgement) => acknowledgement.ruleId) ?? []),
    ...(currentBrief.urgency === "emergency" || currentBrief.urgency === "urgent"
      ? [`brief_urgency_${currentBrief.urgency}`]
      : []),
  ];

  return (
    <main className="content-page brief-page">
      <BackLink href="/landlord" label="Landlord home" />
      <PageIntro
        eyebrow="Contractor brief · Review before sharing"
        title="Check the facts. Keep the diagnosis open."
        description="This is what invited contractors will receive. Correct factual errors, but leave technical conclusions for each contractor to state independently."
        aside={<StatusPill tone="attention">Not shared yet</StatusPill>}
      />

      <section
        className="responsibility-record"
        aria-labelledby="responsibility-record-heading"
      >
        <div className="responsibility-record__heading">
          <div>
            <p className="eyebrow">
              Private repair record · Not shared with contractors
            </p>
            <h2 id="responsibility-record-heading">Responsibility status</h2>
          </div>
          <StatusPill tone="neutral">Recorded understanding</StatusPill>
        </div>
        <dl>
          <div>
            <dt>Currently recorded as</dt>
            <dd>{responsibility.recordedAs}</dd>
          </div>
          <div>
            <dt>Basis</dt>
            <dd>{responsibility.basis}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{responsibility.status}</dd>
          </div>
        </dl>
        <p className="responsibility-record__note">
          This records the current understanding only. RepairScope does not
          determine legal or contractual responsibility.
        </p>
        {authorityReviewRequired && (
          <div className="responsibility-record__review" role="status">
            <StatusPill tone="attention">Operator review required</StatusPill>
            <span>
              Other authorised representative
              {authorityExplanation ? ` · ${authorityExplanation}` : ""}
            </span>
          </div>
        )}
      </section>

      <section className="brief-document">
        <div className="brief-document__masthead">
          <div>
            <p className="eyebrow">RepairScope neutral brief</p>
            <h2>Intermittent bedroom ceiling water ingress</h2>
          </div>
          <div className="brief-ref">
            <span>Repair</span>
            <strong>{brief.repairId.toUpperCase()}</strong>
          </div>
        </div>

        <div className="brief-lead">
          <span className="scope-mark">01</span>
          <p>
            Water staining and intermittent dripping have appeared on the back
            bedroom ceiling after heavy rain. The source has not been confirmed.
            Contractors should state their working diagnosis, whether inspection
            is required, and what their proposed work would address.
          </p>
        </div>

        <div className="brief-grid">
          <BriefSection number="02" title="Reported facts" items={currentBrief.reportedFacts} />
          <BriefSection number="03" title="Confirmed unknowns" items={currentBrief.confirmedUnknowns} tone="unknown" />
          <BriefSection
            number="04"
            title="Evidence being shared"
            items={
              currentBrief.evidence.length
                ? currentBrief.evidence.map((item) => item.name)
                : ["No files added"]
            }
          />
          <BriefSection
            number="05"
            title="Access overview"
            items={[currentBrief.accessOverview]}
          />
          <BriefSection
            number="06"
            title="What contractors must provide"
            items={currentBrief.contractorRequests}
            wide
          />
        </div>

        <div className="brief-correction">
          <label htmlFor="brief-correction">
            Something incorrect or missing?
          </label>
          {appliedCorrection && (
            <div className="brief-correction__result" role="status">
              <div>
                <StatusPill tone="good">
                  Brief updated · v{appliedCorrection.brief.version}
                </StatusPill>
                <strong>What changed</strong>
              </div>
              <p>{appliedCorrection.changeSummary}</p>
              <span>{appliedCorrection.changedSections.join(" · ")}</span>
            </div>
          )}
          <textarea
            id="brief-correction"
            rows={3}
            value={correction}
            onChange={(event) => {
              setCorrection(event.target.value);
              if (correctionStatus === "error") {
                setCorrectionStatus("idle");
                setCorrectionError("");
              }
            }}
            placeholder="Tell us what needs correcting. We’ll update the brief for you to review before anything is shared."
            aria-describedby={[
              "brief-correction-help",
              correctionError ? "brief-correction-error" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <p className="field-help" id="brief-correction-help">
            Use at least three words so the correction is clear enough to review.
          </p>
          {correctionError && (
            <p className="field-error" id="brief-correction-error">
              {correctionError}
            </p>
          )}
          <div className="brief-correction__actions">
            {onEditAnswers && (
              <button
                className="button button--secondary"
                type="button"
                disabled={correctionStatus === "updating"}
                onClick={onEditAnswers}
              >
                Edit questionnaire answers
              </button>
            )}
            <button
              className="button"
              type="button"
              disabled={!hasValidCorrection || correctionStatus === "updating"}
              onClick={() => void applyCorrection()}
            >
              {correctionStatus === "updating"
                ? "Updating brief…"
                : "Apply correction"}
            </button>
          </div>
        </div>
      </section>

      <RepairSubmissionPanel
        brief={currentBrief}
        questionnaireVersion={QUESTIONNAIRE_VERSION}
        issueCategory={draft?.category ?? "general-maintenance"}
        questionnaireAnswers={draft?.responses ?? {}}
        safetyFlags={safetyFlags}
        evidenceNotes={
          typeof draft?.responses.evidenceNotes === "string"
            ? draft.responses.evidenceNotes
            : undefined
        }
        prefill={contactPrefill}
        submissionBlocked={submissionBlocked}
        submissionBlockReason={
          hasPendingCorrection
            ? "Apply or remove your pending correction before submitting this brief."
            : correctionStatus === "updating"
              ? "The brief is being updated. Submission will be available when it is ready."
              : undefined
        }
        onSubmitted={clearPendingBriefDraft}
      />
    </main>
  );
}

function BriefSection({
  number,
  title,
  items,
  tone,
  wide,
}: {
  number: string;
  title: string;
  items: string[];
  tone?: "unknown";
  wide?: boolean;
}) {
  return (
    <section
      className={`brief-section ${wide ? "brief-section--wide" : ""} ${
        tone ? `brief-section--${tone}` : ""
      }`}
    >
      <header>
        <span>{number}</span>
        <h3>{title}</h3>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function RepairStatus({ repairId }: { repairId: string }) {
  const stages = [
    ["Brief submitted", "complete"],
    ["Contractors being contacted", "complete"],
    ["Responses received", "current"],
    ["Ready for review", "future"],
  ] as const;

  return (
    <main className="content-page">
      <BackLink href="/landlord/repairs" label="My repairs" />
      <PageIntro
        eyebrow={`Repair ${repairId.toUpperCase()}`}
        title="The brief is out for independent responses."
        description="A simple sourcing status keeps you informed without turning the repair into an operator workflow."
        aside={<StatusPill tone="good">4 responses received</StatusPill>}
      />
      <section className="status-layout">
        <ol className="repair-timeline">
          {stages.map(([label, status], index) => (
            <li className={`repair-timeline__item repair-timeline__item--${status}`} key={label}>
              <span>{status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{label}</strong>
                <small>
                  {status === "complete"
                    ? "Completed"
                    : status === "current"
                      ? "Three repair quotes and one inspection request"
                      : "Available when enough detail is ready"}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <aside className="update-card">
          <p className="eyebrow">Latest update</p>
          <h2>A contractor response is ready for review</h2>
          <p>
            Open the repair to review quotes, inspection requests and any
            private follow-up.
          </p>
          <Link
            className="button button--secondary"
            href={`/landlord/repairs/${repairId}/responses`}
          >
            View responses
          </Link>
        </aside>
      </section>
    </main>
  );
}

export function LandlordApp({
  path,
}: {
  path: string[];
}) {
  const joined = path.join("/");
  const categoryPath =
    path[0] === "new"
      ? path[1]
      : path[0] === "repairs" && path[1] === "new"
        ? path[2]
        : undefined;

  if (categoryPath && categorySlugs.has(categoryPath as RepairCategoryId)) {
    return (
      <SiteShell surface="landlord">
        <QuestionnaireRoute
          category={categoryPath as RepairCategoryId}
        />
      </SiteShell>
    );
  }

  let content: React.ReactNode;
  let requiresAccount = true;
  if (path[0] === "repairs" && path.length === 1) {
    content = <LandlordRepairsPage />;
  }
  else if (joined.endsWith("/brief")) {
    content = <BriefReviewRoute repairId={path[1] ?? ""} />;
  }
  else if (joined.endsWith("/status")) {
    content = <RepairStatus repairId={path[1] ?? ""} />;
  }
  else if (joined.endsWith("/responses")) {
    content = <ResponseComparisonPage repairId={path[1] ?? ""} />;
  }
  else if (
    joined.endsWith("/selection") ||
    joined.endsWith("/confirmation")
  ) {
    content = <AwaitingConfirmationPage repairId={path[1] ?? ""} />;
  }
  else if (joined.endsWith("/progress")) {
    content = <RepairProgressPage repairId={path[1] ?? ""} />;
  }
  else if (joined.endsWith("/completed")) {
    content = <RepairProgressPage completed repairId={path[1] ?? ""} />;
  }
  else {
    requiresAccount = false;
    const startFresh =
      path[0] === "new" ||
      (path[0] === "repairs" && path[1] === "new");
    content = (
      <StartAndClassify
        key={startFresh ? "fresh-intake" : "landlord-workspace"}
        startFresh={startFresh}
      />
    );
  }

  return (
    <SiteShell surface="landlord">
      {requiresAccount ? <LandlordAccountGate>{content}</LandlordAccountGate> : content}
    </SiteShell>
  );
}
