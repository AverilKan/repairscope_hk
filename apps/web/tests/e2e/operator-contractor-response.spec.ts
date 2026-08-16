import { expect, test } from "@playwright/test";

// End-to-end coverage for the manual contractor response workflow
// (RepairScope HK — Post-Intake Workflow, Slice 2) — the evolved contractor
// card UI in components/operator/OperatorCaseWorkspace.tsx. Local-only
// state, no server writes; see tests/e2e/operator-case-workspace.spec.ts for
// the base add/edit/remove/persist coverage this file builds on.

async function openFirstContractorCard(page: import("@playwright/test").Page) {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "+ Add contractor" }).click();
  return page.locator(".op-contractor-card").first();
}

test("selecting 'Needs inspection' reveals the inspection requirement field, and nothing else conditional", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("Current response").selectOption("needs-inspection");
  await expect(card.getByLabel("Inspection requirement")).toBeVisible();
  await expect(card.getByLabel("What information do they need?")).toHaveCount(0);
  await expect(card.getByLabel("Price type")).toHaveCount(0);

  await card.getByLabel("Inspection requirement").selectOption("required");
  await expect(card).toContainText("Required before proposal");
});

test("selecting 'Needs more information' reveals the information-needed field", async ({ page }) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("Current response").selectOption("needs-more-information");
  await expect(card.getByLabel("What information do they need?")).toBeVisible();
  await card.getByLabel("What information do they need?").fill("Photos of the pipe under the sink.");
  await expect(card.getByLabel("What information do they need?")).toHaveValue(
    "Photos of the pipe under the sink.",
  );
});

test("selecting 'Initial proposal provided' reveals the full proposal form, gated correctly by price type and guarantee status", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("Current response").selectOption("proposal-provided");
  await expect(card.getByLabel("Price type")).toBeVisible();

  // No price type chosen yet — no price fields shown.
  await expect(card.getByLabel("Price (HK$)")).toHaveCount(0);
  await expect(card.getByLabel("Price range — minimum (HK$)")).toHaveCount(0);

  await card.getByLabel("Price type").selectOption("fixed");
  await expect(card.getByLabel("Price (HK$)")).toBeVisible();
  await expect(card.getByLabel("Price range — minimum (HK$)")).toHaveCount(0);
  await card.getByLabel("Price (HK$)").fill("850");

  await card.getByLabel("Price type").selectOption("range");
  // Switching to range clears the single price field and shows min/max.
  await expect(card.getByLabel("Price (HK$)")).toHaveCount(0);
  await card.getByLabel("Price range — minimum (HK$)").fill("500");
  await card.getByLabel("Price range — maximum (HK$)").fill("300");
  await expect(card.getByText(/minimum price is greater than the maximum/)).toBeVisible();
  await card.getByLabel("Price range — maximum (HK$)").fill("900");
  await expect(card.getByText(/minimum price is greater than the maximum/)).toHaveCount(0);

  await card.getByLabel("Price type").selectOption("no-price");
  await expect(card.getByLabel("Price range — minimum (HK$)")).toHaveCount(0);

  // Not getByLabel("Guarantee"): the wrapping <label> makes its accessible
  // name include its <select>'s own option list, which collides with the
  // separate "Guarantee details" label — scope by structure instead.
  const guaranteeSelect = card.locator('label:has-text("Guarantee")').locator("select");
  await expect(card.getByLabel("Guarantee details")).toHaveCount(0);
  await guaranteeSelect.selectOption("yes");
  await expect(card.getByLabel("Guarantee details")).toBeVisible();
  await card.getByLabel("Guarantee details").fill("6 months on parts and labour.");

  await guaranteeSelect.selectOption("not-stated");
  await expect(card.getByLabel("Guarantee details")).toHaveCount(0);

  // The free-form response and operator notes are always present, proposal
  // fields or not.
  await expect(card.getByLabel("Original contractor response — what did they say?")).toBeVisible();
  await expect(card.getByLabel("Operator notes")).toBeVisible();
});

test("changing response type away from 'Initial proposal provided' clears the proposal fields from view, not just hides them behind stale data", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("Current response").selectOption("proposal-provided");
  await card.getByLabel("Price type").selectOption("fixed");
  await card.getByLabel("Price (HK$)").fill("1200");
  await card.getByLabel("Proposed approach").fill("Replace the whole unit.");

  await card.getByLabel("Current response").selectOption("needs-inspection");
  await expect(card.getByLabel("Price type")).toHaveCount(0);
  await expect(card.getByLabel("Price (HK$)")).toHaveCount(0);
  await expect(card.getByLabel("Proposed approach")).toHaveCount(0);

  // Switch back to proposal-provided — the previously entered price must
  // not silently reappear (it was actually cleared, not just hidden).
  await card.getByLabel("Current response").selectOption("proposal-provided");
  await expect(card.getByLabel("Price type")).toHaveValue("");
  await card.getByLabel("Price type").selectOption("fixed");
  await expect(card.getByLabel("Price (HK$)")).toHaveValue("");
});

test("two independently added contractors keep separate response state — editing one never touches the other", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByRole("button", { name: "+ Add contractor" }).click();
  const cards = page.locator(".op-contractor-card");
  await cards.nth(0).getByLabel("Contractor name").fill("Contractor A");
  await cards.nth(0).getByLabel("Current response").selectOption("interested");

  await page.getByRole("button", { name: "+ Add contractor" }).click();
  await cards.nth(1).getByLabel("Contractor name").fill("Contractor B");
  await cards.nth(1).getByLabel("Current response").selectOption("proposal-provided");
  await cards.nth(1).getByLabel("Price type").selectOption("estimate");
  await cards.nth(1).getByLabel("Price (HK$)").fill("650");

  // Collapse both cards before checking summaries — while expanded, each
  // card's own <select> renders every option's text (including "Initial
  // proposal provided") regardless of which is selected, which would make a
  // substring check meaningless.
  await cards.nth(0).getByRole("button", { name: "Collapse" }).click();
  await cards.nth(1).getByRole("button", { name: "Collapse" }).click();
  await expect(cards.nth(0).locator(".op-contractor-card__meta")).toContainText("Interested");
  await expect(cards.nth(0).locator(".op-contractor-card__meta")).not.toContainText("Proposal");
  await expect(cards.nth(1).locator(".op-contractor-card__meta")).toContainText("Proposal");

  await cards.nth(1).getByRole("button", { name: "Remove" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("Contractor A");
  await expect(cards.nth(0)).toContainText("Interested");
});

test("an old, pre-Slice-2 minimal contractor record (written directly to localStorage) renders safely with no crash", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "repairscope:operator-case:RS-MOCK01",
      JSON.stringify({
        caseReference: "RS-MOCK01",
        status: "new",
        internalNotes: "",
        unresolvedQuestions: "",
        ownerFollowUpQuestions: "",
        nextAction: "",
        contractors: [
          { id: "legacy-1", name: "Legacy Contractor", status: "contacted", notes: "Pre-Slice-2 record." },
        ],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const card = page.locator(".op-contractor-card").first();
  await expect(card).toContainText("Legacy Contractor");
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(card.getByLabel("Contractor name")).toHaveValue("Legacy Contractor");
  await expect(card.getByLabel("Current response")).toHaveValue("");
  await expect(card.getByLabel("Operator notes")).toHaveValue("Pre-Slice-2 record.");
});

test("no mutating request is made to the backend as contractor response fields are filled in", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const card = await openFirstContractorCard(page);
  await card.getByLabel("Contractor name").fill("Contractor A");
  await card.getByLabel("Current response").selectOption("proposal-provided");
  await card.getByLabel("Price type").selectOption("fixed");
  await card.getByLabel("Price (HK$)").fill("1500");
  await card.getByLabel("Guarantee").selectOption("yes");
  await card.getByLabel("Guarantee details").fill("1 year.");

  expect(mutatingApiRequests).toEqual([]);
});
