import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

// GeneratedBriefDocument is the single shared rendering of a generated
// repair brief used by both the landlord "Check the facts" screen and the
// operator submission detail screen (components/operator/OperatorCaseWorkspace.tsx)
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
// labelled-facts presentation of exactly the same ProblemBrief the operator
// sees via the default (operator) variant, not a second data source. See
// GeneratedBriefDocument's own comment on `variant` and OwnerBriefSummary.
//
// There is deliberately no generated prose "situation" sentence — see
// OwnerBriefSummary's own comment for why a fixed sentence template around
// arbitrary option values (e.g. affected="unsure", or a category where
// `affected` is a type/component/device rather than an "area") cannot be
// made grammatically safe across every category and every valid answer.
// The tests below assert the COMPLETE rendered row text (not a substring
// fragment) precisely because a previous, fragment-only assertion style let
// broken sentences like "It began more than a month, happens constant,
// condition is not getting worse" pass review undetected.
function draftFor(category: string, responses: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    id: `draft-${category}-${JSON.stringify(responses)}`,
    category,
    originalReport: "",
    extractedSymptoms: [],
    responses,
    safetyAcknowledgements: [],
    status: "draft" as const,
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

test("owner variant: shows the owner-review heading and category, not the numbered report grid", () => {
  const draft = draftFor("leak", {
    affected: "window", branchFirst: "use", branchSecond: "drip", branchThird: "several",
    duration: "week", frequency: "occasional", worsening: "yes", district: "eastern",
  });
  const brief = buildRepairBrief(draft as never);

  const { container } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText("Repair summary"));
  assert.ok(screen.getByText("Please check that the information below is accurate. We’ll use the confirmed information for manual review."));
  assert.ok(screen.getByText("Water seepage / leakage"));
  // No numbered report grid/masthead from the operator variant, and no
  // generated prose sentence above the labelled facts.
  assert.equal(screen.queryByText("RepairScope neutral brief"), null);
  assert.equal(container.querySelector(".brief-grid"), null);
  assert.equal(container.querySelector(".scope-mark"), null);
  assert.equal(container.querySelector(".owner-review__situation"), null);
});

// Section 12: exact complete rendered output for every duration/frequency/
// worsening option, in both languages — not a substring assertion. Each
// fact is its own labelled row (domain/brief.ts's CONCISE_TIMELINE_LABELS),
// never fused into a sentence.
test("owner variant: duration renders as its own complete labelled row for every option, zh and en", () => {
  const cases: [string, string, string][] = [
    ["today", "開始時間：今日", "Started: Today"],
    ["week", "開始時間：一星期內", "Started: Within a week"],
    ["month", "開始時間：一個月內", "Started: Within a month"],
    ["longer", "開始時間：超過一個月", "Started: More than a month"],
    ["unsure", "開始時間：唔肯定", "Started: Not sure"],
  ];
  for (const [value, zhExpected, enExpected] of cases) {
    const brief = buildRepairBrief(draftFor("leak", { duration: value, district: "eastern" }) as never);
    const { unmount: unmountEn } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
    assert.ok(screen.getByText(enExpected), `en duration=${value}`);
    unmountEn();
    cleanup();
    const { unmount: unmountZh } = render(
      React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
    );
    assert.ok(screen.getByText(zhExpected), `zh duration=${value}`);
    unmountZh();
    cleanup();
  }
});

test("owner variant: frequency renders as its own complete labelled row for every option, zh and en", () => {
  const cases: [string, string, string][] = [
    ["once", "出現頻率：只見過一次", "Frequency: Seen once"],
    ["occasional", "出現頻率：間中", "Frequency: Occasionally"],
    ["daily", "出現頻率：每日", "Frequency: Daily"],
    ["constant", "出現頻率：持續", "Frequency: Constant"],
    ["unsure", "出現頻率：唔肯定", "Frequency: Not sure"],
  ];
  for (const [value, zhExpected, enExpected] of cases) {
    const brief = buildRepairBrief(draftFor("leak", { frequency: value, district: "eastern" }) as never);
    const { unmount: unmountEn } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
    assert.ok(screen.getByText(enExpected), `en frequency=${value}`);
    unmountEn();
    cleanup();
    const { unmount: unmountZh } = render(
      React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
    );
    assert.ok(screen.getByText(zhExpected), `zh frequency=${value}`);
    unmountZh();
    cleanup();
  }
});

test("owner variant: worsening renders as its own complete labelled row for every option, zh and en", () => {
  const cases: [string, string, string][] = [
    ["yes", "情況變化：有惡化", "Change over time: Getting worse"],
    ["no", "情況變化：冇惡化", "Change over time: Not getting worse"],
    ["same", "情況變化：差唔多", "Change over time: About the same"],
    ["unsure", "情況變化：唔肯定", "Change over time: Not sure"],
  ];
  for (const [value, zhExpected, enExpected] of cases) {
    const brief = buildRepairBrief(draftFor("leak", { worsening: value, district: "eastern" }) as never);
    const { unmount: unmountEn } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
    assert.ok(screen.getByText(enExpected), `en worsening=${value}`);
    unmountEn();
    cleanup();
    const { unmount: unmountZh } = render(
      React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
    );
    assert.ok(screen.getByText(zhExpected), `zh worsening=${value}`);
    unmountZh();
    cleanup();
  }
});

test("owner variant: affected=unsure never produces a broken sentence — renders as a plain labelled row", () => {
  const brief = buildRepairBrief(draftFor("leak", { affected: "unsure", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("Affected area: Not sure"));
  // The exact broken constructions Codex found must never appear.
  assert.equal(screen.queryByText(/Not sure is the affected area/), null);
  assert.equal(screen.queryByText(/唔肯定出現問題/), null);
});

test("owner variant: air-conditioning affected=split renders as a plain labelled row, not claimed to be an \"area\"", () => {
  const brief = buildRepairBrief(draftFor("aircon", { affected: "split", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("Air conditioner type: Split type"));
  assert.equal(screen.queryByText(/Split type is the affected area/), null);
});

// Section 3: Other/Unsure must not lose duration/frequency/worsening —
// buildRepairBrief now populates observedFacts for every category (see its
// own comment), not only non-open ones.
test("owner variant: Other preserves the open description AND duration/frequency/worsening, all visible together", () => {
  const draft = draftFor("other", {
    otherDetail: "Balcony drain cover is loose and rattles in wind.",
    duration: "month", frequency: "constant", worsening: "no", district: "north",
  });
  const brief = buildRepairBrief(draft as never);

  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText("Balcony drain cover is loose and rattles in wind."));
  assert.ok(screen.getByText("Started: Within a month"));
  assert.ok(screen.getByText("Frequency: Constant"));
  assert.ok(screen.getByText("Change over time: Not getting worse"));
  // No affected/branch rows — other/unsure never has them.
  assert.equal(screen.queryByText(/^Affected/), null);
});

test("owner variant: Unsure preserves duration/frequency/worsening the same way as Other", () => {
  const draft = draftFor("unsure", {
    otherDetail: "Not sure what's causing the smell in the kitchen.",
    duration: "today", frequency: "once", worsening: "unsure", district: "eastern",
  });
  const brief = buildRepairBrief(draft as never);

  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));

  assert.ok(screen.getByText("Not sure what's causing the smell in the kitchen."));
  assert.ok(screen.getByText("Started: Today"));
  assert.ok(screen.getByText("Frequency: Seen once"));
  assert.ok(screen.getByText("Change over time: Not sure"));
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

test("owner variant: evidence=yes shows the exact truthful wording plus the captured type — never claims uploaded/received", () => {
  const withKind = { ...fullBrief, category: "leak", hasEvidence: "yes", evidenceKind: "repair-media" };
  const { unmount } = render(React.createElement(GeneratedBriefDocument, { brief: withKind, variant: "owner" }));
  assert.ok(screen.getByText("You indicated you have the following, but it has not been provided through the RepairScope website yet:"));
  assert.ok(screen.getByText("Repair photo / video"));
  assert.equal(screen.queryByText(/uploaded/i), null);
  assert.equal(screen.queryByText(/\breceived\b/i), null);
  unmount();
  cleanup();

  const withoutKind = { ...fullBrief, category: "leak", hasEvidence: "yes", evidenceKind: undefined };
  render(React.createElement(GeneratedBriefDocument, { brief: withoutKind, variant: "owner" }));
  assert.ok(screen.getByText("You indicated you have relevant information, but it has not been provided through the RepairScope website yet."));
});

// Section 4: evidence=no was previously omitted entirely.
test("owner variant: evidence=no is rendered explicitly, not silently omitted", () => {
  const brief = { ...fullBrief, category: "leak", hasEvidence: "no" };
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("Available information"));
  assert.ok(screen.getByText("No related photos, videos, reports or quotations are currently available."));
});

test("owner variant: evidence=no in Chinese", () => {
  const brief = { ...fullBrief, category: "leak", hasEvidence: "no" };
  render(
    React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
  );
  assert.ok(screen.getByText("目前未有相關相片、影片、報告或報價資料。"));
});

test("owner variant: previous-action detail is labelled concisely (\"What they said\"), not with the raw questionnaire question", () => {
  const draft = draftFor("leak", {
    affected: "window", duration: "week", district: "eastern", prior: "quote", priorDetail: "Plumber quoted $500",
  });
  render(React.createElement(GeneratedBriefDocument, { brief: buildRepairBrief(draft as never), variant: "owner" }));
  assert.ok(screen.getByText("What they said: Plumber quoted $500"));
  assert.equal(screen.queryByText(/What were you told/), null);
});

// Section 5: prior action = no ("冇") must not render as "Previous action: No".
test("owner variant: prior action \"no\" renders as a plain semantic statement, not \"Previous action: No\"", () => {
  const brief = { ...fullBrief, category: "leak", priorAction: { status: "no" } };
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("No previous action"));
  assert.equal(screen.queryByText("Previous action: No"), null);
  assert.equal(screen.queryByText(/^Previous action:/), null);
});

test("owner variant: prior action \"no\" in Chinese renders as 未有之前處理, not 之前曾經處理：冇", () => {
  const brief = { ...fullBrief, category: "leak", priorAction: { status: "no" } };
  render(
    React.createElement(LanguageProvider, null, React.createElement(GeneratedBriefDocument, { brief, variant: "owner" })),
  );
  assert.ok(screen.getByText("未有之前處理"));
  assert.equal(screen.queryByText("之前曾經處理：冇"), null);
});

test("owner variant: prior action = quotation received keeps its specific meaning, not reduced to yes/no", () => {
  const brief = { ...fullBrief, category: "leak", priorAction: { status: "quote" } };
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("Previous action: Quotation received"));
});

// Section 7: door/window branchThird ("Did it happen suddenly or gradually?")
// had a vague concise label ("How it appeared") — now "Onset".
test("owner variant: door/window onset label reads \"Onset\", not the vague \"How it appeared\"", () => {
  const brief = buildRepairBrief(draftFor("door-window", { branchThird: "sudden", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  assert.ok(screen.getByText("Onset: Suddenly"));
  assert.equal(screen.queryByText(/How it appeared/), null);
});

test("owner variant: additional context is shown only when actually entered", () => {
  const withContext = {
    ...fullBrief, category: "leak", additionalContext: "The neighbour upstairs mentioned a similar issue last year.",
  };
  const { unmount } = render(React.createElement(GeneratedBriefDocument, { brief: withContext, variant: "owner" }));
  assert.ok(screen.getByText("Additional information"));
  assert.ok(screen.getByText("The neighbour upstairs mentioned a similar issue last year."));
  unmount();
  cleanup();

  const withoutContext = { ...fullBrief, category: "leak", additionalContext: undefined };
  render(React.createElement(GeneratedBriefDocument, { brief: withoutContext, variant: "owner" }));
  assert.equal(screen.queryByText("Additional information"), null);
});

test("owner variant: the pre-submission identifier is labelled \"Draft reference\", never \"Case reference\"", () => {
  const brief = { ...fullBrief, category: "leak", repairId: "draft-abc-123" };
  const { container } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  const ref = container.querySelector(".owner-review__ref");
  assert.ok(ref);
  assert.match(ref!.textContent ?? "", /Draft reference/);
  assert.match(ref!.textContent ?? "", /DRAFT-ABC-123/);
  assert.doesNotMatch(ref!.textContent ?? "", /Case reference/);
  assert.equal(screen.queryByText(/Case reference/), null);
});

test("owner variant: never renders a raw questionnaire question (？： or ?:) — uses concise summary labels instead, across every category with branch questions", () => {
  const categories = ["leak", "drainage", "plumbing", "electrical", "aircon", "door-window", "surface", "bathroom"] as const;
  for (const category of categories) {
    const draft = draftFor(category, {
      affected: "unsure", branchFirst: "unsure", branchSecond: "unsure", branchThird: "unsure",
      duration: "week", frequency: "occasional", worsening: "yes", district: "eastern",
    });
    const brief = buildRepairBrief(draft as never);
    const { container, unmount } = render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
    const text = container.textContent ?? "";
    assert.doesNotMatch(text, /？：/, `${category}: found ？： in owner review`);
    assert.doesNotMatch(text, /\?:/, `${category}: found ?: in owner review`);
    unmount();
    cleanup();
  }
});

test("owner variant: category-specific branch facts use their own concise label, not a shared generic one where the schema distinguishes them", () => {
  const leakBrief = buildRepairBrief(draftFor("leak", { affected: "window", branchThird: "several", duration: "week", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief: leakBrief, variant: "owner" }));
  assert.ok(screen.getByText("Extent: Several areas"));
  cleanup();

  const plumbingBrief = buildRepairBrief(draftFor("plumbing", { affected: "kitchen", branchThird: "no", duration: "week", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief: plumbingBrief, variant: "owner" }));
  assert.ok(screen.getByText("Can water be isolated: No / cannot control it"));
  cleanup();

  // And the Chinese equivalent, to confirm the concise labels aren't
  // English-only fallbacks.
  render(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(GeneratedBriefDocument, { brief: leakBrief, variant: "owner" }),
    ),
  );
  assert.ok(screen.getByText("影響範圍：幾個位置"));
});

// Section 8: the affected value must never appear twice (a generated
// opener sentence repeating the labelled row below it). There is no opener
// at all now, so this is trivially satisfied — asserted directly rather
// than assumed.
test("owner variant: the affected value appears exactly once, not duplicated by an opener sentence", () => {
  const brief = buildRepairBrief(draftFor("leak", { affected: "window", district: "eastern" }) as never);
  render(React.createElement(GeneratedBriefDocument, { brief, variant: "owner" }));
  const matches = screen.getAllByText(/Around a window/);
  assert.equal(matches.length, 1);
});

test("operator variant is unaffected: still uses question-style labels", () => {
  const draft = draftFor("leak", {
    affected: "window", duration: "week", frequency: "occasional", worsening: "yes", district: "eastern",
  });
  render(React.createElement(GeneratedBriefDocument, { brief: buildRepairBrief(draft as never) }));
  assert.ok(screen.getByText(/When did it begin\?: Within a week/));
  assert.ok(screen.getByText(/How often\?: Occasionally/));
});

// Section 13: the post-submission confirmation screen shares
// summariseObservedFacts with the owner review — verify Other/Unsure's
// timeline survives there too (RepairSubmissionPanel.tsx never calls
// GeneratedBriefDocument directly, so this exercises the same underlying
// function the confirmation screen renders from).
test("confirmation-screen data source: Other/Unsure's duration/frequency/worsening are present in summariseObservedFacts's own output, not just the owner-review rendering", async () => {
  const { summariseObservedFacts } = await import("../domain/brief");
  const draft = draftFor("other", {
    otherDetail: "Balcony drain cover is loose.",
    duration: "week", frequency: "once", worsening: "yes", district: "north",
  });
  const brief = buildRepairBrief(draft as never);
  const rows = summariseObservedFacts(brief, "en");
  assert.ok(rows.includes("Balcony drain cover is loose."));
  assert.ok(rows.some((r) => r.includes("Within a week")));
  assert.ok(rows.some((r) => r.includes("Seen once")));
  assert.ok(rows.some((r) => r.includes("Getting worse")));
});
