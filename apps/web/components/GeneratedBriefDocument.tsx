"use client";

import { questionnaireByCategory, resolveAnswerLabel } from "@/data/questionnaires";
import {
  resolveConfirmedUnknown,
  resolveContractorRequest,
  summariseObservedFacts,
  summariseSituation,
} from "@/domain/brief";
import type { RepairCategoryId } from "@/domain/types";
import { useLanguage } from "./LanguageContext";

// The single, shared rendering of a generated repair brief — used by the
// landlord's "Check the facts" review screen (LandlordApp.tsx) and the
// operator submission detail screen (OperatorSubmissionReview.tsx). There
// is deliberately no separate operator-specific representation: an
// operator should see exactly what the owner saw.
//
// The operator's copy of a brief arrives as untyped JSON from the API
// (persisted at submission time, not guaranteed to match today's
// domain/types.ts ProblemBrief shape for older/staging records), so every
// field here is read defensively rather than assumed present.
type GeneratedBriefLike = {
  repairId?: string;
  originalReport?: string;
  reportedFacts?: string[];
  confirmedUnknowns?: string[];
  evidence?: { name?: string }[];
  accessOverview?: string;
  contractorRequests?: string[];
  category?: string;
  observedFacts?: {
    affected?: string;
    branchFirst?: string;
    branchSecond?: string;
    branchThird?: string;
    duration?: string;
    frequency?: string;
    worsening?: string;
  };
  priorAction?: { status?: string; detail?: string };
  buildingContext?: { managementContacted?: string; sharedAreaInvolved?: string };
  propertyDetails?: {
    district?: string;
    building?: string;
    block?: string;
    floor?: string;
    unit?: string;
    accessBy?: string;
    availability?: string;
  };
  relationship?: string;
  additionalContext?: string;
  hasEvidence?: string;
  evidenceKind?: string;
  landlordCorrections?: string[];
};

export function GeneratedBriefDocument({
  brief,
  bare = false,
  variant = "operator",
}: {
  brief: GeneratedBriefLike | null | undefined;
  /**
   * The landlord "Check the facts" screen wraps this in its own
   * `.brief-document` section alongside the correction form, so it renders
   * bare (no outer div) there to avoid a duplicate/nested `.brief-document`.
   * The operator detail screen has no such wrapper, so it uses the default.
   */
  bare?: boolean;
  /**
   * "operator" (default) is the original numbered report-style layout,
   * unchanged — used by the operator submission detail screen
   * (components/OperatorSubmissionReview.tsx), which should keep seeing
   * the full technical rendering. "owner" is the simplified, synthesised
   * review shown on the owner's "Check the facts" screen
   * (components/LandlordApp.tsx) before contact/submission — see
   * OwnerBriefSummary below. Both variants are pure presentations of the
   * same ProblemBrief; no data is added or removed between them.
   */
  variant?: "operator" | "owner";
}) {
  const { lang, t } = useLanguage();

  if (!brief) {
    const empty = (
      <>
        <p className="eyebrow">{lang === "zh" ? "RepairScope 中立簡報" : "RepairScope neutral brief"}</p>
        <p>{lang === "zh" ? "呢個個案未有維修簡報。" : "No brief is available for this submission."}</p>
      </>
    );
    return bare ? empty : <div className="brief-document">{empty}</div>;
  }

  if (variant === "owner") {
    const content = <OwnerBriefSummary brief={brief} />;
    return bare ? content : <div className="brief-document">{content}</div>;
  }

  const category =
    brief.category && brief.category in questionnaireByCategory
      ? (brief.category as RepairCategoryId)
      : undefined;
  const categoryLabel = category ? t(questionnaireByCategory[category].label) : (lang === "zh" ? "維修簡報" : "Repair brief");
  const resolve = (fieldId: string, value: string | undefined) =>
    category ? resolveAnswerLabel(category, fieldId, value, lang) : (lang === "zh" ? "未提供" : "Not specified");

  // "02 Reported / observed facts" — a standard category's actual answers
  // (affected area, the three branch questions, timeline) live in
  // observedFacts, not reportedFacts/originalReport (there is no
  // free-text "story" to fall back to for those categories — see
  // domain/brief.ts). other/unsure categories use their short description
  // (reportedFacts/originalReport) instead, since they have no branch
  // questions. Shared with the post-submission confirmation screen so both
  // describe the same journey identically.
  const observedFactRows: string[] = summariseObservedFacts(
    {
      category,
      observedFacts: brief.observedFacts,
      reportedFacts: brief.reportedFacts ?? [],
      landlordCorrections: brief.landlordCorrections,
    },
    lang,
  );

  const evidenceItems = Array.isArray(brief.evidence)
    ? brief.evidence.map((item) => item?.name).filter((name): name is string => Boolean(name))
    : [];
  // "Evidence you have" — not "Evidence supplied": no file has actually
  // been transmitted anywhere in this app yet (see docs/PUBLIC_INGESTION_LAUNCH.md).
  // Distinguishes "owner indicates evidence exists" from an actual upload.
  const evidenceRows: string[] =
    evidenceItems.length > 0
      ? evidenceItems
      : brief.hasEvidence === "yes"
        ? [
            `${lang === "zh" ? "業主表示有" : "Owner indicates"}: ${resolve("evidenceKind", brief.evidenceKind)}${
              lang === "zh" ? "（未上載，待人手跟進）" : " (not yet uploaded — RepairScope will follow up)"
            }`,
          ]
        : [];

  const pd = brief.propertyDetails;
  const propertyRows: string[] = [
    ...(pd?.district ? [resolve("district", pd.district)] : []),
    ...[pd?.building, pd?.block, pd?.floor, pd?.unit].filter((v): v is string => Boolean(v)),
  ];
  const accessRows: string[] = [
    ...(brief.relationship ? [resolve("relationship", brief.relationship)] : []),
    ...(pd?.accessBy ? [resolve("accessBy", pd.accessBy)] : []),
    ...(pd?.availability ? [pd.availability] : (brief.accessOverview ? [brief.accessOverview] : [])),
  ];

  const content = (
    <>
      <div className="brief-document__masthead">
        <div>
          <p className="eyebrow">{lang === "zh" ? "RepairScope 中立簡報" : "RepairScope neutral brief"}</p>
          <h2>{categoryLabel}</h2>
        </div>
        <div className="brief-ref">
          <span>{lang === "zh" ? "個案" : "Repair"}</span>
          <strong>{(brief.repairId ?? "unknown").toUpperCase()}</strong>
        </div>
      </div>

      <div className="brief-lead">
        <span className="scope-mark">01</span>
        <p>
          {brief.originalReport?.trim() ? `${brief.originalReport.trim()} ` : ""}
          {lang === "zh"
            ? "RepairScope 未有獨立確認成因或責任。師傅應該講低自己嘅判斷、係咪需要檢查，同建議嘅工作範圍。"
            : "RepairScope has not independently confirmed the cause or responsibility. Contractors should state their own working diagnosis, whether inspection is required, and what their proposed work would address."}
        </p>
      </div>

      <div className="brief-grid">
        <BriefSection
          number="02"
          title={lang === "zh" ? "已知／觀察到嘅事實" : "Reported / observed facts"}
          items={observedFactRows}
          alwaysShow
        />
        <BriefSection
          number="03"
          title={lang === "zh" ? "之前檢查／報價／維修" : "Previous inspection / quotation / repair"}
          items={
            brief.priorAction?.status
              ? [
                  resolve("prior", brief.priorAction.status),
                  ...(brief.priorAction.detail ? [brief.priorAction.detail] : []),
                ]
              : undefined
          }
        />
        <BriefSection
          number="04"
          title={lang === "zh" ? "大廈背景" : "Building context"}
          items={
            brief.buildingContext
              ? [
                  `${lang === "zh" ? "管理處：" : "Management office: "}${resolve("management", brief.buildingContext.managementContacted)}`,
                  `${lang === "zh" ? "其他單位／公用地方：" : "Other flat / common area: "}${resolve("sharedArea", brief.buildingContext.sharedAreaInvolved)}`,
                ]
              : undefined
          }
        />
        <BriefSection
          number="05"
          title={lang === "zh" ? "物業／上門安排" : "Property / access"}
          items={[...propertyRows, ...accessRows]}
          alwaysShow
        />
        <BriefSection
          number="06"
          title={lang === "zh" ? "現有證據" : "Evidence you have"}
          items={evidenceRows.length > 0 ? evidenceRows : undefined}
          emptyLabel={lang === "zh" ? "未有提供證據" : "No evidence indicated"}
        />
        <BriefSection
          number="07"
          title={lang === "zh" ? "補充資料" : "Additional information"}
          items={brief.additionalContext ? [brief.additionalContext] : undefined}
        />
        <BriefSection
          number="08"
          title={lang === "zh" ? "仍未確認" : "What remains unconfirmed"}
          items={brief.confirmedUnknowns?.map((key) => resolveConfirmedUnknown(key, lang))}
          tone="unknown"
          alwaysShow
        />
        <BriefSection
          number="09"
          title={lang === "zh" ? "師傅需要提供" : "What contractors must provide"}
          items={brief.contractorRequests?.map((key) => resolveContractorRequest(key, lang))}
          wide
          alwaysShow
        />
      </div>
    </>
  );

  return bare ? content : <div className="brief-document">{content}</div>;
}

function BriefSection({
  number,
  title,
  items,
  tone,
  wide,
  alwaysShow = false,
  emptyLabel,
}: {
  number: string;
  title: string;
  items: string[] | undefined;
  tone?: "unknown";
  wide?: boolean;
  /** Render even when there is nothing to show (a safe fallback row), instead of omitting the section entirely. */
  alwaysShow?: boolean;
  emptyLabel?: string;
}) {
  const { lang } = useLanguage();
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  // Do not add empty sections simply to meet numbering — a section with no
  // underlying answer at all is omitted rather than shown with a
  // placeholder, unless it is one of the sections that should always be
  // present (property/access, observed facts, unconfirmed, contractor
  // requests).
  if (list.length === 0 && !alwaysShow) return null;
  return (
    <section
      className={`brief-section ${wide ? "brief-section--wide" : ""} ${tone ? `brief-section--${tone}` : ""}`}
    >
      <header>
        <span>{number}</span>
        <h3>{title}</h3>
      </header>
      <ul>
        {list.length > 0 ? (
          list.map((item) => <li key={item}>{item}</li>)
        ) : (
          <li>{emptyLabel ?? (lang === "zh" ? "未有記錄" : "Not recorded")}</li>
        )}
      </ul>
    </section>
  );
}

/**
 * The owner-facing "Check the facts" review — a concise, synthesised
 * summary rather than a repeat of the questionnaire, and deliberately not
 * the numbered report grid the operator sees (see GeneratedBriefDocument's
 * own comment on `variant`). Renders exactly the same ProblemBrief data;
 * nothing here is invented, and nothing shown to the operator is hidden —
 * this only reorganises how it reads. The one exception is "09 What
 * contractors must provide" (`brief.contractorRequests`), which is
 * deliberately not rendered here — instructions addressed to a future
 * contractor belong on the future contractor-facing sourcing brief, not on
 * the owner's own confirmation screen.
 */
function OwnerBriefSummary({ brief }: { brief: GeneratedBriefLike }) {
  const { lang } = useLanguage();
  const category =
    brief.category && brief.category in questionnaireByCategory
      ? (brief.category as RepairCategoryId)
      : undefined;
  const categoryLabel = category
    ? (lang === "zh" ? questionnaireByCategory[category].label.zh : questionnaireByCategory[category].label.en)
    : (lang === "zh" ? "維修個案" : "Repair case");
  const resolve = (fieldId: string, value: string | undefined) =>
    category ? resolveAnswerLabel(category, fieldId, value, lang) : (lang === "zh" ? "未提供" : "Not specified");

  const situation = summariseSituation(
    { category, observedFacts: brief.observedFacts },
    lang,
  );
  // "concise" labels (e.g. "受影響位置", not the question "發現問題喺邊度？")
  // and includeTimeline:false — duration/frequency/worsening are already
  // fused into `situation` above, so repeating them as their own rows here
  // would just restate the same three facts twice. See summariseObservedFacts's
  // own comment for why every other caller keeps the defaults.
  const observedFactRows = summariseObservedFacts(
    {
      category,
      observedFacts: brief.observedFacts,
      reportedFacts: brief.reportedFacts ?? [],
      landlordCorrections: brief.landlordCorrections,
    },
    lang,
    { style: "concise", includeTimeline: false },
  );

  // Always labelled, even though today's priorOptions already resolve to a
  // specific meaning (e.g. "收到報價"/"Quotation received") rather than a
  // bare "有"/"Yes" — a stable label prefix keeps this section readable as
  // a statement rather than a lone value, and is the correct fallback if a
  // stored answer is ever only yes/no.
  const priorStatusLabel = lang === "zh" ? "之前曾經處理" : "Previous action";
  const priorDetailLabel = lang === "zh" ? "對方講法" : "What they said";
  const priorRows: string[] = brief.priorAction?.status
    ? [
        `${priorStatusLabel}${lang === "zh" ? "：" : ": "}${resolve("prior", brief.priorAction.status)}`,
        ...(brief.priorAction.detail
          ? [`${priorDetailLabel}${lang === "zh" ? "：" : ": "}${brief.priorAction.detail}`]
          : []),
      ]
    : [];

  // Truthful either way: no upload path exists yet, so this never claims
  // anything was received. When a type was actually captured, it's listed
  // as its own row (evidenceKind is a single_select field — at most one
  // type is ever recorded); when hasEvidence is "yes" but no type was
  // answered, the sentence alone stands without a dangling colon.
  const evidenceRows: string[] = (() => {
    if (brief.hasEvidence !== "yes") return [];
    const kind = brief.evidenceKind ? resolve("evidenceKind", brief.evidenceKind) : undefined;
    const intro = kind
      ? (lang === "zh" ? "你表示有以下資料，但尚未透過 RepairScope 網站提供：" : "You indicated you have the following, but it has not been provided through the RepairScope website yet:")
      : (lang === "zh" ? "你表示有相關資料，但尚未透過 RepairScope 網站提供。" : "You indicated you have relevant information, but it has not been provided through the RepairScope website yet.");
    return [intro, ...(kind ? [kind] : [])];
  })();

  const pd = brief.propertyDetails;
  const propertyRows: [string, string][] = [
    ...(pd?.district ? ([[lang === "zh" ? "地區" : "District", resolve("district", pd.district)]] as [string, string][]) : []),
    ...(pd?.building ? ([[lang === "zh" ? "屋苑／大廈" : "Building", pd.building]] as [string, string][]) : []),
    ...(pd?.block ? ([[lang === "zh" ? "座／幢" : "Block", pd.block]] as [string, string][]) : []),
    ...(pd?.floor ? ([[lang === "zh" ? "樓層" : "Floor", pd.floor]] as [string, string][]) : []),
    ...(pd?.unit ? ([[lang === "zh" ? "單位" : "Unit", pd.unit]] as [string, string][]) : []),
  ];
  const accessRows: [string, string][] = [
    ...(brief.relationship
      ? ([[lang === "zh" ? "與物業關係" : "Relationship to property", resolve("relationship", brief.relationship)]] as [
          string,
          string,
        ][])
      : []),
    ...(pd?.accessBy
      ? ([[lang === "zh" ? "上門聯絡" : "Access contact", resolve("accessBy", pd.accessBy)]] as [string, string][])
      : []),
    ...(pd?.availability
      ? ([[lang === "zh" ? "方便時段" : "Convenient time", pd.availability]] as [string, string][])
      : []),
  ];
  const buildingRows: [string, string][] = brief.buildingContext
    ? [
        ...(brief.buildingContext.managementContacted
          ? ([[
              lang === "zh" ? "管理處" : "Management office",
              resolve("management", brief.buildingContext.managementContacted),
            ]] as [string, string][])
          : []),
        ...(brief.buildingContext.sharedAreaInvolved
          ? ([[
              lang === "zh" ? "其他單位／公用地方" : "Other flat / common area",
              resolve("sharedArea", brief.buildingContext.sharedAreaInvolved),
            ]] as [string, string][])
          : []),
      ]
    : [];

  return (
    <div className="owner-review">
      <header className="owner-review__header">
        <h2>{lang === "zh" ? "維修資料摘要" : "Repair summary"}</h2>
        <p>
          {lang === "zh"
            ? "請確認以下資料係咪準確。我哋會根據你確認嘅資料做人手檢視。"
            : "Please check that the information below is accurate. We’ll use the confirmed information for manual review."}
        </p>
        <p className="owner-review__category">{categoryLabel}</p>
      </header>

      <OwnerSection title={lang === "zh" ? "維修情況" : "Repair situation"}>
        {situation && <p className="owner-review__situation">{situation}</p>}
        {observedFactRows.length > 0 && (
          <ul className="owner-review__facts">
            {observedFactRows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        )}
      </OwnerSection>

      {priorRows.length > 0 && (
        <OwnerSection title={lang === "zh" ? "之前處理情況" : "Previous action"}>
          <ul className="owner-review__facts">
            {priorRows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </OwnerSection>
      )}

      {evidenceRows.length > 0 && (
        <OwnerSection title={lang === "zh" ? "現有資料" : "Available information"}>
          <ul className="owner-review__facts">
            {evidenceRows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </OwnerSection>
      )}

      {(propertyRows.length > 0 || accessRows.length > 0 || buildingRows.length > 0) && (
        <OwnerSection title={lang === "zh" ? "物業及上門安排" : "Property and access"}>
          {(propertyRows.length > 0 || accessRows.length > 0) && (
            <dl className="owner-review__rows">
              {[...propertyRows, ...accessRows].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {buildingRows.length > 0 && (
            <div className="owner-review__subsection">
              <h4>{lang === "zh" ? "大廈／管理處" : "Building / management office"}</h4>
              <dl className="owner-review__rows">
                {buildingRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </OwnerSection>
      )}

      {brief.additionalContext && (
        <OwnerSection title={lang === "zh" ? "其他補充" : "Additional information"}>
          <p className="owner-review__situation">{brief.additionalContext}</p>
        </OwnerSection>
      )}

      <p className="owner-review__note">
        <strong>{lang === "zh" ? "提示" : "Note"}</strong>
        {lang === "zh"
          ? "：RepairScope 未有獨立確認成因或責任。實際情況可能需要由師傅檢查。"
          : ": RepairScope has not independently confirmed the cause or responsibility. The actual condition may need to be inspected by a contractor."}
      </p>

      {brief.repairId && (
        // This is the client-side draft/journey identifier (see
        // domain/journey.ts's crypto.randomUUID()), not the backend-issued
        // case reference — that only exists once RepairSubmissionPanel's
        // submission actually succeeds, and is shown as "個案參考編號" /
        // "Case reference" on the confirmation screen
        // (RepairSubmissionPanel.tsx). Labelling this the same thing here
        // would let an owner mistake an in-progress draft id for a real,
        // submitted case reference.
        <p className="owner-review__ref">
          {lang === "zh" ? "草稿編號 " : "Draft reference "}
          {brief.repairId.toUpperCase()}
        </p>
      )}
    </div>
  );
}

function OwnerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="owner-review__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
