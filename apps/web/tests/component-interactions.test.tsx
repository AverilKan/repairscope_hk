import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

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
dom.window.requestAnimationFrame = (callback: FrameRequestCallback) =>
  dom.window.setTimeout(() => callback(Date.now()), 0);
dom.window.cancelAnimationFrame = (id: number) =>
  dom.window.clearTimeout(id);
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
const { cleanup, fireEvent, render, screen, waitFor } = await import(
  "@testing-library/react"
);
const { ContractorTaskRouter } = await import(
  "../features/contractor-response/ContractorTaskRouter"
);
const { DecisionModal } = await import("../components/DecisionModal");
const { QuoteDecisionModal } = await import(
  "../components/ResponseDecisionModals"
);
const { defaultResponseBundle } = await import("../data/responseFixtures");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

test("opaque inspection task renders and contractor can propose another time", async () => {
  render(
    React.createElement(ContractorTaskRouter, {
      token: "inspection-confirmation-token",
    }),
  );
  await screen.findByRole("heading", { name: "Confirm the inspection" });
  fireEvent.click(
    screen.getByRole("button", { name: "Propose another time" }),
  );
  const input = screen.getByLabelText("Alternative attendance window");
  fireEvent.change(input, { target: { value: "Tuesday 10:00–13:00" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Send proposed time" }),
  );
  await screen.findByRole("heading", { name: "Another time proposed" });
  assert.match(
    screen.getByText(/landlord must accept/i).textContent ?? "",
    /accept/i,
  );
});

test("unknown opaque token renders a safe invalid-link state", async () => {
  render(
    React.createElement(ContractorTaskRouter, {
      token: "an-unknown-opaque-token",
    }),
  );
  await screen.findByRole("heading", {
    name: "This invitation link is not valid.",
  });
  assert.ok(screen.getByRole("link", { name: "Contact support" }));
});

test("decision modal traps the document and closes from the keyboard", async () => {
  let closed = 0;
  const view = render(
    <DecisionModal
      eyebrow="Private quote"
      footer={<button>Keep open</button>}
      onClose={() => {
        closed += 1;
      }}
      title="Keyboard test"
    >
      <p>Modal content</p>
    </DecisionModal>,
  );
  assert.equal(document.body.style.overflow, "hidden");
  assert.ok(screen.getByRole("dialog", { name: "Keyboard test" }));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(closed, 1);
  view.unmount();
  assert.equal(document.body.style.overflow, "");
});

test("quote detail remains a centred accessible modal at a mobile viewport", async () => {
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  const record = defaultResponseBundle.repairQuotes[0];
  render(
    React.createElement(QuoteDecisionModal, {
      bundle: defaultResponseBundle,
      record,
      quoteRecords: defaultResponseBundle.repairQuotes,
      onClose: () => undefined,
      onFollowUp: () => undefined,
      onSwitchQuote: () => undefined,
    }),
  );
  const dialog = screen.getByRole("dialog", {
    name: `${record.contractor.displayName} quote`,
  });
  assert.ok(dialog.classList.contains("decision-modal"));
  assert.ok(screen.getByRole("button", { name: "Proceed with this quote" }));
  await waitFor(() => {
    assert.equal(document.body.style.overflow, "hidden");
  });
});
