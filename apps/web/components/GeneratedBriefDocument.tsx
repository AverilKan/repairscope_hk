"use client";

import { questionnaireByCategory, resolveAnswerLabel } from "@/data/questionnaires";
import type { RepairCategoryId } from "@/domain/types";
import { useLanguage } from "./LanguageContext";

// The single, shared rendering of a generated repair brief — used by the
// landlord's "Check the facts" review screen (LandlordApp.tsx) and the
// operator submission detail screen (OperatorSubmissionReview.tsx). There
// is deliberately no separate operator-specific brief view: an operator
// should see exactly what the landlord saw.
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
  priorAction?: { status?: string; detail?: string };
  buildingContext?: { managementContacted?: string; sharedAreaInvolved?: string };
  propertyLine?: string;
  relationship?: string;
  additionalContext?: string;
  hasEvidence?: string;
  evidenceKind?: string;
};

export function GeneratedBriefDocument({
  brief,
  bare = false,
}: {
  brief: GeneratedBriefLike | null | undefined;
  /**
   * The landlord "Check the facts" screen wraps this in its own
   * `.brief-document` section alongside the correction form, so it renders
   * bare (no outer div) there to avoid a duplicate/nested `.brief-document`.
   * The operator detail screen has no such wrapper, so it uses the default.
   */
  bare?: boolean;
}) {
  const { lang, t } = useLanguage();

  if (!brief) {
    const empty = (
      <>
        <p className="eyebrow">RepairScope neutral brief</p>
        <p>{lang === "zh" ? "呢個個案未有維修簡報。" : "No brief is available for this submission."}</p>
      </>
    );
    return bare ? empty : <div className="brief-document">{empty}</div>;
  }

  const category =
    brief.category && brief.category in questionnaireByCategory
      ? (brief.category as RepairCategoryId)
      : undefined;
  const categoryLabel = category ? t(questionnaireByCategory[category].label) : (lang === "zh" ? "維修簡報" : "Repair brief");
  const resolve = (fieldId: string, value: string | undefined) =>
    category ? resolveAnswerLabel(category, fieldId, value, lang) : (value || (lang === "zh" ? "未提供" : "Not specified"));

  const evidenceItems = Array.isArray(brief.evidence)
    ? brief.evidence.map((item) => item?.name).filter((name): name is string => Boolean(name))
    : [];
  const evidenceRows: string[] =
    evidenceItems.length > 0
      ? evidenceItems
      : brief.hasEvidence === "yes"
        ? [
            `${lang === "zh" ? "業主表示有" : "Owner indicates"}: ${resolve("evidenceKind", brief.evidenceKind)}${
              lang === "zh" ? "（未上載，待人手跟進）" : " (not yet uploaded — RepairScope will follow up)"
            }`,
          ]
        : [lang === "zh" ? "未有已上載檔案" : "No uploaded evidence"];

  const content = (
    <>
      <div className="brief-document__masthead">
        <div>
          <p className="eyebrow">RepairScope neutral brief</p>
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
          {brief.originalReport?.trim() ||
            (lang === "zh" ? "呢個個案未有記錄原始描述。" : "No original report text was recorded for this submission.")}{" "}
          {lang === "zh"
            ? "RepairScope 未有獨立確認成因或責任。師傅應該講低自己嘅判斷、係咪需要檢查，同建議嘅工作範圍。"
            : "RepairScope has not independently confirmed the cause or responsibility. Contractors should state their own working diagnosis, whether inspection is required, and what their proposed work would address."}
        </p>
      </div>

      <div className="brief-grid">
        <BriefSection number="02" title={lang === "zh" ? "已知事實" : "Reported facts"} items={brief.reportedFacts} />
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
          items={[
            ...(brief.propertyLine ? [brief.propertyLine] : []),
            ...(brief.relationship ? [resolve("relationship", brief.relationship)] : []),
            ...(brief.accessOverview ? [brief.accessOverview] : []),
          ]}
        />
        <BriefSection number="06" title={lang === "zh" ? "已提供證據" : "Evidence supplied"} items={evidenceRows} />
        <BriefSection
          number="07"
          title={lang === "zh" ? "補充資料" : "Additional information"}
          items={brief.additionalContext ? [brief.additionalContext] : undefined}
        />
        <BriefSection
          number="08"
          title={lang === "zh" ? "仍未確認" : "What remains unconfirmed"}
          items={brief.confirmedUnknowns}
          tone="unknown"
        />
        <BriefSection
          number="09"
          title={lang === "zh" ? "師傅需要提供" : "What contractors must provide"}
          items={brief.contractorRequests}
          wide
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
}: {
  number: string;
  title: string;
  items: string[] | undefined;
  tone?: "unknown";
  wide?: boolean;
}) {
  const { lang } = useLanguage();
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
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
          <li>{lang === "zh" ? "未有記錄" : "Not recorded"}</li>
        )}
      </ul>
    </section>
  );
}
