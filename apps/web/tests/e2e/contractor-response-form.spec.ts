import { expect, test } from "@playwright/test";

// End-to-end coverage for the NEW HK contractor-facing guided response
// prototype (RepairScope HK — "frontend structure" phase, Commit B). See
// components/contractor/ContractorResponseForm.tsx's own comment — this is
// built fresh against ContractorResponsePayload/Stage1ContractorBrief, not
// the old UK ContractorApp.tsx. Runs entirely against the mock data source
// (this route is gated to local/mock mode only — see
// tests/e2e/legacy-routes-api-mode.spec.ts for the API-mode gate itself).
//
// LOCALIZATION (HK validation-pilot pass): Traditional Chinese is now the
// default rendered language (see components/LanguageContext.tsx), so every
// assertion below targets the Chinese copy — see that component's own
// LocalizedText dictionary for the exact source of truth these strings are
// copied from.

test("the Stage-1 brief panel shows the sourcing summary and never shows owner-identifying detail", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await expect(page.getByText("話俾 RepairScope 知你點打算處理。")).toBeVisible();
  const briefPanel = page.locator(".contractor-brief-panel");
  // A resolved human label — the raw category id ("plumbing") is never
  // shown (see domain/stage1ContractorBrief.ts's privacy/label hardening).
  await expect(briefPanel).toContainText("水喉問題");
  await expect(briefPanel).toContainText(
    "呢個只係搵師傅階段嘅概要 — 而家未會顯示確實地址、業主聯絡資料或者其他師傅嘅資料。",
  );
  const pageText = await page.locator("main").innerText();
  expect(pageText).not.toContain("Jamie Landlord");
  expect(pageText).not.toContain("jamie@example.com");
  expect(pageText).not.toContain("07700900000");
  expect(pageText).not.toMatch(/\bplumbing\b/);
});

test("an unrecognised invitation shows a clear unavailable state, not a crash", async ({ page }) => {
  await page.goto("/contractor/respond/not-a-real-token");
  await expect(page.getByText("呢個邀請暫時未能使用。")).toBeVisible();
});

test("the 'Interested' branch is light — one free-text field then review", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "仲有冇想講嘅？" })).toBeVisible();
  await page.getByLabel("仲有冇想講嘅？").fill("Sounds doable, can start soon.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();
});

test("the 'Needs inspection' branch captures the inspection requirement and what they said", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "需要上門檢查", exact: true }).click();
  await expect(page.getByRole("heading", { name: "檢查要求" })).toBeVisible();
  await page.getByRole("button", { name: "一定要上門檢查先可以報價" }).click();
  await expect(page.getByRole("heading", { name: "你想檢查啲乜，或者你同對方講咗啲乜？" })).toBeVisible();
  await page.getByLabel("你想檢查啲乜，或者你同對方講咗啲乜？").fill("Need to see the pipe run.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();
});

test("the 'Needs more information' branch captures what's needed", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "需要更多資料", exact: true }).click();
  await page.getByLabel("你需要咩資料？").fill("More photos of the ceiling.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByLabel("仲有冇想講嘅？").fill("Can respond once I see those.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();
});

test("the 'Needs more information' branch blocks Continue on a blank or whitespace-only answer (T2 Commit 1 contract alignment)", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "需要更多資料", exact: true }).click();

  // Blank.
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請講清楚你需要咩資料。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "你需要咩資料？" })).toBeVisible();

  // Whitespace-only.
  await page.getByLabel("你需要咩資料？").fill("   ");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請講清楚你需要咩資料。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "你需要咩資料？" })).toBeVisible();

  // Valid text clears the error and advances.
  await page.getByLabel("你需要咩資料？").fill("More photos of the ceiling.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "仲有冇想講嘅？" })).toBeVisible();
});

test("the 'Not suitable' branch stays minimal with an optional response", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "不適合處理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "仲有冇想講嘅？" })).toBeVisible();
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();
});

test("back/edit: a collapsed step can be changed, and the change is reflected", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  await page.getByLabel("仲有冇想講嘅？").fill("First answer.");
  await page.getByRole("button", { name: "繼續" }).click();

  // The first step is now collapsed with a summary + Change link.
  const firstStep = page.locator(".contractor-step--done").first();
  await expect(firstStep).toContainText("有興趣處理");
  await firstStep.getByRole("button", { name: "更改" }).click();
  await page.getByRole("button", { name: "不適合處理", exact: true }).click();
  await expect(page.locator(".contractor-step--done").first()).toContainText("不適合處理");
});

test("progressive collapse: answered steps collapse to a concise summary above the active step", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace the connector now.");
  await page.getByRole("button", { name: "繼續" }).click();

  const doneSteps = page.locator(".contractor-step--done");
  await expect(doneSteps).toHaveCount(2); // response-type + proposed-approach
  await expect(doneSteps.nth(1)).toContainText("Replace the connector now.");
});

test("proposal branch: fixed price renders a single price field and completes cleanly", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: fixed price blocks Continue with no amount entered (T2 Commit 1 contract alignment)", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請輸入有效價格（0 或以上）。")).toBeVisible();
  // Still on the price-amount step — did not advance.
  await expect(page.getByLabel("價格（港幣）")).toBeVisible();

  await page.getByLabel("價格（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: estimate price behaves the same as fixed (single amount field)", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Inspect then quote.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "估算價格" }).click();
  await expect(page.getByLabel("價格（港幣）")).toBeVisible();
  await page.getByLabel("價格（港幣）").fill("1800");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: range price renders two fields and rejects an inverted range", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Inspect valve first.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "價格範圍" }).click();
  await page.getByLabel("最低價（港幣）").fill("7000");
  await page.getByLabel("最高價（港幣）").fill("4000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("最低價格唔可以高過最高價格。")).toBeVisible();
  // Still on the price-amount step — did not advance.
  await expect(page.getByLabel("最低價（港幣）")).toBeVisible();

  await page.getByLabel("最高價（港幣）").fill("9000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: range price blocks Continue when either bound is missing (T2 Commit 1 contract alignment)", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Inspect valve first.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "價格範圍" }).click();

  // Neither bound filled in.
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請輸入最低同最高價格。")).toBeVisible();

  // Only minimum filled in.
  await page.getByLabel("最低價（港幣）").fill("4000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請輸入最低同最高價格。")).toBeVisible();
  await expect(page.getByLabel("最低價（港幣）")).toBeVisible();

  // Only maximum filled in (clear minimum first).
  await page.getByLabel("最低價（港幣）").fill("");
  await page.getByLabel("最高價（港幣）").fill("7000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請輸入最低同最高價格。")).toBeVisible();

  // Both filled in — advances.
  await page.getByLabel("最低價（港幣）").fill("4000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: a valid equal price range (min === max) is accepted", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Inspect valve first.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "價格範圍" }).click();
  await page.getByLabel("最低價（港幣）").fill("5000");
  await page.getByLabel("最高價（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
});

test("proposal branch: negative prices are rejected (never accepted as a value)", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("-500");
  await expect(page.getByLabel("價格（港幣）")).toHaveValue("");
});

test("proposal branch: 'No price yet' skips the price-amount step entirely", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Need to see it first.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "暫時未能報價" }).click();
  await expect(page.getByRole("heading", { name: "包括啲乜？" })).toBeVisible();
  // The price-amount step never appears as its own collapsed row — only
  // response-type, proposed-approach and price-type (whose own answer is
  // legitimately "No price yet").
  await expect(page.locator(".contractor-step--done")).toHaveCount(3);
  const doneLabels = await page.locator(".contractor-step__label").allTextContents();
  expect(doneLabels).not.toContain("價格");
  expect(doneLabels).not.toContain("價格範圍");
});

test("exclusion and price-change-factor suggestion chips assist without creating a second taxonomy", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByLabel("包括啲乜？").fill("Labour and part.");
  await page.getByRole("button", { name: "繼續" }).click();

  await page.getByRole("button", { name: "+ 油漆／批盪修飾" }).click();
  await expect(page.getByLabel("不包括啲乜？")).toHaveValue("油漆／批盪修飾");
  await page.getByRole("button", { name: "繼續" }).click();

  await page.getByRole("button", { name: "+ 隱藏損壞" }).click();
  await expect(page.getByLabel("咩因素可能影響價格？")).toHaveValue("隱藏損壞");
});

test("guarantee: 'Yes' reveals an optional details field before advancing; 'No'/'Not stated' advance immediately", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByLabel("包括啲乜？").fill("Labour and part.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "繼續" }).click(); // exclusions (optional, blank)
  await page.getByRole("button", { name: "繼續" }).click(); // price-change-factors (optional, blank)
  await page.getByLabel("預計工期").fill("2 hours");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "繼續" }).click(); // earliest start (optional, blank)

  await expect(page.getByRole("heading", { name: "保養" })).toBeVisible();
  await page.getByRole("button", { name: "有", exact: true }).click();
  await expect(page.getByLabel("保養詳情")).toBeVisible();
  await page.getByLabel("保養詳情").fill("6 months on parts.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "仲有冇想講嘅？" })).toBeVisible();
});

test("final review shows a 'Prepare my response' export and the copied text parses back deterministically", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  await page.getByLabel("仲有冇想講嘅？").fill("Sounds doable.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "準備回覆內容", exact: true }).click();
  const exportBox = page.getByLabel("可複製嘅回覆內容");
  await expect(exportBox).toBeVisible();
  const value = await exportBox.inputValue();
  const parsed = JSON.parse(value);
  expect(parsed.schema).toBe("repairscope.contractor-response-export");
  expect(parsed.version).toBe(1);
  expect(parsed.response.responseType).toBe("interested");
  expect(parsed.response.originalResponse).toBe("Sounds doable.");
});

test("back/edit: clearing a previously-valid required answer blocks re-advancement — cannot reach a stale invalid final state (T2 Commit 1)", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "需要更多資料", exact: true }).click();
  await page.getByLabel("你需要咩資料？").fill("More photos of the ceiling.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByLabel("仲有冇想講嘅？").fill("Thanks.");
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();

  // Go back and clear the previously-valid required answer.
  const informationNeededStep = page.locator(".contractor-step--done").filter({
    hasText: "你需要咩資料？",
  });
  await informationNeededStep.getByRole("button", { name: "更改" }).click();
  await page.getByLabel("你需要咩資料？").fill("");

  // The only way back to review is through this step's own Continue gate
  // — it must still block, exactly as it did the first time.
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByText("請講清楚你需要咩資料。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "查看回覆" })).not.toBeVisible();
});

test("text fields enforce the backend length caps via maxLength, and long-text fields accept boundary-length input", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  const field = page.getByLabel("仲有冇想講嘅？");
  await expect(field).toHaveAttribute("maxlength", "2000");

  // The browser itself refuses to accept more than maxLength characters
  // when typed/filled via `fill`, which sets the DOM value directly and
  // is still bounded by the maxLength attribute for a controlled input.
  const boundaryText = "x".repeat(2000);
  await field.fill(boundaryText);
  await expect(field).toHaveValue(boundaryText);
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "準備回覆內容", exact: true }).click();
  await expect(page.getByLabel("可複製嘅回覆內容")).toBeVisible();
});

test("short-text fields (expected duration, earliest start) enforce the 200-character backend cap via maxLength", async ({
  page,
}) => {
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "暫時未能報價" }).click();
  await page.getByRole("button", { name: "繼續" }).click(); // inclusions (optional, blank)
  await page.getByRole("button", { name: "繼續" }).click(); // exclusions (optional, blank)
  await page.getByRole("button", { name: "繼續" }).click(); // price-change-factors (optional, blank)
  await expect(page.getByLabel("預計工期")).toHaveAttribute("maxlength", "200");
});

test("mobile viewport: the contractor form is usable with no page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contractor/respond/demo-token");
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "仲有冇想講嘅？" })).toBeVisible();
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
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace connector.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("5000");
  await page.getByRole("button", { name: "繼續" }).click();

  expect(mutatingApiRequests).toEqual([]);
});
