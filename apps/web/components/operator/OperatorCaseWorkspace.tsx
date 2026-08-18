"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GeneratedBriefDocument } from "@/components/GeneratedBriefDocument";
import { isApiDataSource } from "@/components/LegacyDemoNotice";
import { ProposalComparison } from "@/components/operator/ProposalComparison";
import { StatusPill } from "@/components/SiteShell";
import {
  parseContractorResponseExport,
  parseSupportedContractorResponsePayload,
  sanitizeContractorResponsePayload,
  type ContractorResponsePayload,
} from "@/domain/contractorResponse";
import { cacheContractorRequestLink, readCachedContractorRequestLinks } from "@/domain/contractorRequestLinkCache";
import {
  ContractorRequestOperatorError,
  type ContractorRequestSummary,
} from "@/domain/contractorRequestOperator";
import {
  applyContractorPatch,
  createOperatorContractor,
  emptyOperatorCaseState,
  OPERATOR_CASE_STATUS_LABELS,
  OPERATOR_CASE_STATUSES,
  OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS,
  OPERATOR_CONTRACTOR_RESPONSE_TYPES,
  OPERATOR_CONTRACTOR_STATUS_LABELS,
  OPERATOR_CONTRACTOR_STATUSES,
  OPERATOR_GUARANTEE_STATUS_LABELS,
  OPERATOR_GUARANTEE_STATUSES,
  OPERATOR_INSPECTION_REQUIREMENT_LABELS,
  OPERATOR_INSPECTION_REQUIREMENTS,
  OPERATOR_PRICE_TYPE_LABELS,
  OPERATOR_PRICE_TYPES,
  readOperatorCaseState,
  writeOperatorCaseState,
  type OperatorCaseState,
  type OperatorCaseStatus,
  type OperatorContractor,
  type OperatorContractorResponseType,
  type OperatorContractorStatus,
  type OperatorGuaranteeStatus,
  type OperatorInspectionRequirement,
  type OperatorPriceType,
} from "@/domain/operatorCaseState";
import {
  OperatorSubmissionNotFoundError,
  type OperatorSubmissionDetail,
  type SubmissionClosedReason,
  type SubmissionStatus,
} from "@/domain/operatorSubmission";
import { useOperatorSubmissionService } from "@/services/operator/useOperatorSubmissionService";
import type { OperatorSubmissionService } from "@/services/operator/OperatorSubmissionService";
import { useContractorRequestOperatorService } from "@/services/contractor/useContractorRequestOperatorService";
import type { ContractorRequestOperatorService } from "@/services/contractor/ContractorRequestOperatorService";

// LOCALIZATION (HK validation-pilot pass): the operator surface has no
// language toggle (see components/LanguageContext.tsx's own comment on
// why the operator UI has never adopted useLanguage()) — every string
// below is Traditional Chinese directly, not routed through t()/lt().
// Internal enum values (reviewing, pursuing, needs_landlord_information,
// closed, urgent, ...) are untouched; only their displayed labels change.
const STATUS_OPTIONS: { value: Exclude<SubmissionStatus, "new">; label: string }[] = [
  { value: "reviewing", label: "審閱中" },
  { value: "pursuing", label: "值得跟進" },
  { value: "needs_landlord_information", label: "需要業主提供資料" },
  { value: "closed", label: "現階段不適合" },
];

const CLOSED_REASON_OPTIONS: { value: SubmissionClosedReason; label: string }[] = [
  { value: "urgent", label: "緊急 — 已轉介其他途徑" },
  { value: "outside_current_scope", label: "超出現時服務範圍" },
  { value: "not_currently_viable", label: "現階段未能處理" },
  { value: "outside_service_area", label: "超出服務地區" },
  { value: "duplicate", label: "重複提交" },
  { value: "other", label: "其他" },
];

const BACKEND_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "新個案",
  reviewing: "審閱中",
  pursuing: "值得跟進",
  needs_landlord_information: "需要業主提供資料",
  closed: "已完結",
};

const PREFERRED_CONTACT_METHOD_LABELS: Record<"email" | "phone", string> = {
  email: "電郵",
  phone: "電話",
};

function backendStatusTone(status: SubmissionStatus): "neutral" | "good" | "attention" | "ink" {
  if (status === "pursuing") return "good";
  if (status === "closed") return "neutral";
  if (status === "needs_landlord_information") return "attention";
  return "ink";
}

type LoadState =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "error"; message: string }
  | { phase: "ready"; detail: OperatorSubmissionDetail };

/**
 * The real case detail — resolved by public reference (RS-XXXXXX), which
 * the backend does not yet expose a lookup-by-reference endpoint for (see
 * task scope: no speculative backend work for this). Resolved client-side:
 * list() to find the matching summary's internal id, then get(id) for the
 * full detail. The owner's own submission (brief, questionnaire answers,
 * contact, consent) is rendered strictly read-only here — only the
 * backend's own status/internal-review-notes (via the existing
 * updateStatus API) and this component's own local-only workflow state are
 * editable.
 */
export function OperatorCaseWorkspace({
  caseReference,
  service: injectedService,
  contractorRequestService: injectedContractorRequestService,
}: {
  caseReference: string;
  /** Test-only seam — see OperatorCaseList's own injectedService comment. */
  service?: OperatorSubmissionService;
  /** Same test-only seam for T2 Commit 3's real contractor-request
   * controls — lets tests exercise them without a live Clerk session
   * (see ContractorRequestPanel below, which needs this to avoid calling
   * useContractorRequestOperatorService's Clerk-backed hook at all). */
  contractorRequestService?: ContractorRequestOperatorService;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see OperatorCaseList's identical, justified pattern.
  const service = injectedService ?? useOperatorSubmissionService();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  // Backend status-editing form state (separate from the local workflow
  // state below — see the "Backend submission status" section).
  const [backendNotes, setBackendNotes] = useState("");
  const [closedReason, setClosedReason] = useState<SubmissionClosedReason | "">("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Local-only operator workflow state.
  const [local, setLocal] = useState<OperatorCaseState>(() => emptyOperatorCaseState(caseReference));
  const [localLoaded, setLocalLoaded] = useState(false);
  // Which contractor cards are currently expanded for editing — purely a
  // view concern, not persisted.
  const [expandedContractorIds, setExpandedContractorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // No setState here to reset to "loading" on a caseReference change —
    // the initial state is already "loading", and the page
    // (app/operator/[caseReference]/page.tsx) renders this component with
    // key={caseReference}, so a genuinely different case is a fresh mount
    // rather than a prop update on the same instance. (An earlier version
    // of this effect called setState({phase:"loading"}) here, deferred via
    // setTimeout(0) to satisfy a lint rule — that deferral raced the
    // service call below: list()/get() over an already-resolved mock
    // promise could resolve and setState "ready" via microtasks before the
    // setTimeout(0) macrotask fired, which then overwrote "ready" back to
    // "loading" forever. Fixed by removing the redundant reset instead.)
    service
      .list()
      .then((summaries) => {
        const match = summaries.find((summary) => summary.publicReference === caseReference);
        if (!match) throw new OperatorSubmissionNotFoundError();
        return service.get(match.id);
      })
      .then((detail) => {
        if (cancelled) return;
        setState({ phase: "ready", detail });
        setBackendNotes(detail.internalReviewNotes ?? "");
        setClosedReason(detail.closedReason ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof OperatorSubmissionNotFoundError) {
          setState({ phase: "not-found" });
          return;
        }
        setState({ phase: "error", message: "未能從 RepairScope 載入此個案。" });
      });
    return () => {
      cancelled = true;
    };
  }, [service, caseReference]);

  useEffect(() => {
    // Deferred via setTimeout(0) rather than setState synchronously in the
    // effect body — matches the same hydration-safe pattern already used
    // by LandlordApp's own localStorage-backed state (LandlordHome).
    const timer = window.setTimeout(() => {
      setLocal(readOperatorCaseState(caseReference));
      setLocalLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [caseReference]);

  useEffect(() => {
    if (!localLoaded) return; // don't overwrite storage with the placeholder empty state before hydration
    writeOperatorCaseState(local);
  }, [local, localLoaded]);

  const applyBackendStatus = async (status: Exclude<SubmissionStatus, "new">) => {
    if (state.phase !== "ready") return;
    if (status === "closed" && !closedReason) {
      setSaveStatus("error");
      setSaveError("結束此個案之前，請先選擇原因。");
      return;
    }
    setSaveStatus("saving");
    setSaveError("");
    try {
      const updated = await service.updateStatus(state.detail.id, {
        status,
        internalReviewNotes: backendNotes || undefined,
        closedReason: status === "closed" ? (closedReason as SubmissionClosedReason) : undefined,
      });
      setState({ phase: "ready", detail: updated });
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      setSaveError("未能更新此個案，請再試一次。");
    }
  };

  const updateLocalField = <K extends keyof OperatorCaseState>(key: K, value: OperatorCaseState[K]) => {
    setLocal((current) => ({ ...current, [key]: value }));
  };

  const addContractor = () => {
    const created = createOperatorContractor("");
    setLocal((current) => ({
      ...current,
      contractors: [...current.contractors, created],
    }));
    setExpandedContractorIds((current) => new Set(current).add(created.id));
  };

  // Always routes through applyContractorPatch so switching response type,
  // price type, or guarantee status clears whatever is no longer relevant —
  // see that function's own comment for the exact clearing policy. This
  // patches the SAME record by id — editing never creates a new contractor.
  const updateContractor = (id: string, patch: Partial<OperatorContractor>) => {
    setLocal((current) => ({
      ...current,
      contractors: current.contractors.map((c) => (c.id === id ? applyContractorPatch(c, patch) : c)),
    }));
  };

  const removeContractor = (id: string) => {
    setLocal((current) => ({
      ...current,
      contractors: current.contractors.filter((c) => c.id !== id),
    }));
    setExpandedContractorIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const toggleContractorExpanded = (id: string) => {
    setExpandedContractorIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (state.phase === "loading") {
    return <p role="status">載入中…</p>;
  }

  if (state.phase === "not-found") {
    return (
      <p className="field-error" role="alert">
        找不到個案 {caseReference}。
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <p className="field-error" role="alert">
        {state.message}
      </p>
    );
  }

  const detail = state.detail;

  return (
    <div className="op-case-workspace">
      <header className="op-case-workspace__header">
        <div>
          <h1>{detail.publicReference}</h1>
          <p className="op-case-workspace__meta">
            {detail.issueCategory} · 提交於 {formatTimestamp(detail.createdAt)}
          </p>
        </div>
        <StatusPill tone={backendStatusTone(detail.status)}>{BACKEND_STATUS_LABELS[detail.status]}</StatusPill>
      </header>

      {detail.safetyFlags.length > 0 && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">安全警示</div>
          <p>{detail.safetyFlags.join(", ")}</p>
        </div>
      )}

      {/* The owner's own submission — brief, contact, consent — is
          rendered strictly read-only below. Nothing in this section writes
          back to the submission. */}
      <section className="op-panel" aria-label="業主提交資料">
        <h2>業主提交資料（唯讀）</h2>
        {/* Reuses the same concise semantic summary the owner review and
            post-submission confirmation screens show (variant="owner") —
            no separate operator-specific formatter. showDraftReference is
            suppressed: that row is the pre-submission CLIENT journey UUID,
            not a backend identifier, and would only compete with the real
            RS-XXXXXX reference already shown in this page's own header. */}
        <GeneratedBriefDocument brief={detail.generatedBrief} variant="owner" showDraftReference={false} />

        <dl className="operator-review__facts">
          <div>
            <dt>業主</dt>
            <dd>{detail.landlordName}</dd>
          </div>
          <div>
            <dt>電郵</dt>
            <dd>{detail.landlordEmail}</dd>
          </div>
          <div>
            <dt>電話</dt>
            <dd>{detail.landlordPhone}</dd>
          </div>
          <div>
            <dt>郵區</dt>
            <dd>{detail.propertyPostcode ?? "不適用"}</dd>
          </div>
          <div>
            <dt>地址</dt>
            <dd>{detail.propertyAddress ?? "未提供"}</dd>
          </div>
          <div>
            <dt>慣用聯絡方法</dt>
            <dd>{PREFERRED_CONTACT_METHOD_LABELS[detail.preferredContactMethod]}</dd>
          </div>
          <div>
            <dt>上門備註</dt>
            <dd>{detail.accessNotes ?? "沒有"}</dd>
          </div>
          <div>
            <dt>證據備註</dt>
            <dd>{detail.evidenceNotes ?? "未有描述"}</dd>
          </div>
          <div>
            <dt>同意讓人聯絡</dt>
            <dd>{detail.consentToContact ? "是" : "否"}</dd>
          </div>
          <div>
            <dt>同意分享給師傅</dt>
            <dd>{detail.consentToShareWithContractors ? "是" : "否"}</dd>
          </div>
          <div>
            <dt>問卷版本</dt>
            <dd>{detail.questionnaireVersion}</dd>
          </div>
        </dl>

        <details className="operator-review__answers">
          <summary>顯示原始答案</summary>
          <pre>{JSON.stringify(detail.questionnaireAnswers, null, 2)}</pre>
        </details>
      </section>

      <div className="op-case-workspace__columns">
        <section className="op-panel" aria-label="後台提交狀態">
          <h2>後台提交狀態</h2>
          <p className="op-panel__hint">
            已經儲存在 RepairScope，在任何檢視此個案的地方都會見到 — 與下面只在此機器才可見的本機工作流程狀態不同。
          </p>
          <label>
            內部審閱備註（會儲存在 RepairScope）
            <textarea
              rows={4}
              value={backendNotes}
              onChange={(event) => setBackendNotes(event.target.value)}
            />
          </label>
          <label>
            結束原因（結束個案時必須填）
            <select
              value={closedReason}
              onChange={(event) => setClosedReason(event.target.value as SubmissionClosedReason | "")}
            >
              <option value="">請選擇原因…</option>
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
                onClick={() => void applyBackendStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="op-panel" aria-label="本機工作備註">
          <h2>本機工作備註</h2>
          <p className="op-panel__hint">只留在此機器 — 不會傳送給 RepairScope。</p>
          <label>
            本機工作流程狀態
            <select
              value={local.status}
              onChange={(event) => updateLocalField("status", event.target.value as OperatorCaseStatus)}
            >
              {OPERATOR_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OPERATOR_CASE_STATUS_LABELS[status].zh}
                </option>
              ))}
            </select>
          </label>
          <label>
            內部備註
            <textarea
              value={local.internalNotes}
              onChange={(event) => updateLocalField("internalNotes", event.target.value)}
              placeholder="有什麼想記下關於此個案的事…"
            />
          </label>
          <label>
            未解決的問題
            <textarea
              value={local.unresolvedQuestions}
              onChange={(event) => updateLocalField("unresolvedQuestions", event.target.value)}
              placeholder="內部還有什麼未清楚？"
            />
          </label>
          <label>
            要問業主的問題
            <textarea
              value={local.ownerFollowUpQuestions}
              onChange={(event) => updateLocalField("ownerFollowUpQuestions", event.target.value)}
              placeholder="還有什麼要問業主？"
            />
          </label>
          <label>
            下一步行動
            <textarea
              value={local.nextAction}
              onChange={(event) => updateLocalField("nextAction", event.target.value)}
              placeholder="下一步要做什麼，由誰負責？"
            />
          </label>
          <label>
            跟進日期（可不填）
            <input
              type="date"
              value={local.followUpDate ?? ""}
              onChange={(event) => updateLocalField("followUpDate", event.target.value || undefined)}
            />
          </label>
        </section>
      </div>

      <section className="op-panel op-panel--wide" aria-label="考慮中的師傅">
        <div className="op-panel__heading-row">
          <h2>考慮中的師傅</h2>
          <button type="button" onClick={addContractor}>
            ＋新增師傅
          </button>
        </div>
        <p className="op-panel__hint">
          {isApiDataSource()
            ? "本機記錄，另有可複製給師傅的真實回覆連結（見下面）— 每位師傅都有自己的連結記錄。"
            : "只作本機記錄 — 暫時未有師傅帳戶或邀請功能。"}
        </p>
        {local.contractors.length === 0 ? (
          <p>暫時未有加入師傅。</p>
        ) : (
          <div className="op-contractor-list">
            {local.contractors.map((contractor) => (
              <ContractorCard
                key={contractor.id}
                contractor={contractor}
                expanded={expandedContractorIds.has(contractor.id)}
                onToggleExpanded={() => toggleContractorExpanded(contractor.id)}
                onUpdate={(patch) => updateContractor(contractor.id, patch)}
                onRemove={() => removeContractor(contractor.id)}
                requestLinkContext={
                  isApiDataSource()
                    ? {
                        submissionId: detail.id,
                        caseReference: detail.publicReference,
                        service: injectedContractorRequestService,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="op-panel op-panel--wide" aria-label="報價比較">
        <div className="op-panel__heading-row">
          <h2>報價比較</h2>
          <Link className="button button--secondary" href={`/operator/${detail.publicReference}/owner-preview`}>
            預覽業主報價畫面
          </Link>
        </div>
        <ProposalComparison
          contractors={local.contractors}
          keyDifferences={local.comparisonKeyDifferences ?? ""}
          unresolvedQuestions={local.comparisonUnresolvedQuestions ?? ""}
          repairScopeNote={local.comparisonRepairScopeNote ?? ""}
          onKeyDifferencesChange={(value) => updateLocalField("comparisonKeyDifferences", value)}
          onUnresolvedQuestionsChange={(value) => updateLocalField("comparisonUnresolvedQuestions", value)}
          onRepairScopeNoteChange={(value) => updateLocalField("comparisonRepairScopeNote", value)}
        />
      </section>
    </div>
  );
}

function formatHkDollars(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK")}`;
}

/** A short, at-a-glance line for the collapsed card — what a founder scanning
 * the list actually wants to know without opening every contractor. */
function summarizeContractor(contractor: OperatorContractor): string | null {
  switch (contractor.responseType) {
    case "interested":
      return OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS.interested.zh;
    case "needs-inspection":
      return contractor.inspectionRequirement
        ? `需要上門檢查 — ${OPERATOR_INSPECTION_REQUIREMENT_LABELS[contractor.inspectionRequirement].zh}`
        : "需要上門檢查";
    case "needs-more-information":
      return OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS["needs-more-information"].zh;
    case "not-suitable":
      return OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS["not-suitable"].zh;
    case "proposal-provided": {
      if (contractor.priceType === "fixed" || contractor.priceType === "estimate") {
        if (typeof contractor.price === "number") {
          const prefix = contractor.priceType === "estimate" ? "估算 " : "";
          return `報價 — ${prefix}${formatHkDollars(contractor.price)}`;
        }
      }
      if (contractor.priceType === "range") {
        const { priceMin, priceMax } = contractor;
        if (typeof priceMin === "number" && typeof priceMax === "number") {
          return `報價 — ${formatHkDollars(priceMin)}–${formatHkDollars(priceMax)}`;
        }
      }
      return "已提供報價";
    }
    default:
      return null;
  }
}

function ContractorCard({
  contractor,
  expanded,
  onToggleExpanded,
  onUpdate,
  onRemove,
  requestLinkContext,
}: {
  contractor: OperatorContractor;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (patch: Partial<OperatorContractor>) => void;
  onRemove: () => void;
  /** Present only in real API mode, once the real submission has loaded —
   * see OperatorCaseWorkspace's own isApiDataSource() gate above. Absent
   * entirely in mock mode, which keeps every existing manual-tracking/
   * paste-import behaviour on this card unchanged. */
  requestLinkContext?: {
    submissionId: string;
    caseReference: string;
    service?: ContractorRequestOperatorService;
  };
}) {
  const responseSummary = summarizeContractor(contractor);

  // The persisted range invariant (priceMin <= priceMax) is enforced in
  // applyContractorPatch, so an attempted edit that would invert it is
  // never committed — see handlePriceMinChange/handlePriceMaxChange below.
  // These two hold the operator's raw typed text ONLY while their attempt
  // is invalid, so the input keeps showing what they typed (with an inline
  // error) instead of silently reverting or wiping the other, still-valid
  // bound. `null` means "not overridden — show the persisted value."
  const [priceMinDraft, setPriceMinDraft] = useState<string | null>(null);
  const [priceMaxDraft, setPriceMaxDraft] = useState<string | null>(null);

  const parseOptionalAmount = (raw: string): number | undefined => {
    if (raw === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const wouldInvertRange = (candidateMin: number | undefined, candidateMax: number | undefined): boolean =>
    candidateMin !== undefined && candidateMax !== undefined && candidateMin > candidateMax;

  const handlePriceMinChange = (raw: string) => {
    const candidate = parseOptionalAmount(raw);
    if (wouldInvertRange(candidate, contractor.priceMax)) {
      setPriceMinDraft(raw);
      return;
    }
    setPriceMinDraft(null);
    onUpdate({ priceMin: candidate });
  };

  const handlePriceMaxChange = (raw: string) => {
    const candidate = parseOptionalAmount(raw);
    if (wouldInvertRange(contractor.priceMin, candidate)) {
      setPriceMaxDraft(raw);
      return;
    }
    setPriceMaxDraft(null);
    onUpdate({ priceMax: candidate });
  };

  const rangeInvalid = priceMinDraft !== null || priceMaxDraft !== null;

  // Import bridge (Commit B): a contractor fills in the standalone guided
  // form and copies a small structured export; the founder pastes it here
  // against the SAME contractor record they're already looking at. Preview
  // before commit, then onUpdate — the same callback the manual editor
  // above already uses — merges it via applyContractorPatch, so operator-
  // owned fields (name/trade/contactReference/status/notes) can never be
  // touched by an import, exactly as by manual editing.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ContractorResponsePayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const previewImport = () => {
    const result = parseContractorResponseExport(importText);
    if (!result.ok) {
      setImportError(result.error);
      setImportPreview(null);
      return;
    }
    setImportError(null);
    // Normalize BEFORE preview, not just before merge — sanitize here runs
    // the exact same applyContractorPatch invariants (price sanitisation,
    // response-type conditional clearing) that onUpdate below will apply,
    // so what the operator sees in the preview list is exactly what gets
    // merged, never a raw/tampered value that then silently changes on
    // confirm (e.g. a negative price or inverted range from a hand-edited
    // export).
    setImportPreview(sanitizeContractorResponsePayload(result.payload));
  };

  const confirmImport = () => {
    if (!importPreview) return;
    onUpdate(importPreview);
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setImportError(null);
  };

  const cancelImport = () => {
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setImportError(null);
  };

  return (
    <div className="op-contractor-card">
      <div className="op-contractor-card__summary">
        <div>
          <div className="op-contractor-card__heading">
            {contractor.name || "未命名師傅"}
            {contractor.trade ? <span className="op-contractor-card__trade"> · {contractor.trade}</span> : null}
          </div>
          <p className="op-contractor-card__meta">
            <span>{OPERATOR_CONTRACTOR_STATUS_LABELS[contractor.status].zh}</span>
            {responseSummary && <span>{responseSummary}</span>}
            {contractor.earliestStart && <span>最早可開始時間：{contractor.earliestStart}</span>}
          </p>
        </div>
        <div className="op-contractor-card__actions">
          <button type="button" onClick={onToggleExpanded}>
            {expanded ? "收合" : "編輯"}
          </button>
          <button type="button" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? "取消匯入" : "匯入回覆"}
          </button>
          <button type="button" onClick={onRemove}>
            移除
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="op-contractor-card__import">
          <p className="op-panel__hint">
            貼上師傅在自己表格填寫的回覆。確認之前不會有任何改動 —
            此操作永遠不會覆蓋上面的名稱、行業、聯絡方式、聯絡狀態或你自己的備註。
          </p>
          <label>
            貼上的回覆
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
                setImportError(null);
              }}
              placeholder="在此貼上師傅匯出的回覆…"
            />
          </label>
          <div className="op-contractor-card__import-actions">
            <button type="button" onClick={previewImport} disabled={!importText.trim()}>
              預覽
            </button>
            <button type="button" onClick={cancelImport}>
              取消
            </button>
          </div>
          {importError && (
            <p className="field-error" role="alert">
              {importError}
            </p>
          )}
          {importPreview && (
            <div className="op-contractor-card__import-preview">
              <p>呢次會更新：</p>
              <ul>
                {Object.entries(importPreview).map(([key, value]) => (
                  <li key={key}>
                    <strong>{key}</strong>: {String(value)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={confirmImport}>
                確認匯入
              </button>
            </div>
          )}
        </div>
      )}

      {requestLinkContext && (
        <ContractorRequestPanel
          contractor={contractor}
          submissionId={requestLinkContext.submissionId}
          caseReference={requestLinkContext.caseReference}
          injectedService={requestLinkContext.service}
          onImport={onUpdate}
        />
      )}

      {expanded && (
        <div className="op-contractor-card__form">
          <label>
            師傅名稱
            <input
              value={contractor.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
              aria-label="師傅名稱"
              placeholder="師傅名稱"
            />
          </label>
          <div className="op-contractor-card__row">
            <label>
              行業
              <input
                value={contractor.trade ?? ""}
                onChange={(event) => onUpdate({ trade: event.target.value })}
                placeholder="例如：水喉匠"
              />
            </label>
            <label>
              聯絡方式
              <input
                value={contractor.contactReference ?? ""}
                onChange={(event) => onUpdate({ contactReference: event.target.value })}
                placeholder="例如：WhatsApp／電話備註"
              />
            </label>
          </div>

          <label>
            聯絡／搵師傅狀態
            <select
              value={contractor.status}
              onChange={(event) => onUpdate({ status: event.target.value as OperatorContractorStatus })}
            >
              {OPERATOR_CONTRACTOR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OPERATOR_CONTRACTOR_STATUS_LABELS[status].zh}
                </option>
              ))}
            </select>
          </label>

          <label>
            目前回覆
            <select
              value={contractor.responseType ?? ""}
              onChange={(event) => {
                // Leaving proposal-provided hides the range inputs (see
                // applyContractorPatch, which also clears the persisted
                // priceMin/priceMax) — drop any invalid draft-in-progress
                // with them, rather than leaving it to resurface if the
                // operator switches back.
                setPriceMinDraft(null);
                setPriceMaxDraft(null);
                onUpdate({
                  responseType: (event.target.value || undefined) as OperatorContractorResponseType | undefined,
                });
              }}
            >
              <option value="">未有回覆</option>
              {OPERATOR_CONTRACTOR_RESPONSE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {OPERATOR_CONTRACTOR_RESPONSE_TYPE_LABELS[type].zh}
                </option>
              ))}
            </select>
          </label>

          {contractor.responseType === "needs-inspection" && (
            <label>
              檢查要求
              <select
                value={contractor.inspectionRequirement ?? ""}
                onChange={(event) =>
                  onUpdate({
                    inspectionRequirement: (event.target.value || undefined) as
                      | OperatorInspectionRequirement
                      | undefined,
                  })
                }
              >
                <option value="">請選擇…</option>
                {OPERATOR_INSPECTION_REQUIREMENTS.map((requirement) => (
                  <option key={requirement} value={requirement}>
                    {OPERATOR_INSPECTION_REQUIREMENT_LABELS[requirement].zh}
                  </option>
                ))}
              </select>
            </label>
          )}

          {contractor.responseType === "needs-more-information" && (
            <label>
              他們需要什麼資料？
              <textarea
                value={contractor.informationNeeded ?? ""}
                onChange={(event) => onUpdate({ informationNeeded: event.target.value })}
              />
            </label>
          )}

          {contractor.responseType === "proposal-provided" && (
            <>
              <label>
                報價方式
                <select
                  value={contractor.priceType ?? ""}
                  onChange={(event) => {
                    // Leaving "range" hides the min/max inputs and clears
                    // them in persisted state — drop any pending invalid
                    // draft along with them.
                    setPriceMinDraft(null);
                    setPriceMaxDraft(null);
                    onUpdate({ priceType: (event.target.value || undefined) as OperatorPriceType | undefined });
                  }}
                >
                  <option value="">請選擇…</option>
                  {OPERATOR_PRICE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {OPERATOR_PRICE_TYPE_LABELS[type].zh}
                    </option>
                  ))}
                </select>
              </label>

              {(contractor.priceType === "fixed" || contractor.priceType === "estimate") && (
                <label>
                  價格（港幣）
                  <input
                    type="number"
                    min={0}
                    value={contractor.price ?? ""}
                    onChange={(event) => onUpdate({ price: parseOptionalAmount(event.target.value) })}
                  />
                </label>
              )}

              {contractor.priceType === "range" && (
                <div className="op-contractor-card__row">
                  <label>
                    價格範圍 — 最低（港幣）
                    <input
                      type="number"
                      min={0}
                      value={priceMinDraft ?? contractor.priceMin ?? ""}
                      onChange={(event) => handlePriceMinChange(event.target.value)}
                    />
                  </label>
                  <label>
                    價格範圍 — 最高（港幣）
                    <input
                      type="number"
                      min={0}
                      value={priceMaxDraft ?? contractor.priceMax ?? ""}
                      onChange={(event) => handlePriceMaxChange(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {rangeInvalid && (
                <p className="field-error" role="alert">
                  最低價格不可高於最高價格 — 此數值未有儲存，會保留上一個有效的範圍。
                </p>
              )}

              <label>
                建議處理方法
                <textarea
                  value={contractor.proposedApproach ?? ""}
                  onChange={(event) => onUpdate({ proposedApproach: event.target.value })}
                />
              </label>
              <label>
                包括項目
                <textarea
                  value={contractor.inclusions ?? ""}
                  onChange={(event) => onUpdate({ inclusions: event.target.value })}
                />
              </label>
              <label>
                不包括的項目
                <textarea
                  value={contractor.exclusions ?? ""}
                  onChange={(event) => onUpdate({ exclusions: event.target.value })}
                />
              </label>
              <label>
                可能影響價格的因素
                <textarea
                  value={contractor.priceChangeFactors ?? ""}
                  onChange={(event) => onUpdate({ priceChangeFactors: event.target.value })}
                />
              </label>
              <label>
                預計工期
                <input
                  value={contractor.expectedDuration ?? ""}
                  onChange={(event) => onUpdate({ expectedDuration: event.target.value })}
                  placeholder="例如：1 日、2-3 次上門"
                />
              </label>
              <label>
                最早可開始時間
                <input
                  value={contractor.earliestStart ?? ""}
                  onChange={(event) => onUpdate({ earliestStart: event.target.value })}
                  placeholder="例如：明天下午、3 日內、檢查之後"
                />
              </label>
              <label>
                保養
                <select
                  value={contractor.guaranteeStatus ?? ""}
                  onChange={(event) =>
                    onUpdate({
                      guaranteeStatus: (event.target.value || undefined) as OperatorGuaranteeStatus | undefined,
                    })
                  }
                >
                  <option value="">請選擇…</option>
                  {OPERATOR_GUARANTEE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {OPERATOR_GUARANTEE_STATUS_LABELS[status].zh}
                    </option>
                  ))}
                </select>
              </label>
              {contractor.guaranteeStatus === "yes" && (
                <label>
                  保養詳情
                  <textarea
                    value={contractor.guaranteeDetails ?? ""}
                    onChange={(event) => onUpdate({ guaranteeDetails: event.target.value })}
                  />
                </label>
              )}
            </>
          )}

          <label>
            師傅原本的回覆 — 他們說了什麼？
            <textarea
              value={contractor.originalResponse ?? ""}
              onChange={(event) => onUpdate({ originalResponse: event.target.value })}
              placeholder="貼上或簡述師傅實際所講的內容…"
            />
          </label>

          <label>
            操作員備註
            <textarea
              value={contractor.notes}
              onChange={(event) => onUpdate({ notes: event.target.value })}
              placeholder="手動記錄的備註（WhatsApp、電話等）"
            />
          </label>
        </div>
      )}
    </div>
  );
}

const REQUEST_STATUS_LABELS: Record<ContractorRequestSummary["status"], string> = {
  open: "開放中",
  responded: "已回覆",
  revoked: "已撤銷",
  expired: "已過期",
};

function requestStatusTone(status: ContractorRequestSummary["status"]): "neutral" | "good" | "attention" | "ink" {
  if (status === "responded") return "good";
  if (status === "open") return "ink";
  return "neutral";
}

/**
 * Real request-link controls for ONE contractor card (T2 Commit 3) — sends
 * a real, backend-issued request link and shows that contractor's own
 * request history, live from the operator API. Deliberately separate from
 * the manual "Import response" flow above: sending/revoking a link here
 * never reads or writes OperatorContractor.status/responseType/notes/etc —
 * only an explicit "Import response" action (existing, or its T2 Commit 4
 * server-response counterpart) ever mutates that canonical state. The raw
 * link itself is cached locally (domain/contractorRequestLinkCache.ts) —
 * see that module's comment for why: the backend only ever returns the
 * access token once, at creation.
 */
function ContractorRequestPanel({
  contractor,
  submissionId,
  caseReference,
  injectedService,
  onImport,
}: {
  contractor: OperatorContractor;
  submissionId: string;
  caseReference: string;
  /** Test-only seam — see OperatorCaseWorkspace's own contractorRequestService comment. */
  injectedService?: ContractorRequestOperatorService;
  /** The SAME callback ContractorCard's manual editor and paste-import
   * flow already use (see updateContractor in OperatorCaseWorkspace) —
   * see reviewRequest/confirmReviewImport below for why a server response
   * is deliberately routed through this one shared path rather than a
   * second mutation path of its own (T2 Commit 4). */
  onImport: (patch: Partial<OperatorContractor>) => void;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see OperatorCaseList's identical, justified pattern.
  const service = injectedService ?? useContractorRequestOperatorService();
  const [requests, setRequests] = useState<ContractorRequestSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "error">("idle");
  const [sendError, setSendError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [justCreatedLink, setJustCreatedLink] = useState<string | null>(null);

  // Review-and-import (T2 Commit 4) — a responded request's payload is an
  // INBOX item, not canonical state: reviewingRequestId tracks which
  // request the operator is currently looking at, reviewPreview holds the
  // sanitized-but-not-yet-applied payload (nothing on the contractor
  // changes until confirmReviewImport below), reviewError covers a
  // fetch failure or a payload that fails even minimal shape validation.
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewPreview, setReviewPreview] = useState<ContractorResponsePayload | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const refresh = () => {
    service
      .list(submissionId)
      .then((all) => {
        setRequests(all.filter((r) => r.clientContractorId === contractor.id));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof ContractorRequestOperatorError
            ? error.message
            : "未能載入回覆記錄。",
        );
      });
  };

  useEffect(() => {
    let cancelled = false;
    service
      .list(submissionId)
      .then((all) => {
        if (cancelled) return;
        setRequests(all.filter((r) => r.clientContractorId === contractor.id));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ContractorRequestOperatorError
            ? error.message
            : "未能載入回覆記錄。",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [service, submissionId, contractor.id]);

  // LOCALIZATION WORDING CORRECTION: RepairScope only CREATES this link —
  // the operator still has to manually copy/paste it to the contractor
  // (WhatsApp, SMS, etc.) themselves. "建立"/"複製" (create/copy), never
  // "傳送"/"已發送" (send/sent) — those would falsely imply RepairScope
  // transmitted it. See the module comment on ContractorRequestPanel.
  const sendRequestLink = async () => {
    setSendState("sending");
    setSendError("");
    setJustCreatedLink(null);
    try {
      const created = await service.create(submissionId, {
        contractorLabel: contractor.name || "Unnamed contractor",
        clientContractorId: contractor.id,
      });
      const rawLink = `${window.location.origin}/contractor/respond/${created.accessToken}`;
      cacheContractorRequestLink(caseReference, {
        requestId: created.id,
        rawLink,
        clientContractorId: contractor.id,
        createdAt: created.createdAt,
      });
      setJustCreatedLink(rawLink);
      setSendState("idle");
      refresh();
    } catch (error) {
      setSendState("error");
      setSendError(
        error instanceof ContractorRequestOperatorError ? error.message : "未能建立回覆連結。",
      );
    }
  };

  const revokeRequest = async (requestId: string) => {
    setRevokingId(requestId);
    try {
      await service.revoke(submissionId, requestId);
      refresh();
    } catch (error) {
      setLoadError(
        error instanceof ContractorRequestOperatorError ? error.message : "未能撤銷此連結。",
      );
    } finally {
      setRevokingId(null);
    }
  };

  const reviewRequest = async (requestId: string) => {
    setReviewingRequestId(requestId);
    setReviewLoading(true);
    setReviewError(null);
    setReviewPreview(null);
    try {
      const detail = await service.get(submissionId, requestId);
      // Same runtime shape validation as an operator-pasted export (see
      // parseContractorResponseExport/previewImport above) — the backend
      // already validates this with Pydantic's extra="forbid" at submit
      // time, so a value that fails here would mean transport corruption
      // or schema drift, not a normal case; refusing to preview rather
      // than guessing at a malformed value is the same fail-closed
      // posture as the rest of this module.
      const parsed = parseSupportedContractorResponsePayload(
        detail.responseSchemaVersion,
        detail.responsePayload,
      );
      if (!parsed) {
        setReviewError(
          detail.responseSchemaVersion === 1
            ? "未能讀取此回覆 — 格式未能識別。"
            : "此師傅回覆使用了不支援的版本，未能匯入。",
        );
        return;
      }
      // Same normalization the paste-import flow already runs before
      // preview (see previewImport above) — proves what the operator sees
      // in the preview is exactly what confirmReviewImport will merge,
      // never a raw/unsanitized value that then silently changes on
      // confirm.
      setReviewPreview(sanitizeContractorResponsePayload(parsed));
    } catch (error) {
      setReviewError(
        error instanceof ContractorRequestOperatorError ? error.message : "未能載入此回覆。",
      );
    } finally {
      setReviewLoading(false);
    }
  };

  const cancelReview = () => {
    setReviewingRequestId(null);
    setReviewPreview(null);
    setReviewError(null);
  };

  // The ONE place a server-submitted response is allowed to change
  // canonical OperatorContractor state — routed through the exact same
  // onImport (updateContractor -> applyContractorPatch) callback the
  // manual paste-import flow already uses above, so a server response can
  // never bypass any invariant (price sanitization, conditional-field
  // clearing) that paste-import already enforces. This never fires except
  // from this explicit button click — see the module comment on
  // ContractorRequestPanel.
  const confirmReviewImport = () => {
    if (!reviewPreview) return;
    onImport(reviewPreview);
    cancelReview();
  };

  const cachedLinks = readCachedContractorRequestLinks(caseReference);

  return (
    <div className="op-contractor-card__requests">
      <div className="op-contractor-card__requests-heading">
        <h4>師傅回覆連結</h4>
        <button type="button" onClick={sendRequestLink} disabled={sendState === "sending"}>
          {sendState === "sending" ? "建立緊連結…" : "建立回覆連結"}
        </button>
      </div>
      {sendState === "error" && (
        <p className="field-error" role="alert">
          {sendError}
        </p>
      )}
      {justCreatedLink && (
        <p className="op-contractor-card__requests-new-link">
          連結已建立： <code>{justCreatedLink}</code>
        </p>
      )}
      {loadError && (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      )}
      {requests === null ? (
        <p className="op-panel__hint">回覆記錄載入中…</p>
      ) : requests.length === 0 ? (
        <p className="op-panel__hint">暫時未有為此師傅建立連結。</p>
      ) : (
        <ul className="op-contractor-card__requests-list">
          {requests
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((request) => {
              const cached = cachedLinks.find((link) => link.requestId === request.id);
              return (
                <li key={request.id}>
                  <StatusPill tone={requestStatusTone(request.status)}>
                    {REQUEST_STATUS_LABELS[request.status]}
                  </StatusPill>
                  <span>建立時間 {formatTimestamp(request.createdAt)}</span>
                  {request.status === "open" && cached && <code>{cached.rawLink}</code>}
                  {request.status === "open" && !cached && (
                    <span className="op-panel__hint">
                      此瀏覽器找不到連結資料 — 如有需要，可以撤銷並建立新連結。
                    </span>
                  )}
                  {request.status === "open" && (
                    <button
                      type="button"
                      onClick={() => revokeRequest(request.id)}
                      disabled={revokingId === request.id}
                    >
                      {revokingId === request.id ? "撤銷中…" : "撤銷連結"}
                    </button>
                  )}
                  {request.status === "responded" && reviewingRequestId !== request.id && (
                    <button type="button" onClick={() => reviewRequest(request.id)}>
                      查看回覆
                    </button>
                  )}
                  {request.status === "responded" && reviewingRequestId === request.id && (
                    <div className="op-contractor-card__requests-review">
                      {reviewLoading && <p className="op-panel__hint">載入中…</p>}
                      {reviewError && (
                        <p className="field-error" role="alert">
                          {reviewError}
                        </p>
                      )}
                      {reviewPreview && (
                        <div className="op-contractor-card__import-preview">
                          <p>
                            此為師傅提交的內容。確認之前此師傅的資料不會有任何改動 —
                            永遠不會覆蓋上面的名稱、行業、聯絡方式、聯絡狀態或你自己的備註。
                          </p>
                          <ul>
                            {Object.entries(reviewPreview).map(([key, value]) => (
                              <li key={key}>
                                <strong>{key}</strong>: {String(value)}
                              </li>
                            ))}
                          </ul>
                          <button type="button" onClick={confirmReviewImport}>
                            確認匯入
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={cancelReview}>
                        {reviewPreview ? "取消" : "關閉"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}
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
