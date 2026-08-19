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
  await page.getByRole("button", { name: "＋新增師傅" }).click();
  const card = page.locator(".op-contractor-card").last();
  await card.getByLabel("師傅名稱").fill(name);
  return card;
}

test("with no contractors, the comparison shows a truthful empty state and no table", async ({ page }) => {
  await gotoCase(page);
  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(comparison.getByText("暫時未有記錄任何師傅報價。")).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toHaveCount(0);
});

test("with one proposal, the comparison shows a 'need another proposal' state and still renders that one proposal's data", async ({
  page,
}) => {
  await gotoCase(page);
  const card = await addContractor(page, "Contractor A");
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("fixed");
  await card.getByLabel("價格（港幣）").fill("5000");
  await card.getByLabel("建議處理方法").fill("Replace the connector now.");
  await card.getByRole("button", { name: "收合" }).click();

  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(
    comparison.getByText("已經記錄一個報價，需要多於一個報價才可以比較。"),
  ).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toContainText("Contractor A");
  await expect(comparison.locator(".op-comparison-table")).toContainText("HK$5,000（固定價格）");
  await expect(comparison.locator(".op-comparison-table")).toContainText("Replace the connector now.");
});

test("with two proposals, both render side by side with independent, correctly formatted data — non-proposal contractors and a truthful count", async ({
  page,
}) => {
  await gotoCase(page);

  const cardA = await addContractor(page, "Contractor A");
  await cardA.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardA.getByLabel("報價方式").selectOption("fixed");
  await cardA.getByLabel("價格（港幣）").fill("5000");
  await cardA.getByLabel("建議處理方法").fill("Replace connector now.");
  await cardA.getByLabel("包括項目").fill("Labour and part.");
  await cardA.getByLabel("不包括的項目").fill("Making good.");
  await cardA.getByLabel("預計工期").fill("2 hours");
  await cardA.getByRole("button", { name: "收合" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardB.getByLabel("報價方式").selectOption("range");
  await cardB.getByLabel("價格範圍 — 最低（港幣）").fill("4000");
  await cardB.getByLabel("價格範圍 — 最高（港幣）").fill("7000");
  await cardB.getByLabel("建議處理方法").fill("Inspect valve first.");
  await cardB.getByLabel("不包括的項目").fill("Materials.");
  await cardB.getByRole("button", { name: "收合" }).click();

  const cardC = await addContractor(page, "Contractor C");
  await cardC.getByLabel("目前回覆").selectOption("needs-inspection");
  await cardC.getByRole("button", { name: "收合" }).click();

  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(comparison.getByText("3 位師傅之中，2 位已提供報價。")).toBeVisible();

  const table = comparison.locator(".op-comparison-table");
  await expect(table).toContainText("Contractor A");
  await expect(table).toContainText("Contractor B");
  await expect(table).not.toContainText("Contractor C");

  // Each contractor's own price renders independently and honestly — no
  // normalization of B's range to a midpoint, no comparison to A's price.
  await expect(table).toContainText("HK$5,000（固定價格）");
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
    await card.getByLabel("目前回覆").selectOption("proposal-provided");
    await card.getByLabel("報價方式").selectOption("fixed");
    await card.getByLabel("價格（港幣）").fill(price);
    await card.getByRole("button", { name: "收合" }).click();
  }

  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(comparison.getByText("3 位師傅之中，3 位已提供報價。")).toBeVisible();
  const table = comparison.locator(".op-comparison-table");
  await expect(table).toContainText("HK$1,000（固定價格）");
  await expect(table).toContainText("HK$2,000（固定價格）");
  await expect(table).toContainText("HK$3,000（固定價格）");
});

test("estimate and no-price-yet price types render correctly and distinctly", async ({ page }) => {
  await gotoCase(page);
  const cardA = await addContractor(page, "Estimate Co.");
  await cardA.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardA.getByLabel("報價方式").selectOption("estimate");
  await cardA.getByLabel("價格（港幣）").fill("1500");
  await cardA.getByRole("button", { name: "收合" }).click();

  const cardB = await addContractor(page, "No Price Co.");
  await cardB.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardB.getByLabel("報價方式").selectOption("no-price");
  await cardB.getByRole("button", { name: "收合" }).click();

  const table = page.locator('[aria-label="報價比較"] .op-comparison-table');
  await expect(table).toContainText("HK$1,500（估算價格）");
  await expect(table).toContainText("暫時未能報價");
});

test("fields the operator never filled in show the neutral 'Not stated' convention, not blank and not 'No'", async ({
  page,
}) => {
  await gotoCase(page);
  const card = await addContractor(page, "Sparse Co.");
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  // Deliberately leave price type, approach, inclusions, exclusions,
  // duration, guarantee all unset.
  await card.getByRole("button", { name: "收合" }).click();

  const table = page.locator('[aria-label="報價比較"] .op-comparison-table');
  const rowTexts = await table.locator("tbody tr").allTextContents();
  // Price, 建議處理方法, Includes, Excludes, Price-change factors,
  // Duration, Guarantee, Original response — every one of Sparse Co.'s
  // cells should read "未提供" (Price shows "未提供" for an
  // unselected price type — never blank, never "No").
  for (const text of rowTexts) {
    expect(text).toContain("未提供");
  }
});

test("Key differences, Questions still unresolved, and SimpleFix note are editable and persist across reload; changing Contractor A's price flows into the comparison automatically", async ({
  page,
}) => {
  await gotoCase(page);
  const cardA = await addContractor(page, "Contractor A");
  await cardA.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardA.getByLabel("報價方式").selectOption("fixed");
  await cardA.getByLabel("價格（港幣）").fill("5000");
  await cardA.getByRole("button", { name: "收合" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardB.getByLabel("報價方式").selectOption("range");
  await cardB.getByLabel("價格範圍 — 最低（港幣）").fill("4000");
  await cardB.getByLabel("價格範圍 — 最高（港幣）").fill("7000");
  await cardB.getByRole("button", { name: "收合" }).click();

  const comparison = page.locator('[aria-label="報價比較"]');
  await comparison
    .getByLabel("主要分別")
    .fill("A proposes immediate replacement at a fixed price; B wants to inspect first.");
  await comparison.getByLabel("仍需確認的問題").fill("Does B's range include materials?");
  await comparison.getByLabel("修理易備註").fill("Both contractors are aware of the leak location.");

  await expect(comparison.locator(".op-comparison-table")).toContainText("HK$5,000（固定價格）");

  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const reloadedComparison = page.locator('[aria-label="報價比較"]');
  await expect(reloadedComparison.getByLabel("主要分別")).toHaveValue(
    "A proposes immediate replacement at a fixed price; B wants to inspect first.",
  );
  await expect(reloadedComparison.getByLabel("仍需確認的問題")).toHaveValue(
    "Does B's range include materials?",
  );
  await expect(reloadedComparison.getByLabel("修理易備註")).toHaveValue(
    "Both contractors are aware of the leak location.",
  );

  // Now edit Contractor A's price directly in its own Slice 2 card — no
  // comparison-specific editing surface exists for proposal facts.
  const reloadedCardA = page.locator(".op-contractor-card").first();
  await reloadedCardA.getByRole("button", { name: "編輯" }).click();
  await reloadedCardA.getByLabel("價格（港幣）").fill("5500");

  await expect(reloadedComparison.locator(".op-comparison-table")).toContainText("HK$5,500（固定價格）");
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
  await cardA.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardA.getByLabel("報價方式").selectOption("fixed");
  await cardA.getByLabel("價格（港幣）").fill("3000");
  await cardA.getByRole("button", { name: "收合" }).click();

  const cardB = await addContractor(page, "Contractor B");
  await cardB.getByLabel("目前回覆").selectOption("proposal-provided");
  await cardB.getByLabel("報價方式").selectOption("fixed");
  await cardB.getByLabel("價格（港幣）").fill("9000");
  await cardB.getByRole("button", { name: "收合" }).click();

  const comparisonText = await page.locator('[aria-label="報價比較"]').innerText();
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

  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(comparison.getByText("已經記錄一個報價，需要多於一個報價才可以比較。")).toBeVisible();
  await expect(comparison.getByLabel("主要分別")).toHaveValue("");
  await expect(comparison.getByLabel("仍需確認的問題")).toHaveValue("");
  await expect(comparison.getByLabel("修理易備註")).toHaveValue("");
});

test("no mutating request is made to the backend while editing comparison fields", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await gotoCase(page);
  const comparison = page.locator('[aria-label="報價比較"]');
  await comparison.getByLabel("主要分別").fill("Some difference.");
  await comparison.getByLabel("仍需確認的問題").fill("Some question.");
  await comparison.getByLabel("修理易備註").fill("Some note.");

  expect(mutatingApiRequests).toEqual([]);
});

test("the owner submission remains strictly read-only alongside the new comparison section", async ({ page }) => {
  await gotoCase(page);
  const ownerSection = page.locator('[aria-label="業主提交資料"]');
  await expect(ownerSection).toBeVisible();
  await expect(ownerSection.locator("input, textarea, select")).toHaveCount(0);
});
