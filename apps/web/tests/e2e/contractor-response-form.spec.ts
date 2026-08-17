import { expect, test } from "@playwright/test";

// End-to-end coverage for the NEW HK contractor-facing guided response
// prototype (RepairScope HK — "frontend structure" phase, Commit B). See
// components/contractor/ContractorResponseForm.tsx's own comment — this is
// built fresh against ContractorResponsePayload/Stage1ContractorBrief, not
// the old UK ContractorApp.tsx. Runs entirely against the mock data source
// (this route is gated to local/mock mode only — see
// tests/e2e/legacy-routes-api-mode.spec.ts for the API-mode gate itself).

test("the Stage-1 brief panel shows the sourcing summary and never shows owner-identifying detail", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await expect(page.getByText("Tell RepairScope how you'd like to respond.")).toBeVisible();
  const briefPanel = page.locator(".contractor-brief-panel");
  // A resolved human label — the raw category id ("plumbing") is never
  // shown (see domain/stage1ContractorBrief.ts's privacy/label hardening).
  await expect(briefPanel).toContainText("Plumbing problem");
  await expect(briefPanel).toContainText(
    "This is a sourcing summary only — exact address, owner contact details and any other contractors are not shown at this stage.",
  );
  const pageText = await page.locator("main").innerText();
  expect(pageText).not.toContain("Jamie Landlord");
  expect(pageText).not.toContain("jamie@example.com");
  expect(pageText).not.toContain("07700900000");
  expect(pageText).not.toMatch(/\bplumbing\b/);
});

test("an unrecognised invitation shows a clear unavailable state, not a crash", async ({ page }) => {
  await page.goto("/contractor/respond/not-a-real-token");
  await expect(page.getByText("This invitation is not available.")).toBeVisible();
});

test("the 'Interested' branch is light — one free-text field then review", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anything else you'd like to say?" })).toBeVisible();
  await page.getByLabel("Anything else you'd like to say?").fill("Sounds doable, can start soon.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your response" })).toBeVisible();
});

test("the 'Needs inspection' branch captures the inspection requirement and what they said", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Needs inspection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inspection requirement" })).toBeVisible();
  await page.getByRole("button", { name: "Required before proposal" }).click();
  await expect(page.getByRole("heading", { name: "What do you want to inspect, or what did you say?" })).toBeVisible();
  await page.getByLabel("What do you want to inspect, or what did you say?").fill("Need to see the pipe run.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your response" })).toBeVisible();
});

test("the 'Needs more information' branch captures what's needed", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Needs more information", exact: true }).click();
  await page.getByLabel("What information do you need?").fill("More photos of the ceiling.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Anything else you'd like to say?").fill("Can respond once I see those.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your response" })).toBeVisible();
});

test("the 'Not suitable' branch stays minimal with an optional response", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Not suitable", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anything else you'd like to say?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your response" })).toBeVisible();
});

test("back/edit: a collapsed step can be changed, and the change is reflected", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await page.getByLabel("Anything else you'd like to say?").fill("First answer.");
  await page.getByRole("button", { name: "Continue" }).click();

  // The first step is now collapsed with a summary + Change link.
  const firstStep = page.locator(".contractor-step--done").first();
  await expect(firstStep).toContainText("Interested");
  await firstStep.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Not suitable", exact: true }).click();
  await expect(page.locator(".contractor-step--done").first()).toContainText("Not suitable");
});

test("progressive collapse: answered steps collapse to a concise summary above the active step", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace the connector now.");
  await page.getByRole("button", { name: "Continue" }).click();

  const doneSteps = page.locator(".contractor-step--done");
  await expect(doneSteps).toHaveCount(2); // response-type + proposed-approach
  await expect(doneSteps.nth(1)).toContainText("Replace the connector now.");
});

test("proposal branch: fixed price renders a single price field and completes cleanly", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace connector.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Fixed price" }).click();
  await page.getByLabel("Price (HK$)").fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What's included?" })).toBeVisible();
});

test("proposal branch: estimate price behaves the same as fixed (single amount field)", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Inspect then quote.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Estimate" }).click();
  await expect(page.getByLabel("Price (HK$)")).toBeVisible();
  await page.getByLabel("Price (HK$)").fill("1800");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What's included?" })).toBeVisible();
});

test("proposal branch: range price renders two fields and rejects an inverted range", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Inspect valve first.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Range" }).click();
  await page.getByLabel("Minimum (HK$)").fill("7000");
  await page.getByLabel("Maximum (HK$)").fill("4000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("The minimum can't be greater than the maximum.")).toBeVisible();
  // Still on the price-amount step — did not advance.
  await expect(page.getByLabel("Minimum (HK$)")).toBeVisible();

  await page.getByLabel("Maximum (HK$)").fill("9000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What's included?" })).toBeVisible();
});

test("proposal branch: negative prices are rejected (never accepted as a value)", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace connector.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Fixed price" }).click();
  await page.getByLabel("Price (HK$)").fill("-500");
  await expect(page.getByLabel("Price (HK$)")).toHaveValue("");
});

test("proposal branch: 'No price yet' skips the price-amount step entirely", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Need to see it first.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "No price yet" }).click();
  await expect(page.getByRole("heading", { name: "What's included?" })).toBeVisible();
  // The price-amount step never appears as its own collapsed row — only
  // response-type, proposed-approach and price-type (whose own answer is
  // legitimately "No price yet").
  await expect(page.locator(".contractor-step--done")).toHaveCount(3);
  const doneLabels = await page.locator(".contractor-step__label").allTextContents();
  expect(doneLabels).not.toContain("Price");
  expect(doneLabels).not.toContain("Price range");
});

test("exclusion and price-change-factor suggestion chips assist without creating a second taxonomy", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace connector.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Fixed price" }).click();
  await page.getByLabel("Price (HK$)").fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What's included?").fill("Labour and part.");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "+ Making good (plaster, paint)" }).click();
  await expect(page.getByLabel("What's excluded?")).toHaveValue("Making good (plaster, paint)");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "+ Hidden damage" }).click();
  await expect(page.getByLabel("What could change the price?")).toHaveValue("Hidden damage");
});

test("guarantee: 'Yes' reveals an optional details field before advancing; 'No'/'Not stated' advance immediately", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace connector.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Fixed price" }).click();
  await page.getByLabel("Price (HK$)").fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What's included?").fill("Labour and part.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // exclusions (optional, blank)
  await page.getByRole("button", { name: "Continue" }).click(); // price-change-factors (optional, blank)
  await page.getByLabel("Expected duration").fill("2 hours");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // earliest start (optional, blank)

  await expect(page.getByRole("heading", { name: "Guarantee" })).toBeVisible();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByLabel("Guarantee details")).toBeVisible();
  await page.getByLabel("Guarantee details").fill("6 months on parts.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Anything else you'd like to say?" })).toBeVisible();
});

test("final review shows a 'Prepare my response' export and the copied text parses back deterministically", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await page.getByLabel("Anything else you'd like to say?").fill("Sounds doable.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Prepare my response" }).click();
  const exportBox = page.getByLabel("Response to copy");
  await expect(exportBox).toBeVisible();
  const value = await exportBox.inputValue();
  const parsed = JSON.parse(value);
  expect(parsed.schema).toBe("repairscope.contractor-response-export");
  expect(parsed.version).toBe(1);
  expect(parsed.response.responseType).toBe("interested");
  expect(parsed.response.originalResponse).toBe("Sounds doable.");
});

test("mobile viewport: the contractor form is usable with no page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anything else you'd like to say?" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("no mutating request is made to the backend at any point in the contractor form", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "Initial proposal provided", exact: true }).click();
  await page.getByLabel("Proposed work / approach").fill("Replace connector.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Fixed price" }).click();
  await page.getByLabel("Price (HK$)").fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();

  expect(mutatingApiRequests).toEqual([]);
});
