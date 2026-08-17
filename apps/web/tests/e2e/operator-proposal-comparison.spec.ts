import { expect, test } from "@playwright/test";

// End-to-end coverage for the proposal comparison workflow (RepairScope HK
// — Post-Intake Workflow, Slice 3). Reads live from the same per-case
// contractor records Slice 2 already persists — see
// components/operator/ProposalComparison.tsx and
// domain/operatorCaseState.ts's proposalContractors. Local-only state, no
// server writes; see tests/e2e/operator-contractor-response.spec.ts for the
// underlying contractor-editing coverage this file builds on.

async function gotoCase(page: import("@playwright/test").Page) {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
}

async function addContractor(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "+ Add contractor" }).click();
  const card = page.locator(".op-contractor-card").last();
  await card.getByLabel("Contractor name").fill(name);
  return card;
}

test("with no contractors, the comparison shows a truthful empty state and no table", async ({ page }) => {
  await gotoCase(page);
  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(comparison.getByText("No contractor proposals have been recorded yet.")).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toHaveCount(0);
});

test("with one proposal, the comparison shows a 'need another proposal' state and still renders that one proposal's data", async ({
  page,
}) => {
  await gotoCase(page);
  const card = await addContractor(page, "Contractor A");
  await card.getByLabel("Current response").selectOption("proposal-provided");
  await card.getByLabel("Price type").selectOption("fixed");
  await card.getByLabel("Price (HK$)").fill("5000");
  await card.getByLabel("Proposed approach").fill("Replace the connector now.");
  await card.getByRole("button", { name: "Collapse" }).click();

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(
    comparison.getByText("One proposal has been recorded. Add another proposal to compare."),
  ).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toContainText("Contractor A");
  await expect(comparison.locator(".op-comparison-table")).toContainText("HK$5,000 fixed");
  await expect(comparison.locator(".op-comparison-table")).toContainText("Replace the connector now.");
});

test("with two proposals, both render side by side with independent, correctly formatted data — non-proposal contractors and a truthful count", async ({
  page,
}) => {
  await gotoCase(page);

  const cardA = await addContractor(page, "Contractor A");
  await cardA.getByLabel("Current response").selectOption("proposal-provided");
  await cardA.getByLabel("Price type").selectOption("fixed");
  await cardA.getByLabel("Price (HK$)").fill("5000");
  await cardA.getByLabel("Proposed approach").fill("Replace connector now.");
  await cardA.getByLabel("What's included").fill("Labour and part.");
  await cardA.getByLabel("What's excluded").fill("Making good.");
  await cardA.getByLabel("Expected duration").fill("2 hours");
  await cardA.getByRole("button", { name: "Collapse" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("Current response").selectOption("proposal-provided");
  await cardB.getByLabel("Price type").selectOption("range");
  await cardB.getByLabel("Price range — minimum (HK$)").fill("4000");
  await cardB.getByLabel("Price range — maximum (HK$)").fill("7000");
  await cardB.getByLabel("Proposed approach").fill("Inspect valve first.");
  await cardB.getByLabel("What's excluded").fill("Materials.");
  await cardB.getByRole("button", { name: "Collapse" }).click();

  const cardC = await addContractor(page, "Contractor C");
  await cardC.getByLabel("Current response").selectOption("needs-inspection");
  await cardC.getByRole("button", { name: "Collapse" }).click();

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(comparison.getByText("2 of 3 contractors have provided proposals.")).toBeVisible();

  const table = comparison.locator(".op-comparison-table");
  await expect(table).toContainText("Contractor A");
  await expect(table).toContainText("Contractor B");
  await expect(table).not.toContainText("Contractor C");

  // Each contractor's own price renders independently and honestly — no
  // normalization of B's range to a midpoint, no comparison to A's price.
  await expect(table).toContainText("HK$5,000 fixed");
  await expect(table).toContainText("HK$4,000–HK$7,000");
  await expect(table).toContainText("Replace connector now.");
  await expect(table).toContainText("Inspect valve first.");
  await expect(table).toContainText("Labour and part.");
  await expect(table).toContainText("Making good.");
  await expect(table).toContainText("Materials.");
  await expect(table).toContainText("2 hours");

  // B never populated "Expected duration" or "What's included" — neutral
  // missing-value convention, not "No".
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(9);
});

test("with three proposals, all three remain independently visible", async ({ page }) => {
  await gotoCase(page);
  for (const [name, price] of [
    ["Contractor A", "1000"],
    ["Contractor B", "2000"],
    ["Contractor C", "3000"],
  ] as const) {
    const card = await addContractor(page, name);
    await card.getByLabel("Current response").selectOption("proposal-provided");
    await card.getByLabel("Price type").selectOption("fixed");
    await card.getByLabel("Price (HK$)").fill(price);
    await card.getByRole("button", { name: "Collapse" }).click();
  }

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(comparison.getByText("3 of 3 contractors have provided proposals.")).toBeVisible();
  const table = comparison.locator(".op-comparison-table");
  await expect(table).toContainText("HK$1,000 fixed");
  await expect(table).toContainText("HK$2,000 fixed");
  await expect(table).toContainText("HK$3,000 fixed");
});

test("estimate and no-price-yet price types render correctly and distinctly", async ({ page }) => {
  await gotoCase(page);
  const cardA = await addContractor(page, "Estimate Co.");
  await cardA.getByLabel("Current response").selectOption("proposal-provided");
  await cardA.getByLabel("Price type").selectOption("estimate");
  await cardA.getByLabel("Price (HK$)").fill("1500");
  await cardA.getByRole("button", { name: "Collapse" }).click();

  const cardB = await addContractor(page, "No Price Co.");
  await cardB.getByLabel("Current response").selectOption("proposal-provided");
  await cardB.getByLabel("Price type").selectOption("no-price");
  await cardB.getByRole("button", { name: "Collapse" }).click();

  const table = page.locator('[aria-label="Proposal comparison"] .op-comparison-table');
  await expect(table).toContainText("HK$1,500 estimate");
  await expect(table).toContainText("No price yet");
});

test("fields the operator never filled in show the neutral 'Not stated' convention, not blank and not 'No'", async ({
  page,
}) => {
  await gotoCase(page);
  const card = await addContractor(page, "Sparse Co.");
  await card.getByLabel("Current response").selectOption("proposal-provided");
  // Deliberately leave price type, approach, inclusions, exclusions,
  // duration, guarantee all unset.
  await card.getByRole("button", { name: "Collapse" }).click();

  const table = page.locator('[aria-label="Proposal comparison"] .op-comparison-table');
  const rowTexts = await table.locator("tbody tr").allTextContents();
  // Price, Proposed approach, Includes, Excludes, Price-change factors,
  // Duration, Guarantee, Original response — every one of Sparse Co.'s
  // cells should read "Not stated" (Price shows "Not stated" for an
  // unselected price type — never blank, never "No").
  for (const text of rowTexts) {
    expect(text).toContain("Not stated");
  }
});

test("Key differences, Questions still unresolved, and RepairScope note are editable and persist across reload; changing Contractor A's price flows into the comparison automatically", async ({
  page,
}) => {
  await gotoCase(page);
  const cardA = await addContractor(page, "Contractor A");
  await cardA.getByLabel("Current response").selectOption("proposal-provided");
  await cardA.getByLabel("Price type").selectOption("fixed");
  await cardA.getByLabel("Price (HK$)").fill("5000");
  await cardA.getByRole("button", { name: "Collapse" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("Current response").selectOption("proposal-provided");
  await cardB.getByLabel("Price type").selectOption("range");
  await cardB.getByLabel("Price range — minimum (HK$)").fill("4000");
  await cardB.getByLabel("Price range — maximum (HK$)").fill("7000");
  await cardB.getByRole("button", { name: "Collapse" }).click();

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await comparison
    .getByLabel("Key differences")
    .fill("A proposes immediate replacement at a fixed price; B wants to inspect first.");
  await comparison.getByLabel("Questions still unresolved").fill("Does B's range include materials?");
  await comparison.getByLabel("RepairScope note").fill("Both contractors are aware of the leak location.");

  await expect(comparison.locator(".op-comparison-table")).toContainText("HK$5,000 fixed");

  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const reloadedComparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(reloadedComparison.getByLabel("Key differences")).toHaveValue(
    "A proposes immediate replacement at a fixed price; B wants to inspect first.",
  );
  await expect(reloadedComparison.getByLabel("Questions still unresolved")).toHaveValue(
    "Does B's range include materials?",
  );
  await expect(reloadedComparison.getByLabel("RepairScope note")).toHaveValue(
    "Both contractors are aware of the leak location.",
  );

  // Now edit Contractor A's price directly in its own Slice 2 card — no
  // comparison-specific editing surface exists for proposal facts.
  const reloadedCardA = page.locator(".op-contractor-card").first();
  await reloadedCardA.getByRole("button", { name: "Edit" }).click();
  await reloadedCardA.getByLabel("Price (HK$)").fill("5500");

  await expect(reloadedComparison.locator(".op-comparison-table")).toContainText("HK$5,500 fixed");
  // Contractor B's independently-recorded proposal is unaffected.
  await expect(reloadedComparison.locator(".op-comparison-table")).toContainText("HK$4,000–HK$7,000");

  // No comparison-proposal duplicate ever existed in storage — the price
  // change is visible purely because the comparison reads the same
  // contractor records live.
  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("repairscope:operator-case:RS-MOCK01");
    return raw ? JSON.parse(raw) : null;
  });
  expect(persisted.comparison).toBeUndefined();
  expect(persisted.contractors.find((c: { name: string }) => c.name === "Contractor A").price).toBe(5500);
});

test("the comparison view never contains winner/ranking/scoring language", async ({ page }) => {
  await gotoCase(page);
  const cardA = await addContractor(page, "Contractor A");
  await cardA.getByLabel("Current response").selectOption("proposal-provided");
  await cardA.getByLabel("Price type").selectOption("fixed");
  await cardA.getByLabel("Price (HK$)").fill("3000");
  await cardA.getByRole("button", { name: "Collapse" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("Current response").selectOption("proposal-provided");
  await cardB.getByLabel("Price type").selectOption("fixed");
  await cardB.getByLabel("Price (HK$)").fill("9000");
  await cardB.getByRole("button", { name: "Collapse" }).click();

  const comparisonText = await page.locator('[aria-label="Proposal comparison"]').innerText();
  for (const forbidden of ["winner", "recommend", "best value", "cheapest", "score", "ranking", "confidence"]) {
    expect(comparisonText.toLowerCase()).not.toContain(forbidden);
  }
});

test("a pre-Slice-3 case with contractors but no comparison notes renders a safe empty comparison state", async ({
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
          {
            id: "c1",
            name: "Pre-Slice-3 Contractor",
            status: "contacted",
            notes: "",
            responseType: "proposal-provided",
            priceType: "fixed",
            price: 4200,
          },
        ],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await expect(comparison.getByText("One proposal has been recorded. Add another proposal to compare.")).toBeVisible();
  await expect(comparison.getByLabel("Key differences")).toHaveValue("");
  await expect(comparison.getByLabel("Questions still unresolved")).toHaveValue("");
  await expect(comparison.getByLabel("RepairScope note")).toHaveValue("");
});

test("no mutating request is made to the backend while editing comparison fields", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await gotoCase(page);
  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await comparison.getByLabel("Key differences").fill("Some difference.");
  await comparison.getByLabel("Questions still unresolved").fill("Some question.");
  await comparison.getByLabel("RepairScope note").fill("Some note.");

  expect(mutatingApiRequests).toEqual([]);
});

test("the owner submission remains strictly read-only alongside the new comparison section", async ({ page }) => {
  await gotoCase(page);
  const ownerSection = page.locator('[aria-label="Owner submission"]');
  await expect(ownerSection).toBeVisible();
  await expect(ownerSection.locator("input, textarea, select")).toHaveCount(0);
});
