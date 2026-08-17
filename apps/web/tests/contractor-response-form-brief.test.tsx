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
const { cleanup, render, screen } = await import("@testing-library/react");
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
