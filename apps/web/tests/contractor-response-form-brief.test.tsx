import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

// Regression coverage for ContractorResponseForm rendering a
// Stage1ContractorBrief built from an unknown/malformed issueCategory (see
// domain/stage1ContractorBrief.ts's category-validation hardening) — the
// form must render without crashing, never show the raw unknown category,
// and never leak a sensitive marker smuggled into issueCategory. Same
// jsdom/@testing-library/react harness as tests/component-interactions.test.tsx.

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
globalRecord.HTMLButtonElement = dom.window.HTMLButtonElement;
globalRecord.KeyboardEvent = dom.window.KeyboardEvent;
globalRecord.MouseEvent = dom.window.MouseEvent;
globalRecord.Event = dom.window.Event;
globalRecord.getComputedStyle = dom.window.getComputedStyle;
dom.window.requestAnimationFrame = (callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(Date.now()), 0);
dom.window.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
dom.window.matchMedia = () =>
  ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { ContractorResponseForm } = await import("../components/contractor/ContractorResponseForm");
const { buildStage1ContractorBrief } = await import("../domain/stage1ContractorBrief");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

test("ContractorResponseForm renders a normal valid Stage-1 brief cleanly", () => {
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "leak",
      generatedBrief: {
        category: "leak",
        observedFacts: { affected: "ceiling", duration: "today" },
        propertyDetails: { district: "wan-chai" },
      },
    },
    "en",
  );
  render(React.createElement(ContractorResponseForm, { brief }));
  assert.ok(screen.getByText("Water seepage / leakage"));
  assert.ok(screen.getByText("Wan Chai"));
});

test("ContractorResponseForm renders a Stage-1 brief built from an unknown category without crashing, never showing the raw category or a sensitive marker", () => {
  const brief = buildStage1ContractorBrief(
    {
      issueCategory: "SECRET_OWNER_EMAIL_jamie@example.com",
      generatedBrief: {
        category: "SECRET_OWNER_EMAIL_jamie@example.com",
        observedFacts: { affected: "ceiling", branchFirst: "rain", duration: "today" },
        priorAction: { status: "attempted" },
        propertyDetails: { district: "wan-chai" },
      },
    },
    "en",
  );

  assert.doesNotThrow(() => {
    render(React.createElement(ContractorResponseForm, { brief }));
  });

  const pageText = document.body.textContent ?? "";
  assert.ok(pageText.includes("Repair issue"));
  assert.ok(!pageText.includes("SECRET_OWNER_EMAIL_jamie@example.com"));
  assert.ok(!pageText.includes("jamie@example.com"));
  // The form's "What happens next?" decision buttons are still usable —
  // an unknown category degrades the brief content, not the form itself.
  assert.ok(screen.getByText("Interested"));
});

async function renderSubmittedOutcome(
  outcome: import("../domain/contractorRequestPublic").ContractorResponseSubmissionOutcome,
) {
  const brief = buildStage1ContractorBrief(
    { issueCategory: "leak", generatedBrief: { observedFacts: { affected: "ceiling" } } },
    "en",
  );
  render(React.createElement(ContractorResponseForm, {
    brief,
    submission: { submit: async () => outcome },
  }));
  fireEvent.click(screen.getByText("Interested"));
  fireEvent.click(screen.getByText("Continue"));
  fireEvent.click(screen.getByText("Submit response"));
  await waitFor(() => assert.ok(document.body.textContent?.includes("SimpleFix") || document.body.textContent));
}

test("responded reconciliation is the only 409 outcome shown as already submitted", async () => {
  await renderSubmittedOutcome("already-responded");
  await screen.findByText("You've already submitted a response for this request. Thank you.");
});

for (const [outcome, expected] of [
  ["revoked", "This request was revoked before SimpleFix recorded your response. Ask for a new link."],
  ["expired", "This request expired before SimpleFix recorded your response. Ask for a new link."],
  ["open-conflict", "SimpleFix could not accept this response. Please try again."],
  ["reconciliation-failed", "We couldn't confirm whether SimpleFix recorded your response. Please try again."],
] as const) {
  test(`${outcome} does not render success-like persistence copy`, async () => {
    await renderSubmittedOutcome(outcome);
    await screen.findByText(expected);
    assert.ok(!document.body.textContent?.includes("You've already submitted"));
    assert.ok(!document.body.textContent?.includes("Response submitted. Thank you."));
  });
}
