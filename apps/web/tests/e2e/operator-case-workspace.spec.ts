import { expect, test } from "@playwright/test";

// End-to-end coverage for the consolidated /operator case workspace
// (RepairScope HK — Post-Intake Workflow, Slice 1.5) — real submitted
// cases (via OperatorSubmissionService, mock mode's own RS-MOCK01 fixture
// here since this suite runs against the default mock data source) plus
// the local-only operator working-state layer. No "prototype" route,
// banner, or terminology remains — this is the real /operator route,
// gated by the same OperatorGate as before.
//
// LOCALIZATION (HK validation-pilot pass): the operator UI has no language
// toggle (see components/operator/OperatorCaseWorkspace.tsx's own
// comment) — every assertion below targets the Chinese copy directly. The
// EN toggle used in a couple of tests below is unrelated: it switches the
// SHARED brief-content renderer (GeneratedBriefDocument), which already
// had its own separate bilingual coverage before this pass and is
// untouched by it.

test.describe("operator case list", () => {
  test("renders the real case list, distinguishing backend status from local workflow status", async ({
    page,
  }) => {
    await page.goto("/operator");
    await expect(page.getByText("內部原型")).toHaveCount(0);
    await expect(page.getByText("INTERNAL PROTOTYPE")).toHaveCount(0);

    await expect(page.getByRole("link", { name: "RS-MOCK01" })).toBeVisible();
    const row = page.locator("tr", { has: page.getByRole("link", { name: "RS-MOCK01" }) });
    await expect(row.getByText("plumbing")).toBeVisible();
    // Two distinct status cells — the backend's own SubmissionStatus
    // (rendered via StatusPill) and the local workflow status (rendered
    // via .op-case-status-pill, Chinese labels like "新個案"/"可開始搵師傅")
    // — never conflated into one value.
    await expect(row.locator("td:nth-child(7) .status-pill")).toBeVisible();
    await expect(row.locator("td:nth-child(8) .op-case-status-pill")).toBeVisible();
  });
});

test.describe("operator case detail", () => {
  test("opening a case renders the actual generated brief via the modern semantic summary, plus contact and evidence metadata — no prototype terminology", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await expect(page.getByText("內部原型")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "RS-MOCK01" })).toBeVisible();
    // The app's shared LanguageProvider defaults to Traditional Chinese
    // (see app/layout.tsx) — switch to English to assert on the brief's
    // English section titles below, same as the pre-existing operator
    // brief-readability coverage. This toggle only affects the shared
    // GeneratedBriefDocument content, not the (Chinese-only) operator
    // chrome around it.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    // The real generated brief, via the same modern semantic summary the
    // owner review uses (variant="owner") — not the old numbered report.
    await expect(page.getByText("Repair summary")).toBeVisible();
    await expect(page.getByText("Repair situation")).toBeVisible();
    await expect(page.getByText("Kitchen tap leaking heavily, floor is wet.")).toBeVisible();
    // Contact — detail-level fields, not part of the brief itself.
    await expect(page.getByText("jamie@example.com")).toBeVisible();
    // Evidence metadata.
    await expect(page.getByText("Two photos on my phone.")).toBeVisible();
    // Consent — visible, not editable (see the read-only test below).
    await expect(page.getByText("同意俾人聯絡")).toBeVisible();
  });

  test("a case reference with no matching submission shows an explicit not-found state", async ({ page }) => {
    await page.goto("/operator/RS-DOES-NOT-EXIST");
    await expect(page.getByText(/搵唔到 RS-DOES-NOT-EXIST 呢個個案/)).toBeVisible();
  });

  test("the original owner submission cannot be edited — the owner-submission section has no input, textarea or select", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    const ownerSection = page.locator('[aria-label="業主提交資料"]');
    await expect(ownerSection).toBeVisible();
    await expect(ownerSection.locator("input, textarea, select")).toHaveCount(0);
  });

  test("backend submission status can still be changed (existing capability retained through consolidation)", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await page.getByRole("button", { name: "審閱中" }).click();
    // The backend status pill in the header reflects the update.
    await expect(page.locator(".op-case-workspace__header").getByText("審閱中")).toBeVisible();
  });
});

test.describe("local operator working state — the manual flow", () => {
  test("read the case, note it, flag a question, change local status, add and update two contractors, set next action, and reload — all local state survives; nothing is written to the server for it", async ({
    page,
  }) => {
    const mutatingApiRequests: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
        mutatingApiRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto("/operator/RS-MOCK01");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText("Repair summary")).toBeVisible();

    await page.getByLabel("內部備註").fill("Owner is responsive, prefers email.");
    await page.getByLabel("未解決嘅問題").fill("Is the leak from the flat above?");
    await page.getByLabel("本機工作流程狀態").selectOption("ready-for-sourcing");
    await expect(page.getByLabel("本機工作流程狀態")).toHaveValue("ready-for-sourcing");

    await page.getByRole("button", { name: "＋新增師傅" }).click();
    const cards = page.locator(".op-contractor-card");
    await expect(cards).toHaveCount(1);
    await cards.nth(0).getByLabel("師傅名稱").fill("Contractor A");
    await cards.nth(0).getByLabel("聯絡／搵師傅狀態").selectOption("contacted");
    await cards.nth(0).getByLabel("操作員備註").fill("Called 9am, can visit Thursday.");
    await cards.nth(0).getByLabel("目前回覆").selectOption("interested");
    await cards.nth(0).getByLabel("師傅原本嘅回覆 — 佢哋講咗啲乜？").fill("Can visit Thursday.");

    await page.getByRole("button", { name: "＋新增師傅" }).click();
    await expect(cards).toHaveCount(2);
    await cards.nth(1).getByLabel("師傅名稱").fill("Contractor B");
    await cards.nth(1).getByLabel("聯絡／搵師傅狀態").selectOption("not-contacted");

    await page.getByLabel("下一步行動").fill("Get a quote from Contractor A after Thursday's visit.");
    await page.getByLabel("跟進日期（可不填）").fill("2026-08-25");

    await page.reload();

    await expect(page.getByLabel("本機工作流程狀態")).toHaveValue("ready-for-sourcing");
    await expect(page.getByLabel("內部備註")).toHaveValue("Owner is responsive, prefers email.");
    await expect(page.getByLabel("未解決嘅問題")).toHaveValue("Is the leak from the flat above?");
    await expect(page.getByLabel("下一步行動")).toHaveValue(
      "Get a quote from Contractor A after Thursday's visit.",
    );
    await expect(page.getByLabel("跟進日期（可不填）")).toHaveValue("2026-08-25");

    const reloadedCards = page.locator(".op-contractor-card");
    await expect(reloadedCards).toHaveCount(2);
    // Cards collapse on reload (expand/collapse is view-only, not
    // persisted) — the collapsed summary still shows what was saved.
    await expect(reloadedCards.nth(0)).toContainText("Contractor A");
    await expect(reloadedCards.nth(0)).toContainText("有興趣處理");
    await expect(reloadedCards.nth(1)).toContainText("Contractor B");

    await reloadedCards.nth(0).getByRole("button", { name: "編輯" }).click();
    await expect(reloadedCards.nth(0).getByLabel("師傅名稱")).toHaveValue("Contractor A");
    await expect(reloadedCards.nth(0).getByLabel("聯絡／搵師傅狀態")).toHaveValue("contacted");
    await expect(reloadedCards.nth(0).getByLabel("目前回覆")).toHaveValue("interested");
    await expect(
      reloadedCards.nth(0).getByLabel("師傅原本嘅回覆 — 佢哋講咗啲乜？"),
    ).toHaveValue("Can visit Thursday.");

    await reloadedCards.nth(1).getByRole("button", { name: "編輯" }).click();
    await expect(reloadedCards.nth(1).getByLabel("師傅名稱")).toHaveValue("Contractor B");
    await expect(reloadedCards.nth(1).getByLabel("聯絡／搵師傅狀態")).toHaveValue("not-contacted");

    await reloadedCards.nth(1).getByRole("button", { name: "移除" }).click();
    await expect(page.locator(".op-contractor-card")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".op-contractor-card")).toHaveCount(1);

    expect(mutatingApiRequests).toEqual([]);
  });

  test("the real request-link controls (T2 Commit 3) never render in mock mode", async ({ page }) => {
    // Real contractor-request creation needs a real backend submission id
    // and a real operator session — see components/operator/
    // OperatorCaseWorkspace.tsx's own isApiDataSource() gate. Mock mode
    // must keep this card exactly as it already is (manual tracking +
    // paste-import only), never silently attempt a real network call
    // against a fixture id.
    await page.goto("/operator/RS-MOCK01");
    await page.getByRole("button", { name: "＋新增師傅" }).click();
    await expect(page.locator(".op-contractor-card")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "建立回覆連結" })).toHaveCount(0);
    await expect(page.locator(".op-contractor-card__requests")).toHaveCount(0);
    // The existing manual/import controls remain exactly as before.
    await expect(page.getByRole("button", { name: "匯入回覆" })).toBeVisible();
  });
});

test.describe("local storage isolation", () => {
  test("the local workflow key is namespaced by the REAL public case reference and never collides with the owner-journey namespace", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await page.getByLabel("內部備註").fill("Isolation check.");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("repairscope:operator-case:RS-MOCK01")?.includes("Isolation check."),
        ),
      )
      .toBe(true);

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    for (const key of keys.filter((k) => k.startsWith("repairscope"))) {
      if (key === "repairscope:operator-case:RS-MOCK01") continue;
      expect(key.startsWith("repairscope:journey:")).toBe(false);
      expect(key.startsWith("repairscope:repair:")).toBe(false);
    }
  });
});

test.describe("owner/public routes remain unaffected", () => {
  test("the homepage and the real /landlord owner entry still work exactly as before, with no operator terminology bleeding in", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /屋企有維修/ })).toBeVisible();

    await page.goto("/landlord/repairs/new");
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();
    await expect(page.getByText("內部原型")).toHaveCount(0);
  });

  test("no /prototype route remains reachable", async ({ page }) => {
    const response = await page.goto("/prototype/operator");
    // Next.js's not-found page still returns 200 for an App Router 404
    // boundary in some configurations — assert on content, not status, to
    // stay correct either way.
    await expect(page.getByText("內部原型")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "RS-MOCK01" })).toHaveCount(0);
    void response;
  });
});
