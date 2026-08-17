import { expect, test } from "@playwright/test";

// End-to-end coverage for the owner proposal-return preview (RepairScope
// HK — "frontend structure" phase, Commit C). Exposed only through an
// operator-protected preview surface — see
// app/operator/[caseReference]/owner-preview/page.tsx — never a public
// unauthenticated route.

async function addProposalContractor(
  page: import("@playwright/test").Page,
  { name, priceType, price, priceMin, priceMax, approach }: {
    name: string;
    priceType: "fixed" | "estimate" | "range" | "no-price";
    price?: number;
    priceMin?: number;
    priceMax?: number;
    approach?: string;
  },
) {
  await page.getByRole("button", { name: "+ Add contractor" }).click();
  const card = page.locator(".op-contractor-card").last();
  await card.getByLabel("Contractor name").fill(name);
  await card.getByLabel("Current response").selectOption("proposal-provided");
  if (approach) await card.getByLabel("Proposed approach").fill(approach);
  await card.getByLabel("Price type").selectOption(priceType);
  if (priceType === "range") {
    await card.getByLabel("Price range — minimum (HK$)").fill(String(priceMin));
    await card.getByLabel("Price range — maximum (HK$)").fill(String(priceMax));
  } else if (price !== undefined) {
    await card.getByLabel("Price (HK$)").fill(String(price));
  }
  await card.getByRole("button", { name: "Collapse" }).click();
}

test("with zero proposals, the owner preview shows a clear empty state", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01/owner-preview");
  await expect(page.getByText("No proposals have been recorded yet.")).toBeVisible();
});

test("with one proposal, it renders as a card with a working detail view", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Fortune Plumbing Co.", priceType: "fixed", price: 5000, approach: "Replace the connector now." });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await expect(page).toHaveURL(/\/operator\/RS-MOCK01\/owner-preview/);
  const card = page.locator(".owner-proposal-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Fortune Plumbing Co.");
  await expect(card).toContainText("HK$5,000 fixed");
  await expect(card).toContainText("Replace the connector now.");

  await card.getByRole("button", { name: "View proposal" }).click();
  await expect(card.locator(".owner-proposal-card__detail")).toBeVisible();
});

test("with two proposals, both cards render independently", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });
  await addProposalContractor(page, { name: "Contractor B", priceType: "range", priceMin: 4000, priceMax: 7000 });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  const cards = page.locator(".owner-proposal-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("HK$5,000 fixed");
  await expect(cards.nth(1)).toContainText("HK$4,000–HK$7,000");
});

test("with three proposals, all remain independently visible and a non-proposal contractor is excluded", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 1000 });
  await addProposalContractor(page, { name: "Contractor B", priceType: "estimate", price: 2000 });
  await addProposalContractor(page, { name: "Contractor C", priceType: "no-price" });

  await page.getByRole("button", { name: "+ Add contractor" }).click();
  const notInterested = page.locator(".op-contractor-card").last();
  await notInterested.getByLabel("Contractor name").fill("Contractor D");
  await notInterested.getByLabel("Current response").selectOption("needs-inspection");
  await notInterested.getByRole("button", { name: "Collapse" }).click();

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  const cards = page.locator(".owner-proposal-card");
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".owner-proposal-preview")).not.toContainText("Contractor D");
});

test("'Compare side by side' reuses the same neutral comparison table, no separate proposal model", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000, approach: "Replace now." });
  await addProposalContractor(page, { name: "Contractor B", priceType: "range", priceMin: 4000, priceMax: 7000, approach: "Inspect first." });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  const table = page.locator(".op-comparison-table");
  await expect(table).toBeVisible();
  await expect(table).toContainText("Replace now.");
  await expect(table).toContainText("Inspect first.");
  await expect(page.locator(".owner-proposal-card")).toHaveCount(0);
});

test("the founder's Key differences, Questions still unresolved and RepairScope note are shown read-only, and hidden entirely when empty", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });

  const comparison = page.locator('[aria-label="Proposal comparison"]');
  await comparison.getByLabel("Key differences").fill("A proposes a fixed price now.");
  await comparison.getByLabel("Questions still unresolved").fill("Is materials cost included?");
  await comparison.getByLabel("RepairScope note").fill("Neutral context only.");

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  const notes = page.locator('[aria-label="RepairScope\'s explanation"]');
  await expect(notes).toContainText("A proposes a fixed price now.");
  await expect(notes).toContainText("Is materials cost included?");
  await expect(notes).toContainText("Neutral context only.");
  // Read-only — no input/textarea in this section.
  await expect(notes.locator("input, textarea")).toHaveCount(0);
});

test("no notes section appears when the founder has written nothing", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await expect(page.locator('[aria-label="RepairScope\'s explanation"]')).toHaveCount(0);
});

test("no ranking, scoring or recommendation language exists anywhere in the owner preview", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 3000 });
  await addProposalContractor(page, { name: "Contractor B", priceType: "fixed", price: 9000 });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  const text = (await page.locator(".owner-proposal-preview").innerText()).toLowerCase();
  for (const forbidden of [
    "winner",
    "recommend",
    "best value",
    "cheapest",
    "score",
    "ranking",
    "star rating",
    "confidence",
  ]) {
    expect(text).not.toContain(forbidden);
  }
});

test("editing a contractor's proposal on the case page updates the owner preview with no duplicate proposal store", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await expect(page.locator(".owner-proposal-card")).toContainText("HK$5,000 fixed");

  await page.getByRole("link", { name: "Back to case" }).click();
  const card = page.locator(".op-contractor-card").first();
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("Price (HK$)").fill("5500");

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await expect(page.locator(".owner-proposal-card")).toContainText("HK$5,500 fixed");

  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("repairscope:operator-case:RS-MOCK01");
    return raw ? JSON.parse(raw) : null;
  });
  expect(persisted.ownerProposals).toBeUndefined();
  expect(persisted.ownerPreview).toBeUndefined();
});

test("an imported contractor response is immediately visible in the owner preview", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "+ Add contractor" }).click();
  const card = page.locator(".op-contractor-card").last();
  await card.getByLabel("Contractor name").fill("Imported Co.");
  await card.getByRole("button", { name: "Collapse" }).click();

  await card.getByRole("button", { name: "Import response" }).click();
  await card.locator("textarea").first().fill(
    JSON.stringify({
      schema: "repairscope.contractor-response-export",
      version: 1,
      response: { responseType: "proposal-provided", priceType: "fixed", price: 4200, proposedApproach: "Inspect and fix." },
    }),
  );
  await card.getByRole("button", { name: "Preview" }).click();
  await card.getByRole("button", { name: "Confirm import" }).click();

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await expect(page.locator(".owner-proposal-card")).toContainText("Imported Co.");
  await expect(page.locator(".owner-proposal-card")).toContainText("HK$4,200 fixed");
});

test("the owner preview is gated behind the operator area — a case-workspace back link exists and no public route bypasses it", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01/owner-preview");
  await expect(page.getByRole("link", { name: "Back to case" })).toBeVisible();
});

test("mobile viewport: proposal cards remain usable with no page-level horizontal overflow", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });
  await addProposalContractor(page, { name: "Contractor B", priceType: "range", priceMin: 4000, priceMax: 7000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operator/RS-MOCK01/owner-preview");
  await expect(page.locator(".owner-proposal-card")).toHaveCount(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("no mutating request is made to the backend while viewing the owner preview", async ({ page }) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await addProposalContractor(page, { name: "Contractor A", priceType: "fixed", price: 5000 });

  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.getByRole("link", { name: "Preview owner proposal view" }).click();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await page.getByRole("button", { name: "Proposal cards" }).click();

  expect(mutatingApiRequests).toEqual([]);
});
