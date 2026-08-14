import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

// GeneratedBriefDocument is the single shared rendering of a generated
// repair brief used by both the landlord "Check the facts" screen and the
// operator submission detail screen (components/OperatorSubmissionReview.tsx)
// — there is deliberately no second, operator-specific representation.
// Rendered here with no LanguageProvider in the tree, so it uses the
// default (English) language context — see components/LanguageContext.tsx.

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://repairscope.test/",
});
const globalRecord = globalThis as unknown as Record<string, unknown>;
globalRecord.window = dom.window;
globalRecord.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
globalRecord.HTMLElement = dom.window.HTMLElement;
globalRecord.getComputedStyle = dom.window.getComputedStyle;

const React = await import("react");
const { cleanup, render, screen } = await import("@testing-library/react");
const { GeneratedBriefDocument } = await import(
  "../components/GeneratedBriefDocument"
);
const { buildRepairBrief } = await import("../domain/brief");
const { LanguageProvider } = await import("../components/LanguageContext");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const fullBrief = {
  repairId: "repair-plumbing",
  category: "plumbing",
  originalReport: "Tap in the kitchen has been dripping for two weeks.",
  reportedFacts: ["Tap in the kitchen has been dripping for two weeks."],
  confirmedUnknowns: ["RepairScope has not independently confirmed the cause or responsibility."],
  evidence: [{ name: "kitchen-tap.jpg" }],
  accessOverview: "Weekday evenings after 7pm.",
  contractorRequests: ["State a working diagnosis and confidence."],
};

test("renders every labelled section from real brief data", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: fullBrief }));
  assert.ok(screen.getByText("Reported / observed facts"));
  assert.ok(screen.getByText("Tap in the kitchen has been dripping for two weeks."));
  assert.ok(screen.getByText("What remains unconfirmed"));
  assert.ok(screen.getByText("Evidence you have"));
  assert.ok(screen.getByText("kitchen-tap.jpg"));
  assert.ok(screen.getByText("Weekday evenings after 7pm."));
  assert.ok(screen.getByText("What contractors must provide"));
  assert.ok(screen.getByText("REPAIR-PLUMBING"));
});

test("a brief with only some fields populated (as real staging data has) does not crash", () => {
  render(
    React.createElement(GeneratedBriefDocument, {
      brief: { reportedFacts: ["Kitchen tap leaking heavily, floor is wet."] },
    }),
  );
  assert.ok(screen.getByText("Kitchen tap leaking heavily, floor is wet."));
  // Sections that always show (observed facts, property/access, unconfirmed,
  // contractor requests) still render with a safe fallback rather than
  // crashing or rendering an empty list; sections with no underlying answer
  // at all (e.g. evidence, when hasEvidence was never answered) are omitted
  // entirely rather than padded with a placeholder.
  assert.ok(screen.getAllByText("Not recorded").length > 0);
  assert.equal(screen.queryByText("Evidence you have"), null);
});

test("a missing brief renders a fallback instead of crashing", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: null }));
  assert.ok(screen.getByText("No brief is available for this submission."));
});

// Regression coverage for a defect where the masthead heading and lead
// paragraph were a fixed "Intermittent bedroom ceiling water ingress…"
// scenario rendered for every submission regardless of category or actual
// report content (HK-A0 item A) — the headline is now derived from
// brief.category via data/questionnaires.ts, not a caller-supplied string.

test("headline is derived from the brief's own category, not a fixed scenario", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: fullBrief }));
  assert.ok(screen.getByText("Plumbing problem"));
  assert.equal(screen.queryByText("Intermittent bedroom ceiling water ingress"), null);
});

test("a plumbing case cannot show a ceiling-ingress headline and an electrical case cannot show a leak headline", () => {
  const { unmount: unmountPlumbing } = render(
    React.createElement(GeneratedBriefDocument, {
      brief: { ...fullBrief, category: "plumbing", originalReport: "Kitchen tap will not stop dripping." },
    }),
  );
  assert.ok(screen.getByText("Plumbing problem"));
  assert.equal(screen.queryByText(/ceiling/i), null);
  unmountPlumbing();
  cleanup();

  render(
    React.createElement(GeneratedBriefDocument, {
      brief: { ...fullBrief, category: "electrical", originalReport: "A socket in the lounge sparked." },
    }),
  );
  assert.ok(screen.getByText("Electrical / power problem"));
  assert.equal(screen.queryByText(/water ingress/i), null);
  assert.ok(screen.getByText(/A socket in the lounge sparked\./));
});

test("lead paragraph renders the actual original report text, not invented content", () => {
  render(
    React.createElement(GeneratedBriefDocument, {
      brief: { ...fullBrief, originalReport: "Bathroom extractor fan has stopped working entirely." },
    }),
  );
  assert.ok(screen.getByText(/Bathroom extractor fan has stopped working entirely\./));
});

test("disclaimer says RepairScope has not independently confirmed the cause — it does not claim no cause has ever been identified", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: fullBrief }));
  assert.ok(screen.getAllByText(/RepairScope has not independently confirmed the cause or responsibility\./).length > 0);
});

test("missing category and missing original report render safely, not the old fixed scenario", () => {
  render(
    React.createElement(GeneratedBriefDocument, {
      brief: { reportedFacts: ["Kitchen tap leaking heavily, floor is wet."] },
    }),
  );
  assert.ok(screen.getByText("Repair brief"));
  // No invented placeholder text stands in for a missing original report —
  // the lead paragraph shows only the fixed disclaimer sentence.
  assert.ok(
    screen.getByText(
      /RepairScope has not independently confirmed the cause or responsibility\./,
    ),
  );
  assert.equal(screen.queryByText("Intermittent bedroom ceiling water ingress"), null);
});

// Regression coverage for the CRITICAL data-loss defect (rework item 2):
// a fully answered standard-category ("leak") journey used to render an
// empty "Reported / observed facts" section because reportedFacts is
// intentionally empty for standard categories (see domain/brief.ts). This
// renders GeneratedBriefDocument against buildRepairBrief's real output —
// not a hand-authored fixture — and checks the resolved bilingual labels
// (never the raw stored codes) appear.
test("a fully answered standard-category journey shows its real observations, not an empty section", () => {
  const draft = {
    id: "draft-leak-render",
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: {
      affected: "ceiling",
      branchFirst: "rain",
      branchSecond: "mark",
      branchThird: "large",
      duration: "week",
      frequency: "occasional",
      worsening: "yes",
      district: "eastern",
    },
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const brief = buildRepairBrief(draft);

  render(React.createElement(GeneratedBriefDocument, { brief }));

  assert.equal(screen.queryByText("Not recorded"), null);
  // Resolved English labels for the raw stored codes, not the codes
  // themselves — each labelled with its own question/field text (rework
  // item 8: a bare "Yes"/value alone is ambiguous), so these are matched as
  // substrings of "Question: Answer" rather than exact standalone text.
  assert.ok(screen.getByText(/Ceiling/));
  assert.ok(screen.getByText(/During \/ after rain/));
  assert.ok(screen.getByText(/Water mark \/ damp patch/));
  assert.ok(screen.getByText(/A large area/));
  assert.ok(screen.getByText(/Within a week/));
  assert.ok(screen.getByText(/Occasionally/));
  assert.ok(screen.getByText(/Getting worse/));
  assert.equal(screen.queryByText("ceiling"), null);
  assert.equal(screen.queryByText("rain"), null);
});

// Regression coverage for rework item 3 (bilingual brief correctness):
// confirmedUnknowns/contractorRequests used to be pre-baked English
// sentences stored directly on the brief — buildRepairBrief now stores
// stable keys instead, resolved to the current language by
// resolveConfirmedUnknown/resolveContractorRequest at render time.
test("confirmedUnknowns and contractorRequests render in Chinese for the Chinese journey, not the stored English key", () => {
  const draft = {
    id: "draft-leak-zh",
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: { affected: "ceiling", district: "eastern" },
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const brief = buildRepairBrief(draft);

  render(
    React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief })),
  );

  assert.ok(screen.getByText("RepairScope 未有獨立確認成因或責任。"));
  assert.ok(screen.getByText("講低自己嘅判斷同信心程度。"));
  assert.equal(
    screen.queryByText("RepairScope has not independently confirmed the cause or responsibility."),
    null,
  );
  assert.equal(screen.queryByText("not-independently-confirmed"), null);
});

// Regression coverage: applyBriefCorrection stores the correction in
// landlordCorrections (raw text), and summariseObservedFacts must still
// surface it in "02 Reported / observed facts" even for a standard
// category with observedFacts already populated — otherwise a correction
// to a fully answered "leak" journey would silently vanish (it used to be
// appended to reportedFacts, which summariseObservedFacts only fell back to
// when observedFacts was empty).
test("a correction on a standard-category brief remains visible, with a localised label", () => {
  const draft = {
    id: "draft-leak-correction",
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: { affected: "ceiling", district: "eastern" },
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const generated = buildRepairBrief(draft);
  const corrected = { ...generated, landlordCorrections: ["Actually the wall, not the ceiling."] };

  render(React.createElement(GeneratedBriefDocument, { brief: corrected }));

  assert.ok(screen.getByText(/Ceiling/));
  assert.ok(screen.getByText(/Owner correction:.*Actually the wall, not the ceiling\./));
});

test("bare mode omits the outer .brief-document wrapper (for the landlord screen's own card)", () => {
  const { container: bareContainer } = render(
    React.createElement(GeneratedBriefDocument, { brief: fullBrief, bare: true }),
  );
  assert.equal(bareContainer.querySelector(".brief-document"), null);
  cleanup();

  const { container: wrappedContainer } = render(
    React.createElement(GeneratedBriefDocument, { brief: fullBrief }),
  );
  assert.ok(wrappedContainer.querySelector(".brief-document"));
});

// Coverage for the owner-review redesign (variant="owner") — a simplified,
// synthesised presentation of exactly the same ProblemBrief the operator
// sees via the default (operator) variant, not a second data source. See
// GeneratedBriefDocument's own comment on `variant` and OwnerBriefSummary.
test("owner variant: shows the owner-review heading, category and a synthesised situation, not the numbered report grid", () => {
  const draft = {
    id: "draft-leak-owner",
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: {
      affected: "window",
      branchFirst: "use",
      branchSecond: "drip",
      branchThird: "several",
      duration: "week",
      frequency: "occasional",
      worsening: "yes",
      district: "eastern",
    },
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const brief = buildRepairBrief(draft);

  const { container } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText("Repair summary"));
  assert.ok(screen.getByText("Please check that the information below is accurate. We’ll use the confirmed information for manual review."));
  assert.ok(screen.getByText("Water seepage / leakage"));
  // A synthesised sentence (affected + timeline), not a raw "Question: Answer" dump.
  assert.ok(screen.getByText(/Affected: Around a window\./));
  assert.ok(screen.getByText(/began within a week/));
  // The category-specific branch facts remain individually labelled rows
  // underneath (not fused into invented prose — see summariseSituation's
  // own comment on why).
  assert.ok(screen.getByText(/Dripping/));
  // No numbered report grid/masthead from the operator variant.
  assert.equal(screen.queryByText("RepairScope neutral brief"), null);
  assert.equal(container.querySelector(".brief-grid"), null);
  assert.equal(container.querySelector(".scope-mark"), null);
});

test("owner variant: labels every property/access value, and omits values that were never answered", () => {
  const brief = {
    ...fullBrief,
    category: "leak",
    propertyDetails: { district: "eastern", building: "Test Court", floor: "8", unit: "A" },
    relationship: "owner-occupier",
  };

  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText("District"));
  assert.ok(screen.getByText("Eastern"));
  assert.ok(screen.getByText("Building"));
  assert.ok(screen.getByText("Test Court"));
  assert.ok(screen.getByText("Floor"));
  assert.ok(screen.getByText("Unit"));
  assert.ok(screen.getByText("Relationship to property"));
  assert.ok(screen.getByText("Owner-occupier"));
  // block/availability/access-contact were never answered — no blank rows.
  assert.equal(screen.queryByText("Block"), null);
  assert.equal(screen.queryByText("Access contact"), null);
});

test("owner variant: the contractor-only \"What contractors must provide\" section is not shown", () => {
  const brief = { ...fullBrief, category: "leak", contractorRequests: ["state-diagnosis"] };
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.equal(screen.queryByText("What contractors must provide"), null);
  assert.equal(screen.queryByText("State a working diagnosis and confidence."), null);
});

test("owner variant: the uncertainty note appears exactly once, and there is no large top disclaimer banner or numbered \"What remains unconfirmed\" section", () => {
  const brief = { ...fullBrief, category: "leak" };
  const { container } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  const matches = screen.getAllByText(
    /RepairScope has not independently confirmed the cause or responsibility\./,
  );
  assert.equal(matches.length, 1);
  assert.equal(screen.queryByText("What remains unconfirmed"), null);
  assert.equal(container.querySelector(".brief-lead"), null);
});

test("owner variant: truthful evidence wording — never claims uploaded/received", () => {
  const brief = { ...fullBrief, category: "leak", hasEvidence: "yes", evidenceKind: "repair-media" };
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText(/has not been provided through the RepairScope website yet/));
  assert.equal(screen.queryByText(/uploaded/i), null);
  assert.equal(screen.queryByText(/received/i), null);
});

test("owner variant renders correctly in Chinese too", () => {
  const draft = {
    id: "draft-leak-owner-zh",
    category: "leak" as const,
    originalReport: "",
    extractedSymptoms: [],
    responses: { affected: "window", duration: "week", district: "eastern" },
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const brief = buildRepairBrief(draft);

  render(
    React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
  );

  assert.ok(screen.getByText("維修資料摘要"));
  assert.ok(screen.getByText("滲水／漏水"));
  assert.ok(screen.getByText(/涉及：窗邊。/));
  assert.equal(screen.queryByText("RepairScope 中立簡報"), null);
});
