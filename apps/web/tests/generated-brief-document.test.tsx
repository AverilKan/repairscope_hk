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
  assert.ok(screen.getByText("Reported facts"));
  assert.ok(screen.getByText("Tap in the kitchen has been dripping for two weeks."));
  assert.ok(screen.getByText("What remains unconfirmed"));
  assert.ok(screen.getByText("Evidence supplied"));
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
  // Every section still renders with a safe fallback rather than crashing
  // or rendering an empty list.
  assert.ok(screen.getAllByText("Not recorded").length > 0);
  assert.ok(screen.getByText("No uploaded evidence"));
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
  assert.ok(screen.getByText(/No original report text was recorded for this submission\./));
  assert.equal(screen.queryByText("Intermittent bedroom ceiling water ingress"), null);
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
