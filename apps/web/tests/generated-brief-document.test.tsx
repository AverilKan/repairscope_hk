import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

// GeneratedBriefDocument is the single shared rendering of a generated
// repair brief used by both the landlord "Check the facts" screen and the
// operator submission detail screen (components/OperatorSubmissionReview.tsx)
// — there is deliberately no second, operator-specific representation.

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
  repairId: "repair-plumbing-leak",
  reportedFacts: ["Tap in the kitchen has been dripping for two weeks."],
  confirmedUnknowns: ["The technical cause has not been confirmed."],
  evidence: [{ name: "kitchen-tap.jpg" }],
  accessOverview: "Landlord will arrange access.",
  contractorRequests: ["State a working diagnosis and confidence."],
};

test("renders every labelled section from real brief data", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: fullBrief }));
  assert.ok(screen.getByText("Reported facts"));
  assert.ok(
    screen.getByText("Tap in the kitchen has been dripping for two weeks."),
  );
  assert.ok(screen.getByText("Confirmed unknowns"));
  assert.ok(screen.getByText("Evidence being shared"));
  assert.ok(screen.getByText("kitchen-tap.jpg"));
  assert.ok(screen.getByText("Access overview"));
  assert.ok(screen.getByText("Landlord will arrange access."));
  assert.ok(screen.getByText("What contractors must provide"));
  assert.ok(screen.getByText("REPAIR-PLUMBING-LEAK"));
});

test("a brief with only some fields populated (as real staging data has) does not crash", () => {
  render(
    React.createElement(GeneratedBriefDocument, {
      brief: { reportedFacts: ["Kitchen tap leaking heavily, floor is wet."] },
    }),
  );
  assert.ok(
    screen.getByText("Kitchen tap leaking heavily, floor is wet."),
  );
  // Every section still renders with a safe fallback rather than crashing
  // or rendering an empty list.
  assert.equal(screen.getAllByText("Not recorded").length, 3);
  assert.ok(screen.getByText("No files added"));
});

test("a missing brief renders a fallback instead of crashing", () => {
  render(React.createElement(GeneratedBriefDocument, { brief: null }));
  assert.ok(screen.getByText("No brief is available for this submission."));
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
