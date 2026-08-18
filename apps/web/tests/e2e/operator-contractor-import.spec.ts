import { expect, test } from "@playwright/test";

// End-to-end coverage for the operator's "Import contractor response"
// action (RepairScope HK — "frontend structure" phase, Commit B) — the
// bridge from the new contractor-facing form's export back into the
// existing operator contractor card. See
// domain/contractorResponse.ts/OperatorCaseWorkspace.tsx's ContractorCard.

function makeExport(response: Record<string, unknown>) {
  return JSON.stringify({ schema: "repairscope.contractor-response-export", version: 1, response });
}

async function gotoCaseWithContractor(page: import("@playwright/test").Page) {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "＋新增師傅" }).click();
  const card = page.locator(".op-contractor-card").last();
  await card.getByLabel("師傅名稱").fill("Fortune Plumbing Co.");
  await card.getByLabel("行業").fill("Plumber");
  await card.getByLabel("聯絡方式").fill("WhatsApp 9123 4567");
  await card.getByLabel("聯絡／尋找師傅狀態").selectOption("contacted");
  await card.getByLabel("操作員備註").fill("Called twice, very responsive.");
  await card.getByRole("button", { name: "收合" }).click();
  return card;
}

test("importing a response preserves the contractor's name, trade, contact reference, contact status and operator notes", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card
    .locator("textarea")
    .first()
    .fill(
      makeExport({
        responseType: "proposal-provided",
        priceType: "fixed",
        price: 5000,
        proposedApproach: "Replace the connector now.",
      }),
    );
  await card.getByRole("button", { name: "預覽" }).click();
  await expect(card.locator(".op-contractor-card__import-preview")).toBeVisible();
  await card.getByRole("button", { name: "確認匯入" }).click();

  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("師傅名稱")).toHaveValue("Fortune Plumbing Co.");
  await expect(card.getByLabel("行業")).toHaveValue("Plumber");
  await expect(card.getByLabel("聯絡方式")).toHaveValue("WhatsApp 9123 4567");
  await expect(card.getByLabel("聯絡／尋找師傅狀態")).toHaveValue("contacted");
  await expect(card.getByLabel("操作員備註")).toHaveValue("Called twice, very responsive.");
  await expect(card.getByLabel("目前回覆")).toHaveValue("proposal-provided");
  await expect(card.getByLabel("價格（港幣）")).toHaveValue("5000");
  await expect(card.getByLabel("建議處理方法")).toHaveValue("Replace the connector now.");
});

test("an operator-only field embedded in a hand-crafted import payload (e.g. name/status) is silently dropped, never applied", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "interested",
      originalResponse: "Sounds doable.",
      // Attempted operator-only fields — must never survive.
      name: "Injected Name",
      status: "not-contacted",
      notes: "Injected notes",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  await card.getByRole("button", { name: "確認匯入" }).click();

  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("師傅名稱")).toHaveValue("Fortune Plumbing Co.");
  await expect(card.getByLabel("聯絡／尋找師傅狀態")).toHaveValue("contacted");
  await expect(card.getByLabel("操作員備註")).toHaveValue("Called twice, very responsive.");
  await expect(card.getByLabel("目前回覆")).toHaveValue("interested");
});

test("a malformed or invalid import is rejected with a clear error and nothing changes", async ({ page }) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill("{not valid json at all");
  await card.getByRole("button", { name: "預覽" }).click();
  await expect(card.locator(".field-error")).toBeVisible();
  await expect(card.locator(".op-contractor-card__import-preview")).toHaveCount(0);

  await card.locator("textarea").first().fill(makeExport({ responseType: "not-a-real-type" }));
  await card.getByRole("button", { name: "預覽" }).click();
  await expect(card.locator(".field-error")).toBeVisible();
});

test("import does not create another contractor and does not touch a second, independent contractor", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByRole("button", { name: "＋新增師傅" }).click();
  const cards = page.locator(".op-contractor-card");
  await cards.nth(0).getByLabel("師傅名稱").fill("Contractor A");
  await cards.nth(0).getByRole("button", { name: "收合" }).click();

  await page.getByRole("button", { name: "＋新增師傅" }).click();
  await cards.nth(1).getByLabel("師傅名稱").fill("Contractor B");
  await cards.nth(1).getByLabel("目前回覆").selectOption("proposal-provided");
  await cards.nth(1).getByLabel("報價方式").selectOption("fixed");
  await cards.nth(1).getByLabel("價格（港幣）").fill("9000");
  await cards.nth(1).getByRole("button", { name: "收合" }).click();

  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole("button", { name: "匯入回覆" }).click();
  await cards
    .nth(0)
    .locator("textarea")
    .first()
    .fill(makeExport({ responseType: "interested", originalResponse: "For Contractor A only." }));
  await cards.nth(0).getByRole("button", { name: "預覽" }).click();
  await cards.nth(0).getByRole("button", { name: "確認匯入" }).click();

  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole("button", { name: "編輯" }).click();
  await expect(cards.nth(0).getByLabel("目前回覆")).toHaveValue("interested");
  await cards.nth(1).getByRole("button", { name: "編輯" }).click();
  await expect(cards.nth(1).getByLabel("目前回覆")).toHaveValue("proposal-provided");
  await expect(cards.nth(1).getByLabel("價格（港幣）")).toHaveValue("9000");
});

test("Slice 3's comparison immediately reflects an imported 'Initial proposal provided' response, with no separate proposal state", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "proposal-provided",
      priceType: "range",
      priceMin: 4000,
      priceMax: 7000,
      proposedApproach: "Inspect valve first.",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  await card.getByRole("button", { name: "確認匯入" }).click();

  const comparison = page.locator('[aria-label="報價比較"]');
  await expect(comparison.getByText("已經記錄一個報價，需要多於一個報價才可以比較。")).toBeVisible();
  await expect(comparison.locator(".op-comparison-table")).toContainText("HK$4,000–HK$7,000");
  await expect(comparison.locator(".op-comparison-table")).toContainText("Inspect valve first.");

  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("repairscope:operator-case:RS-MOCK01");
    return raw ? JSON.parse(raw) : null;
  });
  expect(persisted.comparison).toBeUndefined();
});

test("a tampered negative price never appears in the preview — the preview shows the same normalized value that gets merged", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "proposal-provided",
      priceType: "fixed",
      price: -5000,
      proposedApproach: "Replace the connector now.",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  const preview = card.locator(".op-contractor-card__import-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("-5000");

  await card.getByRole("button", { name: "確認匯入" }).click();
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("價格（港幣）")).toHaveValue("");
});

test("a tampered inverted price range never appears in the preview — both bounds are cleared before preview, not after confirm", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "proposal-provided",
      priceType: "range",
      priceMin: 9000,
      priceMax: 3000,
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  const preview = card.locator(".op-contractor-card__import-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("9000");
  await expect(preview).not.toContainText("3000");

  await card.getByRole("button", { name: "確認匯入" }).click();
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveValue("");
  await expect(card.getByLabel("價格範圍 — 最高（港幣）")).toHaveValue("");
});

test("stale proposal fields incompatible with the response type never appear in the preview", async ({ page }) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "not-suitable",
      originalResponse: "Not my trade.",
      // Stale proposal-only fields that should never survive for a
      // "not-suitable" response — applyContractorPatch clears them.
      priceType: "fixed",
      price: 5000,
      proposedApproach: "Replace the connector now.",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  const preview = card.locator(".op-contractor-card__import-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("5000");
  await expect(preview).not.toContainText("Replace the connector now.");

  await card.getByRole("button", { name: "確認匯入" }).click();
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("目前回覆")).toHaveValue("not-suitable");
  await expect(card.getByLabel("價格（港幣）")).toHaveCount(0);
});

test("stale guarantee details without a 'Yes' guarantee status never appear in the preview", async ({ page }) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "proposal-provided",
      priceType: "fixed",
      price: 5000,
      guaranteeStatus: "no",
      guaranteeDetails: "12 months on parts and labour.",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  const preview = card.locator(".op-contractor-card__import-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("12 months on parts and labour.");

  await card.getByRole("button", { name: "確認匯入" }).click();
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("保養")).toHaveValue("no");
});

test("a malformed/unrecoverable payload still rejects cleanly and changes nothing on the contractor, even with normalization now running before preview", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(makeExport({ responseType: "not-a-real-type", price: -1 }));
  await card.getByRole("button", { name: "預覽" }).click();
  await expect(card.locator(".field-error")).toBeVisible();
  await expect(card.locator(".op-contractor-card__import-preview")).toHaveCount(0);

  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("目前回覆")).toHaveValue("");
});

test("the paste-import preview renders localized Chinese labels and enum values, never the raw canonical keys/identifiers (Codex localization audit)", async ({
  page,
}) => {
  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(
    makeExport({
      responseType: "proposal-provided",
      priceType: "fixed",
      price: 5000,
      proposedApproach: "Replace the connector now.",
      earliestStart: "Tomorrow afternoon",
      guaranteeStatus: "yes",
    }),
  );
  await card.getByRole("button", { name: "預覽" }).click();
  const preview = card.locator(".op-contractor-card__import-preview");
  await expect(preview).toBeVisible();
  const previewText = await preview.innerText();

  // Localized field labels.
  expect(previewText).toContain("回覆類型");
  expect(previewText).toContain("報價類型");
  expect(previewText).toContain("建議處理方法");
  expect(previewText).toContain("最早可開始時間");
  expect(previewText).toContain("保養");
  // Localized enum values.
  expect(previewText).toContain("提供初步報價");
  expect(previewText).toContain("固定價格");
  expect(previewText).toContain("HK$5,000");

  // Never the raw canonical field keys or enum identifiers.
  for (const raw of ["responseType", "priceType", "proposedApproach", "earliestStart", "guaranteeStatus", "proposal-provided", "fixed"]) {
    expect(previewText).not.toContain(raw);
  }

  // Confirm still writes the exact canonical values — display localization
  // never translated the stored/domain data.
  await card.getByRole("button", { name: "確認匯入" }).click();
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("目前回覆")).toHaveValue("proposal-provided");
  await expect(card.getByLabel("報價方式")).toHaveValue("fixed");
  await expect(card.getByLabel("價格（港幣）")).toHaveValue("5000");
});

test("no mutating request is made to the backend during preview or import", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const card = await gotoCaseWithContractor(page);
  await card.getByRole("button", { name: "匯入回覆" }).click();
  await card.locator("textarea").first().fill(makeExport({ responseType: "interested" }));
  await card.getByRole("button", { name: "預覽" }).click();
  await card.getByRole("button", { name: "確認匯入" }).click();

  expect(mutatingApiRequests).toEqual([]);
});
