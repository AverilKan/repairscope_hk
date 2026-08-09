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
  reportedFacts?: string[];
  confirmedUnknowns?: string[];
  evidence?: { name?: string }[];
  accessOverview?: string;
  contractorRequests?: string[];
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
  if (!brief) {
    const empty = (
      <>
        <p className="eyebrow">RepairScope neutral brief</p>
        <p>No brief is available for this submission.</p>
      </>
    );
    return bare ? empty : <div className="brief-document">{empty}</div>;
  }

  const evidenceItems = Array.isArray(brief.evidence)
    ? brief.evidence
        .map((item) => item?.name)
        .filter((name): name is string => Boolean(name))
    : [];

  const content = (
    <>
      <div className="brief-document__masthead">
        <div>
          <p className="eyebrow">RepairScope neutral brief</p>
          <h2>Intermittent bedroom ceiling water ingress</h2>
        </div>
        <div className="brief-ref">
          <span>Repair</span>
          <strong>{(brief.repairId ?? "unknown").toUpperCase()}</strong>
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
        <BriefSection
          number="02"
          title="Reported facts"
          items={brief.reportedFacts}
        />
        <BriefSection
          number="03"
          title="Confirmed unknowns"
          items={brief.confirmedUnknowns}
          tone="unknown"
        />
        <BriefSection
          number="04"
          title="Evidence being shared"
          items={evidenceItems.length ? evidenceItems : ["No files added"]}
        />
        <BriefSection
          number="05"
          title="Access overview"
          items={brief.accessOverview ? [brief.accessOverview] : undefined}
        />
        <BriefSection
          number="06"
          title="What contractors must provide"
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
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
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
        {list.length > 0 ? (
          list.map((item) => <li key={item}>{item}</li>)
        ) : (
          <li>Not recorded</li>
        )}
      </ul>
    </section>
  );
}
