import { expect, test } from "@playwright/test";

// End-to-end coverage for the manual contractor response workflow
// (RepairScope HK — Post-Intake Workflow, Slice 2) — the evolved contractor
// card UI in components/operator/OperatorCaseWorkspace.tsx. Local-only
// state, no server writes; see tests/e2e/operator-case-workspace.spec.ts for
// the base add/edit/remove/persist coverage this file builds on.

async function openFirstContractorCard(page: import("@playwright/test").Page) {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "＋新增師傅" }).click();
  return page.locator(".op-contractor-card").first();
}

test("selecting 'Needs inspection' reveals the inspection requirement field, and nothing else conditional", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("目前回覆").selectOption("needs-inspection");
  await expect(card.getByLabel("檢查要求")).toBeVisible();
  await expect(card.getByLabel("他們需要什麼資料？")).toHaveCount(0);
  await expect(card.getByLabel("報價方式")).toHaveCount(0);

  await card.getByLabel("檢查要求").selectOption("required");
  await expect(card).toContainText("一定要上門檢查先可以報價");
});

test("selecting 'Needs more information' reveals the information-needed field", async ({ page }) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("目前回覆").selectOption("needs-more-information");
  await expect(card.getByLabel("他們需要什麼資料？")).toBeVisible();
  await card.getByLabel("他們需要什麼資料？").fill("Photos of the pipe under the sink.");
  await expect(card.getByLabel("他們需要什麼資料？")).toHaveValue(
    "Photos of the pipe under the sink.",
  );
});

test("selecting 'Initial proposal provided' reveals the full proposal form, gated correctly by price type and guarantee status", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await expect(card.getByLabel("報價方式")).toBeVisible();

  // No price type chosen yet — no price fields shown.
  await expect(card.getByLabel("價格（港幣）")).toHaveCount(0);
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveCount(0);

  await card.getByLabel("報價方式").selectOption("fixed");
  await expect(card.getByLabel("價格（港幣）")).toBeVisible();
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveCount(0);
  await card.getByLabel("價格（港幣）").fill("850");

  await card.getByLabel("報價方式").selectOption("range");
  // Switching to range clears the single price field and shows min/max.
  await expect(card.getByLabel("價格（港幣）")).toHaveCount(0);
  await card.getByLabel("價格範圍 — 最低（港幣）").fill("500");
  await card.getByLabel("價格範圍 — 最高（港幣）").fill("300");
  await expect(card.getByText(/未有儲存/)).toBeVisible();
  await card.getByLabel("價格範圍 — 最高（港幣）").fill("900");
  await expect(card.getByText(/未有儲存/)).toHaveCount(0);

  await card.getByLabel("報價方式").selectOption("no-price");
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveCount(0);

  // Not getByLabel("Guarantee"): the wrapping <label> makes its accessible
  // name include its <select>'s own option list, which collides with the
  // separate "保養詳情" label — scope by structure instead.
  const guaranteeSelect = card.locator('label:has-text("保養")').locator("select");
  await expect(card.getByLabel("保養詳情")).toHaveCount(0);
  await guaranteeSelect.selectOption("yes");
  await expect(card.getByLabel("保養詳情")).toBeVisible();
  await card.getByLabel("保養詳情").fill("6 months on parts and labour.");

  await guaranteeSelect.selectOption("not-stated");
  await expect(card.getByLabel("保養詳情")).toHaveCount(0);

  // The free-form response and operator notes are always present, proposal
  // fields or not.
  await expect(card.getByLabel("師傅原本的回覆 — 他們說了什麼？")).toBeVisible();
  await expect(card.getByLabel("操作員備註")).toBeVisible();
});

test("changing response type away from 'Initial proposal provided' clears the proposal fields from view, not just hides them behind stale data", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("fixed");
  await card.getByLabel("價格（港幣）").fill("1200");
  await card.getByLabel("建議處理方法").fill("Replace the whole unit.");

  await card.getByLabel("目前回覆").selectOption("needs-inspection");
  await expect(card.getByLabel("報價方式")).toHaveCount(0);
  await expect(card.getByLabel("價格（港幣）")).toHaveCount(0);
  await expect(card.getByLabel("建議處理方法")).toHaveCount(0);

  // Switch back to proposal-provided — the previously entered price must
  // not silently reappear (it was actually cleared, not just hidden).
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await expect(card.getByLabel("報價方式")).toHaveValue("");
  await card.getByLabel("報價方式").selectOption("fixed");
  await expect(card.getByLabel("價格（港幣）")).toHaveValue("");
});

test("two independently added contractors keep separate response state — editing one never touches the other", async ({
  page,
}) => {
  await page.goto("/operator/RS-MOCK01");
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByRole("button", { name: "＋新增師傅" }).click();
  const cards = page.locator(".op-contractor-card");
  await cards.nth(0).getByLabel("師傅名稱").fill("Contractor A");
  await cards.nth(0).getByLabel("目前回覆").selectOption("interested");

  await page.getByRole("button", { name: "＋新增師傅" }).click();
  await cards.nth(1).getByLabel("師傅名稱").fill("Contractor B");
  await cards.nth(1).getByLabel("目前回覆").selectOption("proposal-provided");
  await cards.nth(1).getByLabel("報價方式").selectOption("estimate");
  await cards.nth(1).getByLabel("價格（港幣）").fill("650");

  // Collapse both cards before checking summaries — while expanded, each
  // card's own <select> renders every option's text (including "Initial
  // proposal provided") regardless of which is selected, which would make a
  // substring check meaningless.
  await cards.nth(0).getByRole("button", { name: "收合" }).click();
  await cards.nth(1).getByRole("button", { name: "收合" }).click();
  await expect(cards.nth(0).locator(".op-contractor-card__meta")).toContainText("有興趣處理");
  await expect(cards.nth(0).locator(".op-contractor-card__meta")).not.toContainText("報價");
  await expect(cards.nth(1).locator(".op-contractor-card__meta")).toContainText("報價");

  await cards.nth(1).getByRole("button", { name: "移除" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("Contractor A");
  await expect(cards.nth(0)).toContainText("有興趣處理");
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
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("師傅名稱")).toHaveValue("Legacy Contractor");
  await expect(card.getByLabel("目前回覆")).toHaveValue("");
  await expect(card.getByLabel("操作員備註")).toHaveValue("Pre-Slice-2 record.");
});

// --- Slice 2 repair pass: contact-status/response-type overlap, invalid ---
// --- price ranges (Codex audit findings) -----------------------------------

test("the contact/sourcing status dropdown offers only Considering/Not contacted/Contacted — no response-outcome values", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  const options = await card.getByLabel("聯絡／尋找師傅狀態").locator("option").allTextContents();
  assertDeepEqualOptions(options, ["考慮中", "未聯絡", "已聯絡"]);
});

test("the current response dropdown offers only the five response types — no contact-progress values", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  const options = await card.getByLabel("目前回覆").locator("option").allTextContents();
  assertDeepEqualOptions(options, [
    "未有回覆",
    "有興趣處理",
    "需要上門檢查",
    "需要更多資料",
    "不適合處理",
    "提供初步報價",
  ]);
});

function assertDeepEqualOptions(actual: string[], expected: string[]) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected dropdown options ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

test("an attempted inverted range (min=10000, max=5000) is never committed, never persists, and never survives reload — the collapsed card never shows it", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("師傅名稱").fill("Bad Range Co.");
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("range");
  await card.getByLabel("價格範圍 — 最低（港幣）").fill("10000");
  // At this point min=10000 alone is a legitimate, non-inverted value (max
  // is still unset) and does persist — the invariant only applies once
  // BOTH bounds exist. The attempted max=5000 is what must be rejected.
  await card.getByLabel("價格範圍 — 最高（港幣）").fill("5000");
  await expect(card.getByText(/未有儲存/)).toBeVisible();

  // The rejected max never reached persisted state; the invariant
  // (min <= max whenever both exist) is never violated because max simply
  // stays unset rather than becoming 5000.
  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("repairscope:operator-case:RS-MOCK01");
    return raw ? JSON.parse(raw).contractors[0] : null;
  });
  expect(persisted.priceMin).toBe(10000);
  expect(persisted.priceMax).toBeUndefined();

  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const reloadedCard = page.locator(".op-contractor-card").first();
  await expect(reloadedCard).toContainText("Bad Range Co.");
  // Collapsed summary never shows a range at all while only one bound is
  // set — summarizeContractor requires both min and max to be numbers.
  await expect(reloadedCard.locator(".op-contractor-card__meta")).not.toContainText("5,000");
  await expect(reloadedCard.locator(".op-contractor-card__meta")).not.toContainText("報價 —");

  // Reopen and confirm the rejected max is still gone after reload — not
  // silently restored from some other path.
  await reloadedCard.getByRole("button", { name: "編輯" }).click();
  await expect(reloadedCard.getByLabel("價格範圍 — 最低（港幣）")).toHaveValue("10000");
  await expect(reloadedCard.getByLabel("價格範圍 — 最高（港幣）")).toHaveValue("");
});

test("a valid range (min=5000, max=10000) persists, survives reload, and appears correctly in the collapsed summary", async ({
  page,
}) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("師傅名稱").fill("Good Range Co.");
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("range");
  await card.getByLabel("價格範圍 — 最低（港幣）").fill("5000");
  await card.getByLabel("價格範圍 — 最高（港幣）").fill("10000");
  await expect(card.getByText(/未有儲存/)).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const reloadedCard = page.locator(".op-contractor-card").first();
  await expect(reloadedCard.locator(".op-contractor-card__meta")).toContainText("HK$5,000–HK$10,000");
});

test("min equal to max is accepted as a valid range, live in the browser", async ({ page }) => {
  const card = await openFirstContractorCard(page);
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("range");
  await card.getByLabel("價格範圍 — 最低（港幣）").fill("7000");
  await card.getByLabel("價格範圍 — 最高（港幣）").fill("7000");
  await expect(card.getByText(/未有儲存/)).toHaveCount(0);
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveValue("7000");
  await expect(card.getByLabel("價格範圍 — 最高（港幣）")).toHaveValue("7000");
});

test("a record already carrying an inverted range in localStorage (simulating pre-repair-pass data) is sanitized on load and never rendered as a valid proposal", async ({
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
            id: "bad-range-1",
            name: "Already Inverted Co.",
            status: "contacted",
            notes: "",
            responseType: "proposal-provided",
            priceType: "range",
            priceMin: 10000,
            priceMax: 5000,
            proposedApproach: "Should survive normalization.",
          },
        ],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const card = page.locator(".op-contractor-card").first();
  await expect(card).toContainText("Already Inverted Co.");
  await expect(card.locator(".op-contractor-card__meta")).not.toContainText("10,000");
  await expect(card.locator(".op-contractor-card__meta")).not.toContainText("5,000");
  await expect(card.locator(".op-contractor-card__meta")).not.toContainText("報價 —");

  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("價格範圍 — 最低（港幣）")).toHaveValue("");
  await expect(card.getByLabel("價格範圍 — 最高（港幣）")).toHaveValue("");
  // Other proposal fields, unrelated to the price invariant, are untouched.
  await expect(card.getByLabel("建議處理方法")).toHaveValue("Should survive normalization.");
});

test("a historical status='interested' record (no responseType) normalizes on load to contact status=Contacted and response=Interested, with no contradictory display", async ({
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
        contractors: [{ id: "legacy-1", name: "Legacy Interested Co.", status: "interested", notes: "" }],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const card = page.locator(".op-contractor-card").first();
  await expect(card.locator(".op-contractor-card__meta")).toContainText("已聯絡");
  await expect(card.locator(".op-contractor-card__meta")).toContainText("有興趣處理");
  await card.getByRole("button", { name: "編輯" }).click();
  await expect(card.getByLabel("聯絡／尋找師傅狀態")).toHaveValue("contacted");
  await expect(card.getByLabel("目前回覆")).toHaveValue("interested");
});

test("no mutating request is made to the backend as contractor response fields are filled in", async ({ page }) => {
  const mutatingApiRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
      mutatingApiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const card = await openFirstContractorCard(page);
  await card.getByLabel("師傅名稱").fill("Contractor A");
  await card.getByLabel("目前回覆").selectOption("proposal-provided");
  await card.getByLabel("報價方式").selectOption("fixed");
  await card.getByLabel("價格（港幣）").fill("1500");
  await card.getByLabel("保養").selectOption("yes");
  await card.getByLabel("保養詳情").fill("1 year.");

  expect(mutatingApiRequests).toEqual([]);
});
